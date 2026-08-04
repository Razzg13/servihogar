-- ============================================================
-- Hogandia — migración 002: Realtime + Storage (fotos y verificación)
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- (requiere que supabase/schema.sql ya se haya corrido antes)
-- ============================================================

-- ---------------- REALTIME ----------------
-- Habilita que el chat y las notificaciones lleguen en vivo sin recargar.
alter publication supabase_realtime add table public.mensajes;
alter publication supabase_realtime add table public.notificaciones;

-- ---------------- COLUMNAS NUEVAS EN PROFILES ----------------
alter table public.profiles add column if not exists foto_url text;
alter table public.profiles add column if not exists verificacion_doc_path text;

-- ---------------- STORAGE: bucket público para fotos de perfil ----------------
insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

create policy "avatares_select_public" on storage.objects
  for select using (bucket_id = 'avatares');
create policy "avatares_insert_propio" on storage.objects
  for insert with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatares_update_propio" on storage.objects
  for update using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatares_delete_propio" on storage.objects
  for delete using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------- STORAGE: bucket privado para documentos de verificación ----------------
-- Solo el propio trabajador y el admin pueden ver estos archivos (no son públicos).
insert into storage.buckets (id, name, public)
values ('verificaciones', 'verificaciones', false)
on conflict (id) do nothing;

create policy "verif_select_propio_o_admin" on storage.objects
  for select using (
    bucket_id = 'verificaciones'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
create policy "verif_insert_propio" on storage.objects
  for insert with check (bucket_id = 'verificaciones' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "verif_delete_propio" on storage.objects
  for delete using (bucket_id = 'verificaciones' and (storage.foldername(name))[1] = auth.uid()::text);
