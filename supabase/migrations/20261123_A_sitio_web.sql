-- SITIO WEB · constructor de webs con plantillas (estilo WordPress).
-- Requiere 20261023_A_base_ventas.sql (función es_ventas()). Ejecutar una sola vez en Supabase > SQL Editor.
--
-- Quién lo usa: ventas, finanzas y admin (es_ventas()). La interfaz lo oculta a los demás, pero la seguridad real son estas políticas.
-- Diseño: cada sitio es UNA fila; todo su contenido (tema, datos de empresa y bloques) vive en la columna jsonb "contenido".
-- Así añadir un tipo de bloque nuevo no requiere migración.

-- ============================================================
-- 1) TABLA
-- ============================================================
create table if not exists public.sitios_web (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  plantilla text not null check (plantilla in ('corporativa','moderna','minimalista')),
  contenido jsonb not null
    check (jsonb_typeof(contenido) = 'object' and octet_length(contenido::text) <= 300000)
);
create index if not exists sitios_web_actualizado_idx on public.sitios_web (updated_at desc);

create or replace function public.sitios_web_tocar() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists sitios_web_tocar on public.sitios_web;
create trigger sitios_web_tocar before update on public.sitios_web
  for each row execute function public.sitios_web_tocar();

-- ============================================================
-- 2) PERMISOS
-- ============================================================
alter table public.sitios_web enable row level security;
revoke all on public.sitios_web from anon, authenticated;
grant select, insert, update, delete on public.sitios_web to authenticated;

drop policy if exists "ventas lee sitios" on public.sitios_web;
create policy "ventas lee sitios" on public.sitios_web for select to authenticated using (public.es_ventas());
drop policy if exists "ventas crea sitios" on public.sitios_web;
create policy "ventas crea sitios" on public.sitios_web for insert to authenticated with check (public.es_ventas());
drop policy if exists "ventas edita sitios" on public.sitios_web;
create policy "ventas edita sitios" on public.sitios_web for update to authenticated
  using (public.es_ventas()) with check (public.es_ventas());
drop policy if exists "ventas borra sitios" on public.sitios_web;
create policy "ventas borra sitios" on public.sitios_web for delete to authenticated using (public.es_ventas());

-- ============================================================
-- 3) IMÁGENES DEL SITIO (bucket público "sitios", máx. 2 MB, sin SVG por seguridad)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('sitios', 'sitios', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ventas gestiona imagenes de sitios" on storage.objects;
create policy "ventas gestiona imagenes de sitios" on storage.objects for all to authenticated
  using (bucket_id = 'sitios' and public.es_ventas()) with check (bucket_id = 'sitios' and public.es_ventas());
