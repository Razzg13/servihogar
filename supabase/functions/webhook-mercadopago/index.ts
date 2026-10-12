// Hogandia — Edge Function: webhook-mercadopago
//
// Mercado Pago llama a esta URL cuando cambia el estado de un pago (la
// configura crear-preferencia-pago como notification_url de cada
// preferencia). Nunca se confía en los datos que vienen en la query del
// webhook en sí — eso cualquiera lo podría falsificar — así que acá se
// vuelve a pedir el pago directo a la API de Mercado Pago con el Access
// Token propio, y recién con esa respuesta se decide si la cita queda
// pagada.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    // Mercado Pago manda el id del pago como "data.id" (notificaciones nuevas)
    // o como "id" (formato IPN viejo, por las dudas).
    const paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    const topic = url.searchParams.get('type') || url.searchParams.get('topic');
    if (!paymentId || (topic && topic !== 'payment')) {
      // No es una notificación de pago (puede ser de otro tipo, ej. "merchant_order");
      // se responde 200 igual para que Mercado Pago no reintente de más.
      return new Response('OK (ignorado)', { status: 200 });
    }

    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!resp.ok) {
      return new Response('OK (no se pudo confirmar el pago con Mercado Pago, se ignora)', { status: 200 });
    }
    const pago = await resp.json();

    const citaId = pago.external_reference;
    if (!citaId) {
      return new Response('OK (pago sin external_reference, no es de una cita de Hogandia)', { status: 200 });
    }

    if (pago.status === 'approved') {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: cita } = await admin
        .from('citas')
        .update({ pago: 'pagado', mp_payment_id: String(pago.id), monto: pago.transaction_amount })
        .eq('id', citaId)
        .select('trabajador_id, fecha, hora')
        .single();
      if (cita) {
        await admin.from('notificaciones').insert({
          user_id: cita.trabajador_id,
          texto: `Recibiste el pago de tu cita del ${cita.fecha} a las ${cita.hora} por Mercado Pago.`,
        });
      }
    }
    // Otros estados (pending, rejected, in_process) no cambian nada todavía:
    // el cliente sigue viendo el botón de pago y puede reintentar.

    return new Response('OK', { status: 200 });
  } catch (e) {
    // Siempre 200: si Mercado Pago recibe un error, reintenta la notificación
    // muchas veces seguidas, y un error de verdad ya quedó en los logs.
    console.error('webhook-mercadopago:', e);
    return new Response('OK (con error interno, ver logs)', { status: 200 });
  }
});
