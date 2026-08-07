// Hogandia — Edge Function: enviar-whatsapp (SCAFFOLD, sin proveedor conectado)
//
// Se invoca igual que notificar-email/enviar-push: addNotificacion() en
// js/app.js la llama justo después de guardar la notificación en la tabla.
// Hoy NO manda nada real todavía — busca el celular del destinatario y, si
// no hay ninguna credencial de proveedor configurada, responde 200 sin hacer
// nada (no rompe el resto del flujo). Ver README.md de esta carpeta para
// conectarla a Twilio o a la API de Meta cuando decidan cuál usar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Ninguna de estas dos existe todavía — se configuran con
// `supabase secrets set ...` cuando se elija proveedor (ver README.md).
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM'); // ej. 'whatsapp:+14155238886'
const META_WHATSAPP_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN');
const META_WHATSAPP_PHONE_ID = Deno.env.get('META_WHATSAPP_PHONE_ID');

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
    const notificacion = payload.record; // { id, user_id, texto, leida, created_at }
    if (!notificacion?.user_id || !notificacion?.texto) {
      return new Response('Falta user_id o texto en la notificación.', { status: 400, headers: corsHeaders });
    }

    const tieneTwilio = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM;
    const tieneMeta = META_WHATSAPP_TOKEN && META_WHATSAPP_PHONE_ID;
    if (!tieneTwilio && !tieneMeta) {
      // Scaffold sin proveedor conectado todavía: no es un error, solo no hay nada que hacer.
      return new Response('enviar-whatsapp desplegada pero sin proveedor configurado (ver README.md).', {
        status: 200,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: perfil, error } = await supabase
      .from('profiles')
      .select('celular, nombre')
      .eq('id', notificacion.user_id)
      .single();

    if (error || !perfil?.celular) {
      return new Response('El destinatario no tiene celular guardado.', { status: 200, headers: corsHeaders });
    }

    const mensaje = `Hola ${perfil.nombre?.split(' ')[0] ?? ''}, ${notificacion.texto}`;

    if (tieneTwilio) {
      // --- Twilio WhatsApp API ---
      // Docs: https://www.twilio.com/docs/whatsapp/api
      // El número del destinatario debe ir en formato E.164 con prefijo "whatsapp:".
      const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: TWILIO_WHATSAPP_FROM!,
          To: `whatsapp:${perfil.celular}`,
          Body: mensaje,
        }),
      });
      if (!resp.ok) {
        const detalle = await resp.text();
        return new Response(`Error de Twilio: ${detalle}`, { status: 502, headers: corsHeaders });
      }
      return new Response('OK (Twilio)', { status: 200, headers: corsHeaders });
    }

    // --- Meta Cloud API ---
    // Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
    // Requiere una plantilla aprobada por Meta para el primer mensaje de cada
    // conversación (no se puede mandar texto libre sin que el usuario haya
    // escrito primero); ajustar el body según la plantilla que aprueben.
    const resp = await fetch(`https://graph.facebook.com/v20.0/${META_WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${META_WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: perfil.celular,
        type: 'text',
        text: { body: mensaje },
      }),
    });
    if (!resp.ok) {
      const detalle = await resp.text();
      return new Response(`Error de Meta: ${detalle}`, { status: 502, headers: corsHeaders });
    }
    return new Response('OK (Meta)', { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`, { status: 500, headers: corsHeaders });
  }
});
