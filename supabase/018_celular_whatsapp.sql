-- ============================================================
-- Hogandia — migración 018: celular para notificaciones por WhatsApp
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- Campo opcional para poder avisar por WhatsApp (cita aceptada, pago
-- confirmado, etc.) además de email/push. Ver
-- supabase/functions/enviar-whatsapp/README.md: la función todavía no está
-- conectada a ningún proveedor real, solo queda el campo y el enganche listos.

alter table public.profiles add column if not exists celular text;
