// Hogandia — Edge Function: notificar-email
//
// Se dispara vía un Database Webhook cuando se inserta una fila en
// public.notificaciones (ver instrucciones en supabase/functions/notificar-email/README.md).
// Busca el correo del destinatario y le envía un email real con Resend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Mientras no verifiques un dominio propio en Resend, solo podés enviar desde
// este remitente de prueba (y solo llega a la cuenta con la que te registraste).
const REMITENTE = 'Hogandia <onboarding@resend.dev>';

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const notificacion = payload.record; // fila insertada: { id, user_id, texto, leida, created_at }
    if (!notificacion?.user_id || !notificacion?.texto) {
      return new Response('Falta user_id o texto en la notificación.', { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: perfil, error } = await supabase
      .from('profiles')
      .select('correo, nombre')
      .eq('id', notificacion.user_id)
      .single();

    if (error || !perfil?.correo) {
      return new Response('No se encontró el correo del destinatario.', { status: 404 });
    }

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: perfil.correo,
        subject: 'Tienes una nueva notificación en Hogandia',
        html: `<p>Hola ${perfil.nombre?.split(' ')[0] ?? ''},</p><p>${notificacion.texto}</p>`,
      }),
    });

    if (!resendResp.ok) {
      const detalle = await resendResp.text();
      return new Response(`Error de Resend: ${detalle}`, { status: 502 });
    }

    return new Response('OK', { status: 200 });
  } catch (e) {
    return new Response(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
});
