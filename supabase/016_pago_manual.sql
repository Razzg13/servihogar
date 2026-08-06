-- ============================================================
-- Hogandia — migración 016: pago manual por transferencia (sin pasarela)
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
-- Reemplaza el pago simulado por un flujo real pero sin pasarela de pago:
-- el trabajador publica cómo le pagan (Nequi, cuenta, etc.), el cliente
-- transfiere por fuera de la app y sube un comprobante, y el trabajador
-- confirma que lo recibió. No hay cobro automático ni verificación de que
-- la plata realmente llegó — es un paso intermedio más simple que integrar
-- una pasarela real (Wompi/Mercado Pago/etc.), que sigue disponible más
-- adelante si hace falta (ver rama feature/pagos-wompi).

alter table public.profiles
  add column if not exists datos_pago_texto text;

alter table public.citas
  add column if not exists comprobante_pago_path text;

alter table public.citas drop constraint if exists citas_pago_check;
alter table public.citas add constraint citas_pago_check
  check (pago in ('pendiente','declarado','pagado'));

-- ---------------- STORAGE: bucket privado para comprobantes de pago ----------------
-- Cada archivo vive en "{cita_id}/archivo.ext"; solo el cliente y el
-- trabajador de esa cita (o el admin) pueden verlo.
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

create policy "comprobantes_select_involucrados" on storage.objects
  for select using (
    bucket_id = 'comprobantes' and (
      public.is_admin() or exists (
        select 1 from public.citas c
        where c.id::text = (storage.foldername(name))[1]
          and (c.cliente_id = auth.uid() or c.trabajador_id = auth.uid())
      )
    )
  );
create policy "comprobantes_insert_cliente" on storage.objects
  for insert with check (
    bucket_id = 'comprobantes' and exists (
      select 1 from public.citas c
      where c.id::text = (storage.foldername(name))[1] and c.cliente_id = auth.uid()
    )
  );

-- Controla quién puede mover `pago` a cada estado: el cliente puede declarar
-- que pagó, pero solo el trabajador (o el admin) puede confirmarlo o
-- rechazarlo — así ningún lado puede marcarse a sí mismo como "ya cobré".
create or replace function public.controlar_transicion_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pago is distinct from old.pago then
    if new.pago = 'declarado' and auth.uid() is distinct from old.cliente_id then
      raise exception 'Solo el cliente puede declarar que pagó.';
    elsif new.pago in ('pagado','pendiente')
      and auth.uid() is distinct from old.trabajador_id and not public.is_admin() then
      raise exception 'Solo el trabajador (o un admin) puede confirmar o rechazar un pago declarado.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_controlar_transicion_pago on public.citas;
create trigger trg_controlar_transicion_pago
before update on public.citas
for each row execute function public.controlar_transicion_pago();
