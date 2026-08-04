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

## 5. Crear el Database Webhook

En el Supabase Dashboard → **Database** → **Webhooks** → **Create a new hook**:

- **Name**: `notificar-email`
- **Table**: `notificaciones`
- **Events**: solo `Insert`
- **Type**: `Supabase Edge Functions`
- **Edge Function**: `notificar-email`
- **HTTP Headers**: dejá el que Supabase agrega automáticamente (incluye la
  autorización con el service role)

Guardá. Desde ese momento, cada `addNotificacion(...)` del código (citas
nuevas, aceptadas, rechazadas, canceladas, reagendadas) también va a mandar
un correo real, sin tocar nada más del front-end.

## Probarlo

Generá cualquier notificación en la app (por ejemplo, agendá una cita) y
revisá:
- El correo del destinatario (o tu propio correo, si seguís en modo de prueba
  de Resend).
- **Supabase Dashboard → Edge Functions → notificar-email → Logs** si algo
  falla.
