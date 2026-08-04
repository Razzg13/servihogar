-- ============================================================
-- Hogandia — migración 007: galería de trabajos anteriores del trabajador
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================

alter table public.profiles add column if not exists galeria_fotos text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('portafolio', 'portafolio', true)
on conflict (id) do nothing;

create policy "portafolio_select_public" on storage.objects
  for select using (bucket_id = 'portafolio');
create policy "portafolio_insert_propio" on storage.objects
  for insert with check (bucket_id = 'portafolio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "portafolio_delete_propio" on storage.objects
  for delete using (bucket_id = 'portafolio' and (storage.foldername(name))[1] = auth.uid()::text);
