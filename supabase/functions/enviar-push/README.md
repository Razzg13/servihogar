# enviar-push

Manda una notificación push real del navegador (la que aparece aunque la
pestaña de Hogandia esté cerrada) cada vez que se crea una notificación en la
app, usando el protocolo estándar [Web Push](https://web.dev/push-notifications-overview/)
vía la librería [`web-push`](https://www.npmjs.com/package/web-push) (sin
costo, no depende de ningún servicio de terceros pago).

## 1. Generar el par de claves VAPID (una sola vez)

Desde cualquier máquina con Node instalado (no hace falta que quede como
dependencia del proyecto):

```bash
npx web-push generate-vapid-keys
```

Vas a obtener dos valores:

- **Public Key** → pegala en `js/supabase-config.js`, reemplazando
  `VAPID_PUBLIC_KEY` (es pública por diseño, viaja al navegador).
- **Private Key** → **nunca** la pegues en el código ni la mandes por chat.
  Va solo como secreto de Supabase (paso 3).

## 2. Instalar la CLI de Supabase y conectar el proyecto

```bash
npm install -g supabase
supabase login
supabase link --project-ref fqxnppxekhqsjgpcwofb
```

(Si ya lo hiciste para `notificar-email`, te lo podés saltar.)

## 3. Guardar las claves VAPID como secretos

```bash
supabase secrets set VAPID_PUBLIC_KEY=tu_clave_publica_aca
supabase secrets set VAPID_PRIVATE_KEY=tu_clave_privada_aca
```

## 4. Desplegar la función

```bash
supabase functions deploy enviar-push
```

## 5. Correr la migración de la tabla de suscripciones

En el SQL Editor del dashboard, corré `supabase/014_push_subscriptions.sql`
si todavía no lo hiciste.

## 6. Conexión con la app

Igual que `notificar-email`: `addNotificacion(...)` en `js/app.js` invoca
`enviar-push` justo después de guardar la notificación, sin necesitar un
Database Webhook. El botón "Activar notificaciones" (cerca de la campana)
pide permiso al navegador y guarda la suscripción en `push_subscriptions`.

## Probarlo

1. Iniciá sesión, hacé clic en el botón de activar notificaciones push y
   aceptá el permiso del navegador.
2. Generá una notificación (ej. que otra cuenta te acepte/rechace una cita).
3. Debería aparecer una notificación nativa del sistema operativo, incluso
   con la pestaña de Hogandia en segundo plano.
4. Si falla, revisá **Supabase Dashboard → Edge Functions → enviar-push →
   Logs**.
