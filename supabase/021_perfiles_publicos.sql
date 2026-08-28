-- ============================================================
-- Hogandia — migración 021: separar el perfil público del privado
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
--
-- CONTEXTO
-- El esquema original (schema.sql) tenía la política:
--     create policy "profiles_select_public" on public.profiles
--       for select using (true);
-- Eso hacía que el directorio de trabajadores se viera sin iniciar sesión,
-- pero también dejaba leer por la API REST el `correo` (y luego el `celular`)
-- de CUALQUIER usuario registrado, incluso sin login. Es un dato personal y
-- no debería exponerse.
--
-- SOLUCIÓN
--  1. `profiles` pasa a ser privada: solo la fila propia, o todo si sos admin.
--  2. Se crea la vista `profiles_publicos` con SOLO los campos no sensibles
--     (sin correo, sin celular, sin datos de verificación ni favoritos).
--     El front (js/app.js) usa esta vista para el directorio y para ver el
--     perfil de otras personas; usa la tabla `profiles` solo para el perfil
--     propio y para el panel de administración.
--
-- La vista queda como SECURITY DEFINER (el linter de Supabase lo marca como
-- "error", ver lint 0010). Acá es intencional: es el patrón de "proyección
-- pública segura de una tabla protegida". Ponerla `security_invoker = true`
-- volvería a romper el directorio para visitantes sin login, salvo que se
-- reabra RLS sobre `profiles`, que es justamente lo que esta migración evita.
-- Como la vista expone solo columnas inofensivas, el riesgo real es nulo.
--
-- Esta migración es idempotente: se puede correr varias veces sin problema.

-- ---------------- 1. profiles: lectura solo propia o de admin ----------------
drop policy if exists "profiles_select_public"        on public.profiles;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select using ((select auth.uid()) = id or public.is_admin());

-- ---------------- 2. vista con los campos públicos ----------------
create or replace view public.profiles_publicos as
  select
    id,
    tipo,
    nombre,
    categoria,
    tarifa,
    tarifa_urgente,
    experiencia,
    zona,
    servicios,
    verificado,
    estado,
    disponibilidad,
    disponible_ahora,
    foto_url,
    galeria_fotos,
    lat,
    lng,
    radio_cobertura_km,
    created_at
  from public.profiles;

grant select on public.profiles_publicos to anon, authenticated;
