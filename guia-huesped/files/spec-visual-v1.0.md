# Spec visual · Guía del huésped

**Versión:** 1.0.0
**Estado:** Congelado — validado sobre maqueta v0.1
**Depende de:** ADR-005 (contrato de datos) · ADR-004 v1.1 (tokens de marca)
**Corpus de contenido:** `guia-huesped-v0.1.md`

Este documento congela las decisiones visuales validadas en maqueta. Claude Code sigue estas reglas al renderizar el contrato de datos.

---

## 1 · Desviaciones aprobadas

**Sin Tailwind ni CDN.** Prohibido cualquier script o hoja externa. Todo el estilo va en CSS nativo dentro del HTML final. Es lo que sostiene Lighthouse ≥ 95 y cero peticiones de red.

**Sin firma al pie** (16 de septiembre de 2026, deroga la versión anterior de esta línea). `logo_B_wordmark.svg` se retira: contiene `B5714F` y `EB Garamond`, y el primero está en la lista de prohibidos del criterio 1 de §7 — la spec se exigía a sí misma un asset que su propia verificación rechazaba. La página va sin firma hasta que haya un wordmark hecho con el sistema vigente. El descarte de `LP-arcoL-*.svg` que fijaba ADR-004 v1.1 sigue vigente. Registro completo en `guia-huesped-v0.1.md`.

**Numeración dinámica.** Las secciones se numeran en palabras y de forma correlativa en el frontend: UNO, DOS, TRES. Si una sección no tiene bloques en el contrato de datos, no se renderiza y la siguiente hereda el número inmediato. El huésped nunca ve un salto numérico. La numeración del corpus (secciones 1–4) es interna y no se expone.

---

## 2 · Tipografía y ritmo

| Elemento | Familia | Tamaño | Nota |
|---|---|---|---|
| Titular de página | Serif | 40 px móvil · 56 px ≥768 | |
| Titular de sección | Serif | 32 px móvil · 40 px ≥768 | |
| Subtítulo de bloque | Serif | 24 px | |
| Cuerpo | Sans | 16 px, `line-height` 1.5 | 24 px exactos, múltiplo de 8 |
| Micro-texto | Mono | 12 px, mayúsculas, `letter-spacing` 0.18em | |
| Hora de check-out | Mono | 32 px | TEJA |
| Teléfono | Mono | 24 px | TINTA. Área táctil ≥48 px, enlace `tel:`. Ver anexo UX 3.1 |

**Filete bajo titular.** TEJA, grosor **máximo 2 px**, longitud corta. Es un acento, no un bloque. Corregido desde la maqueta, que usaba 6 px y pesaba demasiado.

**Ritmo desigual.** Mucho aire antes de un subtítulo, poco después. Referencia: 56 px arriba, 8 px abajo. El espacio uniforme es lo que hace que una página sin decoración se lea plana.

**Medida de línea.** Máximo 60 caracteres. Ancho de columna 720 px; el margen de 90 px en desktop es mínimo, no el único limitante.

---

## 3 · Color y contraste

| Uso | Token | Ratio |
|---|---|---|
| Texto sobre fondo | TINTA `#16130F` / CAL `#F2EEE6` | 16,00:1 |
| Texto sobre banda | TINTA / NIEBLA `#E2DCD1` | 13,57:1 |
| Hora de check-out | TEJA `#A94D28` / CAL | 4,80:1 |

**TEJA solo sobre CAL, y solo en la hora de check-out.** Sobre NIEBLA da 4,07:1 y no pasa AA en texto pequeño. Y aunque 4,80:1 pasa AA, queda bajo el umbral de 5:1 recomendado para lectura en exteriores — por eso el teléfono salió de TEJA. Detalle en el anexo UX 3.1.

**Micro-textos en TINTA puro.** Sin grises. Nada de PIEDRA ni opacidades reducidas en texto: cualquier atenuación tiene que seguir midiendo ≥ 4,5:1 sobre CAL **y** sobre NIEBLA, y en la práctica eso deja fuera cualquier gris del sistema. Si hace falta jerarquía, se resuelve con tamaño y tracking, no con color.

**Sin grises fuera del ADR.** Incluye los divisores.

---

## 4 · Reglas de composición

**Lista de salida sin divisores.** Prohibidos los filetes horizontales o líneas entre ítems del checklist. La separación es solo aire. Corregido desde la maqueta, que usaba bordes a 12 % de opacidad — un gris fuera del ADR.

**Bandas.** Las secciones alternan CAL y NIEBLA. Corte seco a todo el ancho, sin transición ni degradado.

**Área libre.** Mínimo 35 % del scroll a 390 px de ancho.

**Prohibiciones permanentes.** Sin degradados, sin sombras, sin bordes redondeados tipo píldora, sin animación.

---

## 5 · Estructura

Scroll vertical continuo, una sola página. Sin pestañas, sin router, sin PWA, sin Service Worker.

Móvil primero, 390 px de referencia. Margen perimetral 24 px hasta 767, 90 px desde 768.

Retícula base 8 px en todo el espaciado de bloque.

---

## 6 · Seguridad

Cero credenciales en el bundle: ni clave de WiFi, ni código de cerradura, ni QR. Van por WhatsApp, por reserva, y rotan. Cerrado en Q-10 y Q-26.

---

## 7 · Verificación

| # | Criterio |
|---|---|
| 1 | `grep` de prohibidos sin resultados: `1B1A18`, `EFE6D4`, `B5714F`, `Jost`, `Cinzel`, `DejaVu`, `LP-S_arco`, `Casa Patio` |
| 2 | Sin dependencias externas: cero `<script src>`, cero `@font-face` remoto, cero `<link>` a otro dominio |
| 3 | Lighthouse Performance ≥ 95 |
| 4 | Contraste AA 4,5:1 en todo el texto |
| 5 | Cero scroll horizontal a 390 px |
| 6 | Espaciado de bloque múltiplo de 8 px |
| 7 | Cero credenciales |
| 8 | Sin secciones vacías renderizadas, sin saltos en la numeración visible |
| 9 | El único elemento accionable (teléfono) tiene área táctil ≥48×48 px y contraste ≥5:1 |

**Artefactos de verificación: no se borran.** `lh-report.json`, `lh-390.json` y `screenshot-390.png` quedan en disco. Un veredicto sin evidencia no es una verificación.

---

## 8 · Entrada para Claude Code

Lee el contrato de datos de ADR-005 e inyecta el contenido en la estructura descrita acá. Build limpio, sin dependencias de terceros.

Las restricciones de `guia-huesped-v0.1.md`, sección «Orden de trabajo», siguen vigentes y no se derogan.
