begin;

-- El hogar guardado pertenece a la cuenta. No se añade a profiles_publicos.
-- Al elegirlo en una reserva se copia a la cita específica.
alter table public.profiles
  add column if not exists ubicacion_hogar jsonb
  check (ubicacion_hogar is null or (tipo = 'cliente' and jsonb_typeof(ubicacion_hogar) = 'object'));

notify pgrst, 'reload schema';

commit;
