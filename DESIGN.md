---
name: Hogandia
description: Plataforma para conectar clientes con trabajadores de confianza en Ibagué
colors:
  navy: "#1C2B39"
  navy-deep: "#131E28"
  paper: "#FAF3E9"
  card: "#FFFFFF"
  orange: "#BD5818"
  orange-deep: "#9C4812"
  green: "#3F7D58"
  red: "#B4432F"
  ink: "#14201B"
  ink-soft: "#5B6A66"
  line: "#E4DFD5"
typography:
  display:
    fontFamily: "IBM Plex Serif, serif"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontWeight: 400
    fontSize: "14px"
    lineHeight: 1.45
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontWeight: 600
    fontSize: "11px"
    letterSpacing: "0.05em"
rounded:
  sm: "9px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  pill: "999px"
  full: "50%"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.orange-deep}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.lg}"
    padding: "24px"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.navy}"
    rounded: "{rounded.pill}"
    padding: "6px 11px"
---

# Design System: Hogandia

## Overview

**Creative North Star: "El Recibo de Confianza"**

Hogandia se siente como un comprobante formal, no como una app de redes sociales. Su patrón más distintivo y más repetido —desde el perfil de un trabajador hasta el panel de estadísticas del admin o del propio trabajador— es la "ficha de datos": una etiqueta en mayúsculas IBM Plex Mono, un valor grande en IBM Plex Serif, y a veces una nota pequeña debajo. Calificación, trabajos hechos, zona, tarifa, total cobrado, citas completadas: todo lo que el usuario necesita poder *confiar* se presenta así, como líneas de un recibo verificable, no como una tarjeta decorativa.

Sobre esa base funcional se apoya una paleta cálida de "papel" (fondo crema `--paper`) y navy profesional (`--navy`) con un único acento naranja-terracota (`--orange`) que actúa casi exclusivamente como llamado a la acción. El sistema es local y de oficio —Ibagué, plomeros, electricistas— no una fintech genérica: cálido, con textura de papel, pero serio en sus datos.

El modo oscuro no es un tema distinto: invierte navy↔claro para fondo y texto, pero el naranja se mantiene idéntico en ambos modos, como constante de marca.

**Key Characteristics:**
- Fichas de datos tipo "recibo": label mono mayúscula + valor grande IBM Plex Serif, repetidas en perfil, panel admin y panel del trabajador.
- Un solo acento de color (naranja) usado con moderación, casi siempre en botones primarios y estados activos.
- Sombra única, suave y difusa en todas las superficies elevadas — nunca dura ni con grados de elevación distintos.
- Esquinas generosas (12–16px en tarjetas, 20px en formularios) pero controles compactos (9–10px en botones/inputs).
- Modo oscuro como inversión de la misma paleta, no una paleta nueva.

## Colors

Paleta cálida y de bajo contraste cromático: un solo acento saturado (naranja) sobre neutros cálidos de papel y navy frío.

### Primary
- **Naranja Terracota** (`#BD5818`): acción primaria — botones `.btn-primary`, chips activos, selección de día/hora en el calendario, acentos de marca ("cerca de ti" en el hero). Hover oscurece a **Naranja Profundo** (`#9C4812`).

### Secondary
- **Navy** (`#1C2B39`): texto de encabezados, marca, nav, fondo de botones ghost sobre foto. **Navy Profundo** (`#131E28`) es el fondo del footer y, en modo oscuro, el fondo de superficies hundidas (inputs del nav, tabs).

### Neutral
- **Papel** (`#FAF3E9`): fondo general de la página — el tono cálido que le da identidad "de papel" al sistema.
- **Tarjeta** (`#FFFFFF`): fondo de toda superficie elevada (cards, tablas, modales).
- **Tinta** (`#14201B`): texto de cuerpo.
- **Tinta Suave** (`#5B6A66`): texto secundario, metadatos, placeholders.
- **Línea** (`#E4DFD5`): bordes y divisores, siempre sutiles, nunca estructurales.

### Semantic
- **Verde Confianza** (`#3F7D58`): verificado, activo, pago confirmado, calificación alta.
- **Rojo Alerta** (`#B4432F`): rechazado, bloqueado, cancelado, error.

### Named Rules
**La Regla del Acento Único.** El naranja es el único color con intención de "haceme click"; nunca se usa dos colores de acento compitiendo en la misma vista.

**La Regla del Dato en Mono.** Cualquier número o estado que el usuario deba poder verificar —precio, calificación, estado de una cita, total cobrado— se tipea en IBM Plex Mono, nunca en el sans de cuerpo. Es la señal tipográfica de "esto es un dato real, no decoración".

## Typography

**Display Font:** IBM Plex Serif (con fallback serif)
**Body Font:** IBM Plex Sans (con fallback sans-serif)
**Label/Mono Font:** IBM Plex Mono (con fallback monospace)

**Character:** las tres son de la misma familia tipográfica (IBM Plex) — nadie más combina Serif + Sans + Mono de Plex así, lo que le da especificidad al sistema sin sumar una fuente nueva. IBM Plex Serif aporta carácter editorial y de documento formal en títulos y cifras grandes (encaja con el "Recibo de Confianza" mejor que una sans geométrica genérica); IBM Plex Sans es neutro y muy legible para párrafos; IBM Plex Mono funcional-administrativo para todo lo que deba leerse como un dato verificado.

### Hierarchy
- **Display** (700, `clamp(31px,4vw,45px)`, 1.1): titular del hero de home únicamente.
- **Headline** (700, 22–26px): nombre del trabajador en su perfil, títulos de página (`.page-head h2`).
- **Title** (700, 14–18px): títulos de tarjeta y sección (`.section-title h2`, `.card h3`).
- **Body** (400, 13–14.5px, line-height 1.45): texto de cuerpo, descripciones, reseñas.
- **Label** (600, 10–11px, uppercase, letter-spacing 0.05em): etiquetas de campo, encabezados de tabla, labels de ficha de datos.

### Named Rules
**La Regla de las Mayúsculas Pequeñas.** Toda etiqueta de campo o encabezado de dato va en IBM Plex Mono mayúscula de 10–11px con tracking abierto — nunca un label sans de tamaño normal.

## Layout

Contenedor centrado `.wrap` de 1120px máximo, con padding lateral que baja de 24px → 18px (≤840px) → 14px (≤560px). Grillas de tarjetas (trabajadores, servicios) van de 3–4 columnas en desktop a 2 en tablet (≤900px) a 1 columna o scroll horizontal con snap en mobile (≤560px) — la fila de categorías de servicio (`.svc-row`) es la única que usa scroll horizontal en vez de apilarse. Breakpoint de navegación en 840px: el menú pasa a hamburguesa con panel desplegable. Padding interno de tarjeta consistente en 16–24px; separación entre secciones de home de 52–56px.

## Elevation & Depth

Sistema de sombra única: una sola variable `--shadow` (`0 4px 10px -4px rgba(28,43,57,.10), 0 20px 40px -24px rgba(28,43,57,.22)`), difusa y ambiental, aplicada igual a cards, tablas, modales y el formulario de auth. No hay escala de elevación — una superficie está "levantada" o no lo está, sin grados intermedios. El valor no cambia entre modo claro y oscuro.

### Shadow Vocabulary
- **Elevada** (`var(--shadow)`): toda tarjeta, tabla, modal y formulario en reposo.
- **Sin sombra**: fondos de página, chips, pills, inputs (estos usan borde de 1.5px en vez de sombra).

### Named Rules
**La Regla de la Sombra Única.** No se inventan variantes de sombra por componente; `var(--shadow)` es la única elevación que existe en el sistema.

## Shapes

Escala de radios clara por función: controles interactivos compactos (9–10px: botones, inputs, navegación de calendario), tarjetas y contenedores generosos (12–16px), formularios aún más suaves (20px), y círculo completo para avatares sin foto y los puntos numerados de "Cómo funciona". Los bordes son casi siempre 1–1.5px sólidos en `--line`, nunca dobles ni con esquinas mixtas.

El CSS incluye además una clase `.ticket` (muescas circulares + línea de perforación punteada, pensada para un motivo de "orden de trabajo") que hoy **no se usa en ningún componente renderizado** — queda disponible como posible refuerzo futuro del Recibo de Confianza, no como patrón ya expresado.

## Components

### Buttons
- **Shape:** 9–10px de radio, sin borde en la variante primaria.
- **Primary:** fondo naranja (`#BD5818`), texto blanco, `10px 16px`; hover a `#9C4812`.
- **Outline:** fondo tarjeta, texto navy, borde 1.5px `--line`; hover oscurece el borde a navy.
- **Ghost:** transparente con borde blanco translúcido — solo sobre la foto del hero.
- **Danger:** fondo tarjeta, texto y borde rojo.
- Todos los botones hacen `scale(0.97)` al presionar (feedback táctil, no color).

### Chips / Pills
- **Chip de servicio/categoría:** fondo papel, texto navy, radio total (pill), activo = fondo naranja + texto blanco.
- **Status pill / rating pill / badge de verificación:** mismo lenguaje (fondo tintado suave del color semántico, texto del mismo color, IBM Plex Mono), solo cambia la paleta semántica (verde=verificado/activo, rojo=rechazado, navy=completado/neutro).

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** blanco (tarjeta) sobre fondo papel.
- **Shadow Strategy:** `var(--shadow)`, ver Elevation.
- **Border:** 1px `--line`.
- **Internal Padding:** 16–24px.

### Ficha de Datos ("Recibo")
Componente de firma del sistema: grilla de 2 a 4 columnas, cada celda con label mono mayúscula pequeño arriba y valor grande IBM Plex Serif abajo (opcionalmente una nota mono pequeña debajo del valor). Aparece como `.spec-sheet` en el perfil del trabajador (calificación, trabajos hechos, zona, tarifa) y como `.admin-stat` en los paneles de estadísticas (admin y trabajador). Fondo ligeramente distinto al resto de la tarjeta (`--steps-bg` en el perfil) para que se lea como una sección aparte, tipo recibo insertado.

### Inputs / Fields
- **Style:** fondo tarjeta, borde 1.5px `--line`, radio 11px.
- **Focus:** borde y outline naranja de 2px.
- **Label:** mono mayúscula pequeña arriba del campo, nunca flotante ni dentro del input.

### Navigation
- Texto navy-soft 13.5px, activo = fondo naranja al 14% + texto naranja profundo. En mobile (≤840px) colapsa a botón hamburguesa con panel en grilla de 2 columnas.

## Do's and Don'ts

### Do:
- **Do** usar IBM Plex Mono para cualquier precio, calificación, estado o dato que el usuario deba poder verificar (Regla del Dato en Mono).
- **Do** mantener el naranja como único acento de acción por vista (Regla del Acento Único).
- **Do** reutilizar `var(--shadow)` tal cual para cualquier superficie nueva que deba sentirse "elevada" — no inventar sombras nuevas.
- **Do** usar el patrón de Ficha de Datos (label mono + valor grande) para cualquier nuevo panel de métricas, en vez de una tarjeta de stat genérica.

### Don't:
- **Don't** introducir un segundo color de acento saturado compitiendo con el naranja.
- **Don't** usar Arial, system-ui o una fuente sans genérica donde el sistema ya define IBM Plex Serif / IBM Plex Sans.
- **Don't** apilar tarjetas dentro de tarjetas; el sistema usa una sola capa de elevación por superficie.
- **Don't** asumir que `.ticket` (muescas + perforación) ya está en uso solo porque existe en el CSS — hoy es una clase sin aplicar.
