-- ============================================================
-- Verificación de la migración 030 (confirmación del trabajador)
-- Pegar y correr completo en: Supabase Dashboard → SQL Editor → New query
-- ============================================================
-- Es un DRY RUN: todo corre dentro de una transacción con ROLLBACK al
-- final, así que no deja ningún dato de prueba ni cambia nada real, pase
-- lo que pase. Los resultados aparecen como mensajes NOTICE en la pestaña
-- de resultados (o "Logs" / salida de la consulta, según la versión del
-- dashboard) — copiame esa salida completa.

begin;

-- ---------- 1. El esquema quedó como se esperaba ----------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='citas' and column_name='completada_pendiente_desde') then
    raise exception 'FALTA: la columna completada_pendiente_desde no existe';
  end if;
  raise notice 'OK (1/5): columna completada_pendiente_desde existe';

  if not exists (select 1 from pg_constraint where conname='citas_estado_check' and pg_get_constraintdef(oid) like '%esperando_confirmacion%') then
    raise exception 'FALTA: citas_estado_check no incluye esperando_confirmacion';
  end if;
  raise notice 'OK (2/5): citas_estado_check incluye esperando_confirmacion';

  if not exists (select 1 from pg_trigger where tgname='trg_controlar_transicion_completada') then
    raise exception 'FALTA: el trigger trg_controlar_transicion_completada no existe';
  end if;
  raise notice 'OK (3/5): trigger trg_controlar_transicion_completada existe';

  if not exists (select 1 from cron.job where jobname='auto-confirmar-citas-completadas') then
    raise exception 'FALTA: el cron job auto-confirmar-citas-completadas no está programado';
  end if;
  raise notice 'OK (4/5): cron job auto-confirmar-citas-completadas programado';

  if not exists (select 1 from pg_policies where tablename='reportes' and policyname='reportes_insert_involucrados') then
    raise exception 'FALTA: la política reportes_insert_involucrados no existe';
  end if;
  raise notice 'OK (5/5): política reportes_insert_involucrados existe';
end $$;

-- ---------- 2. Prueba funcional end-to-end (con las cuentas de prueba) ----------
do $$
declare
  v_cliente uuid := '8d22f06e-42f4-4056-97aa-7d4ef6501953';     -- Usuario Prueba
  v_trabajador uuid := '0b72e7dc-5bd7-4778-bd81-11ee0c37e69f';  -- Trabajador Prueba
  v_cita_id uuid;
  v_fallo boolean;
begin
  -- Como postgres (superusuario), sin RLS, para crear el dato de prueba.
  insert into public.citas (cliente_id, trabajador_id, fecha, hora, estado)
  values (v_cliente, v_trabajador, '2026-01-01', '10:00 am', 'aceptada')
  returning id into v_cita_id;
  raise notice 'Cita de prueba creada: % (estado=aceptada)', v_cita_id;

  -- --- Simular al CLIENTE marcando "ya se hizo" ---
  perform set_config('request.jwt.claims', json_build_object('sub', v_cliente, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.citas set estado='esperando_confirmacion' where id=v_cita_id;
  raise notice 'OK: el cliente pudo pasar a esperando_confirmacion';
  reset role;

  -- --- El CLIENTE NO debería poder saltar directo a "completada" ---
  perform set_config('request.jwt.claims', json_build_object('sub', v_cliente, 'role','authenticated')::text, true);
  set local role authenticated;
  v_fallo := false;
  begin
    update public.citas set estado='completada' where id=v_cita_id;
  exception when others then
    v_fallo := true;
    raise notice 'OK: el trigger bloqueó al cliente (%)', sqlerrm;
  end;
  reset role;
  if not v_fallo then raise exception 'FALLO DE SEGURIDAD: el cliente pudo marcar completada sin que el trabajador confirme'; end if;

  -- --- Simular al TRABAJADOR objetando (crea un reporte y reabre la cita) ---
  perform set_config('request.jwt.claims', json_build_object('sub', v_trabajador, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.reportes (cita_id, de_nombre, motivo, estado) values (v_cita_id, 'Trabajador Prueba', 'No fue así (prueba)', 'abierto');
  raise notice 'OK: el trabajador pudo crear un reporte (antes solo podía el cliente)';
  reset role;

  -- --- Simular al TRABAJADOR confirmando ---
  perform set_config('request.jwt.claims', json_build_object('sub', v_trabajador, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.citas set estado='completada' where id=v_cita_id;
  raise notice 'OK: el trabajador pudo confirmar completada';
  reset role;

  raise notice 'TODAS LAS PRUEBAS PASARON';
end $$;

rollback;
-- ¿Por qué ROLLBACK y no COMMIT? Porque esto es solo una verificación: no
-- queremos dejar una cita ni un reporte de prueba en la base real. Si por
-- algún motivo preferís dejarlo (no recomendado), cambiá "rollback" por
-- "commit" — pero no hace falta para confirmar que la migración funciona.
