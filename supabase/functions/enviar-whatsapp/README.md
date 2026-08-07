# enviar-whatsapp (scaffold, sin proveedor conectado)

Igual que `notificar-email` y `enviar-push`, pero para WhatsApp. **Hoy no
manda nada real**: la función está desplegable y ya se llama desde
`addNotificacion()` en `js/app.js`, pero mientras no configures ninguna de
las credenciales de abajo, responde 200 sin hacer nada (no rompe el resto
del flujo de notificaciones).

Para que sirva hacen falta dos cosas:

1. Que el usuario tenga guardado su celular (`profiles.celular`, migración
   `018_celular_whatsapp.sql`) — ya se pide en el registro y en el perfil del
   trabajador.
2. Elegir un proveedor y configurar sus credenciales como secretos.

## Opción A: Twilio (más rápido para probar)

1. Creá una cuenta en https://www.twilio.com (tiene trial gratis).
2. Activá el **WhatsApp Sandbox** (Messaging → Try it out → Send a WhatsApp
   message) — te da un número de prueba y un código que cada destinatario
   debe mandar por WhatsApp una vez para poder recibir mensajes tuyos (límite
   del modo sandbox; para producción real hay que pedir un número de WhatsApp
   Business verificado).
3. Copiá el **Account SID** y el **Auth Token** del dashboard.
4. Guardá los secretos:

```bash
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=tu_auth_token
supabase secrets set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

## Opción B: Meta Cloud API (directo, sin intermediario)

1. Creá una app en https://developers.facebook.com y agregale el producto
   **WhatsApp**.
2. En **WhatsApp → API Setup** conseguís un token temporal y un
   **Phone Number ID** para probar de una vez (a tu propio número).
3. Para mandarle a clientes/trabajadores reales necesitás verificar tu
   negocio en Meta Business Manager (puede tardar días) y usar plantillas de
   mensaje aprobadas para el primer contacto de cada conversación — no se
   puede mandar texto libre sin que el usuario te haya escrito antes.
4. Guardá los secretos:

```bash
supabase secrets set META_WHATSAPP_TOKEN=tu_token
supabase secrets set META_WHATSAPP_PHONE_ID=tu_phone_number_id
```

Si configurás **ambas**, la función prioriza Twilio (ver `index.ts`).

## Desplegar

```bash
supabase functions deploy enviar-whatsapp
```

## Probarlo

Generá cualquier notificación en la app (ej. agendá una cita) desde una
cuenta que tenga celular guardado, y revisá **Supabase Dashboard → Edge
Functions → enviar-whatsapp → Logs**.
