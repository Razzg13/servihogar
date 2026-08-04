-- ============================================================
-- Hogandia — migración 013: lista de espera de horarios ocupados
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- Si un horario ya está reservado, el cliente puede anotarse; cuando esa
-- cita se cancela/rechaza, se le avisa por notificación (solo dentro de la
-- app — mandar también un correo requeriría el mismo patrón de pg_net con
-- URL/service role key de la migración 011, no incluido acá para no repetir
-- ese secreto en más lugares de los necesarios).

create table if not exists public.listas_espera (
  id bigint generated always as identity primary key,
  trabajador_id uuid not null references public.profiles(id) on delete cascade,
  cliente_id uuid not null references public.profiles(id) on delete cascade,
  fecha text not null,
  hora text not null,
  created_at timestamptz not null default now(),
  unique (trabajador_id, cliente_id, fecha, hora)
);
alter table public.listas_espera enable row level security;

drop policy if exists "listas_espera_select_propio" on public.listas_espera;
create policy "listas_espera_select_propio" on public.listas_espera
  for select using (auth.uid() = cliente_id or auth.uid() = trabajador_id or public.is_admin());
drop policy if exists "listas_espera_insert_cliente" on public.listas_espera;
create policy "listas_espera_insert_cliente" on public.listas_espera
  for insert with check (auth.uid() = cliente_id);
drop policy if exists "listas_espera_delete_propio" on public.listas_espera;
create policy "listas_espera_delete_propio" on public.listas_espera
  for delete using (auth.uid() = cliente_id or public.is_admin());

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
  w record;
begin
  if TG_OP = 'DELETE' then
    v_trabajador_id := old.trabajador_id; v_fecha := old.fecha; v_hora := old.hora;
  else
    if new.estado not in ('rechazada', 'cancelada') then
      return new;
    end if;
    v_trabajador_id := new.trabajador_id; v_fecha := new.fecha; v_hora := new.hora;
  end if;

  for w in
    select * from public.listas_espera
    where trabajador_id = v_trabajador_id and fecha = v_fecha and hora = v_hora
  loop
    insert into public.notificaciones (user_id, texto)
    values (w.cliente_id, 'Se liberó un cupo el ' || v_fecha || ' a las ' || v_hora || ' — agendalo antes de que se ocupe de nuevo.');
    delete from public.listas_espera where id = w.id;
  end loop;

  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_notificar_lista_espera_upd on public.citas;
create trigger trg_notificar_lista_espera_upd
after update on public.citas
for each row execute function public.notificar_lista_espera();

drop trigger if exists trg_notificar_lista_espera_del on public.citas;
create trigger trg_notificar_lista_espera_del
after delete on public.citas
for each row execute function public.notificar_lista_espera();
