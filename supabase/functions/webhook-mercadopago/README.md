# webhook-mercadopago

Recibe el aviso de Mercado Pago cuando un pago cambia de estado (lo dispara
`crear-preferencia-pago`, que configura esta función como `notification_url`
de cada preferencia) y, si el pago quedó aprobado, marca la cita
correspondiente como pagada y avisa al trabajador.

No hace falta configurar nada acá aparte: usa el mismo secreto
`MP_ACCESS_TOKEN` que `crear-preferencia-pago` (ver su README para cómo
conseguirlo y guardarlo) y se despliega junto con ella:

```bash
supabase functions deploy webhook-mercadopago
```

## Por qué nunca confía en lo que manda el webhook

Cualquiera podría mandarle a esta URL una query armada a mano, así que acá
nunca se usa directamente lo que viene en la notificación para decidir si
un pago está aprobado. En cambio, se vuelve a pedir el pago directo a la
API de Mercado Pago (`GET /v1/payments/{id}`) con el Access Token propio, y
solo si esa respuesta dice `status: "approved"` se marca la cita como
pagada. Es la verificación que recomienda la [documentación oficial de
Mercado Pago](https://www.mercadopago.com.co/developers/es/docs/checkout-pro/additional-content/notifications/webhooks).

## Si algo no llega

- Revisá **Supabase Dashboard → Edge Functions → webhook-mercadopago →
  Logs** — cualquier error queda registrado ahí (la función siempre
  responde 200 para que Mercado Pago no reintente de más, pero el error
  real se loguea).
- En el panel de Mercado Pago Developers, dentro de tu aplicación, hay una
  sección de **Webhooks** donde se puede ver el historial de notificaciones
  enviadas y su resultado — sirve para confirmar que Mercado Pago sí está
  llegando a la URL de Supabase.
