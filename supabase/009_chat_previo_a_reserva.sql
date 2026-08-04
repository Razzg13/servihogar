-- ============================================================
-- Hogandia — migración 009: chat entre cliente y trabajador antes de agendar
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- Hasta ahora el chat (tabla mensajes) solo existía atado a una cita ya
-- creada. Esto agrega "conversaciones" independientes de una cita, para que
-- un cliente pueda preguntarle algo a un trabajador antes de reservar.

create table if not exists public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.profiles(id) on delete cascade,
  trabajador_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (cliente_id, trabajador_id)
);
alter table public.conversaciones enable row level security;

drop policy if exists "conversaciones_select_involucrados" on public.conversaciones;
create policy "conversaciones_select_involucrados" on public.conversaciones
  for select using (auth.uid() = cliente_id or auth.uid() = trabajador_id or public.is_admin());
drop policy if exists "conversaciones_insert_cliente" on public.conversaciones;
create policy "conversaciones_insert_cliente" on public.conversaciones
  for insert with check (auth.uid() = cliente_id);

-- mensajes ahora puede pertenecer a una cita O a una conversación (nunca ambas).
alter table public.mensajes alter column cita_id drop not null;
alter table public.mensajes add column if not exists conversacion_id uuid references public.conversaciones(id) on delete cascade;
alter table public.mensajes drop constraint if exists mensajes_un_solo_hilo;
alter table public.mensajes add constraint mensajes_un_solo_hilo
  check ((cita_id is not null)::int + (conversacion_id is not null)::int = 1);

drop policy if exists "mensajes_select_conversacion" on public.mensajes;
create policy "mensajes_select_conversacion" on public.mensajes
  for select using (
    exists (select 1 from public.conversaciones cv where cv.id = conversacion_id
      and (cv.cliente_id = auth.uid() or cv.trabajador_id = auth.uid()))
  );
drop policy if exists "mensajes_insert_conversacion" on public.mensajes;
create policy "mensajes_insert_conversacion" on public.mensajes
  for insert with check (
    de = auth.uid() and exists (select 1 from public.conversaciones cv where cv.id = conversacion_id
      and (cv.cliente_id = auth.uid() or cv.trabajador_id = auth.uid()))
  );

-- Habilita Realtime para las conversaciones nuevas (ya estaba habilitado para mensajes en 002).
alter publication supabase_realtime add table public.conversaciones;
