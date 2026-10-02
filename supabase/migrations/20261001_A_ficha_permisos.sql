-- FICHA: permisos de escritura sobre la tabla empleados.
-- Requiere haber ejecutado antes 20260930_rrhh_base.sql. Ejecutar una sola vez en Supabase > SQL Editor.

-- 1) Todos los usuarios del CRM pueden LEER las fichas; solo RRHH puede crearlas, editarlas o borrarlas
drop policy if exists "crm gestiona empleados" on public.empleados;
drop policy if exists "empleados lectura" on public.empleados;
drop policy if exists "rrhh crea empleados" on public.empleados;
drop policy if exists "rrhh edita empleados" on public.empleados;
drop policy if exists "rrhh borra empleados" on public.empleados;

create policy "empleados lectura" on public.empleados
  for select to authenticated using (true);
create policy "rrhh crea empleados" on public.empleados
  for insert to authenticated with check (public.es_rrhh());
create policy "rrhh edita empleados" on public.empleados
  for update to authenticated using (public.es_rrhh()) with check (public.es_rrhh());
create policy "rrhh borra empleados" on public.empleados
  for delete to authenticated using (public.es_rrhh());

-- 2) Las secciones comerciales (Empleados y Empresas) siguen creando empleados y empresas para cualquier
--    usuario del CRM: sus funciones pasan a ejecutarse con los permisos de su propietario (security definer).
create or replace function public.crear_empleado(
  p_nombre text, p_email text, p_telefono text, p_empresa_id uuid, p_oportunidad_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
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

create or replace function public.crear_empresa(
  p_nombre text, p_ubicacion text, p_empleado_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
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

-- 3) La columna user_id (que vincula la ficha con un usuario) NO se puede escribir desde el navegador.
--    Solo la cambia vincular_usuario_actual(). Así nadie puede enlazarse a la ficha de otra persona
--    y leer su nómina.
revoke insert, update on public.empleados from authenticated;
grant insert (nombre, email, telefono, empresa_id, puesto, foto_path, estado) on public.empleados to authenticated;
grant update (nombre, email, telefono, empresa_id, puesto, foto_path, estado) on public.empleados to authenticated;
