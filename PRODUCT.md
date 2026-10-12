# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos audiencias con roles distintos en la misma app:

- **Clientes** en Ibagué (Tolima, Colombia) que necesitan un servicio técnico o doméstico (plomería, electricidad, limpieza, jardinería, pintura, cerrajería) y hoy lo consiguen por recomendación boca a boca, grupos de WhatsApp o Facebook Marketplace.
- **Trabajadores independientes** de esos mismos oficios, que ofrecen sus servicios, gestionan solicitudes, cobran y construyen reputación (calificaciones, insignias de verificación).

Un tercer rol, **administrador**, modera usuarios, verificaciones y reportes, pero no es un usuario del "producto" en el sentido de audiencia a diseñar para persuadir — su panel es una herramienta de operación interna.

## Product Purpose

Conectar clientes con trabajadores independientes de confianza en Ibagué, cubriendo todo el ciclo: buscar, comparar, agendar, chatear, pagar y calificar, sin salir de la app. Éxito = una cita agendada, cumplida y pagada con ambas partes conformes (reflejado en calificación y repetición).

## Positioning

Frente a la alternativa real (WhatsApp, boca a boca, Facebook Marketplace), Hogandia compite en dos frentes a la vez, sin que ninguno domine sobre el otro:

- **Confianza verificable**: insignias de identidad verificada y antecedentes judiciales verificados (ambas opcionales e independientes, revisadas a mano por un admin) — algo que ninguna de esas alternativas informales ofrece.
- **Todo en un solo lugar**: buscar por categoría/precio/calificación, comparar perfiles, ver disponibilidad real, agendar, chatear por cita, pagar (transferencia manual o Mercado Pago) y calificar, en vez de mensajes sueltos y acuerdos informales.

## Operating Context

- Mercado local: Ibagué, Tolima, Colombia — zonas/comunas específicas de la ciudad (ej. Centro, Comuna 8 - Ciudadela), no una app nacional.
- Flujo típico: cliente busca o pide cotización → agenda cita con un trabajador según su disponibilidad semanal → chat por cita → el trabajador marca "voy en camino" → servicio → cliente paga (transferencia con comprobante, o Mercado Pago Checkout Pro) → ambas partes se califican.
- El trabajador gestiona su propio panel: solicitudes entrantes, pedidos de cotización, mensajes, estadísticas (ingresos, calificación, cancelaciones, clientes recurrentes) y su perfil profesional (servicios, tarifa, disponibilidad semanal, galería de trabajos anteriores).
- El pago es real pero no custodiado por la plataforma (transferencia directa confirmada por el trabajador, o Mercado Pago con el trabajador como vendedor) — Hogandia no retiene fondos ni media disputas de dinero más allá de un reporte.
- La verificación es manual: el admin revisa documentos subidos (identidad, antecedentes) sin validación automática de terceros.

## Capabilities and Constraints

- Sitio estático (HTML/CSS/JS sin framework) + Supabase (Postgres, Auth, Storage, Edge Functions, RLS) como único backend. Sin servidor propio.
- Las claves de Supabase en `js/supabase-config.js` son públicas por diseño; la seguridad real vive en las políticas RLS.
- Pagos: transferencia manual (con comprobante) y Mercado Pago Checkout Pro (opcional, por trabajador). Sin custodia de fondos por la plataforma.
- Mapas: OpenStreetMap/Leaflet, sin API key de pago.
- Accesibilidad: apunta a WCAG 2.1 AA (navegación por teclado, regiones vivas, foco retenido en diálogos, página propia de estado de accesibilidad en `#/accesibilidad`).
- Modo oscuro ya implementado (toggle manual, no solo `prefers-color-scheme`).
- Sin app nativa — todo el uso es vía navegador (desktop y mobile web).

## Brand Commitments

Nombre **Hogandia** y el logo existente se mantienen. La identidad visual actual (paleta navy/naranja, tipografía Space Grotesk para títulos + IBM Plex Sans para texto + IBM Plex Mono para datos/etiquetas) está **abierta a repensarse** en trabajo de diseño futuro — no es una marca cerrada que haya que preservar tal cual.

## Evidence on Hand

- Perfiles de trabajadores reales con fotos, galería de trabajos y reseñas ya en la base de datos de producción (ej. "Andrés Pineda", categoría Limpieza).
- Capturas de pantalla de las pantallas principales (home, buscar, perfil, panel del trabajador, login) relevadas en esta sesión, en claro y oscuro, desktop y mobile.
- README.md del repo documenta funcionalidades, estructura del proyecto y cómo correrlo localmente.
- No hay testimonios, casos de estudio, prensa ni benchmarks de uso real más allá de las reseñas de usuarios dentro de la propia app — no inventar cifras de crecimiento, cobertura geográfica más allá de Ibagué, ni casos de éxito.

## Product Principles

1. **La confianza se demuestra, no se declara**: las insignias de verificación (identidad, antecedentes) y las calificaciones reales pesan más que cualquier copy persuasivo sobre "seguridad".
2. **Todo el ciclo en un lugar**: cada función (buscar, agendar, chatear, pagar, calificar) debe sentirse parte de un mismo flujo continuo, no módulos sueltos.
3. **Dos audiencias, dos modos**: el cliente explora y decide (persuadir/comparar); el trabajador opera su negocio día a día (eficiencia, claridad, menos fricción) — el diseño de cada panel debe responder al modo correcto.
4. **Local y concreto, no genérico**: Ibagué, sus zonas/comunas y precios en pesos colombianos (COP) son parte real del producto, no placeholders.
5. **El pago es real pero no custodiado**: el diseño nunca debe sugerir una garantía de la plataforma sobre el dinero que no existe.

## Accessibility & Inclusion

Objetivo WCAG 2.1 AA, ya parcialmente implementado: navegación completa por teclado (calendario y horarios como botones reales con `aria-label`/`role="radio"`), enlace "saltar al contenido", regiones vivas (`aria-live`) para resultados y avisos, diálogos con foco retenido, `prefers-reduced-motion` respetado, tamaño de fuente 16px en inputs para evitar zoom automático en mobile. Limitaciones conocidas publicadas en `#/accesibilidad` dentro de la propia app.
