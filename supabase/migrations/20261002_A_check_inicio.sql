-- CHECK DE INICIO: tareas del primer día de cada trabajador.
-- Requiere 20260930_rrhh_base.sql. Ejecutar una sola vez en Supabase > SQL Editor.

-- 1) Plantilla: las tareas estándar que se asignan a cada trabajador que se incorpora
create table if not exists public.plantilla_checks_inicio (
  id uuid primary key default gen_random_uuid(),
  titulo text not null unique check (char_length(titulo) between 2 and 120),
  orden int not null default 0
);

insert into public.plantilla_checks_inicio (titulo, orden) values
  ('Entregar portátil', 1),
  ('Crear correo corporativo', 2),
  ('Dar acceso al CRM', 3),
  ('Entregar uniforme y equipo de protección', 4),
  ('Presentar al equipo', 5)
on conflict (titulo) do nothing;

-- 2) Tareas de cada trabajador
create table if not exists public.checks_inicio (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 2 and 120),
  orden int not null default 0,
  completada boolean not null default false,
  completada_en timestamptz,
  completada_por uuid references auth.users(id) on delete set null,
  unique (empleado_id, titulo)
);
create index if not exists checks_inicio_empleado_idx on public.checks_inicio (empleado_id);

-- La fecha y quién la completó las pone siempre la base de datos, nunca el navegador
create or replace function public.checks_inicio_marca() returns trigger
language plpgsql as $$
begin
  if not new.completada then
    new.completada_en := null;
    new.completada_por := null;
  elsif tg_op = 'INSERT' then
    new.completada_en := now();
    new.completada_por := auth.uid();
  elsif not old.completada then
    new.completada_en := now();
    new.completada_por := auth.uid();
  else
    new.completada_en := old.completada_en;
    new.completada_por := old.completada_por;
  end if;
  return new;
end $$;

drop trigger if exists checks_inicio_marca on public.checks_inicio;
create trigger checks_inicio_marca before insert or update on public.checks_inicio
  for each row execute function public.checks_inicio_marca();

-- 3) Permisos: RRHH gestiona todo; cada trabajador solo VE sus propias tareas
alter table public.plantilla_checks_inicio enable row level security;
alter table public.checks_inicio enable row level security;

drop policy if exists "rrhh gestiona plantilla" on public.plantilla_checks_inicio;
create policy "rrhh gestiona plantilla" on public.plantilla_checks_inicio
  for all to authenticated using (public.es_rrhh()) with check (public.es_rrhh());

drop policy if exists "ver mis checks o todos si rrhh" on public.checks_inicio;
create policy "ver mis checks o todos si rrhh" on public.checks_inicio
  for select to authenticated using (public.es_rrhh() or empleado_id = public.mi_empleado_id());
drop policy if exists "rrhh crea checks" on public.checks_inicio;
create policy "rrhh crea checks" on public.checks_inicio
  for insert to authenticated with check (public.es_rrhh());
drop policy if exists "rrhh edita checks" on public.checks_inicio;
create policy "rrhh edita checks" on public.checks_inicio
  for update to authenticated using (public.es_rrhh()) with check (public.es_rrhh());
drop policy if exists "rrhh borra checks" on public.checks_inicio;
create policy "rrhh borra checks" on public.checks_inicio
  for delete to authenticated using (public.es_rrhh());

grant select, insert, update, delete on public.plantilla_checks_inicio, public.checks_inicio to authenticated;

-- 4) Asigna a un trabajador las tareas de la plantilla que aún no tenga. Devuelve cuántas ha creado.
--    La usará también el proceso de contratación (Admisión) para crear los checks automáticamente.
create or replace function public.crear_checks_inicio(p_empleado_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.es_rrhh() then
    raise exception 'Solo RRHH puede crear los checks de inicio';
  end if;
  insert into public.checks_inicio (empleado_id, titulo, orden)
  select p_empleado_id, p.titulo, p.orden from public.plantilla_checks_inicio p
  on conflict (empleado_id, titulo) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.crear_checks_inicio(uuid) from public, anon;
grant execute on function public.crear_checks_inicio(uuid) to authenticated;
