-- VENTAS · Agente de IA: registro de lo que hace el agente (auditoría + evita duplicados).
-- Requiere 20261023_A_base_ventas.sql, 20261024_A_presupuestos.sql y 20261025_A_facturacion.sql.
-- Ejecutar una sola vez en Supabase > SQL Editor.
--
-- Principios:
--  · El agente es un USUARIO más del CRM, con su rol (ventas o finanzas). No usa la clave service_role:
--    todo lo que hace pasa por las mismas funciones y políticas RLS que cuando lo hace una persona.
--  · El agente solo crea BORRADORES. Enviar un presupuesto o emitir una factura sigue siendo humano.
--  · Cada acción queda registrada aquí, y el propio registro impide procesar dos veces lo mismo.

create table if not exists public.agente_acciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  accion text not null check (accion in ('presupuesto', 'factura')),
  oportunidad_id uuid references public.oportunidades(id) on delete cascade,   -- accion = presupuesto
  presupuesto_id uuid references public.presupuestos(id) on delete set null,   -- presupuesto creado / presupuesto a facturar
  factura_id uuid references public.facturas(id) on delete set null,
  resultado text not null check (resultado in ('procesando', 'creado', 'revision', 'error')),
  detalle text check (char_length(detalle) <= 1000),
  modelo text,
  origen text not null default 'manual' check (origen in ('manual', 'webhook')),
  constraint agente_acciones_clave_ck check (
    (accion = 'presupuesto' and oportunidad_id is not null) or
    (accion = 'factura' and presupuesto_id is not null)
  )
);

-- Una oportunidad solo se convierte una vez en presupuesto, y un presupuesto solo se factura una vez.
-- "revision" y "error" no bloquean: se puede volver a intentar (con el botón o corrigiendo el dato que faltaba).
create unique index if not exists agente_pres_uidx on public.agente_acciones (oportunidad_id)
  where accion = 'presupuesto' and resultado in ('procesando', 'creado');
create unique index if not exists agente_fact_uidx on public.agente_acciones (presupuesto_id)
  where accion = 'factura' and resultado in ('procesando', 'creado');
create index if not exists agente_acciones_fecha_idx on public.agente_acciones (created_at desc);

alter table public.agente_acciones enable row level security;
revoke all on public.agente_acciones from anon, authenticated;
grant select, insert, update on public.agente_acciones to authenticated;       -- nunca delete

drop policy if exists "ventas lee acciones del agente" on public.agente_acciones;
create policy "ventas lee acciones del agente" on public.agente_acciones
  for select to authenticated using (public.es_ventas());
drop policy if exists "ventas registra acciones del agente" on public.agente_acciones;
create policy "ventas registra acciones del agente" on public.agente_acciones
  for insert to authenticated with check (public.es_ventas() and resultado = 'procesando');
drop policy if exists "ventas cierra acciones del agente" on public.agente_acciones;
create policy "ventas cierra acciones del agente" on public.agente_acciones
  for update to authenticated using (public.es_ventas()) with check (public.es_ventas());

-- El registro es de auditoría: una fila solo puede pasar de "procesando" a su resultado final, una vez.
create or replace function public.agente_acciones_proteger() returns trigger
language plpgsql as $$
begin
  if old.resultado <> 'procesando' then
    raise exception 'El registro del agente no se puede modificar';
  end if;
  -- Lo que identifica la acción no cambia nunca (el presupuesto y la factura sí se rellenan al terminar)
  if row(new.accion, new.oportunidad_id, new.origen) is distinct from row(old.accion, old.oportunidad_id, old.origen) then
    raise exception 'El registro del agente no se puede modificar';
  end if;
  return new;
end $$;
drop trigger if exists agente_acciones_proteger_tg on public.agente_acciones;
create trigger agente_acciones_proteger_tg before update on public.agente_acciones
  for each row execute function public.agente_acciones_proteger();

-- ============================================================
-- USUARIOS DEL AGENTE (a mano, una vez)
-- ============================================================
-- 1) En Authentication > Users crea DOS usuarios con contraseña larga y aleatoria (marca "Auto Confirm User"):
--      agente-ventas@tuempresa.com      → prepara presupuestos (rol ventas)
--      agente-finanzas@tuempresa.com    → prepara borradores de factura (rol finanzas)   [opcional]
-- 2) Asígnales su rol (cambia los correos):
--
--   insert into public.roles_usuario (user_id, rol)
--   select id, 'ventas' from auth.users where email = 'agente-ventas@tuempresa.com'
--   on conflict (user_id) do update set rol = excluded.rol;
--
--   insert into public.roles_usuario (user_id, rol)
--   select id, 'finanzas' from auth.users where email = 'agente-finanzas@tuempresa.com'
--   on conflict (user_id) do update set rol = excluded.rol;
--
-- Mínimo privilegio: NO les des el rol 'admin'. El agente de ventas no puede tocar facturas, y el de finanzas
-- solo ejecuta crear_factura_desde_presupuesto (el código no llama a emitir_factura, anular ni registrar_pago).
