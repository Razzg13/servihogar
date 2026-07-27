# ServiHogar

Plataforma web para conectar clientes con trabajadores independientes de servicios técnicos y domésticos (plomería, electricidad, limpieza, jardinería, pintura, cerrajería) en Ibagué.

Proyecto académico — Metodología de Diseño de Software, Universidad del Tolima.

## Funcionalidades

- Registro e inicio de sesión (cliente / trabajador)
- Búsqueda y filtro de trabajadores por categoría
- Perfil de trabajador con calificaciones y reseñas
- Agendamiento de citas (calendario y horarios)
- Panel del cliente: seguimiento y calificación de citas
- Panel del trabajador: gestión de solicitudes y perfil profesional
- Panel de administrador: gestión de usuarios y reportes

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

Los datos (usuarios, citas, calificaciones) se guardan en el `localStorage` del
navegador de cada visitante. No hay backend ni base de datos compartida: es un
prototipo funcional para fines académicos y de demostración.

## Despliegue

El sitio es estático, así que se puede desplegar directamente en Netlify, GitHub
Pages o Vercel arrastrando la carpeta o conectando el repositorio.
