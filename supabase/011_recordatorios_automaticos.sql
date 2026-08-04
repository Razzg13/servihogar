-- ============================================================
-- Hogandia — migración 011: recordatorio automático el día antes de la cita
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- (requiere que 010_columna_inicio_cita.sql ya se haya corrido antes)
-- ============================================================
--
-- ANTES DE CORRER ESTO, reemplazá los dos placeholders de más abajo:
--   <URL_DE_TU_FUNCION>      → https://fqxnppxekhqsjgpcwofb.supabase.co/functions/v1/notificar-email
--   <TU_SERVICE_ROLE_KEY>    → Project Settings → API → service_role key (la secreta, no la anon)
-- Esta clave NUNCA se la pegues a un asistente/IA en un chat — solo se pega
-- acá, en tu propio SQL Editor, y queda guardada dentro de la función.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.enviar_recordatorios_citas()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_texto text;
begin
  for r in
    select c.id, c.trabajador_id, c.cliente_id, c.fecha, c.hora
    from public.citas c
    where c.estado = 'aceptada'
      and c.inicio is not null
      -- "mañana" en hora de Colombia, para no depender del huso horario del servidor
      and (c.inicio at time zone 'America/Bogota')::date = ((now() at time zone 'America/Bogota')::date + 1)
  loop
    v_texto := 'Recordatorio: mañana ' || r.fecha || ' a las ' || r.hora || ' tenés una cita agendada en Hogandia.';

    insert into public.notificaciones (user_id, texto) values (r.cliente_id, v_texto);

    perform net.http_post(
      url := '<URL_DE_TU_FUNCION>',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <TU_SERVICE_ROLE_KEY>'
      ),
      body := jsonb_build_object('record', jsonb_build_object('user_id', r.cliente_id, 'texto', v_texto))
    );
  end loop;
end;
$$;

-- Corre todos los días a las 15:00 UTC = 10:00 am hora de Colombia.
select cron.schedule(
  'recordatorios-citas-diario',
  '0 15 * * *',
  $$select public.enviar_recordatorios_citas();$$
);
