-- VENTAS · Fase 2: FACTURACIÓN (facturas, rectificativas, pagos y datos de la empresa emisora).
-- Requiere 20261023_A_base_ventas.sql y 20261024_A_presupuestos.sql. Ejecutar una sola vez en Supabase > SQL Editor.
--
-- Principios:
--  · La interfaz solo LEE las tablas. Todo lo que escribe pasa por funciones que validan permisos y reglas.
--  · Una factura emitida es INMUTABLE: lo garantizan triggers en la base de datos, no solo la interfaz.
--  · Una factura emitida no se borra ni se edita: se ANULA emitiendo una rectificativa (serie REC).
--  · Numeración correlativa sin saltos (FAC-2026-0001): se asigna al emitir, en la misma transacción.
--  · Los datos fiscales del emisor y del cliente se COPIAN a la factura al emitirla, así un cambio posterior
--    en la empresa no altera facturas ya emitidas.
--  · Solo finanzas/admin emiten, anulan y cobran. Ventas puede consultar.

-- ============================================================
-- 1) DATOS DE LA EMPRESA EMISORA (una sola fila)
-- ============================================================
create table if not exists public.datos_emisor (
  id boolean primary key default true check (id),          -- solo puede existir una fila
  updated_at timestamptz not null default now(),
  razon_social text check (char_length(razon_social) <= 160),
  nif text check (char_length(nif) between 5 and 20),
  direccion text check (char_length(direccion) <= 200),
  codigo_postal text check (char_length(codigo_postal) between 4 and 10),
  ciudad text check (char_length(ciudad) <= 100),
  pais text not null default 'España' check (char_length(pais) between 2 and 60),
  email text check (char_length(email) <= 160 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono text check (char_length(telefono) between 5 and 30),
  iban text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  texto_pie text check (char_length(texto_pie) <= 500)
);
insert into public.datos_emisor (id, razon_social) values (true, 'Meridiano Logística') on conflict (id) do nothing;

alter table public.datos_emisor enable row level security;
revoke all on public.datos_emisor from anon, authenticated;
grant select, update on public.datos_emisor to authenticated;
drop policy if exists "ventas lee emisor" on public.datos_emisor;
create policy "ventas lee emisor" on public.datos_emisor for select to authenticated using (public.es_ventas());
drop policy if exists "finanzas edita emisor" on public.datos_emisor;
create policy "finanzas edita emisor" on public.datos_emisor
  for update to authenticated using (public.es_finanzas()) with check (public.es_finanzas());

-- ============================================================
-- 2) TABLAS
-- ============================================================
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  numero text unique,                                       -- FAC-2026-0001 / REC-2026-0001; null mientras es borrador
  tipo text not null default 'ordinaria' check (tipo in ('ordinaria','rectificativa')),
  estado text not null default 'borrador' check (estado in ('borrador','emitida','pagada','anulada')),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  presupuesto_id uuid references public.presupuestos(id) on delete set null,
  rectifica_id uuid references public.facturas(id) on delete restrict,   -- factura que corrige (solo rectificativas)
  motivo text check (char_length(motivo) between 5 and 500),
  fecha_emision date,                                       -- se fija al emitir (hoy)
  dias_pago integer not null default 30 check (dias_pago between 0 and 120),
  fecha_vencimiento date,
  forma_pago text not null default 'transferencia' check (forma_pago in ('transferencia','domiciliación','tarjeta','efectivo')),
  notas text check (char_length(notas) <= 2000),
  base_imponible numeric(14,2) not null default 0,
  iva_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  pagado numeric(14,2) not null default 0,
  -- Copia de los datos fiscales en el momento de emitir
  cliente_nombre text, cliente_nif text, cliente_direccion text, cliente_email text,
  emisor_nombre text, emisor_nif text, emisor_direccion text, emisor_email text, emisor_iban text, emisor_pie text,
  emitida_en timestamptz,
  emitida_por uuid references auth.users(id) on delete set null,
  pagada_en timestamptz,
  constraint facturas_numero_ck check ((estado = 'borrador') = (numero is null)),
  constraint facturas_fechas_ck check (estado = 'borrador' or (fecha_emision is not null and fecha_vencimiento >= fecha_emision)),
  constraint facturas_rectificativa_ck check ((tipo = 'rectificativa') = (rectifica_id is not null)),
  constraint facturas_pagado_ck check (pagado >= 0 and (tipo = 'rectificativa' or pagado <= total))
);
create index if not exists facturas_empresa_idx on public.facturas (empresa_id);
create index if not exists facturas_estado_idx on public.facturas (estado, fecha_emision desc);
-- Un presupuesto solo puede tener una factura "viva" (las anuladas liberan el presupuesto)
create unique index if not exists facturas_presupuesto_viva_uidx on public.facturas (presupuesto_id)
  where presupuesto_id is not null and tipo = 'ordinaria' and estado <> 'anulada';
-- Una factura solo se rectifica una vez
create unique index if not exists facturas_rectifica_uidx on public.facturas (rectifica_id) where rectifica_id is not null;

create table if not exists public.lineas_factura (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.facturas(id) on delete cascade,
  orden integer not null default 0,
  servicio_id uuid references public.servicios(id) on delete set null,
  descripcion text not null check (char_length(btrim(descripcion)) between 1 and 300),
  cantidad numeric(10,2) not null check (cantidad <> 0 and abs(cantidad) <= 100000),   -- negativa en rectificativas
  unidad text not null default 'servicio' check (unidad in ('servicio','envío','palé','kg','hora','km')),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0 and precio_unitario <= 1000000),
  descuento_pct numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  tipo_iva numeric(4,2) not null default 21 check (tipo_iva in (0, 4, 10, 21)),
  importe_base numeric(14,2) generated always as
    (round(cantidad * precio_unitario * (100 - descuento_pct) / 100, 2)) stored
);
create index if not exists lineas_factura_idx on public.lineas_factura (factura_id, orden);

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  factura_id uuid not null references public.facturas(id) on delete restrict,
  fecha date not null,
  importe numeric(14,2) not null check (importe > 0),
  metodo text not null default 'transferencia' check (metodo in ('transferencia','domiciliación','tarjeta','efectivo','otro')),
  referencia text check (char_length(referencia) <= 100),
  registrado_por uuid references auth.users(id) on delete set null
);
create index if not exists pagos_factura_idx on public.pagos (factura_id, fecha);

-- ============================================================
-- 3) INMUTABILIDAD (triggers: valen incluso para las funciones de la base de datos)
-- ============================================================
create or replace function public.facturas_proteger() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'borrador' then
      raise exception 'Una factura emitida no se puede borrar: anúlala con una rectificativa';
    end if;
    return old;
  end if;
  -- UPDATE de una factura ya emitida: solo pueden cambiar el estado de cobro/anulación y lo cobrado
  if old.estado <> 'borrador' then
    if row(old.numero, old.tipo, old.empresa_id, old.presupuesto_id, old.rectifica_id, old.motivo, old.fecha_emision,
           old.dias_pago, old.fecha_vencimiento, old.forma_pago, old.notas, old.base_imponible, old.iva_total, old.total,
           old.cliente_nombre, old.cliente_nif, old.cliente_direccion, old.cliente_email,
           old.emisor_nombre, old.emisor_nif, old.emisor_direccion, old.emisor_email, old.emisor_iban, old.emisor_pie,
           old.emitida_en, old.emitida_por)
       is distinct from
       row(new.numero, new.tipo, new.empresa_id, new.presupuesto_id, new.rectifica_id, new.motivo, new.fecha_emision,
           new.dias_pago, new.fecha_vencimiento, new.forma_pago, new.notas, new.base_imponible, new.iva_total, new.total,
           new.cliente_nombre, new.cliente_nif, new.cliente_direccion, new.cliente_email,
           new.emisor_nombre, new.emisor_nif, new.emisor_direccion, new.emisor_email, new.emisor_iban, new.emisor_pie,
           new.emitida_en, new.emitida_por) then
      raise exception 'Una factura emitida no se puede modificar';
    end if;
    if old.estado = 'anulada' and new.estado <> 'anulada' then
      raise exception 'Una factura anulada no se puede reabrir';
    end if;
    if new.estado = 'borrador' then raise exception 'Una factura emitida no puede volver a borrador'; end if;
  end if;
  return new;
end $$;
drop trigger if exists facturas_proteger_tg on public.facturas;
create trigger facturas_proteger_tg before update or delete on public.facturas
  for each row execute function public.facturas_proteger();

-- Las líneas solo se tocan mientras la factura es borrador
create or replace function public.lineas_factura_proteger() returns trigger
language plpgsql as $$
declare v_estado text; v_id uuid := case when tg_op = 'DELETE' then old.factura_id else new.factura_id end;
begin
  select estado into v_estado from public.facturas where id = v_id;
  -- Si la factura ya no existe es el borrado en cascada de un borrador: se permite
  if v_estado is not null and v_estado <> 'borrador' then
    raise exception 'Las líneas de una factura emitida no se pueden modificar';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists lineas_factura_proteger_tg on public.lineas_factura;
create trigger lineas_factura_proteger_tg before insert or update or delete on public.lineas_factura
  for each row execute function public.lineas_factura_proteger();

-- Los pagos tampoco se editan: se registran o se eliminan (con la factura recalculada)
create or replace function public.pagos_proteger() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception 'Un pago no se puede modificar: elimínalo y vuelve a registrarlo'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists pagos_proteger_tg on public.pagos;
create trigger pagos_proteger_tg before update on public.pagos for each row execute function public.pagos_proteger();

-- ============================================================
-- 4) PERMISOS: la interfaz lee (y finanzas borra borradores)
-- ============================================================
alter table public.facturas enable row level security;
alter table public.lineas_factura enable row level security;
alter table public.pagos enable row level security;
revoke all on public.facturas, public.lineas_factura, public.pagos from anon, authenticated;
grant select, delete on public.facturas to authenticated;
grant select on public.lineas_factura, public.pagos to authenticated;

drop policy if exists "ventas lee facturas" on public.facturas;
create policy "ventas lee facturas" on public.facturas for select to authenticated using (public.es_ventas());
drop policy if exists "finanzas borra borradores de factura" on public.facturas;
create policy "finanzas borra borradores de factura" on public.facturas
  for delete to authenticated using (public.es_finanzas() and estado = 'borrador');
drop policy if exists "ventas lee lineas de factura" on public.lineas_factura;
create policy "ventas lee lineas de factura" on public.lineas_factura for select to authenticated using (public.es_ventas());
drop policy if exists "ventas lee pagos" on public.pagos;
create policy "ventas lee pagos" on public.pagos for select to authenticated using (public.es_ventas());

-- ============================================================
-- 5) TOTALES (mismo cálculo que los presupuestos: el IVA se calcula sobre la suma de bases de cada tipo)
-- ============================================================
create or replace function public.recalcular_factura(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_base numeric(14,2); v_iva numeric(14,2);
begin
  select coalesce(sum(g.base), 0), coalesce(sum(g.iva), 0) into v_base, v_iva
    from (select sum(importe_base) as base, round(sum(importe_base) * tipo_iva / 100, 2) as iva
            from public.lineas_factura where factura_id = p_id group by tipo_iva) g;
  update public.facturas set base_imponible = v_base, iva_total = v_iva, total = v_base + v_iva, updated_at = now()
   where id = p_id;
end $$;
revoke execute on function public.recalcular_factura(uuid) from public, anon, authenticated;

-- ============================================================
-- 6) CREAR UN BORRADOR DESDE UN PRESUPUESTO ACEPTADO
-- ============================================================
create or replace function public.crear_factura_desde_presupuesto(p_presupuesto_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.presupuestos; v_id uuid; v_dias integer; v_existe text;
begin
  if not public.es_finanzas() then raise exception 'Solo finanzas puede crear facturas'; end if;
  select * into p from public.presupuestos where id = p_presupuesto_id for update;
  if not found then raise exception 'El presupuesto no existe'; end if;
  if p.estado <> 'aceptado' then raise exception 'Solo se puede facturar un presupuesto aceptado'; end if;

  select coalesce(numero, 'en borrador') into v_existe from public.facturas
   where presupuesto_id = p.id and tipo = 'ordinaria' and estado <> 'anulada' limit 1;
  if found then raise exception 'Este presupuesto ya tiene una factura (%)', v_existe; end if;

  select dias_pago into v_dias from public.empresas where id = p.empresa_id;
  insert into public.facturas (empresa_id, presupuesto_id, dias_pago, notas)
  values (p.empresa_id, p.id, coalesce(v_dias, 30), p.notas) returning id into v_id;

  insert into public.lineas_factura (factura_id, orden, servicio_id, descripcion, cantidad, unidad, precio_unitario, descuento_pct, tipo_iva)
  select v_id, orden, servicio_id, descripcion, cantidad, unidad, precio_unitario, descuento_pct, tipo_iva
    from public.lineas_presupuesto where presupuesto_id = p.id order by orden;

  perform public.recalcular_factura(v_id);
  return v_id;
end $$;

-- ============================================================
-- 7) GUARDAR EL BORRADOR (cabecera + todas las líneas, en una transacción)
-- ============================================================
create or replace function public.guardar_factura(
  p_id uuid, p_dias_pago integer, p_forma_pago text, p_notas text, p_lineas jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare f public.facturas;
begin
  if not public.es_finanzas() then raise exception 'Solo finanzas puede editar facturas'; end if;
  select * into f from public.facturas where id = p_id for update;
  if not found then raise exception 'La factura no existe'; end if;
  if f.estado <> 'borrador' then raise exception 'Solo se puede editar una factura en borrador'; end if;
  if f.tipo <> 'ordinaria' then raise exception 'Las rectificativas no se editan'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then raise exception 'Las líneas no son válidas'; end if;
  if jsonb_array_length(p_lineas) > 100 then raise exception 'Una factura admite como máximo 100 líneas'; end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) e where (e ->> 'cantidad')::numeric <= 0) then
    raise exception 'Las cantidades de una factura deben ser positivas';
  end if;

  update public.facturas set dias_pago = p_dias_pago, forma_pago = p_forma_pago, notas = nullif(btrim(p_notas), '')
   where id = p_id;

  delete from public.lineas_factura where factura_id = p_id;
  insert into public.lineas_factura
    (factura_id, orden, servicio_id, descripcion, cantidad, unidad, precio_unitario, descuento_pct, tipo_iva)
  select p_id, e.ord::integer,
         nullif(e.obj ->> 'servicio_id', '')::uuid,
         btrim(e.obj ->> 'descripcion'),
         (e.obj ->> 'cantidad')::numeric,
         coalesce(nullif(e.obj ->> 'unidad', ''), 'servicio'),
         (e.obj ->> 'precio_unitario')::numeric,
         coalesce(nullif(e.obj ->> 'descuento_pct', '')::numeric, 0),
         coalesce(nullif(e.obj ->> 'tipo_iva', '')::numeric, 21)
    from jsonb_array_elements(p_lineas) with ordinality as e(obj, ord);

  perform public.recalcular_factura(p_id);
end $$;

-- ============================================================
-- 8) EMITIR: número definitivo + copia de los datos fiscales. Desde aquí es inmutable.
-- ============================================================
create or replace function public.emitir_factura(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  f public.facturas; e public.datos_emisor; c public.empresas;
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_faltan text[] := '{}'; v_numero text;
begin
  if not public.es_finanzas() then raise exception 'Solo finanzas puede emitir facturas'; end if;
  select * into f from public.facturas where id = p_id for update;
  if not found then raise exception 'La factura no existe'; end if;
  if f.estado <> 'borrador' then raise exception 'Esta factura ya está emitida'; end if;
  if f.tipo <> 'ordinaria' then raise exception 'Las rectificativas se emiten al anular una factura'; end if;

  perform public.recalcular_factura(p_id);
  select * into f from public.facturas where id = p_id;
  if not exists (select 1 from public.lineas_factura where factura_id = p_id) then
    raise exception 'Añade al menos una línea antes de emitir la factura';
  end if;
  if f.total <= 0 then raise exception 'El total de la factura debe ser mayor que cero'; end if;

  select * into e from public.datos_emisor where id;
  if coalesce(btrim(e.razon_social), '') = '' then v_faltan := array_append(v_faltan, 'razón social de la empresa emisora'); end if;
  if coalesce(btrim(e.nif), '') = '' then v_faltan := array_append(v_faltan, 'NIF de la empresa emisora'); end if;
  if coalesce(btrim(e.direccion), '') = '' or coalesce(e.codigo_postal, '') = '' or coalesce(e.ciudad, '') = '' then
    v_faltan := array_append(v_faltan, 'dirección de la empresa emisora');
  end if;
  select * into c from public.empresas where id = f.empresa_id;
  if coalesce(btrim(c.nif), '') = '' then v_faltan := array_append(v_faltan, 'NIF/CIF del cliente'); end if;
  if coalesce(btrim(c.direccion_fiscal), '') = '' or coalesce(c.codigo_postal, '') = '' or coalesce(c.ciudad, '') = '' then
    v_faltan := array_append(v_faltan, 'dirección fiscal del cliente');
  end if;
  if array_length(v_faltan, 1) > 0 then
    raise exception 'Faltan datos para emitir la factura: %', array_to_string(v_faltan, ', ');
  end if;

  v_numero := public.siguiente_numero('FAC');
  update public.facturas set
    numero = v_numero, estado = 'emitida', fecha_emision = v_hoy, fecha_vencimiento = v_hoy + dias_pago,
    cliente_nombre = coalesce(nullif(btrim(c.razon_social), ''), c.nombre), cliente_nif = upper(btrim(c.nif)),
    cliente_direccion = btrim(c.direccion_fiscal) || ', ' || c.codigo_postal || ' ' || c.ciudad || ', ' || c.pais,
    cliente_email = c.email_facturacion,
    emisor_nombre = btrim(e.razon_social), emisor_nif = upper(btrim(e.nif)),
    emisor_direccion = btrim(e.direccion) || ', ' || e.codigo_postal || ' ' || e.ciudad || ', ' || e.pais,
    emisor_email = e.email, emisor_iban = e.iban, emisor_pie = e.texto_pie,
    emitida_en = now(), emitida_por = auth.uid(), updated_at = now()
  where id = p_id;
  return v_numero;
end $$;

-- ============================================================
-- 9) ANULAR: emite una rectificativa (REC) con las líneas en negativo y marca la original como anulada
-- ============================================================
create or replace function public.anular_factura(p_id uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f public.facturas; v_id uuid; v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if not public.es_finanzas() then raise exception 'Solo finanzas puede anular facturas'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Indica el motivo de la anulación (mínimo 5 caracteres)'; end if;
  select * into f from public.facturas where id = p_id for update;
  if not found then raise exception 'La factura no existe'; end if;
  if f.tipo <> 'ordinaria' then raise exception 'Una rectificativa no se puede anular'; end if;
  if f.estado = 'anulada' then raise exception 'Esta factura ya está anulada'; end if;
  if f.estado = 'borrador' then raise exception 'Un borrador no se anula: elimínalo'; end if;
  if exists (select 1 from public.pagos where factura_id = p_id) then
    raise exception 'La factura tiene cobros registrados: elimínalos antes de anularla';
  end if;

  insert into public.facturas (tipo, empresa_id, rectifica_id, motivo, dias_pago, forma_pago)
  values ('rectificativa', f.empresa_id, f.id, btrim(p_motivo), 0, f.forma_pago) returning id into v_id;

  insert into public.lineas_factura (factura_id, orden, servicio_id, descripcion, cantidad, unidad, precio_unitario, descuento_pct, tipo_iva)
  select v_id, orden, servicio_id, descripcion, -cantidad, unidad, precio_unitario, descuento_pct, tipo_iva
    from public.lineas_factura where factura_id = f.id order by orden;
  perform public.recalcular_factura(v_id);

  update public.facturas set
    numero = public.siguiente_numero('REC'), estado = 'emitida', fecha_emision = v_hoy, fecha_vencimiento = v_hoy,
    cliente_nombre = f.cliente_nombre, cliente_nif = f.cliente_nif, cliente_direccion = f.cliente_direccion, cliente_email = f.cliente_email,
    emisor_nombre = f.emisor_nombre, emisor_nif = f.emisor_nif, emisor_direccion = f.emisor_direccion,
    emisor_email = f.emisor_email, emisor_iban = f.emisor_iban, emisor_pie = f.emisor_pie,
    emitida_en = now(), emitida_por = auth.uid(), updated_at = now()
  where id = v_id;

  update public.facturas set estado = 'anulada', updated_at = now() where id = f.id;
  return v_id;
end $$;

-- ============================================================
-- 10) PAGOS
-- ============================================================
create or replace function public.registrar_pago(
  p_factura_id uuid, p_fecha date, p_importe numeric, p_metodo text, p_referencia text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare f public.facturas; v_hoy date := (now() at time zone 'Europe/Madrid')::date; v_nuevo numeric(14,2);
begin
  if not public.es_finanzas() then raise exception 'Solo finanzas puede registrar cobros'; end if;
  select * into f from public.facturas where id = p_factura_id for update;
  if not found then raise exception 'La factura no existe'; end if;
  if f.tipo <> 'ordinaria' or f.estado not in ('emitida', 'pagada') then
    raise exception 'Solo se pueden registrar cobros en facturas emitidas';
  end if;
  if f.estado = 'pagada' then raise exception 'Esta factura ya está pagada por completo'; end if;
  if p_importe is null or p_importe <= 0 then raise exception 'El importe del cobro debe ser mayor que cero'; end if;
  if p_fecha is null or p_fecha > v_hoy then raise exception 'La fecha del cobro no puede ser futura'; end if;
  if p_fecha < f.fecha_emision then raise exception 'La fecha del cobro no puede ser anterior a la de la factura'; end if;
  if round(p_importe, 2) > f.total - f.pagado then
    raise exception 'El importe supera lo pendiente de cobro (% €)', (f.total - f.pagado);
  end if;

  insert into public.pagos (factura_id, fecha, importe, metodo, referencia, registrado_por)
  values (p_factura_id, p_fecha, round(p_importe, 2), p_metodo, nullif(btrim(p_referencia), ''), auth.uid());

  v_nuevo := f.pagado + round(p_importe, 2);
  update public.facturas
     set pagado = v_nuevo,
         estado = case when v_nuevo = f.total then 'pagada' else 'emitida' end,
         pagada_en = case when v_nuevo = f.total then now() else null end,
         updated_at = now()
   where id = p_factura_id;
end $$;

create or replace function public.eliminar_pago(p_pago_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pg public.pagos; f public.facturas;
begin
  if not public.es_finanzas() then raise exception 'Solo finanzas puede eliminar cobros'; end if;
  select * into pg from public.pagos where id = p_pago_id;
  if not found then raise exception 'El cobro no existe'; end if;
  select * into f from public.facturas where id = pg.factura_id for update;
  if f.estado not in ('emitida', 'pagada') then raise exception 'No se pueden eliminar cobros de esta factura'; end if;

  delete from public.pagos where id = p_pago_id;
  update public.facturas
     set pagado = f.pagado - pg.importe, estado = 'emitida', pagada_en = null, updated_at = now()
   where id = f.id;
end $$;

revoke execute on function
  public.crear_factura_desde_presupuesto(uuid), public.guardar_factura(uuid, integer, text, text, jsonb),
  public.emitir_factura(uuid), public.anular_factura(uuid, text),
  public.registrar_pago(uuid, date, numeric, text, text), public.eliminar_pago(uuid)
  from public, anon;
grant execute on function
  public.crear_factura_desde_presupuesto(uuid), public.guardar_factura(uuid, integer, text, text, jsonb),
  public.emitir_factura(uuid), public.anular_factura(uuid, text),
  public.registrar_pago(uuid, date, numeric, text, text), public.eliminar_pago(uuid)
  to authenticated;
