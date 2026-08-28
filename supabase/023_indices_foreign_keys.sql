-- ============================================================
-- Hogandia — migración 023: índices para las foreign keys
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
--
-- El "Performance Advisor" de Supabase marca 13 foreign keys sin un índice
-- que las cubra (lint 0001). Sin ese índice, cada borrado/actualización de la
-- fila padre y cada join por esa columna hace un scan secuencial. Con pocos
-- datos no se nota; conviene tenerlo antes de que crezca.
--
-- `conversaciones.cliente_id` y `listas_espera.trabajador_id` ya están
-- cubiertas por índices compuestos, por eso no están acá.
--
-- Idempotente.

create index if not exists idx_citas_cliente_id       on public.citas (cliente_id);
create index if not exists idx_citas_trabajador_id    on public.citas (trabajador_id);
create index if not exists idx_citas_cancelada_por    on public.citas (cancelada_por);

create index if not exists idx_conversaciones_trabajador_id on public.conversaciones (trabajador_id);

create index if not exists idx_listas_espera_cliente_id on public.listas_espera (cliente_id);

create index if not exists idx_mensajes_cita_id         on public.mensajes (cita_id);
create index if not exists idx_mensajes_conversacion_id on public.mensajes (conversacion_id);
create index if not exists idx_mensajes_de              on public.mensajes (de);

create index if not exists idx_notificaciones_user_id   on public.notificaciones (user_id);
create index if not exists idx_pqr_user_id              on public.pqr (user_id);
create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions (user_id);
create index if not exists idx_reportes_cita_id         on public.reportes (cita_id);
create index if not exists idx_resenas_worker_id        on public.resenas (worker_id);
