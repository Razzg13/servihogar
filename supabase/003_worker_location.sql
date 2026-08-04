-- ============================================================
-- Hogandia — migración 003: ubicación real del trabajador
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================

alter table public.profiles add column if not exists lat double precision;
alter table public.profiles add column if not exists lng double precision;
