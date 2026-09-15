# Anexo UX · Investigación, adopción y decisiones

**Versión:** 1.0.0
**Anexo de:** `spec-visual-v1.0.md`
**Método:** hallazgos de industria filtrados contra las reglas duras del proyecto. Lo que no pasa el filtro queda registrado con su motivo.

---

## 1 · Investigar

**Zona del pulgar.** La investigación de Steven Hoober (2013) sigue siendo la base: alrededor del 75 % de la gente sostiene el teléfono con una mano y opera con el pulgar. La pantalla se divide en tres zonas — alcance cómodo abajo al centro, estiramiento a los lados, y esquinas superiores prácticamente inalcanzables sin cambiar el agarre. Los elementos accionables deberían medir al menos 48 px por lado, con separación entre ellos para evitar toques accidentales.

**Legibilidad bajo el sol.** El mínimo WCAG de 4,5:1 se queda corto en exteriores. La recomendación práctica para elementos críticos en uso móvil al aire libre es **5:1 o superior**, apuntando a 7:1 cuando el elemento decide una acción. Texto oscuro sobre fondo claro se lee mejor bajo sol directo que lo contrario, porque el brillo de la pantalla compite con el ambiente.

**Divulgación progresiva.** El patrón dominante en guías digitales es el acordeón: colapsar secciones para reducir el scroll.

---

## 2 · Adoptar — lo que pasó el filtro y lo que no

| Hallazgo | Veredicto | Motivo |
|---|---|---|
| Contraste ≥5:1 en elementos críticos | **Adoptado con corrección** | Ver 3.1 — obliga a cambiar el uso de TEJA |
| Objetivo táctil ≥48 px | **Adoptado** | Aplica al único elemento accionable de la página |
| Acción principal en zona baja | **Adoptado por construcción** | Ver 3.2 |
| Separación entre objetivos táctiles | **No aplica** | Hay un solo elemento accionable |
| Navegación inferior fija | **Descartado** | No hay navegación. Un scroll continuo no tiene a dónde navegar |
| Acordeones / divulgación progresiva | **Descartado** | Requiere JS y esconde contenido. La página completa cabe en pocos scrolls; colapsar agregaría toques para leer menos |
| Modo oscuro para exteriores | **Descartado** | Contradice CAL como fondo normativo. Además, texto oscuro sobre claro es mejor bajo sol directo, que es justo lo que ya hacemos |
| Botones flotantes | **Descartado** | Sombra y forma de píldora, prohibidas por ADR-004 |
| Gestos de swipe | **Descartado** | Requiere JS y no hay nada que deslizar |

**Hallazgo del filtro:** casi toda la investigación de ergonomía móvil asume una app con navegación. Esta guía es un documento de lectura con muy pocos elementos accionables. Eso no es una carencia: es lo que la hace rápida. La mayoría de los patrones se descartan por no tener dónde aplicarse, no por incompatibles.

**Revisión v1.1 — cuatro elementos accionables, no uno.** La v1.0 de este anexo afirmaba que había un solo elemento tocable. Con la decisión de WhatsApp y multiidioma ya son cuatro: WhatsApp, llamar, selector de idioma y, más adelante, los enlaces de lugares de Popayán. Los descartes de la tabla se sostienen —sigue sin haber navegación ni nada que colapsar— pero los criterios de área táctil y separación entre objetivos ahora sí aplican. Ver 3.5.

---

## 3 · Demostrar — decisiones adoptadas

### 3.1 · El teléfono no puede quedarse en TEJA

**Evidencia.** TEJA `#A94D28` sobre CAL da 4,80:1. Pasa AA, pero queda por debajo del umbral de 5:1 recomendado para uso móvil en exteriores.

**Por qué importa acá y no en otro lado.** El teléfono es el único dato de la guía que alguien va a leer bajo presión: de pie, con maleta, quizá afuera, quizá con sol. Es exactamente el caso que el umbral de exteriores describe. La hora de check-out, en cambio, se lee sentado y adentro.

**Corrección.** El número de teléfono va en **TINTA** (16,00:1), no en TEJA. El tamaño de 24 px en mono y el espacio alrededor le dan la jerarquía que le daba el color.

TEJA se conserva en la hora de check-out —lectura tranquila, en interior— y en el filete decorativo, que no es texto.

Consecuencia: TEJA queda como acento casi exclusivamente no textual. Es menos color en la página, y eso es coherente con el sistema.

### 3.2 · El teléfono, al final y con área táctil real

**Posición.** Va al cierre de la última sección, que es donde el pulgar llega sin cambiar el agarre. No por casualidad: es el único elemento accionable y le corresponde la única zona cómoda.

**Área táctil.** Mínimo 48×48 px de superficie tocable, construida con `padding` en el enlace, no con tamaño de fuente. El texto puede verse de 24 px y el objetivo medir 48.

**Enlace real.** `tel:` para que un toque marque. Un número que hay que copiar a mano es un número que no se usa cuando hace falta.

### 3.3 · La medida de línea es una decisión de exteriores

El máximo de 60 caracteres ya estaba en el spec por razones tipográficas. Bajo sol hay una razón adicional: con reflejo en la pantalla, el ojo pierde el renglón más fácil, y una línea corta hace el retorno más seguro.

No cambia nada; lo registro para que nadie la ensanche pensando que es solo estética.

### 3.5 · Contacto dual y selector de idioma

**Un destinatario, dos canales.** WhatsApp primero, llamar debajo y más discreto. El huésped elige canal, no persona. Ambos apuntan al mismo número oficial — dos números en pantalla no dan más acceso, dan menos certeza.

Ambos son `href`, no scripts: `https://wa.me/...` y `tel:...`. No violan la restricción de dependencias.

**Separación entre objetivos.** Ahora que hay dos controles contiguos, la separación deja de ser teórica: mínimo 8 px de espacio muerto entre áreas táctiles, para que nadie llame queriendo escribir.

**Selector de idioma.** Va arriba, en la zona incómoda del pulgar, y eso es deliberado: es un control de uso único que se busca al abrir, no uno frecuente. La zona cómoda se reserva para los controles de contacto, que es donde alguien actúa bajo presión.

Área táctil ≥48 px como los demás. Sin bandera como único indicador — una bandera no es un idioma. Códigos de dos letras o el nombre del idioma.

### 3.6 · Nada que colapsar

La guía se queda expandida, completa, en scroll continuo. Sin acordeones ni "leer más".

La razón no es solo evitar JS: **un acordeón cambia el costo de leer por el costo de encontrar.** Con cuatro bloques de contenido, encontrar no es el problema. Si la guía crece a quince bloques, esta decisión se revisa — y ahí el criterio será la longitud real, no el patrón de la industria.

---

## 4 · Cambios al spec visual

| Elemento | Antes | Ahora |
|---|---|---|
| Teléfono | TEJA, 24 px mono | **TINTA**, 24 px mono, área táctil ≥48 px, enlace `tel:` |
| Hora de check-out | TEJA, 32 px mono | Sin cambio |
| Filete | TEJA, 2 px | Sin cambio |

Criterio de verificación adicional para la Definición de terminado:

> El único elemento accionable de la página tiene área táctil ≥48×48 px y contraste ≥5:1.

---

## 5 · Lo que esta investigación no midió

Ninguno de estos hallazgos viene de huéspedes de esta propiedad. Son promedios de industria aplicados a una página que todavía no ha visto un usuario real.

La medición que importa sigue siendo WI-002-A: qué preguntan los huéspedes, y si la guía deja de recibir esas preguntas. Este anexo mejora la probabilidad de que la página funcione; no demuestra que funcione.
