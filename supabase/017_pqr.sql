-- ============================================================
-- Hogandia — migración 017: canal de Peticiones, Quejas y Reclamos (PQR)
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- Canal formal para que cualquier usuario logueado le escriba a la
-- plataforma (no a otro usuario, como sí hace "reportes" sobre una cita
-- puntual) y el admin le responda. Sirve además como canal para ejercer
-- los derechos de Habeas Data descritos en la Política de Privacidad.

create table if not exists public.pqr (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('peticion','queja','reclamo')),
  asunto text not null,
  mensaje text not null,
  estado text not null default 'abierto' check (estado in ('abierto','respondido')),
  respuesta text,
  respuesta_fecha timestamptz,
  created_at timestamptz not null default now()
);
alter table public.pqr enable row level security;

drop policy if exists "pqr_select_propio_o_admin" on public.pqr;
create policy "pqr_select_propio_o_admin" on public.pqr
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "pqr_insert_propio" on public.pqr;
create policy "pqr_insert_propio" on public.pqr
  for insert with check (auth.uid() = user_id);
drop policy if exists "pqr_update_admin" on public.pqr;
create policy "pqr_update_admin" on public.pqr
  for update using (public.is_admin());
