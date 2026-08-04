-- ============================================================
-- Hogandia — migración 005: integridad de reseñas
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- Antes de esto, cualquier usuario logueado podía insertar una reseña para
-- cualquier trabajador sin haber contratado nunca su servicio (la política
-- solo exigía estar autenticado). Esta migración ata cada reseña a una cita
-- real, completada, del mismo cliente, y toma el nombre desde el perfil en
-- vez de confiar en lo que mande el navegador.

alter table public.resenas add column if not exists cita_id uuid references public.citas(id) on delete cascade;
alter table public.resenas drop constraint if exists resenas_cita_id_unique;
alter table public.resenas add constraint resenas_cita_id_unique unique (cita_id);

create or replace function public.completar_resena_desde_cita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_trabajador_id uuid;
  v_estado text;
  v_nombre text;
begin
  if new.cita_id is null then
    raise exception 'La reseña debe estar vinculada a una cita.';
  end if;

  select cliente_id, trabajador_id, estado into v_cliente_id, v_trabajador_id, v_estado
  from public.citas where id = new.cita_id;

  if v_cliente_id is null then
    raise exception 'La cita indicada no existe.';
  end if;
  if auth.uid() is distinct from v_cliente_id then
    raise exception 'Solo el cliente de esa cita puede calificarla.';
  end if;
  if v_estado <> 'completada' then
    raise exception 'Solo se puede calificar una cita completada.';
  end if;

  select nombre into v_nombre from public.profiles where id = v_cliente_id;

  new.worker_id := v_trabajador_id;
  new.cliente_nombre := coalesce(v_nombre, 'Cliente');
  return new;
end;
$$;

drop trigger if exists trg_completar_resena on public.resenas;
create trigger trg_completar_resena
before insert on public.resenas
for each row execute function public.completar_resena_desde_cita();
