-- ============================================================
-- Hogandia — migración 025: endurece RLS de profiles
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- (Este archivo vivía sin versionar como "021_endurece_rls_profiles.sql" —
-- ese número ya lo usa la migración committeada 021_perfiles_publicos.sql,
-- así que se renumera a 025, el siguiente libre. La función
-- proteger_campos_admin_profile() ya aparece referenciada en la migración
-- 022 (revoke execute), lo que sugiere que esta migración SÍ se corrió
-- contra la base real en algún momento; igual conviene re-ejecutarla ahora
-- — es idempotente (drop/create en todos lados) — porque hasta este commit
-- el archivo no estaba en control de versiones y se pudo haber perdido.)
--
-- Corrige dos brechas encontradas en una auditoría de RLS:
--
-- 1) profiles_update_self_or_admin permitía al dueño de la fila actualizar
--    CUALQUIER columna de su propio perfil (RLS es por fila, no por
--    columna). Sin nada que lo impida, un usuario podía llamar directo a la
--    REST API de Supabase con su propio JWT y hacer, por ejemplo:
--      patch /profiles?id=eq.<su-uuid>  { "tipo": "admin" }
--    y quedar admin de toda la plataforma. O más sutil: ponerse
--    verificado=true sin revisión, o revertir su propio estado='bloqueado'.
--    Fix: un trigger (mismo patrón que proteger_campos_resena, migración
--    006) que fuerza esas columnas de control a su valor anterior cuando
--    quien edita es el propio dueño y no es admin.
--
-- 2) profiles_select_public exponía la fila COMPLETA (correo, celular,
--    datos_pago_texto, verificacion_doc_path, etc.) a cualquiera, sin login
--    — y ya se explotaba en el uso normal: el buscador público de
--    trabajadores (cargarTrabajadores en js/app.js) hace select('*') y ese
--    JSON completo viaja al navegador de cualquier visitante.
--    Fix: la tabla real queda restringida a auth.uid() = id o admin; se
--    agrega una vista profiles_publicos con solo las columnas que el
--    directorio/perfil público necesita mostrar.

-- ---------------- 1) Trigger: protege columnas de control admin ----------------
create or replace function public.proteger_campos_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    new.tipo := old.tipo;
    new.estado := old.estado;
    new.verificado := old.verificado;
    new.verificacion_pendiente := old.verificacion_pendiente;
    new.verificacion_rechazada := old.verificacion_rechazada;
    new.verificacion_motivo_rechazo := old.verificacion_motivo_rechazo;
    new.verificacion_historial := old.verificacion_historial;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_campos_admin_profile on public.profiles;
create trigger trg_proteger_campos_admin_profile
before update on public.profiles
for each row execute function public.proteger_campos_admin_profile();

-- ---------------- 2) Restringe la lectura pública de profiles ----------------
drop policy if exists "profiles_select_public" on public.profiles;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- Vista con las columnas que sí son públicas (directorio de trabajadores y
-- perfil visible de cualquier usuario). Se crea SIN "security_invoker", así
-- que corre con los permisos del dueño de la vista (el rol que ejecuta esta
-- migración en el SQL Editor) y no queda sujeta a la policy restrictiva de
-- arriba: es la forma estándar en Postgres/Supabase de publicar un
-- subconjunto de columnas de una tabla con RLS más estricta. Si algún día
-- se agrega una columna sensible nueva a profiles, hay que acordarse de
-- NO agregarla acá. `estado` sí se incluye a propósito (no es dato sensible,
-- es un enum activo/bloqueado) porque renderBuscar() lo usa para esconder
-- del directorio a los trabajadores bloqueados por el admin.
-- drop + create (no "or replace") porque agregar/reordenar columnas de una
-- vista existente con "create or replace view" solo se permite al final de
-- la lista; así queda reejecutable sin pelearse con ese orden.
drop view if exists public.profiles_publicos;
create view public.profiles_publicos as
select
  id, tipo, nombre, categoria, tarifa, tarifa_urgente, experiencia, zona,
  servicios, verificado, estado, disponibilidad, disponible_ahora, foto_url,
  galeria_fotos, lat, lng, radio_cobertura_km, created_at
from public.profiles;

grant select on public.profiles_publicos to anon, authenticated;
