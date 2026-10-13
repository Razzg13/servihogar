-- ============================================================
-- Hogandia — migración 030: confirmación del trabajador al completar
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- Antes, el cliente marcaba una cita como "completada" directamente y eso
-- certificaba, de un solo lado, que el servicio ocurrió (hallazgo P1 de la
-- revisión de diseño de mis-citas). Ahora el cliente marca que lo hizo, la
-- cita queda "esperando_confirmacion", y el trabajador confirma u objeta.
-- Si no responde en 3 días, se confirma sola — para que un trabajador que
-- no vuelve a entrar no le bloquee la calificación al cliente para siempre.

alter table public.citas
  add column if not exists completada_pendiente_desde timestamptz;

alter table public.citas drop constraint if exists citas_estado_check;
alter table public.citas add constraint citas_estado_check
  check (estado in ('pendiente','aceptada','rechazada','completada','cancelada','esperando_confirmacion'));

-- Controla quién puede mover `estado` hacia (y a través de) la confirmación:
-- el cliente puede decir "ya se hizo", pero solo el trabajador (o el admin,
-- o el job automático de más abajo, que corre sin sesión) puede confirmar
-- que es cierto — mismo patrón que controlar_transicion_pago (migración 016).
create or replace function public.controlar_transicion_completada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'esperando_confirmacion' then
      if old.estado is distinct from 'aceptada' then
        raise exception 'Solo se puede marcar como hecho un servicio en una cita aceptada.';
      end if;
      if auth.uid() is not null and auth.uid() is distinct from old.cliente_id and not public.is_admin() then
        raise exception 'Solo el cliente puede marcar el servicio como hecho.';
      end if;
      new.completada_pendiente_desde := now();
    elsif new.estado = 'completada' then
      if old.estado is distinct from 'esperando_confirmacion' then
        raise exception 'Solo se puede confirmar una cita que esté esperando confirmación.';
      end if;
      if auth.uid() is not null and auth.uid() is distinct from old.trabajador_id and not public.is_admin() then
        raise exception 'Solo el trabajador (o un admin) puede confirmar que el servicio se completó.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_controlar_transicion_completada on public.citas;
create trigger trg_controlar_transicion_completada
before update on public.citas
for each row execute function public.controlar_transicion_completada();

-- REPORTES: antes solo el cliente podía reportar un problema sobre su propia
-- cita; ahora el trabajador también puede (lo necesita para objetar un
-- "completada" con el que no está de acuerdo).
drop policy if exists "reportes_select_propio_o_admin" on public.reportes;
create policy "reportes_select_propio_o_admin" on public.reportes
  for select using (
    public.is_admin() or exists (
      select 1 from public.citas c where c.id = cita_id
        and (c.cliente_id = auth.uid() or c.trabajador_id = auth.uid())
    )
  );
drop policy if exists "reportes_insert_cliente" on public.reportes;
create policy "reportes_insert_involucrados" on public.reportes
  for insert with check (
    exists (
      select 1 from public.citas c where c.id = cita_id
        and (c.cliente_id = auth.uid() or c.trabajador_id = auth.uid())
    )
  );

-- Auto-confirmación: si el trabajador no confirma ni objeta en 3 días,
-- la cita se confirma sola.
create extension if not exists pg_cron;

create or replace function public.auto_confirmar_citas_completadas()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id, cliente_id, trabajador_id, fecha
    from public.citas
    where estado = 'esperando_confirmacion'
      and completada_pendiente_desde < now() - interval '3 days'
  loop
    update public.citas set estado = 'completada' where id = r.id;
    insert into public.notificaciones (user_id, texto) values
      (r.cliente_id, 'Se confirmó automáticamente que tu cita del ' || r.fecha || ' se completó (el trabajador no respondió en 3 días). Ya podés calificar.'),
      (r.trabajador_id, 'La cita del ' || r.fecha || ' se marcó como completada automáticamente porque no la confirmaste a tiempo.');
  end loop;
end;
$$;

select cron.schedule(
  'auto-confirmar-citas-completadas',
  '0 * * * *',
  $$select public.auto_confirmar_citas_completadas();$$
);
