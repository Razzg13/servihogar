-- ============================================================
-- Hogandia — migración 015: rechazo, tipo de documento e historial de verificación
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- Hoy el admin solo puede aprobar una verificación (verificarTrabajador en
-- js/app.js); no existe forma de rechazarla. Esto agrega esa mitad que falta
-- del flujo, más el tipo de documento que se subió y un historial simple de
-- auditoría (quién solicitó/aprobó/rechazó y cuándo).

alter table public.profiles
  add column if not exists verificacion_rechazada boolean not null default false,
  add column if not exists verificacion_motivo_rechazo text,
  add column if not exists verificacion_tipo_doc text,
  add column if not exists verificacion_historial jsonb not null default '[]'::jsonb;
