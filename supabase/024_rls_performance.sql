-- ============================================================
-- Hogandia — migración 024: rendimiento de las políticas RLS
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
--
-- El "Performance Advisor" marca ~30 políticas que llaman a auth.uid() /
-- is_admin() directamente, así que Postgres las reevalúa POR CADA FILA
-- (lint 0003 auth_rls_initplan). Envolverlas en (select ...) hace que se
-- evalúen una sola vez por consulta.
--
-- De paso se consolidan las dos políticas permisivas de `mensajes` (una por
-- cita, otra por conversación) en una sola con OR (lint 0006).
--
-- La lógica de permisos NO cambia — solo la forma de escribirla.
-- Idempotente: cada política se dropea y recrea.

-- ---------------- profiles ----------------
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check ((select auth.uid()) = id);
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select using ((select auth.uid()) = id or (select public.is_admin()));
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using ((select auth.uid()) = id or (select public.is_admin()));

-- ---------------- citas ----------------
drop policy if exists "citas_select_involucrados" on public.citas;
create policy "citas_select_involucrados" on public.citas
  for select using ((select auth.uid()) = cliente_id or (select auth.uid()) = trabajador_id or (select public.is_admin()));
drop policy if exists "citas_insert_cliente" on public.citas;
create policy "citas_insert_cliente" on public.citas
  for insert with check ((select auth.uid()) = cliente_id);
drop policy if exists "citas_update_involucrados" on public.citas;
create policy "citas_update_involucrados" on public.citas
  for update using ((select auth.uid()) = cliente_id or (select auth.uid()) = trabajador_id or (select public.is_admin()));
drop policy if exists "citas_delete_cliente" on public.citas;
create policy "citas_delete_cliente" on public.citas
  for delete using ((select auth.uid()) = cliente_id);

-- ---------------- conversaciones ----------------
drop policy if exists "conversaciones_select_involucrados" on public.conversaciones;
create policy "conversaciones_select_involucrados" on public.conversaciones
  for select using ((select auth.uid()) = cliente_id or (select auth.uid()) = trabajador_id or (select public.is_admin()));
drop policy if exists "conversaciones_insert_cliente" on public.conversaciones;
create policy "conversaciones_insert_cliente" on public.conversaciones
  for insert with check ((select auth.uid()) = cliente_id);

-- ---------------- mensajes (consolidadas) ----------------
drop policy if exists "mensajes_select_conversacion" on public.mensajes;
drop policy if exists "mensajes_select_involucrados" on public.mensajes;
drop policy if exists "mensajes_insert_conversacion" on public.mensajes;
drop policy if exists "mensajes_insert_involucrados" on public.mensajes;
create policy "mensajes_select" on public.mensajes
  for select using (
    exists (select 1 from public.conversaciones cv
      where cv.id = mensajes.conversacion_id
        and ((select auth.uid()) = cv.cliente_id or (select auth.uid()) = cv.trabajador_id))
    or exists (select 1 from public.citas c
      where c.id = mensajes.cita_id
        and ((select auth.uid()) = c.cliente_id or (select auth.uid()) = c.trabajador_id))
  );
create policy "mensajes_insert" on public.mensajes
  for insert with check (
    de = (select auth.uid())
    and (
      exists (select 1 from public.conversaciones cv
        where cv.id = mensajes.conversacion_id
          and ((select auth.uid()) = cv.cliente_id or (select auth.uid()) = cv.trabajador_id))
      or exists (select 1 from public.citas c
        where c.id = mensajes.cita_id
          and ((select auth.uid()) = c.cliente_id or (select auth.uid()) = c.trabajador_id))
    )
  );

-- ---------------- reportes ----------------
drop policy if exists "reportes_select_propio_o_admin" on public.reportes;
create policy "reportes_select_propio_o_admin" on public.reportes
  for select using (
    (select public.is_admin())
    or exists (select 1 from public.citas c where c.id = reportes.cita_id and c.cliente_id = (select auth.uid()))
  );
drop policy if exists "reportes_insert_cliente" on public.reportes;
create policy "reportes_insert_cliente" on public.reportes
  for insert with check (
    exists (select 1 from public.citas c where c.id = reportes.cita_id and c.cliente_id = (select auth.uid()))
  );
drop policy if exists "reportes_update_admin" on public.reportes;
create policy "reportes_update_admin" on public.reportes
  for update using ((select public.is_admin()));

-- ---------------- notificaciones ----------------
drop policy if exists "notificaciones_select_propio" on public.notificaciones;
create policy "notificaciones_select_propio" on public.notificaciones
  for select using ((select auth.uid()) = user_id);
drop policy if exists "notificaciones_insert_auth" on public.notificaciones;
create policy "notificaciones_insert_auth" on public.notificaciones
  for insert with check ((select auth.uid()) is not null);
drop policy if exists "notificaciones_update_propio" on public.notificaciones;
create policy "notificaciones_update_propio" on public.notificaciones
  for update using ((select auth.uid()) = user_id);

-- ---------------- resenas ----------------
drop policy if exists "resenas_insert_auth" on public.resenas;
create policy "resenas_insert_auth" on public.resenas
  for insert with check ((select auth.uid()) is not null);
drop policy if exists "resenas_update_respuesta_trabajador" on public.resenas;
create policy "resenas_update_respuesta_trabajador" on public.resenas
  for update using ((select auth.uid()) = worker_id) with check ((select auth.uid()) = worker_id);
drop policy if exists "resenas_delete_admin" on public.resenas;
create policy "resenas_delete_admin" on public.resenas
  for delete using ((select public.is_admin()));

-- ---------------- push_subscriptions ----------------
drop policy if exists "push_subscriptions_select_propio" on public.push_subscriptions;
create policy "push_subscriptions_select_propio" on public.push_subscriptions
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));
drop policy if exists "push_subscriptions_insert_propio" on public.push_subscriptions;
create policy "push_subscriptions_insert_propio" on public.push_subscriptions
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "push_subscriptions_update_propio" on public.push_subscriptions;
create policy "push_subscriptions_update_propio" on public.push_subscriptions
  for update using ((select auth.uid()) = user_id);
drop policy if exists "push_subscriptions_delete_propio" on public.push_subscriptions;
create policy "push_subscriptions_delete_propio" on public.push_subscriptions
  for delete using ((select auth.uid()) = user_id or (select public.is_admin()));

-- ---------------- listas_espera ----------------
drop policy if exists "listas_espera_select_propio" on public.listas_espera;
create policy "listas_espera_select_propio" on public.listas_espera
  for select using ((select auth.uid()) = cliente_id or (select auth.uid()) = trabajador_id or (select public.is_admin()));
drop policy if exists "listas_espera_insert_cliente" on public.listas_espera;
create policy "listas_espera_insert_cliente" on public.listas_espera
  for insert with check ((select auth.uid()) = cliente_id);
drop policy if exists "listas_espera_delete_propio" on public.listas_espera;
create policy "listas_espera_delete_propio" on public.listas_espera
  for delete using ((select auth.uid()) = cliente_id or (select public.is_admin()));

-- ---------------- pqr ----------------
drop policy if exists "pqr_select_propio_o_admin" on public.pqr;
create policy "pqr_select_propio_o_admin" on public.pqr
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));
drop policy if exists "pqr_insert_propio" on public.pqr;
create policy "pqr_insert_propio" on public.pqr
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "pqr_update_admin" on public.pqr;
create policy "pqr_update_admin" on public.pqr
  for update using ((select public.is_admin()));
