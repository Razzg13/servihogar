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
├── index.html      → estructura de la página
├── css/
│   └── styles.css  → estilos
└── js/
    └── app.js       → lógica de la aplicación
```

## Cómo probarlo localmente

No requiere instalación ni servidor. Basta con abrir `index.html` en el navegador,
o servirlo con cualquier servidor estático, por ejemplo:

```bash
python3 -m http.server 8000
```

y luego entrar a `http://localhost:8000`.

## Usuarios de prueba

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Cliente | camila@correo.com | 1234 |
| Trabajador | jorge@correo.com | 1234 |
| Administrador | admin@servihogar.com | admin |

## Nota técnica

Los datos (usuarios, citas, calificaciones, mensajes, notificaciones) se guardan
en el `localStorage` del navegador de cada visitante. No hay backend ni base de
datos compartida: es un prototipo funcional para fines académicos y de
demostración. El pago y la verificación de identidad son simulados (no hay
pasarela de pago real ni validación de documentos).

## Despliegue

El sitio es estático, así que se puede desplegar directamente en Netlify, GitHub
Pages o Vercel arrastrando la carpeta o conectando el repositorio.
