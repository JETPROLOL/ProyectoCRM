-- ADMISIÓN: solicitudes de trabajo que llegan desde la web pública.
-- Requiere 20260930_rrhh_base.sql y 20261002_A_check_inicio.sql. Ejecutar una sola vez en Supabase > SQL Editor.

-- 1) Tabla de solicitudes
create table if not exists public.solicitudes_admision (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- nombre + espacio + apellidos debe caber en empleados.nombre (máx. 120): 50 + 1 + 69
  nombre text not null check (char_length(btrim(nombre)) between 2 and 50),
  apellidos text not null check (char_length(btrim(apellidos)) between 2 and 69),
  telefono text not null check (char_length(btrim(telefono)) between 5 and 30),
  email text not null check (char_length(email) <= 160 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  cv_path text not null check (cv_path ~ '^solicitudes/[0-9a-f-]{36}\.pdf$'),  -- ruta dentro del bucket "cvs"
  estado text not null default 'pendiente' check (estado in ('pendiente','aceptada','denegada')),
  motivo text check (char_length(motivo) <= 500),
  resuelta_por uuid references auth.users(id) on delete set null,
  resuelta_en timestamptz,
  empleado_id uuid references public.empleados(id) on delete set null   -- ficha creada al aceptar
);
create index if not exists solicitudes_admision_estado_idx on public.solicitudes_admision (estado, created_at desc);

-- 2) Permisos. Supabase da por defecto todos los privilegios: se quitan y se concede solo lo necesario.
alter table public.solicitudes_admision enable row level security;
revoke all on public.solicitudes_admision from anon, authenticated;

-- La web pública (anon) solo puede CREAR solicitudes, y solo con estos cinco campos. Nunca leerlas.
grant insert (nombre, apellidos, telefono, email, cv_path) on public.solicitudes_admision to anon, authenticated;
grant select, delete on public.solicitudes_admision to authenticated;

drop policy if exists "web crea solicitudes" on public.solicitudes_admision;
create policy "web crea solicitudes" on public.solicitudes_admision
  for insert to anon, authenticated with check (estado = 'pendiente' and empleado_id is null);

drop policy if exists "rrhh lee solicitudes" on public.solicitudes_admision;
create policy "rrhh lee solicitudes" on public.solicitudes_admision
  for select to authenticated using (public.es_rrhh());

drop policy if exists "rrhh borra solicitudes" on public.solicitudes_admision;
create policy "rrhh borra solicitudes" on public.solicitudes_admision
  for delete to authenticated using (public.es_rrhh());

-- 3) Storage: la web puede SUBIR un CV (solo a la carpeta solicitudes/), pero no leerlo ni borrarlo.
--    El bucket "cvs" ya limita a PDF de 5 MB. Solo RRHH lo lee (política "rrhh gestiona cvs").
drop policy if exists "web sube cv de solicitud" on storage.objects;
create policy "web sube cv de solicitud" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = 'solicitudes');

-- 4) Aceptar: crea la ficha (empleados) y sus checks de inicio, y marca la solicitud. Todo en una transacción.
create or replace function public.aceptar_solicitud_admision(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.solicitudes_admision; v_id uuid;
begin
  if not public.es_rrhh() then raise exception 'Solo RRHH puede resolver solicitudes'; end if;

  select * into s from public.solicitudes_admision where id = p_id for update;
  if not found then raise exception 'La solicitud no existe'; end if;
  if s.estado <> 'pendiente' then raise exception 'Esta solicitud ya estaba resuelta'; end if;
  if exists (select 1 from public.empleados where lower(email) = lower(btrim(s.email)) and estado = 'activo') then
    raise exception 'Ya hay un empleado activo con ese correo';
  end if;

  insert into public.empleados (nombre, email, telefono)
  values (btrim(s.nombre) || ' ' || btrim(s.apellidos), lower(btrim(s.email)), btrim(s.telefono))
  returning id into v_id;

  perform public.crear_checks_inicio(v_id);

  update public.solicitudes_admision
     set estado = 'aceptada', resuelta_por = auth.uid(), resuelta_en = now(), empleado_id = v_id
   where id = p_id;
  return v_id;
end $$;

-- 5) Denegar (con motivo opcional, solo para uso interno de RRHH)
create or replace function public.denegar_solicitud_admision(p_id uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_rrhh() then raise exception 'Solo RRHH puede resolver solicitudes'; end if;
  update public.solicitudes_admision
     set estado = 'denegada', motivo = nullif(btrim(p_motivo), ''), resuelta_por = auth.uid(), resuelta_en = now()
   where id = p_id and estado = 'pendiente';
  if not found then raise exception 'La solicitud no existe o ya estaba resuelta'; end if;
end $$;

revoke execute on function public.aceptar_solicitud_admision(uuid), public.denegar_solicitud_admision(uuid, text) from public, anon;
grant execute on function public.aceptar_solicitud_admision(uuid), public.denegar_solicitud_admision(uuid, text) to authenticated;
