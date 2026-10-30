-- VENTAS · FACTURAS DE PROVEEDOR (las que NOSOTROS tenemos que pagar).
-- Requiere 20261023_A_base_ventas.sql (es_ventas / es_finanzas). Ejecutar una sola vez en Supabase > SQL Editor.
--
-- Son una tabla APARTE de public.facturas (las que emitimos nosotros a partir de un presupuesto):
-- no llevan numeración propia, ni líneas, ni inmutabilidad; son el PDF de otra empresa más los datos que lee el agente.
--
-- Flujo:
--   1) Finanzas sube el PDF desde el CRM  → se guarda en el bucket privado "facturas-proveedor" y se crea una fila
--      con estado 'pendiente_lectura'.
--   2) El agente de IA (Automatizacion_empresa/facturas/agente.py, con la clave secreta de Supabase) coge las filas
--      'pendiente_lectura', lee el PDF y rellena numero, fecha, proveedor, nif, base, iva, total y correcta.
--        · correcta = true  → estado 'por_pagar'
--        · correcta = false → estado 'revisar' (faltan datos o base + IVA no suma el total)
--        · fallo al leer    → estado 'error_lectura' (con el motivo en error_lectura)
--   3) Finanzas la marca como pagada cuando la paga.
--
-- La interfaz solo escribe lo mínimo (archivo + nombre + huella); los datos leídos solo los escribe el agente.

-- ============================================================
-- 1) TABLA
-- ============================================================
create table if not exists public.facturas_proveedor (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Archivo
  archivo_path text not null unique check (archivo_path ~ '^[0-9a-f-]{36}\.pdf$'),   -- ruta dentro del bucket "facturas-proveedor"
  nombre_archivo text not null check (char_length(nombre_archivo) between 1 and 200),
  hash_archivo text not null check (hash_archivo ~ '^[0-9a-f]{64}$'),                 -- SHA-256: evita subir dos veces el mismo PDF
  subida_por uuid default auth.uid() references auth.users(id) on delete set null,

  -- Estado
  estado text not null default 'pendiente_lectura'
    check (estado in ('pendiente_lectura', 'leyendo', 'por_pagar', 'revisar', 'error_lectura', 'pagada')),
  lectura_iniciada_en timestamptz,
  leida_en timestamptz,
  error_lectura text check (char_length(error_lectura) <= 500),

  -- Datos que lee el agente (todos opcionales: "si un dato no aparece, se deja vacío")
  numero text check (char_length(numero) <= 80),
  fecha date,
  proveedor text check (char_length(proveedor) <= 200),
  nif text check (char_length(nif) <= 30),
  base numeric(14,2),
  iva numeric(14,2),
  total numeric(14,2),
  correcta boolean,

  -- Pago
  pagada_en timestamptz,
  pagada_por uuid references auth.users(id) on delete set null,
  constraint facturas_proveedor_pago_ck check ((estado = 'pagada') = (pagada_en is not null))
);

create unique index if not exists facturas_proveedor_hash_uidx on public.facturas_proveedor (hash_archivo);
create index if not exists facturas_proveedor_estado_idx on public.facturas_proveedor (estado, created_at desc);
create index if not exists facturas_proveedor_fecha_idx on public.facturas_proveedor (fecha desc);

create or replace function public.facturas_proveedor_tocar() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists facturas_proveedor_tocar_tg on public.facturas_proveedor;
create trigger facturas_proveedor_tocar_tg before update on public.facturas_proveedor
  for each row execute function public.facturas_proveedor_tocar();

-- ============================================================
-- 2) PERMISOS
--    Ventas, finanzas y admin LEEN. Solo finanzas/admin suben y borran.
--    Los datos leídos y el estado NO se escriben desde el navegador: el agente usa la clave secreta (service role),
--    que se salta RLS, y el pago pasa por funciones.
-- ============================================================
alter table public.facturas_proveedor enable row level security;
revoke all on public.facturas_proveedor from anon, authenticated;
grant select, delete on public.facturas_proveedor to authenticated;
grant insert (archivo_path, nombre_archivo, hash_archivo) on public.facturas_proveedor to authenticated;

drop policy if exists "ventas lee facturas proveedor" on public.facturas_proveedor;
create policy "ventas lee facturas proveedor" on public.facturas_proveedor
  for select to authenticated using (public.es_ventas());

-- Al subir solo se puede crear una fila "limpia" (estado por defecto, sin datos leídos)
drop policy if exists "finanzas sube facturas proveedor" on public.facturas_proveedor;
create policy "finanzas sube facturas proveedor" on public.facturas_proveedor
  for insert to authenticated with check (public.es_finanzas());

drop policy if exists "finanzas borra facturas proveedor" on public.facturas_proveedor;
create policy "finanzas borra facturas proveedor" on public.facturas_proveedor
  for delete to authenticated using (public.es_finanzas() and estado <> 'pagada');

-- ============================================================
-- 3) FUNCIONES (pagar / deshacer el pago / reintentar la lectura)
-- ============================================================
create or replace function public.pagar_factura_proveedor(p_id uuid, p_pagada boolean) returns void
language plpgsql security definer set search_path = public as $$
declare f public.facturas_proveedor;
begin
  if not public.es_finanzas() then raise exception 'Solo finanzas puede registrar pagos'; end if;
  select * into f from public.facturas_proveedor where id = p_id for update;
  if not found then raise exception 'La factura no existe'; end if;

  if p_pagada then
    if f.estado = 'pagada' then raise exception 'Esta factura ya está marcada como pagada'; end if;
    if f.estado not in ('por_pagar', 'revisar') then
      raise exception 'Solo se puede marcar como pagada una factura ya leída (por pagar o por revisar)';
    end if;
    update public.facturas_proveedor
       set estado = 'pagada', pagada_en = now(), pagada_por = auth.uid() where id = p_id;
  else
    if f.estado <> 'pagada' then raise exception 'Esta factura no está pagada'; end if;
    -- Vuelve a "por pagar" si sus datos estaban bien y a "revisar" si no
    update public.facturas_proveedor
       set estado = case when correcta then 'por_pagar' else 'revisar' end, pagada_en = null, pagada_por = null
     where id = p_id;
  end if;
end $$;

-- Devuelve la factura a la cola del agente (p. ej. si falló la lectura o los datos salieron mal)
create or replace function public.reintentar_lectura_factura_proveedor(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f public.facturas_proveedor;
begin
  if not public.es_finanzas() then raise exception 'Solo finanzas puede reintentar la lectura'; end if;
  select * into f from public.facturas_proveedor where id = p_id for update;
  if not found then raise exception 'La factura no existe'; end if;
  if f.estado not in ('error_lectura', 'revisar') then
    raise exception 'Solo se puede reintentar la lectura de una factura con error o por revisar';
  end if;
  update public.facturas_proveedor
     set estado = 'pendiente_lectura', error_lectura = null, lectura_iniciada_en = null, leida_en = null,
         numero = null, fecha = null, proveedor = null, nif = null, base = null, iva = null, total = null, correcta = null
   where id = p_id;
end $$;

revoke execute on function public.pagar_factura_proveedor(uuid, boolean), public.reintentar_lectura_factura_proveedor(uuid)
  from public, anon;
grant execute on function public.pagar_factura_proveedor(uuid, boolean), public.reintentar_lectura_factura_proveedor(uuid)
  to authenticated;

-- ============================================================
-- 4) STORAGE: bucket privado solo PDF (10 MB). Leen ventas/finanzas/admin; suben y borran finanzas/admin.
--    (El agente descarga con la clave secreta, que no necesita política.)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('facturas-proveedor', 'facturas-proveedor', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

drop policy if exists "ventas lee facturas proveedor (archivos)" on storage.objects;
create policy "ventas lee facturas proveedor (archivos)" on storage.objects for select to authenticated
  using (bucket_id = 'facturas-proveedor' and public.es_ventas());

drop policy if exists "finanzas sube facturas proveedor (archivos)" on storage.objects;
create policy "finanzas sube facturas proveedor (archivos)" on storage.objects for insert to authenticated
  with check (bucket_id = 'facturas-proveedor' and public.es_finanzas());

drop policy if exists "finanzas borra facturas proveedor (archivos)" on storage.objects;
create policy "finanzas borra facturas proveedor (archivos)" on storage.objects for delete to authenticated
  using (bucket_id = 'facturas-proveedor' and public.es_finanzas());
