-- ============================================================
-- Hogandia — migración 006: respuesta del trabajador y moderación de reseñas
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- (requiere que 005_integridad_resenas.sql ya se haya corrido antes)
-- ============================================================

alter table public.resenas add column if not exists respuesta_trabajador text;
alter table public.resenas add column if not exists respuesta_fecha timestamptz;

-- El trabajador puede responder su propia reseña, pero un trigger evita que
-- toque la calificación o el comentario original del cliente al hacerlo.
drop policy if exists "resenas_update_respuesta_trabajador" on public.resenas;
create policy "resenas_update_respuesta_trabajador" on public.resenas
  for update using (auth.uid() = worker_id) with check (auth.uid() = worker_id);

create or replace function public.proteger_campos_resena()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.worker_id then
    new.cita_id := old.cita_id;
    new.worker_id := old.worker_id;
    new.cliente_nombre := old.cliente_nombre;
    new.estrellas := old.estrellas;
    new.comentario := old.comentario;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_campos_resena on public.resenas;
create trigger trg_proteger_campos_resena
before update on public.resenas
for each row execute function public.proteger_campos_resena();

-- El admin puede eliminar una reseña inapropiada o falsa.
drop policy if exists "resenas_delete_admin" on public.resenas;
create policy "resenas_delete_admin" on public.resenas
  for delete using (public.is_admin());
