-- HORARIOS: fichajes de entrada/salida y solicitudes de vacaciones.
-- Requiere 20260930_rrhh_base.sql. Ejecutar una sola vez en Supabase > SQL Editor.

-- ================= FICHAJES =================
create table if not exists public.fichajes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  entrada timestamptz not null default now(),
  salida timestamptz,
  nota text check (char_length(nota) <= 300),
  check (salida is null or salida > entrada)
);
-- Un trabajador solo puede tener UN fichaje abierto (entrada sin salida) a la vez
create unique index if not exists fichajes_uno_abierto on public.fichajes (empleado_id) where salida is null;
create index if not exists fichajes_empleado_entrada_idx on public.fichajes (empleado_id, entrada desc);

alter table public.fichajes enable row level security;
revoke all on public.fichajes from anon;
grant select, insert, update, delete on public.fichajes to authenticated;

-- Cada trabajador solo VE sus fichajes; RRHH ve y corrige todos.
-- Los trabajadores NO escriben en la tabla: fichan con las funciones de abajo, que usan la hora del servidor
-- (así nadie puede inventarse una hora de entrada o salida).
drop policy if exists "ver mis fichajes o todos si rrhh" on public.fichajes;
create policy "ver mis fichajes o todos si rrhh" on public.fichajes
  for select to authenticated using (public.es_rrhh() or empleado_id = public.mi_empleado_id());
drop policy if exists "rrhh crea fichajes" on public.fichajes;
create policy "rrhh crea fichajes" on public.fichajes
  for insert to authenticated with check (public.es_rrhh());
drop policy if exists "rrhh edita fichajes" on public.fichajes;
create policy "rrhh edita fichajes" on public.fichajes
  for update to authenticated using (public.es_rrhh()) with check (public.es_rrhh());
drop policy if exists "rrhh borra fichajes" on public.fichajes;
create policy "rrhh borra fichajes" on public.fichajes
  for delete to authenticated using (public.es_rrhh());

create or replace function public.fichar_entrada() returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empleado_id();
begin
  if v_emp is null then raise exception 'Tu usuario no está vinculado a una ficha de empleado'; end if;
  if not exists (select 1 from public.empleados where id = v_emp and estado = 'activo') then
    raise exception 'Tu ficha está de baja: no puedes fichar';
  end if;
  insert into public.fichajes (empleado_id) values (v_emp);
exception when unique_violation then
  raise exception 'Ya tienes una entrada registrada sin salida';
end $$;

create or replace function public.fichar_salida() returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empleado_id();
begin
  if v_emp is null then raise exception 'Tu usuario no está vinculado a una ficha de empleado'; end if;
  update public.fichajes set salida = now() where empleado_id = v_emp and salida is null;
  if not found then raise exception 'No tienes ninguna entrada abierta'; end if;
end $$;

-- ================= VACACIONES =================
create table if not exists public.vacaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  desde date not null,
  hasta date not null,
  comentario text check (char_length(comentario) <= 500),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  respuesta text check (char_length(respuesta) <= 500),
  resuelta_por uuid references auth.users(id) on delete set null,
  resuelta_en timestamptz,
  check (hasta >= desde)
);
create index if not exists vacaciones_empleado_idx on public.vacaciones (empleado_id, desde desc);
create index if not exists vacaciones_estado_idx on public.vacaciones (estado, desde);

alter table public.vacaciones enable row level security;
revoke all on public.vacaciones from anon, authenticated;
grant select, delete on public.vacaciones to authenticated;
-- El trabajador solo rellena estos campos; el estado nace siempre "pendiente" y solo cambia con resolver_vacaciones()
grant insert (empleado_id, desde, hasta, comentario) on public.vacaciones to authenticated;

drop policy if exists "ver mis vacaciones o todas si rrhh" on public.vacaciones;
create policy "ver mis vacaciones o todas si rrhh" on public.vacaciones
  for select to authenticated using (public.es_rrhh() or empleado_id = public.mi_empleado_id());
drop policy if exists "pedir mis vacaciones" on public.vacaciones;
create policy "pedir mis vacaciones" on public.vacaciones
  for insert to authenticated with check (empleado_id = public.mi_empleado_id());
-- Cada trabajador puede cancelar sus solicitudes aún pendientes; RRHH puede borrar cualquiera
drop policy if exists "cancelar mi solicitud pendiente o rrhh" on public.vacaciones;
create policy "cancelar mi solicitud pendiente o rrhh" on public.vacaciones
  for delete to authenticated using (public.es_rrhh() or (empleado_id = public.mi_empleado_id() and estado = 'pendiente'));

-- Validación al pedir: no en el pasado y sin solaparse con otras solicitudes pendientes o aprobadas del mismo trabajador
create or replace function public.vacaciones_valida() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.desde < (now() at time zone 'Europe/Madrid')::date then
    raise exception 'No puedes pedir vacaciones en fechas pasadas';
  end if;
  if exists (
    select 1 from public.vacaciones v
     where v.empleado_id = new.empleado_id and v.estado in ('pendiente','aprobada')
       and daterange(v.desde, v.hasta, '[]') && daterange(new.desde, new.hasta, '[]')
  ) then
    raise exception 'Ya tienes una solicitud que se solapa con esas fechas';
  end if;
  return new;
end $$;
drop trigger if exists vacaciones_valida on public.vacaciones;
create trigger vacaciones_valida before insert on public.vacaciones
  for each row execute function public.vacaciones_valida();

create or replace function public.resolver_vacaciones(p_id uuid, p_aprobar boolean, p_respuesta text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_rrhh() then raise exception 'Solo RRHH puede resolver solicitudes de vacaciones'; end if;
  update public.vacaciones
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         respuesta = nullif(btrim(p_respuesta), ''), resuelta_por = auth.uid(), resuelta_en = now()
   where id = p_id and estado = 'pendiente';
  if not found then raise exception 'La solicitud no existe o ya estaba resuelta'; end if;
end $$;

revoke execute on function public.fichar_entrada(), public.fichar_salida(),
  public.resolver_vacaciones(uuid, boolean, text) from public, anon;
grant execute on function public.fichar_entrada(), public.fichar_salida(),
  public.resolver_vacaciones(uuid, boolean, text) to authenticated;
