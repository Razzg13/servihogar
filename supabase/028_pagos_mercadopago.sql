-- ============================================================
-- Hogandia — migración 028: pagos dentro de la app con Mercado Pago
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
--
-- Hasta ahora el pago era 100% manual: transferencia por fuera de la app +
-- foto de comprobante + el trabajador confirma. Esto no reemplaza ese flujo
-- (sigue disponible, por si el cliente prefiere Nequi/cuenta directo) pero
-- agrega la opción de pagar con tarjeta, Nequi o PSE desde la app, vía
-- Mercado Pago Checkout Pro. Ver supabase/functions/crear-preferencia-pago
-- y supabase/functions/webhook-mercadopago.
--
-- Idempotente: se puede correr varias veces sin problema.

alter table public.citas
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id text;

-- El trigger de la migración 016 (controlar_transicion_pago) solo dejaba
-- marcar pago='pagado' al propio trabajador de la cita o a un admin — tiene
-- sentido para el flujo manual (nadie se confirma el pago a sí mismo), pero
-- bloquearía al webhook de Mercado Pago, que corre con la service_role key
-- (sin auth.uid(), porque no es un usuario logueado sino un llamado del
-- servidor). Se agrega esa excepción: cuando auth.uid() es null, quien está
-- actualizando ya pasó por tener la service_role key — lo mismo que ya se
-- confía en cualquier Edge Function de este proyecto (enviar-push,
-- notificar-email, etc.), no es un permiso nuevo.
create or replace function public.controlar_transicion_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pago is distinct from old.pago then
    if auth.uid() is null then
      -- service_role (webhook de Mercado Pago u otra Edge Function): permitido.
      return new;
    end if;
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
