-- ============================================================
-- Hogandia — migración 020: aviso más rápido al liberarse un cupo
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- (requiere que 013_lista_de_espera.sql y 011_recordatorios_automaticos.sql
-- ya se hayan corrido antes, así pg_net ya está habilitado)
-- ============================================================
--
-- La migración 013 ya avisa dentro de la app cuando se libera un cupo, pero
-- eso solo lo ve el cliente si tiene la app abierta o revisa la campana. Como
-- el primero que entra se queda con el horario, acá se agrega el mismo envío
-- por email/push/WhatsApp que ya usa addNotificacion() en el front, pero
-- disparado directo desde la base para que llegue apenas se libera, sin
-- depender de que el cliente esté conectado.
--
-- ANTES DE CORRER ESTO, reemplazá los dos placeholders de más abajo (igual
-- que en la migración 011):
--   <URL_BASE_FUNCIONES>    → https://fqxnppxekhqsjgpcwofb.supabase.co/functions/v1
--   <TU_SERVICE_ROLE_KEY>   → Project Settings → API → service_role key (la secreta)
-- Esta clave NUNCA se la pegues a un asistente/IA en un chat — solo acá, en
-- tu propio SQL Editor.

create or replace function public.notificar_lista_espera()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabajador_id uuid;
  v_fecha text;
  v_hora text;
  v_texto text;
  w record;
  v_headers jsonb;
begin
  if TG_OP = 'DELETE' then
    v_trabajador_id := old.trabajador_id; v_fecha := old.fecha; v_hora := old.hora;
  else
    if new.estado not in ('rechazada', 'cancelada') then
      return new;
    end if;
    v_trabajador_id := new.trabajador_id; v_fecha := new.fecha; v_hora := new.hora;
  end if;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer <TU_SERVICE_ROLE_KEY>'
  );

  for w in
    select * from public.listas_espera
    where trabajador_id = v_trabajador_id and fecha = v_fecha and hora = v_hora
  loop
    v_texto := 'Se liberó un cupo el ' || v_fecha || ' a las ' || v_hora || ' — agendalo antes de que se ocupe de nuevo.';

    insert into public.notificaciones (user_id, texto) values (w.cliente_id, v_texto);

    perform net.http_post(
      url := '<URL_BASE_FUNCIONES>/notificar-email',
      headers := v_headers,
      body := jsonb_build_object('record', jsonb_build_object('user_id', w.cliente_id, 'texto', v_texto))
    );
    perform net.http_post(
      url := '<URL_BASE_FUNCIONES>/enviar-push',
      headers := v_headers,
      body := jsonb_build_object('record', jsonb_build_object('user_id', w.cliente_id, 'texto', v_texto))
    );
    perform net.http_post(
      url := '<URL_BASE_FUNCIONES>/enviar-whatsapp',
      headers := v_headers,
      body := jsonb_build_object('record', jsonb_build_object('user_id', w.cliente_id, 'texto', v_texto))
    );

    delete from public.listas_espera where id = w.id;
  end loop;

  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;
