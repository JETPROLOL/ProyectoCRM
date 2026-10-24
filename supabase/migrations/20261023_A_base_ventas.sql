-- VENTAS Y FACTURACIÓN · Fase 0: base común. Es ADITIVA: no rompe nada de lo que ya funciona.
-- Requiere 20260930_rrhh_base.sql. Ejecutar una sola vez en Supabase > SQL Editor.
--
-- Qué añade:
--   1) Roles nuevos (ventas, finanzas, admin) y sus funciones es_ventas() / es_finanzas()
--   2) Datos fiscales en empresas (las empresas son los CLIENTES: se les vende y se les factura)
--   3) Oportunidades enlazadas a una empresa real (empresa_id) y a un vendedor (vendedor_id, sin UNIQUE)
--   4) Catálogo de servicios con precio e IVA
--   5) Numeración correlativa de documentos (PRE-2026-0001, FAC-2026-0001...)

-- ============================================================
-- 1) ROLES
-- ============================================================
-- admin: acceso completo a ventas y facturación · finanzas: factura y cobra · ventas: presupuestos
-- Un usuario tiene un único rol. Quien no tenga fila en roles_usuario sigue siendo "empleado".
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.roles_usuario'::regclass and contype = 'c' loop
    execute format('alter table public.roles_usuario drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.roles_usuario
  add constraint roles_usuario_rol_check check (rol in ('rrhh','empleado','ventas','finanzas','admin'));

create or replace function public.tiene_rol(p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roles_usuario where user_id = auth.uid() and rol = any (p_roles));
$$;

-- Ventas lo ven y gestionan ventas, finanzas y admin (finanzas necesita ver lo vendido para facturarlo)
create or replace function public.es_ventas() returns boolean
language sql stable security definer set search_path = public as $$
  select public.tiene_rol(array['ventas','finanzas','admin']);
$$;

create or replace function public.es_finanzas() returns boolean
language sql stable security definer set search_path = public as $$
  select public.tiene_rol(array['finanzas','admin']);
$$;

-- Mismo perfil de siempre más los dos permisos nuevos (la interfaz de RRHH ignora los campos extra)
create or replace function public.mi_perfil() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'es_rrhh', public.es_rrhh(),
    'empleado_id', public.mi_empleado_id(),
    'es_ventas', public.es_ventas(),
    'es_finanzas', public.es_finanzas()
  );
$$;

revoke execute on function public.tiene_rol(text[]), public.es_ventas(), public.es_finanzas(), public.mi_perfil()
  from public, anon;
grant execute on function public.tiene_rol(text[]), public.es_ventas(), public.es_finanzas(), public.mi_perfil()
  to authenticated;

-- ============================================================
-- 2) DATOS FISCALES DE LAS EMPRESAS (clientes)
-- ============================================================
-- Todos opcionales para no romper las empresas que ya existen. La factura exigirá NIF y dirección al emitirse.
alter table public.empresas
  add column if not exists razon_social text check (char_length(razon_social) <= 160),
  add column if not exists nif text check (char_length(nif) between 5 and 20),
  add column if not exists direccion_fiscal text check (char_length(direccion_fiscal) <= 200),
  add column if not exists codigo_postal text check (char_length(codigo_postal) between 4 and 10),
  add column if not exists ciudad text check (char_length(ciudad) <= 100),
  add column if not exists pais text not null default 'España' check (char_length(pais) between 2 and 60),
  add column if not exists email_facturacion text
    check (char_length(email_facturacion) <= 160 and email_facturacion ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column if not exists telefono text check (char_length(telefono) between 5 and 30),
  add column if not exists dias_pago integer not null default 30 check (dias_pago between 0 and 120);

-- Un mismo NIF no puede estar en dos clientes (da igual mayúsculas o espacios)
create unique index if not exists empresas_nif_uidx on public.empresas (upper(btrim(nif))) where nif is not null;

-- ============================================================
-- 3) OPORTUNIDADES ↔ EMPRESAS Y VENDEDOR
-- ============================================================
-- empresa (texto) es lo que escribió el visitante en la web; empresa_id es el cliente real del CRM.
-- vendedor_id es quien lleva la venta. No se usa empleado_id porque es UNIQUE (un empleado, una oportunidad).
alter table public.oportunidades
  add column if not exists empresa_id uuid references public.empresas(id) on delete set null,
  add column if not exists vendedor_id uuid references public.empleados(id) on delete set null;
create index if not exists oportunidades_empresa_idx on public.oportunidades (empresa_id);
create index if not exists oportunidades_vendedor_idx on public.oportunidades (vendedor_id);

-- Enlaza las oportunidades que ya existen cuando el nombre coincide con UNA sola empresa
update public.oportunidades o
   set empresa_id = e.id
  from public.empresas e
 where o.empresa_id is null
   and o.empresa is not null
   and lower(btrim(o.empresa)) = lower(btrim(e.nombre))
   and (select count(*) from public.empresas x where lower(btrim(x.nombre)) = lower(btrim(o.empresa))) = 1;

-- La web pública solo puede crear oportunidades "limpias": sin empleado, sin empresa enlazada y sin vendedor
drop policy if exists "web crea oportunidades" on public.oportunidades;
create policy "web crea oportunidades" on public.oportunidades
  for insert to anon, authenticated
  with check (estado = 'nueva' and valor_estimado is null
              and empleado_id is null and empresa_id is null and vendedor_id is null);

-- ============================================================
-- 4) CATÁLOGO DE SERVICIOS
-- ============================================================
create table if not exists public.servicios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  codigo text not null unique check (codigo ~ '^[A-Z0-9-]{2,20}$'),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  descripcion text check (char_length(descripcion) <= 500),
  unidad text not null default 'servicio' check (unidad in ('servicio','envío','palé','kg','hora','km')),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  tipo_iva numeric(4,2) not null default 21 check (tipo_iva in (0, 4, 10, 21)),
  activo boolean not null default true
);

alter table public.servicios enable row level security;
revoke all on public.servicios from anon, authenticated;
grant select, insert, update on public.servicios to authenticated;   -- no se borra: se desactiva (activo = false)

drop policy if exists "ventas lee servicios" on public.servicios;
create policy "ventas lee servicios" on public.servicios
  for select to authenticated using (public.es_ventas());
drop policy if exists "ventas crea servicios" on public.servicios;
create policy "ventas crea servicios" on public.servicios
  for insert to authenticated with check (public.es_ventas());
drop policy if exists "ventas edita servicios" on public.servicios;
create policy "ventas edita servicios" on public.servicios
  for update to authenticated using (public.es_ventas()) with check (public.es_ventas());

-- Servicios de ejemplo (precios ficticios; se pueden editar desde el CRM)
insert into public.servicios (codigo, nombre, descripcion, unidad, precio_unitario, tipo_iva) values
  ('TRN-NAC', 'Transporte nacional', 'Transporte de mercancía por carretera dentro de España', 'envío', 180.00, 21),
  ('TRN-INT', 'Transporte internacional', 'Transporte de mercancía por carretera a países de la UE', 'envío', 950.00, 21),
  ('ALM-DIS', 'Almacenaje y distribución', 'Almacenaje en nave y distribución posterior (precio por palé y mes)', 'palé', 14.50, 21),
  ('ULT-MIL', 'Última milla', 'Entrega final al destinatario en entorno urbano', 'envío', 6.90, 21),
  ('TRN-REF', 'Transporte refrigerado', 'Transporte con temperatura controlada', 'envío', 260.00, 21),
  ('ADU-GES', 'Gestión aduanera', 'Tramitación de documentación y despacho aduanero', 'servicio', 120.00, 21)
on conflict (codigo) do nothing;

-- ============================================================
-- 5) NUMERACIÓN CORRELATIVA DE DOCUMENTOS
-- ============================================================
-- Un contador por serie y año: PRE-2026-0001, PRE-2026-0002... y al cambiar de año vuelve a 0001.
-- El número se reserva dentro de la misma transacción que crea el documento: si esta falla, el número
-- no se consume, así que no quedan saltos (requisito de las facturas).
create table if not exists public.contadores_documentos (
  serie text not null check (serie ~ '^[A-Z]{2,5}$'),
  anio integer not null,
  ultimo integer not null default 0,
  primary key (serie, anio)
);
alter table public.contadores_documentos enable row level security;
revoke all on public.contadores_documentos from anon, authenticated;   -- solo se toca desde las funciones

create or replace function public.siguiente_numero(p_serie text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_anio integer := extract(year from (now() at time zone 'Europe/Madrid'))::integer;
  v_n integer;
begin
  -- El upsert bloquea la fila del contador: dos usuarios a la vez nunca obtienen el mismo número
  insert into public.contadores_documentos (serie, anio, ultimo) values (p_serie, v_anio, 1)
  on conflict (serie, anio) do update set ultimo = public.contadores_documentos.ultimo + 1
  returning ultimo into v_n;
  return p_serie || '-' || v_anio || '-' || lpad(v_n::text, 4, '0');
end $$;

-- Solo la usarán otras funciones (presupuestos, facturas); la interfaz no la llama directamente
revoke execute on function public.siguiente_numero(text) from public, anon, authenticated;

-- ============================================================
-- 6) ASIGNAR ROLES (a mano, una vez por usuario)
-- ============================================================
-- Crea antes el usuario en Authentication > Users y ejecuta, cambiando el correo y el rol
-- (ventas, finanzas o admin). Quien ya sea 'rrhh' pasaría a tener solo el nuevo rol: usa admin para uno principal.
--
--   insert into public.roles_usuario (user_id, rol)
--   select id, 'admin' from auth.users where email = 'correo@ejemplo.com'
--   on conflict (user_id) do update set rol = excluded.rol;
