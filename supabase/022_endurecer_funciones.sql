-- ============================================================
-- Hogandia — migración 022: endurecer funciones SECURITY DEFINER
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
--
-- El "Security Advisor" de Supabase marca varias funciones. Esta migración
-- resuelve las que se pueden resolver sin romper nada:
--
--  * is_admin() no tenía search_path fijo (lint 0011). Como el cuerpo ya usa
--    nombres calificados (public.profiles, auth.uid()), fijarlo en '' es seguro.
--
--  * Varias funciones son disparadores (triggers) o tareas de cron y NO están
--    pensadas para llamarse desde el frontend por /rest/v1/rpc, pero PostgREST
--    las expone porque tienen EXECUTE para anon/authenticated/PUBLIC
--    (lints 0028 y 0029). Se les quita ese permiso. Siguen funcionando como
--    trigger / cron porque eso no depende del GRANT: postgres (dueño del
--    trigger y de la tarea de cron) y service_role conservan el acceso.
--
-- Se deja is_admin() invocable por anon/authenticated A PROPÓSITO: las
-- políticas RLS (TO public) la invocan y para eso el rol necesita EXECUTE.
-- Solo devuelve un booleano "sos admin", no expone datos.
--
-- Idempotente: se puede correr varias veces.

alter function public.is_admin() set search_path = '';

revoke execute on function public.completar_resena_desde_cita()   from public, anon, authenticated;
revoke execute on function public.controlar_transicion_pago()     from public, anon, authenticated;
revoke execute on function public.enviar_recordatorios_citas()    from public, anon, authenticated;
revoke execute on function public.notificar_lista_espera()        from public, anon, authenticated;
revoke execute on function public.proteger_campos_admin_profile() from public, anon, authenticated;
revoke execute on function public.proteger_campos_resena()        from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()               from public, anon, authenticated;

-- ------------------------------------------------------------
-- Aparte de este SQL, en el panel de Supabase:
--   Authentication → Policies / Passwords → activar
--   "Leaked password protection" (chequeo contra HaveIBeenPwned).
-- ------------------------------------------------------------
