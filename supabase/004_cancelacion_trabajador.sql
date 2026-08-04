-- ============================================================
-- Hogandia — migración 004: el trabajador puede cancelar una cita ya aceptada
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================

alter table public.citas drop constraint if exists citas_estado_check;
alter table public.citas add constraint citas_estado_check
  check (estado in ('pendiente','aceptada','rechazada','completada','cancelada'));
