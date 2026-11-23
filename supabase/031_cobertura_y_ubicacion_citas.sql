begin;

alter table public.profiles
  add column if not exists zonas_servicio text[] not null default '{}'
  check (cardinality(zonas_servicio) <= 14);

alter table public.citas
  add column if not exists ubicacion_servicio jsonb
  check (ubicacion_servicio is null or jsonb_typeof(ubicacion_servicio) = 'object');

-- Solo las zonas declaradas para prestar servicios se añaden al directorio.
-- La dirección y el pin de la cita quedan en citas bajo su RLS existente.
create or replace view public.profiles_publicos as
select
  id, tipo, nombre, categoria, tarifa, tarifa_urgente, experiencia, zona,
  servicios, verificado, estado, disponibilidad, disponible_ahora, foto_url,
  galeria_fotos, lat, lng, radio_cobertura_km, created_at,
  antecedentes_verificado, zonas_servicio
from public.profiles;

notify pgrst, 'reload schema';

commit;
