# ServiHogar

Plataforma web para conectar clientes con trabajadores independientes de servicios técnicos y domésticos (plomería, electricidad, limpieza, jardinería, pintura, cerrajería) en Ibagué.

Proyecto académico — Metodología de Diseño de Software, Universidad del Tolima.

## Funcionalidades

- Registro e inicio de sesión (cliente / trabajador)
- Búsqueda y filtro de trabajadores por categoría, texto, precio o calificación
- Mapa de la zona de cada trabajador y mapa de conjunto en Buscar (OpenStreetMap, sin API key)
- Perfil de trabajador con calificaciones, reseñas y distintivo de verificado
- Favoritos: los clientes pueden guardar trabajadores
- Agendamiento de citas (calendario y horarios)
- Chat simple por cita entre cliente y trabajador
- Pago simulado por cita (sin dinero real)
- Comprobante de la cita descargable/imprimible
- Reportar un problema desde una cita
- Notificaciones dentro de la app (campana con contador)
- Modo oscuro
- Panel del cliente: seguimiento, calificación, pago y reporte de citas
- Panel del trabajador: gestión de solicitudes, chat, perfil profesional y solicitud de verificación
- Panel de administrador: gestión de usuarios, verificación de trabajadores, reportes y estadísticas

## Estructura del proyecto

```
├── index.html              → estructura de la página
├── css/
│   └── styles.css          → estilos
├── js/
│   ├── supabase-config.js  → URL y anon key del proyecto de Supabase
│   └── app.js               → lógica de la aplicación
└── supabase/
    └── schema.sql          → tablas, políticas de seguridad (RLS) y funciones
```

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
guardan en texto plano. El pago y la verificación de identidad siguen siendo
simulados (no hay pasarela de pago real ni validación de documentos).

## Despliegue

El sitio es estático, así que se puede desplegar directamente en Netlify, GitHub
Pages o Vercel arrastrando la carpeta o conectando el repositorio. Recordá que
`js/supabase-config.js` viaja con el resto del código (sus valores son públicos
por diseño).
