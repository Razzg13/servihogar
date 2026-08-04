-- ============================================================
-- Hogandia — migración 008: calificación al cliente, "disponible ahora" e ingresos
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================

-- El trabajador también puede calificar al cliente (antes solo era en un sentido).
alter table public.citas add column if not exists calificacion_trabajador jsonb;

-- Monto cobrado en el pago simulado, para el panel de ingresos del trabajador
-- (no existía ningún registro de cuánto se cobró por cada servicio).
alter table public.citas add column if not exists monto integer;

-- El trabajador puede marcarse como disponible para pedidos urgentes del día.
alter table public.profiles add column if not exists disponible_ahora boolean not null default false;
