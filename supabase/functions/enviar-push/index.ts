// Hogandia — Edge Function: enviar-push
//
// Se invoca directamente desde js/app.js (addNotificacion), igual que
// notificar-email (ver README de esa función para el porqué de la llamada
// directa en vez de un Database Webhook). Manda una notificación push real
// del navegador a todos los dispositivos suscritos del destinatario.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails('mailto:soporte@hogandia.co', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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
    const payload = await req.json();
    const notificacion = payload.record; // { user_id, texto }
    if (!notificacion?.user_id || !notificacion?.texto) {
      return new Response('Falta user_id o texto en la notificación.', { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', notificacion.user_id);

    if (error) {
      return new Response(`Error leyendo suscripciones: ${error.message}`, { status: 500, headers: corsHeaders });
    }
    if (!subs || subs.length === 0) {
      return new Response('OK (el usuario no tiene notificaciones push activadas)', { status: 200, headers: corsHeaders });
    }

    const mensaje = JSON.stringify({ title: 'Hogandia', body: notificacion.texto });

    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          mensaje,
        );
      } catch (err) {
        // 404/410 = la suscripción ya no existe del lado del navegador (desinstaló, borró datos, etc.)
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }));

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`, { status: 500, headers: corsHeaders });
  }
});
