-- EVALUACIONES: nota de 1 a 5 con comentario, de cualquier usuario a cualquier empleado. Se reinician cada trimestre.
-- Requiere 20260930_rrhh_base.sql. Ejecutar una sola vez en Supabase > SQL Editor.

-- Primer día del trimestre en curso (T1 = ene-mar, T2 = abr-jun, T3 = jul-sep, T4 = oct-dic), hora de Madrid
create or replace function public.trimestre_actual() returns date
language sql stable as $$
  select date_trunc('quarter', now() at time zone 'Europe/Madrid')::date;
$$;

create table if not exists public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  evaluado_id uuid not null references public.empleados(id) on delete cascade,
  evaluador_user_id uuid not null references auth.users(id) on delete cascade,
  puntuacion int not null check (puntuacion between 1 and 5),
  comentario text check (char_length(comentario) <= 1000),
  trimestre date not null default public.trimestre_actual(),
  -- Cada usuario evalúa a cada empleado una vez por trimestre (puede cambiar su nota mientras dure el trimestre)
  unique (evaluado_id, evaluador_user_id, trimestre)
);
create index if not exists evaluaciones_trimestre_idx on public.evaluaciones (trimestre, evaluado_id);

alter table public.evaluaciones enable row level security;
revoke all on public.evaluaciones from anon, authenticated;
grant select, delete on public.evaluaciones to authenticated;

-- Privacidad: cada usuario solo ve las evaluaciones que HA DADO; RRHH ve todas (con sus comentarios).
-- La media de cada empleado la ve todo el mundo mediante medias_evaluaciones() (solo agregados).
drop policy if exists "ver mis evaluaciones o todas si rrhh" on public.evaluaciones;
create policy "ver mis evaluaciones o todas si rrhh" on public.evaluaciones
  for select to authenticated using (public.es_rrhh() or evaluador_user_id = auth.uid());
drop policy if exists "rrhh borra evaluaciones" on public.evaluaciones;
create policy "rrhh borra evaluaciones" on public.evaluaciones
  for delete to authenticated using (public.es_rrhh());

-- Evaluar (crea o actualiza la nota del trimestre en curso). Nadie puede evaluarse a sí mismo.
create or replace function public.evaluar(p_evaluado uuid, p_puntuacion int, p_comentario text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if p_puntuacion is null or p_puntuacion not between 1 and 5 then raise exception 'La nota debe estar entre 1 y 5'; end if;
  if not exists (select 1 from public.empleados where id = p_evaluado and estado = 'activo') then
    raise exception 'Ese empleado no existe o está de baja';
  end if;
  if exists (select 1 from public.empleados where id = p_evaluado and user_id = auth.uid()) then
    raise exception 'No puedes evaluarte a ti mismo';
  end if;

  insert into public.evaluaciones (evaluado_id, evaluador_user_id, puntuacion, comentario)
  values (p_evaluado, auth.uid(), p_puntuacion, nullif(btrim(p_comentario), ''))
  on conflict (evaluado_id, evaluador_user_id, trimestre)
  do update set puntuacion = excluded.puntuacion, comentario = excluded.comentario, updated_at = now();
end $$;

-- Media y número de evaluaciones de cada empleado en un trimestre (por defecto, el actual)
create or replace function public.medias_evaluaciones(p_trimestre date default null)
returns table (evaluado_id uuid, media numeric, total int)
language sql stable security definer set search_path = public as $$
  select e.evaluado_id, round(avg(e.puntuacion)::numeric, 2), count(*)::int
    from public.evaluaciones e
   where auth.uid() is not null and e.trimestre = coalesce(p_trimestre, public.trimestre_actual())
   group by e.evaluado_id;
$$;

revoke execute on function public.evaluar(uuid, int, text), public.medias_evaluaciones(date),
  public.trimestre_actual() from public, anon;
grant execute on function public.evaluar(uuid, int, text), public.medias_evaluaciones(date),
  public.trimestre_actual() to authenticated;
