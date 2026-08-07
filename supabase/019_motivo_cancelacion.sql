-- ============================================================
-- Hogandia — migración 019: motivo de cancelación + cancelación uniforme
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- Hasta ahora, cuando el cliente cancelaba una cita, la fila se borraba de
-- la base (no quedaba registro); cuando cancelaba el trabajador, quedaba
-- como estado='cancelada'. Con este cambio el cliente también cancela con
-- update en vez de delete (ver cancelarCita en js/app.js), así que ambos
-- casos quedan igual de rastreables — útil para detectar patrones (ej. un
-- cliente o trabajador que cancela mucho) desde el panel admin.

alter table public.citas add column if not exists motivo_cancelacion text;

-- Quién canceló (no siempre coincide con cliente_id/trabajador_id: sirve para
-- que el panel admin pueda contar cancelaciones por usuario sin adivinar de
-- qué lado vino cada una).
alter table public.citas add column if not exists cancelada_por uuid references public.profiles(id);
