// Hogandia — Edge Function: crear-preferencia-pago
//
// La invoca el cliente desde "Mis citas" (pagarConMercadoPago en js/app.js)
// cuando elige pagar con tarjeta, Nequi o PSE en vez de hacer una
// transferencia manual. Crea una "preferencia" de pago en Mercado Pago
// Checkout Pro y devuelve la URL (init_point) a la que redirigir al
// navegador — Mercado Pago se encarga de toda la pantalla de pago.
//
// El monto se calcula ACÁ, del lado del servidor, a partir de la tarifa real
// del trabajador guardada en profiles — nunca se confía en un monto que
// mande el frontend (alguien podría editarlo antes de que salga del
// navegador).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;
// URL pública del sitio, para volver después de pagar. Configurable por si
// alguna vez cambia el dominio sin tener que tocar el código.
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://hogandia.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    // functions.invoke() del cliente agrega solo el JWT del usuario logueado
    // en el header Authorization; se usa para confirmar que quien pide la
    // preferencia es realmente el cliente de esa cita, no cualquiera que
    // adivine un cita_id ajeno.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response('No autenticado.', { status: 401, headers: corsHeaders });
    }

    const { cita_id } = await req.json();
    if (!cita_id) {
      return new Response('Falta cita_id.', { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: cita, error: citaError } = await admin
      .from('citas')
      .select('id, cliente_id, trabajador_id, fecha, hora, es_urgente, pago')
      .eq('id', cita_id)
      .single();
    if (citaError || !cita) {
      return new Response('No se encontró la cita.', { status: 404, headers: corsHeaders });
    }
    if (cita.cliente_id !== userData.user.id) {
      return new Response('Esta cita no te pertenece.', { status: 403, headers: corsHeaders });
    }
    if (cita.pago === 'pagado') {
      return new Response('Esta cita ya está pagada.', { status: 409, headers: corsHeaders });
    }

    const { data: trabajador, error: trabajadorError } = await admin
      .from('profiles')
      .select('nombre, tarifa, tarifa_urgente')
      .eq('id', cita.trabajador_id)
      .single();
    if (trabajadorError || !trabajador) {
      return new Response('No se encontró el trabajador.', { status: 404, headers: corsHeaders });
    }

    // Misma fórmula que calcularMonto() en js/logica.js.
    const monto = Number(trabajador.tarifa || 0) + (cita.es_urgente ? Number(trabajador.tarifa_urgente || 0) : 0);
    if (!monto || monto <= 0) {
      return new Response('El trabajador no tiene una tarifa válida configurada.', { status: 422, headers: corsHeaders });
    }

    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{
          title: `Servicio con ${trabajador.nombre} — Hogandia`,
          description: `Cita del ${cita.fecha} a las ${cita.hora}`,
          quantity: 1,
          currency_id: 'COP',
          unit_price: monto,
        }],
        external_reference: cita.id,
        // Sin un payer explícito, Mercado Pago a veces rechaza la creación
        // de la preferencia con un 403 genérico del motor de políticas
        // (cuentas nuevas en etapa de prueba lo piden). Usamos el email del
        // cliente autenticado, que ya validamos arriba con auth.getUser().
        payer: userData.user.email ? { email: userData.user.email } : undefined,
        back_urls: {
          success: `${SITE_URL}/#/miscitas`,
          pending: `${SITE_URL}/#/miscitas`,
          failure: `${SITE_URL}/#/miscitas`,
        },
        auto_return: 'approved',
        notification_url: `${SUPABASE_URL}/functions/v1/webhook-mercadopago`,
      }),
    });
    if (!resp.ok) {
      const detalle = await resp.text();
      return new Response(`Error de Mercado Pago: ${detalle}`, { status: 502, headers: corsHeaders });
    }
    const pref = await resp.json();

    await admin.from('citas').update({ mp_preference_id: pref.id }).eq('id', cita_id);

    return new Response(JSON.stringify({ init_point: pref.init_point }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`, { status: 500, headers: corsHeaders });
  }
});
