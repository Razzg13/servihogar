-- ============================================================
-- Hogandia — migración 012: columnas para radio de cobertura, recargo por
-- urgencia, notas al agendar, servicio recurrente, "en camino", dirección
-- de referencia y fotos en reseñas.
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================

-- PROFILES (trabajador)
alter table public.profiles add column if not exists radio_cobertura_km integer;
alter table public.profiles add column if not exists tarifa_urgente integer;

-- CITAS
alter table public.citas add column if not exists notas_cliente text;
alter table public.citas add column if not exists direccion_referencia text;
alter table public.citas add column if not exists recurrente boolean not null default false;
alter table public.citas add column if not exists en_camino boolean not null default false;
alter table public.citas add column if not exists en_camino_lat double precision;
alter table public.citas add column if not exists en_camino_lng double precision;
alter table public.citas add column if not exists es_urgente boolean not null default false;

-- RESEÑAS con fotos
alter table public.resenas add column if not exists fotos text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('resenas-fotos', 'resenas-fotos', true)
on conflict (id) do nothing;

drop policy if exists "resenas_fotos_select_public" on storage.objects;
create policy "resenas_fotos_select_public" on storage.objects
  for select using (bucket_id = 'resenas-fotos');
drop policy if exists "resenas_fotos_insert_propio" on storage.objects;
create policy "resenas_fotos_insert_propio" on storage.objects
  for insert with check (bucket_id = 'resenas-fotos' and (storage.foldername(name))[1] = auth.uid()::text);
