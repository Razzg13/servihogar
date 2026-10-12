# crear-preferencia-pago

Crea una preferencia de pago en [Mercado Pago Checkout Pro](https://www.mercadopago.com.co/developers/es/docs/checkout-pro/landing)
y devuelve la URL a la que redirigir al cliente para pagar con tarjeta,
Nequi o PSE, sin salir de Mercado Pago. No reemplaza el pago manual por
transferencia (sigue disponible); es una opción más.

## 1. Conseguir las credenciales de Mercado Pago

Necesitás el **Access Token** (nunca el Public Key, ese es para el
frontend y acá no hace falta porque Checkout Pro solo redirige a una URL).

- Para **probar sin riesgo**: [mercadopago.com.co/developers/panel](https://www.mercadopago.com.co/developers/panel) →
  tu aplicación → pestaña **Credenciales de prueba** → copiá el Access Token
  (empieza igual que el de producción, `APP_USR-...`, no te guíes solo por
  el prefijo — fijate el título de la sección).
- Cuando quieras cobrar plata real: la misma pantalla, pestaña
  **Credenciales de producción**.

**Nunca pegues el Access Token en el código ni en un chat con un asistente
de IA** — solo va como secreto de Supabase (paso 3).

## 2. Instalar la CLI de Supabase y conectar el proyecto

```bash
npm install -g supabase
supabase login
supabase link --project-ref fqxnppxekhqsjgpcwofb
```

(Si ya lo hiciste para otra función, te lo podés saltar.)

## 3. Guardar el Access Token como secreto

```bash
supabase secrets set MP_ACCESS_TOKEN=tu_access_token_aca
```

Mientras estés probando, usá el Access Token de **prueba**. El día que
pases a cobrar de verdad, corré el mismo comando con el de producción —
no hace falta redesplegar nada, el secreto se actualiza solo.

## 4. Desplegar las dos funciones

Esta función y `webhook-mercadopago` trabajan juntas — hay que desplegar
las dos:

```bash
supabase functions deploy crear-preferencia-pago
supabase functions deploy webhook-mercadopago
```

## 5. Correr la migración

En el SQL Editor del dashboard, corré `supabase/028_pagos_mercadopago.sql`
si todavía no lo hiciste.

## 6. Conexión con la app

El botón "💳 Pagar con tarjeta, Nequi o PSE" (dentro de "Mis citas" → Pagar)
invoca esta función con el `cita_id`; la función calcula el monto real
desde la tarifa del trabajador, crea la preferencia en Mercado Pago y
devuelve la URL de pago (`init_point`), a la que el navegador redirige.
Cuando el cliente termina de pagar, Mercado Pago le avisa a
`webhook-mercadopago` (ver su propio README) y ahí se marca la cita como
pagada.

## Probarlo (con las credenciales de prueba)

1. Agendá una cita de prueba y aceptala del lado del trabajador.
2. Como cliente, andá a "Mis citas" → "Pagar" → "Pagar con tarjeta, Nequi o PSE".
3. Mercado Pago te va a pedir una tarjeta — usá una de las [tarjetas de
   prueba oficiales](https://www.mercadopago.com.co/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards)
   (ningún cobro es real en modo prueba).
4. Si el pago queda aprobado, deberías volver a "Mis citas" y ver la cita
   marcada como pagada en unos segundos (lo hace el webhook, no la vuelta
   del navegador).
5. Si algo falla, revisá **Supabase Dashboard → Edge Functions →
   crear-preferencia-pago / webhook-mercadopago → Logs**.
