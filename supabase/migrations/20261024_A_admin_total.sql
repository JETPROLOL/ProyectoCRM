-- ADMIN TOTAL: el rol 'admin' pasa a contar también como RRHH, así un solo usuario ve todo el CRM.
-- Requiere 20260930_rrhh_base.sql y 20261023_A_base_ventas.sql. Se puede ejecutar varias veces.
-- Ojo: todas las políticas de RRHH usan es_rrhh(), así que un admin también lee nóminas y evaluaciones
-- y puede gestionar roles. Asigna 'admin' solo a quien deba tener acceso total.
create or replace function public.es_rrhh() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roles_usuario
                  where user_id = auth.uid() and rol in ('rrhh','admin'));
$$;
