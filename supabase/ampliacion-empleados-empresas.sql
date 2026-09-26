-- Ampliación: empresas, empleados y oportunidad asociada a empleado.
-- Ejecuta este script en Supabase > SQL Editor (sirve para tu base de datos actual y para una nueva).

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null check (char_length(nombre) between 2 and 120),
  ubicacion text not null check (char_length(ubicacion) between 2 and 160)
);

create table if not exists public.empleados (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null check (char_length(nombre) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono text not null check (char_length(telefono) between 5 and 30),
  empresa_id uuid references public.empresas(id) on delete set null
);

-- Cada oportunidad tiene como máximo un empleado (el que la redactó) y cada empleado, una oportunidad
alter table public.oportunidades
  add column if not exists empleado_id uuid unique references public.empleados(id) on delete set null;

alter table public.empresas enable row level security;
alter table public.empleados enable row level security;

drop policy if exists "crm gestiona empresas" on public.empresas;
create policy "crm gestiona empresas" on public.empresas
  for all to authenticated using (true) with check (true);

drop policy if exists "crm gestiona empleados" on public.empleados;
create policy "crm gestiona empleados" on public.empleados
  for all to authenticated using (true) with check (true);

-- La web solo crea oportunidades nuevas y sin empleado asignado
drop policy if exists "web crea oportunidades" on public.oportunidades;
create policy "web crea oportunidades" on public.oportunidades
  for insert to anon, authenticated
  with check (estado = 'nueva' and valor_estimado is null and empleado_id is null);

grant insert on public.oportunidades to anon, authenticated;
grant select, update on public.oportunidades to authenticated;
grant select, insert, update, delete on public.empresas, public.empleados to authenticated;

-- Crear empleado y asociarle su oportunidad en una sola operación
create or replace function public.crear_empleado(
  p_nombre text, p_email text, p_telefono text, p_empresa_id uuid, p_oportunidad_id uuid
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.empleados (nombre, email, telefono, empresa_id)
  values (p_nombre, p_email, p_telefono, p_empresa_id) returning id into v_id;

  if p_oportunidad_id is not null then
    update public.oportunidades set empleado_id = v_id
     where id = p_oportunidad_id and empleado_id is null;
    if not found then
      raise exception 'Esa oportunidad ya está asociada a otro empleado';
    end if;
  end if;
  return v_id;
end $$;

-- Crear empresa y asociarle un empleado que aún no tenga empresa
create or replace function public.crear_empresa(
  p_nombre text, p_ubicacion text, p_empleado_id uuid
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.empresas (nombre, ubicacion) values (p_nombre, p_ubicacion) returning id into v_id;

  if p_empleado_id is not null then
    update public.empleados set empresa_id = v_id
     where id = p_empleado_id and empresa_id is null;
    if not found then
      raise exception 'Ese empleado ya pertenece a otra empresa';
    end if;
  end if;
  return v_id;
end $$;

revoke execute on function public.crear_empleado(text, text, text, uuid, uuid) from public, anon;
revoke execute on function public.crear_empresa(text, text, uuid) from public, anon;
grant execute on function public.crear_empleado(text, text, text, uuid, uuid) to authenticated;
grant execute on function public.crear_empresa(text, text, uuid) to authenticated;
