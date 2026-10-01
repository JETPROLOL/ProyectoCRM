-- FASE 0 de RRHH: base común. Es ADITIVA: no rompe nada de lo que ya funciona.
-- Ejecutar una sola vez en Supabase > SQL Editor.

-- 1) La tabla empleados pasa a ser la ficha del trabajador
alter table public.empleados
  add column if not exists puesto text,
  add column if not exists foto_path text,   -- ruta dentro del bucket "fotos", no la URL
  add column if not exists estado text not null default 'activo' check (estado in ('activo','baja')),
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

-- 2) Roles: quien no tenga fila aquí se considera "empleado"
create table if not exists public.roles_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol text not null default 'empleado' check (rol in ('rrhh','empleado'))
);
alter table public.roles_usuario enable row level security;

-- 3) Funciones de apoyo (las usarán las políticas RLS de todas las secciones)
create or replace function public.es_rrhh() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roles_usuario where user_id = auth.uid() and rol = 'rrhh');
$$;

create or replace function public.mi_empleado_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.empleados where user_id = auth.uid() limit 1;
$$;

create or replace function public.mi_perfil() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('es_rrhh', public.es_rrhh(), 'empleado_id', public.mi_empleado_id());
$$;

-- Vincula al usuario logueado con la ficha que tenga su mismo correo (solo si aún no está vinculado)
create or replace function public.vincular_usuario_actual() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or v_email is null then return null; end if;
  if not exists (select 1 from public.empleados where user_id = auth.uid()) then
    update public.empleados set user_id = auth.uid()
     where id = (select id from public.empleados
                  where user_id is null and lower(email) = v_email
                  order by created_at limit 1);
  end if;
  return public.mi_empleado_id();
end $$;

revoke execute on function public.es_rrhh(), public.mi_empleado_id(), public.mi_perfil(),
  public.vincular_usuario_actual() from public, anon;
grant execute on function public.es_rrhh(), public.mi_empleado_id(), public.mi_perfil(),
  public.vincular_usuario_actual() to authenticated;

-- 4) Políticas de roles_usuario
drop policy if exists "ver mi rol o todos si rrhh" on public.roles_usuario;
create policy "ver mi rol o todos si rrhh" on public.roles_usuario
  for select to authenticated using (user_id = auth.uid() or public.es_rrhh());
drop policy if exists "rrhh gestiona roles" on public.roles_usuario;
create policy "rrhh gestiona roles" on public.roles_usuario
  for all to authenticated using (public.es_rrhh()) with check (public.es_rrhh());
grant select, insert, update, delete on public.roles_usuario to authenticated;

-- 5) Storage: fotos (público, solo imágenes), cvs y nóminas (privados, solo PDF)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('fotos',   'fotos',   true,  2097152, array['image/jpeg','image/png','image/webp']),
  ('cvs',     'cvs',     false, 5242880, array['application/pdf']),
  ('nominas', 'nominas', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "rrhh gestiona fotos" on storage.objects;
create policy "rrhh gestiona fotos" on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and public.es_rrhh()) with check (bucket_id = 'fotos' and public.es_rrhh());

drop policy if exists "rrhh gestiona cvs" on storage.objects;
create policy "rrhh gestiona cvs" on storage.objects for all to authenticated
  using (bucket_id = 'cvs' and public.es_rrhh()) with check (bucket_id = 'cvs' and public.es_rrhh());

drop policy if exists "rrhh gestiona nominas" on storage.objects;
create policy "rrhh gestiona nominas" on storage.objects for all to authenticated
  using (bucket_id = 'nominas' and public.es_rrhh()) with check (bucket_id = 'nominas' and public.es_rrhh());

-- Convención: las nóminas se guardan como <empleado_id>/<archivo>.pdf, así cada empleado solo lee su carpeta
drop policy if exists "empleado lee sus nominas" on storage.objects;
create policy "empleado lee sus nominas" on storage.objects for select to authenticated
  using (bucket_id = 'nominas' and (storage.foldername(name))[1] = public.mi_empleado_id()::text);

-- 6) PRIMER USUARIO DE RRHH (hay que hacerlo a mano una vez).
-- Crea antes el usuario en Authentication > Users y luego ejecuta, cambiando el correo:
--
--   insert into public.roles_usuario (user_id, rol)
--   select id, 'rrhh' from auth.users where email = 'correo-de-rrhh@ejemplo.com'
--   on conflict (user_id) do update set rol = 'rrhh';
