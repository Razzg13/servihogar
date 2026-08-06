// Configuración del proyecto de Supabase.
// La URL y la clave "anon/publishable" son públicas por diseño (están hechas para
// exponerse en el frontend); la seguridad real la dan las políticas de Row Level
// Security definidas en supabase/schema.sql, no el secreto de esta clave.
const SUPABASE_URL = 'https://fqxnppxekhqsjgpcwofb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YKyaZA59u8fpiG0S4xIONg_OeueRC9T';

// Clave pública VAPID para notificaciones push del navegador. También es
// pública por diseño (ver supabase/functions/enviar-push/README.md para
// generarla). La clave PRIVADA nunca va acá: se configura en Supabase con
// `supabase secrets set VAPID_PRIVATE_KEY=...` para que la use la Edge
// Function enviar-push.
const VAPID_PUBLIC_KEY = 'REEMPLAZAR_CON_TU_CLAVE_PUBLICA_VAPID';
