-- ============================================================
-- Hogandia — migración 010: columna de fecha/hora real en las citas
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- "fecha" y "hora" son texto libre en español (ej. "15 de agosto", "3:00 pm"),
-- pensado solo para mostrarse. Para poder automatizar cosas (recordatorios,
-- reportes por fecha) hace falta una columna de fecha/hora real calculada
-- una sola vez al agendar/reagendar (ver js/app.js, confirmarCita()).

alter table public.citas add column if not exists inicio timestamptz;
