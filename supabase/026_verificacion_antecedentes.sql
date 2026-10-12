-- ============================================================
-- Hogandia — migración 026: verificación de antecedentes judiciales
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
--
-- Segunda insignia de confianza, independiente de "✓ Identidad verificada"
-- (esa sigue igual, columnas verificacion_*). El trabajador sube su propio
-- certificado de antecedentes (gratis en antecedentes.policia.gov.co) y el
-- admin lo revisa a mano — mismo patrón que la verificación de identidad,
-- sin depender de ningún proveedor externo de pago.
--
-- Se agregan como columnas paralelas, no reemplazando verificacion_doc_path,
-- porque un trabajador puede (y debería poder) tener ambas cosas verificadas
-- a la vez — con una sola columna de documento no se podía.
--
-- Idempotente: se puede correr varias veces sin problema.

alter table public.profiles
  add column if not exists antecedentes_doc_path text,
  add column if not exists antecedentes_verificado boolean not null default false,
  add column if not exists antecedentes_pendiente boolean not null default false,
  add column if not exists antecedentes_rechazado boolean not null default false,
  add column if not exists antecedentes_motivo_rechazo text,
  add column if not exists antecedentes_historial jsonb not null default '[]'::jsonb;

-- El trigger de la migración 025 (proteger_campos_admin_profile) ya impide que
-- un usuario toque sus propias columnas de control de identidad cuando no es
-- admin. Se redefine acá para que también cubra las columnas nuevas de
-- antecedentes — si no, un trabajador podría llamar directo a la REST API y
-- ponerse antecedentes_verificado=true sin que ningún admin lo revisara,
-- exactamente el mismo problema que 025 corrigió para la verificación de
-- identidad.
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
    new.antecedentes_verificado := old.antecedentes_verificado;
    new.antecedentes_rechazado := old.antecedentes_rechazado;
    new.antecedentes_motivo_rechazo := old.antecedentes_motivo_rechazo;
    new.antecedentes_historial := old.antecedentes_historial;
  end if;
  return new;
end;
$$;

-- profiles_publicos (migración 021) expone "verificado" al directorio público
-- a propósito; se agrega antecedentes_verificado con el mismo criterio, para
-- poder mostrar el distintivo en las tarjetas y el perfil sin necesitar login.
-- Va al FINAL de la lista a propósito: "create or replace view" no permite
-- reordenar ni insertar columnas en el medio de una vista que ya existe
-- (Postgres lo trata como un intento de renombrar la columna que quedó en esa
-- posición) — solo agregar columnas nuevas al final.
create or replace view public.profiles_publicos as
  select
    id, tipo, nombre, categoria, tarifa, tarifa_urgente, experiencia, zona,
    servicios, verificado, estado, disponibilidad, disponible_ahora, foto_url,
    galeria_fotos, lat, lng, radio_cobertura_km, created_at,
    antecedentes_verificado
  from public.profiles;

grant select on public.profiles_publicos to anon, authenticated;
