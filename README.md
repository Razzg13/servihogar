# Hogandia

Plataforma web para conectar clientes con trabajadores independientes de servicios técnicos y domésticos (plomería, electricidad, limpieza, jardinería, pintura, cerrajería) en Ibagué.

## Funcionalidades

- Registro e inicio de sesión (cliente / trabajador)
- Búsqueda y filtro de trabajadores por categoría, texto, precio o calificación
- Buscador de la portada con filtrado en vivo (sin salir de la home)
- Mapa de la zona de cada trabajador y mapa de conjunto en Buscar (OpenStreetMap, sin API key)
- Perfil de trabajador con calificaciones, reseñas y distintivo de verificado
- Favoritos: los clientes pueden guardar trabajadores
- Agendamiento de citas (calendario que marca los días sin atención y horarios)
- Chat simple por cita entre cliente y trabajador
- Pago por transferencia con comprobante (el trabajador lo confirma al recibirlo)
- Comprobante de la cita descargable/imprimible
- Reportar un problema desde una cita
- Notificaciones dentro de la app (campana con contador)
- Modo oscuro
- Panel del cliente: seguimiento, calificación, pago y reporte de citas
- Panel del trabajador: gestión de solicitudes, chat, perfil profesional y solicitud de verificación
- Panel de administrador: gestión de usuarios, verificación de trabajadores, reportes y estadísticas
- Accesibilidad: navegación por teclado, regiones vivas, diálogos con foco retenido y
  página propia con el estado de accesibilidad (`#/accesibilidad`)

## Accesibilidad

La app apunta a WCAG 2.1 AA. Lo que ya está cubierto: navegación completa por teclado
(el calendario y los horarios son botones reales con `aria-label` y `role="radio"`), enlace
"saltar al contenido", regiones vivas (`role="status"`/`aria-live`) para resultados y avisos,
diálogos que retienen el foco y lo devuelven al cerrarse, y etiquetas ocultas (`.sr-only`)
en los campos de búsqueda. Las limitaciones conocidas están publicadas en `#/accesibilidad`.

## Estructura del proyecto

```
├── index.html              → estructura de la página
├── css/
│   └── styles.css          → estilos
├── js/
│   ├── supabase-config.js  → URL y anon key del proyecto de Supabase
│   ├── logica.js            → funciones puras (fechas, disponibilidad, precios,
│   │                          calificaciones, completitud del perfil)
│   └── app.js               → lógica de la aplicación (DOM, Supabase, vistas)
├── tests/
│   ├── logica.test.mjs      → tests de las funciones puras
│   ├── app-dom.test.mjs     → la app corriendo en un DOM mínimo (ver abajo)
│   ├── dom-minimo.mjs       → DOM mínimo para ejecutar el render sin navegador
│   └── run-local.mjs        → runner alternativo cuando `node --test` no puede
│                              lanzar su proceso hijo
└── supabase/
    └── schema.sql          → tablas, políticas de seguridad (RLS) y funciones
```

## Tests

```bash
node --test tests/          # las dos suites (requiere poder lanzar procesos hijo)
node tests/run-local.mjs    # solo las funciones puras, sin proceso hijo
node tests/app-dom.test.mjs # la app completa en un DOM mínimo
```

`tests/app-dom.test.mjs` carga `index.html` en un DOM mínimo propio
(`tests/dom-minimo.mjs`), inyecta un doble de Supabase y ejecuta `js/app.js` como
lo haría el navegador. Sirve para verificar lo que un test unitario no ve: que la
app arranque sin excepciones y que el render produzca las clases, atributos y
textos que esperan el CSS y la accesibilidad. No reemplaza una pasada visual por
el sitio (no aplica CSS ni calcula layout), pero sí comprueba el comportamiento.

## Cómo probarlo localmente

1. Creá un proyecto gratuito en [supabase.com](https://supabase.com).
2. En el SQL Editor de tu proyecto, corré el contenido de `supabase/schema.sql`.
3. En **Authentication → Providers → Email**, desactivá "Confirm email" (para que
   el registro deje logueado al instante, como en el flujo pensado).
4. Completá `js/supabase-config.js` con la Project URL y la anon/publishable key
   de tu proyecto (Settings → API). Ambas son seguras de exponer en el frontend;
   la seguridad real la dan las políticas RLS de `schema.sql`.
5. Servilo con cualquier servidor estático, por ejemplo:

```bash
python3 -m http.server 8000
```

y entrá a `http://localhost:8000`. Registrate desde la app para crear tu primer
usuario. Para convertir una cuenta en administradora, corré en el SQL Editor:

```sql
update public.profiles set tipo = 'admin' where correo = 'tu-correo@ejemplo.com';
```

## Nota técnica

El backend es [Supabase](https://supabase.com) (Postgres + Auth + Row Level
Security): usuarios, citas, reseñas, mensajes de chat, reportes y
notificaciones se guardan en una base de datos real y compartida, con acceso
controlado por políticas de seguridad (cada quien solo puede leer/editar lo
que le corresponde). Las contraseñas las maneja Supabase Auth, nunca se
guardan en texto plano. El directorio de trabajadores se sirve desde la vista
`profiles_publicos` (solo campos no sensibles); el `correo` y el `celular` de
cada usuario nunca salen de su propia sesión ni del panel de administración
(ver `supabase/021_perfiles_publicos.sql`). El pago es real pero manual (transferencia por fuera
de la app + comprobante + confirmación del trabajador, sin pasarela de
pago); la verificación de identidad también es manual (el admin revisa el
documento subido, sin validación automática de terceros).

## Despliegue

El sitio es estático, así que se puede desplegar directamente en Netlify, GitHub
Pages o Vercel arrastrando la carpeta o conectando el repositorio. Recordá que
`js/supabase-config.js` viaja con el resto del código (sus valores son públicos
por diseño).
