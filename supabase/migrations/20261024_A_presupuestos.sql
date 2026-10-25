-- VENTAS · Fase 1: presupuestos con líneas, IVA por tipo, descuentos y estados.
-- Requiere 20261023_A_base_ventas.sql. Ejecutar una sola vez en Supabase > SQL Editor.
--
-- Diseño: la interfaz solo LEE las tablas. Todo lo que escribe (crear, guardar, cambiar de estado) pasa
-- por funciones que validan permisos y reglas en el servidor y recalculan los totales. Nadie puede
-- dejar un total incoherente ni saltarse el flujo de estados desde el navegador.

-- ============================================================
-- 1) TABLAS
-- ============================================================
create table if not exists public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  numero text not null unique,                              -- PRE-2026-0001
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  oportunidad_id uuid references public.oportunidades(id) on delete set null,
  vendedor_id uuid references public.empleados(id) on delete set null,
  estado text not null default 'borrador'
    check (estado in ('borrador','enviado','aceptado','rechazado','caducado')),
  fecha date not null default (now() at time zone 'Europe/Madrid')::date,
  validez_hasta date not null default ((now() at time zone 'Europe/Madrid')::date + 30),
  notas text check (char_length(notas) <= 2000),
  -- Totales: los calcula recalcular_presupuesto(); la interfaz no puede escribirlos
  base_imponible numeric(14,2) not null default 0,
  iva_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  enviado_en timestamptz,
  resuelto_en timestamptz,
  constraint presupuestos_validez_check check (validez_hasta >= fecha)
);
create index if not exists presupuestos_empresa_idx on public.presupuestos (empresa_id);
create index if not exists presupuestos_oportunidad_idx on public.presupuestos (oportunidad_id);
create index if not exists presupuestos_estado_idx on public.presupuestos (estado, fecha desc);

create table if not exists public.lineas_presupuesto (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  orden integer not null default 0,
  servicio_id uuid references public.servicios(id) on delete set null,
  descripcion text not null check (char_length(btrim(descripcion)) between 1 and 300),
  cantidad numeric(10,2) not null check (cantidad >= 0.01 and cantidad <= 100000),
  unidad text not null default 'servicio' check (unidad in ('servicio','envío','palé','kg','hora','km')),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0 and precio_unitario <= 1000000),
  descuento_pct numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  tipo_iva numeric(4,2) not null default 21 check (tipo_iva in (0, 4, 10, 21)),
  -- Base de la línea = cantidad × precio × (1 − descuento), redondeada a céntimos
  importe_base numeric(14,2) generated always as
    (round(cantidad * precio_unitario * (100 - descuento_pct) / 100, 2)) stored
);
create index if not exists lineas_presupuesto_idx on public.lineas_presupuesto (presupuesto_id, orden);

-- ============================================================
-- 2) TOTALES
-- ============================================================
-- El IVA se calcula sobre la suma de bases de cada tipo (no línea a línea), como en una factura.
create or replace function public.recalcular_presupuesto(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_base numeric(14,2); v_iva numeric(14,2);
begin
  select coalesce(sum(g.base), 0), coalesce(sum(g.iva), 0) into v_base, v_iva
    from (select sum(importe_base) as base, round(sum(importe_base) * tipo_iva / 100, 2) as iva
            from public.lineas_presupuesto where presupuesto_id = p_id group by tipo_iva) g;
  update public.presupuestos
     set base_imponible = v_base, iva_total = v_iva, total = v_base + v_iva, updated_at = now()
   where id = p_id;
end $$;
revoke execute on function public.recalcular_presupuesto(uuid) from public, anon, authenticated;

-- ============================================================
-- 3) PERMISOS: la interfaz solo lee (y borra borradores)
-- ============================================================
alter table public.presupuestos enable row level security;
alter table public.lineas_presupuesto enable row level security;
revoke all on public.presupuestos, public.lineas_presupuesto from anon, authenticated;
grant select, delete on public.presupuestos to authenticated;
grant select on public.lineas_presupuesto to authenticated;

drop policy if exists "ventas lee presupuestos" on public.presupuestos;
create policy "ventas lee presupuestos" on public.presupuestos
  for select to authenticated using (public.es_ventas());
drop policy if exists "ventas borra borradores" on public.presupuestos;
create policy "ventas borra borradores" on public.presupuestos
  for delete to authenticated using (public.es_ventas() and estado = 'borrador');   -- sus líneas se borran en cascada
drop policy if exists "ventas lee lineas" on public.lineas_presupuesto;
create policy "ventas lee lineas" on public.lineas_presupuesto
  for select to authenticated using (public.es_ventas());

-- ============================================================
-- 4) CREAR (opcionalmente desde una oportunidad)
-- ============================================================
-- Si viene de una oportunidad: la enlaza con la empresa (si aún no la tenía) y precarga una línea
-- con el servicio que pidió el cliente, si coincide con uno del catálogo.
create or replace function public.crear_presupuesto(p_empresa_id uuid, p_oportunidad_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; o public.oportunidades; s public.servicios;
begin
  if not public.es_ventas() then raise exception 'No tienes permiso para crear presupuestos'; end if;
  if not exists (select 1 from public.empresas where id = p_empresa_id) then
    raise exception 'La empresa no existe';
  end if;

  if p_oportunidad_id is not null then
    select * into o from public.oportunidades where id = p_oportunidad_id for update;
    if not found then raise exception 'La oportunidad no existe'; end if;
    if o.empresa_id is not null and o.empresa_id <> p_empresa_id then
      raise exception 'Esa oportunidad ya está enlazada a otra empresa';
    end if;
    update public.oportunidades set empresa_id = p_empresa_id where id = p_oportunidad_id and empresa_id is null;
  end if;

  insert into public.presupuestos (numero, empresa_id, oportunidad_id, vendedor_id)
  values (public.siguiente_numero('PRE'), p_empresa_id, p_oportunidad_id, public.mi_empleado_id())
  returning id into v_id;

  if p_oportunidad_id is not null then
    select * into s from public.servicios where activo and lower(btrim(nombre)) = lower(btrim(o.servicio)) limit 1;
    if found then
      insert into public.lineas_presupuesto (presupuesto_id, orden, servicio_id, descripcion, cantidad, unidad, precio_unitario, tipo_iva)
      values (v_id, 1, s.id, s.nombre, 1, s.unidad, s.precio_unitario, s.tipo_iva);
      perform public.recalcular_presupuesto(v_id);
    end if;
  end if;
  return v_id;
end $$;

-- ============================================================
-- 5) GUARDAR (cabecera + todas las líneas en una sola transacción; solo en borrador)
-- ============================================================
-- p_lineas: [{servicio_id, descripcion, cantidad, unidad, precio_unitario, descuento_pct, tipo_iva}, ...]
create or replace function public.guardar_presupuesto(
  p_id uuid, p_fecha date, p_validez date, p_notas text, p_lineas jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare p public.presupuestos;
begin
  if not public.es_ventas() then raise exception 'No tienes permiso para editar presupuestos'; end if;
  select * into p from public.presupuestos where id = p_id for update;
  if not found then raise exception 'El presupuesto no existe'; end if;
  if p.estado <> 'borrador' then raise exception 'Solo se puede editar un presupuesto en borrador'; end if;
  if p_validez < p_fecha then raise exception 'La fecha de validez no puede ser anterior a la fecha del presupuesto'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then raise exception 'Las líneas no son válidas'; end if;
  if jsonb_array_length(p_lineas) > 100 then raise exception 'Un presupuesto admite como máximo 100 líneas'; end if;

  update public.presupuestos
     set fecha = p_fecha, validez_hasta = p_validez, notas = nullif(btrim(p_notas), '')
   where id = p_id;

  delete from public.lineas_presupuesto where presupuesto_id = p_id;
  insert into public.lineas_presupuesto
    (presupuesto_id, orden, servicio_id, descripcion, cantidad, unidad, precio_unitario, descuento_pct, tipo_iva)
  select p_id, e.ord::integer,
         nullif(e.obj ->> 'servicio_id', '')::uuid,
         btrim(e.obj ->> 'descripcion'),
         (e.obj ->> 'cantidad')::numeric,
         coalesce(nullif(e.obj ->> 'unidad', ''), 'servicio'),
         (e.obj ->> 'precio_unitario')::numeric,
         coalesce(nullif(e.obj ->> 'descuento_pct', '')::numeric, 0),
         coalesce(nullif(e.obj ->> 'tipo_iva', '')::numeric, 21)
    from jsonb_array_elements(p_lineas) with ordinality as e(obj, ord);

  perform public.recalcular_presupuesto(p_id);
end $$;

-- ============================================================
-- 6) CAMBIAR DE ESTADO (única vía; valida el flujo y actualiza la oportunidad)
-- ============================================================
--   borrador → enviado → aceptado | rechazado | caducado
--   enviado, caducado y rechazado pueden volver a borrador para renegociar; aceptado es definitivo.
create or replace function public.cambiar_estado_presupuesto(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.presupuestos;
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_ok boolean;
begin
  if not public.es_ventas() then raise exception 'No tienes permiso para cambiar presupuestos'; end if;
  select * into p from public.presupuestos where id = p_id for update;
  if not found then raise exception 'El presupuesto no existe'; end if;

  v_ok := case p.estado
    when 'borrador'  then p_estado = 'enviado'
    when 'enviado'   then p_estado in ('borrador','aceptado','rechazado','caducado')
    when 'caducado'  then p_estado = 'borrador'
    when 'rechazado' then p_estado = 'borrador'
    else false end;
  if not v_ok then raise exception 'No se puede pasar un presupuesto de % a %', p.estado, p_estado; end if;

  if p_estado = 'enviado' then
    if not exists (select 1 from public.lineas_presupuesto where presupuesto_id = p_id) then
      raise exception 'Añade al menos una línea antes de enviar el presupuesto';
    end if;
    if p.validez_hasta < v_hoy then raise exception 'La fecha de validez ya ha pasado: amplíala antes de enviarlo'; end if;
  end if;
  if p_estado = 'aceptado' and p.validez_hasta < v_hoy then
    raise exception 'El presupuesto ha caducado: vuélvelo a borrador y amplía la validez';
  end if;

  update public.presupuestos
     set estado = p_estado,
         enviado_en = case p_estado when 'enviado' then now() when 'borrador' then null else enviado_en end,
         resuelto_en = case when p_estado in ('aceptado','rechazado','caducado') then now() else null end,
         updated_at = now()
   where id = p_id;

  -- Efectos sobre la oportunidad del pipeline
  if p.oportunidad_id is not null then
    if p_estado = 'enviado' then
      update public.oportunidades set estado = 'propuesta'
       where id = p.oportunidad_id and estado in ('nueva','contactada');
    elsif p_estado = 'aceptado' then
      update public.oportunidades set estado = 'ganada', valor_estimado = p.total
       where id = p.oportunidad_id;
    end if;
  end if;
end $$;

-- Pasa a "caducado" los enviados cuya validez ha vencido (la lista la llama al abrirse)
create or replace function public.caducar_presupuestos() returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.es_ventas() then return 0; end if;
  update public.presupuestos
     set estado = 'caducado', resuelto_en = now(), updated_at = now()
   where estado = 'enviado' and validez_hasta < (now() at time zone 'Europe/Madrid')::date;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.crear_presupuesto(uuid, uuid), public.guardar_presupuesto(uuid, date, date, text, jsonb),
  public.cambiar_estado_presupuesto(uuid, text), public.caducar_presupuestos() from public, anon;
grant execute on function public.crear_presupuesto(uuid, uuid), public.guardar_presupuesto(uuid, date, date, text, jsonb),
  public.cambiar_estado_presupuesto(uuid, text), public.caducar_presupuestos() to authenticated;
