-- ARCHIVOS / NÓMINAS: cada empleado sube su nómina (PDF) y la firma.
-- Requiere 20260930_rrhh_base.sql (buckets y funciones). Ejecutar una sola vez en Supabase > SQL Editor.

create table if not exists public.nominas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  periodo date not null check (periodo = date_trunc('month', periodo)::date),   -- siempre el día 1 del mes
  archivo_path text not null,                                                   -- ruta dentro del bucket "nominas"
  nombre_archivo text not null check (char_length(nombre_archivo) <= 200),
  firmada boolean not null default false,
  firmada_en timestamptz,
  firmada_por uuid references auth.users(id) on delete set null,
  firma_nombre text check (char_length(firma_nombre) between 3 and 150),
  -- El archivo debe estar en la carpeta del propio empleado (convención del bucket): nadie puede apuntar a la de otro
  check (archivo_path like empleado_id::text || '/%'),
  check (firmada = (firmada_en is not null))
);
create index if not exists nominas_empleado_idx on public.nominas (empleado_id, periodo desc);

alter table public.nominas enable row level security;
revoke all on public.nominas from anon, authenticated;
grant select, delete on public.nominas to authenticated;
-- La firma NO se escribe desde el navegador: solo la función firmar_nomina()
grant insert (empleado_id, periodo, archivo_path, nombre_archivo) on public.nominas to authenticated;

drop policy if exists "ver mis nominas o todas si rrhh" on public.nominas;
create policy "ver mis nominas o todas si rrhh" on public.nominas
  for select to authenticated using (public.es_rrhh() or empleado_id = public.mi_empleado_id());
drop policy if exists "subir mi nomina o rrhh" on public.nominas;
create policy "subir mi nomina o rrhh" on public.nominas
  for insert to authenticated with check (public.es_rrhh() or empleado_id = public.mi_empleado_id());
-- Una nómina firmada ya no la puede borrar el empleado; RRHH sí
drop policy if exists "borrar mi nomina sin firmar o rrhh" on public.nominas;
create policy "borrar mi nomina sin firmar o rrhh" on public.nominas
  for delete to authenticated using (public.es_rrhh() or (empleado_id = public.mi_empleado_id() and not firmada));

-- Firma electrónica simple: el empleado confirma con su nombre. La fecha y el usuario los pone siempre la base de datos.
create or replace function public.firmar_nomina(p_id uuid, p_nombre text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.mi_empleado_id() is null then raise exception 'Tu usuario no está vinculado a una ficha de empleado'; end if;
  update public.nominas
     set firmada = true, firmada_en = now(), firmada_por = auth.uid(), firma_nombre = btrim(p_nombre)
   where id = p_id and empleado_id = public.mi_empleado_id() and not firmada;
  if not found then raise exception 'No puedes firmar esta nómina (no es tuya o ya está firmada)'; end if;
end $$;
revoke execute on function public.firmar_nomina(uuid, text) from public, anon;
grant execute on function public.firmar_nomina(uuid, text) to authenticated;

-- Storage: la base ya deja a RRHH gestionar todo y a cada empleado LEER su carpeta.
-- Aquí se añade que cada empleado pueda SUBIR a su carpeta y borrar archivos suyos que aún no estén firmados.
drop policy if exists "empleado sube sus nominas" on storage.objects;
create policy "empleado sube sus nominas" on storage.objects for insert to authenticated
  with check (bucket_id = 'nominas' and (storage.foldername(name))[1] = public.mi_empleado_id()::text);

drop policy if exists "empleado borra sus nominas sin firmar" on storage.objects;
create policy "empleado borra sus nominas sin firmar" on storage.objects for delete to authenticated
  using (
    bucket_id = 'nominas' and (storage.foldername(name))[1] = public.mi_empleado_id()::text
    and not exists (select 1 from public.nominas n where n.archivo_path = name and n.firmada)
  );
