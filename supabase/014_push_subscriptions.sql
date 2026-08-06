-- ============================================================
-- Hogandia — migración 014: suscripciones a notificaciones push del navegador
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- Cada fila es una suscripción Web Push (PushSubscription) de un dispositivo
-- del usuario. Un mismo usuario puede tener varias (varios navegadores/equipos).

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_propio" on public.push_subscriptions;
create policy "push_subscriptions_select_propio" on public.push_subscriptions
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "push_subscriptions_insert_propio" on public.push_subscriptions;
create policy "push_subscriptions_insert_propio" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
drop policy if exists "push_subscriptions_update_propio" on public.push_subscriptions;
create policy "push_subscriptions_update_propio" on public.push_subscriptions
  for update using (auth.uid() = user_id);
drop policy if exists "push_subscriptions_delete_propio" on public.push_subscriptions;
create policy "push_subscriptions_delete_propio" on public.push_subscriptions
  for delete using (auth.uid() = user_id or public.is_admin());
