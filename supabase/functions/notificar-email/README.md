# notificar-email

Envía un correo real cada vez que se crea una notificación en la app
(cita nueva, aceptada, rechazada, cancelada, reagendada, etc.), usando
[Resend](https://resend.com) (tiene plan gratis, 3.000 correos/mes).

## 1. Crear cuenta y API key en Resend

1. Registrate en https://resend.com (gratis).
2. En el dashboard, andá a **API Keys** → **Create API Key** → copiá el valor
   (empieza con `re_...`). Solo se muestra una vez.

Por defecto Resend solo te deja enviar desde `onboarding@resend.dev` y **solo
al correo con el que te registraste** (modo de prueba). Para enviar a
cualquier cliente/trabajador real, tenés que verificar un dominio propio en
Resend (Domains → Add Domain) y cambiar el remitente en `index.ts`.

## 2. Instalar la CLI de Supabase y conectar el proyecto

```bash
npm install -g supabase
supabase login
supabase link --project-ref fqxnppxekhqsjgpcwofb
```

`supabase login` abre el navegador para autenticarte — hacelo vos desde tu
propia sesión, no compartas el token con nadie.

## 3. Guardar el API key de Resend como secreto

```bash
supabase secrets set RESEND_API_KEY=re_tu_api_key_aca
```

## 4. Desplegar la función

Desde la raíz del proyecto:

```bash
supabase functions deploy notificar-email
```

Al terminar te va a dar una URL como:
`https://fqxnppxekhqsjgpcwofb.supabase.co/functions/v1/notificar-email`

## 5. Conexión con la app

Lo ideal sería un Database Webhook (Database → Webhooks) que dispare la
función automáticamente al insertarse una fila en `notificaciones`, sin
tocar el front-end. Si tu proyecto tira el error `schema "supabase_functions"
does not exist` al crearlo (pasa en algunos proyectos nuevos, falta esa
infraestructura interna), usá en su lugar la llamada directa que ya está en
`js/app.js`: la función `addNotificacion(...)` invoca `notificar-email` justo
después de guardar la notificación en la tabla. No requiere ninguna
configuración extra — ya funciona apenas desplegás la función y guardás el
secreto de Resend.

Si en el futuro Supabase resuelve el problema del webhook, se puede volver a
esa opción (más robusta porque no depende de que el cliente esté conectado)
quitando la llamada de `addNotificacion` y creando el webhook como se
describe arriba.

## Probarlo

Generá cualquier notificación en la app (por ejemplo, agendá una cita) y
revisá:
- El correo del destinatario (o tu propio correo, si seguís en modo de prueba
  de Resend).
- **Supabase Dashboard → Edge Functions → notificar-email → Logs** si algo
  falla.
