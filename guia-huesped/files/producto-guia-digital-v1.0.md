# Guía Digital · Declaración de producto y backlog

**Versión:** 1.0.0
**Fecha:** 15 de septiembre de 2026
**Corpus de contenido:** `guia-huesped-v0.1.md`
**Tokens de marca:** ADR-004 v1.1

---

## 1 · Qué es

Una guía digital para huéspedes de alojamiento turístico. Reemplaza el mensaje de WhatsApp que se hunde en el scroll por una URL persistente que el huésped puede volver a abrir durante toda la estadía.

**Primer usuario:** apartaestudio 302, Living POP, Popayán.

**Restricción de origen:** el 302 es socio de diseño, no fuente de requisitos universales. Cualquier necesidad observada ahí se documenta como hipótesis, no como requisito de plataforma.

---

## 2 · Lo que el producto NO hace

Cerrado con causa. No se reabre sin derogar la decisión citada.

| Qué | Por qué |
|---|---|
| Credenciales en el bundle o en caché | Q-10. Un Service Worker persiste la credencial en el dispositivo después del checkout |
| Código de cerradura en la app | Q-10 + Q-26. La rotación por estadía vía WhatsApp ya es la implementación correcta |
| QR de WiFi en pantalla | Misma clase que lo anterior, en formato fotografiable |
| Dossier A4 imprimible con clave | §3.8 #6 del PRD v0.1 |
| Fotos de locales de terceros | Q-09. Texto sin imagen, salvo autorización escrita |

---

## 3 · Contrato de datos · ADR-005

**Estado:** Propuesto
**Decisión:** el contenido de la guía vive en un archivo de datos versionado, no dentro del HTML.

**Idioma del código.** Claves, identificadores, nombres de archivo y comentarios en inglés. Los valores de texto van en el idioma que les corresponde.

**Estructura mínima**

| Nivel | Campo | Nota |
|---|---|---|
| `property` | `id`, `name`, `geo`, `contact` | `contact` separa `display`, `tel` (con `+57`) y `whatsapp` (sin `+`) |
| `property` | `languages`, `defaultLanguage` | Declara `["es","en","fr","pt"]` desde ya |
| `sections[]` | `id`, `order`, `title` | |
| `blocks[]` | `id`, `type`, `subtitle`, cuerpo | Tipos: `prose`, `list`, `data` |
| `places[]` | `name`, `address`, `walkMinutes`, `category` | Sin imagen |

**Regla de idioma.** Todo texto de cara al huésped se indexa por idioma desde el primer día. El schema declara cuatro idiomas; la v1 se publica con `es` y `en`. `fr` y `pt` entran cuando el contenido en español esté completo — traducir secciones a medias significa traducir dos veces.

**Selección de idioma.** Detección por navegador como valor inicial, más un selector visible. La detección sola falla: un huésped francés con el teléfono en inglés recibiría inglés. La elección persiste mientras navega.

**Regla de renderizado.** Una sección sin bloques no se maqueta. Sin titular vacío, sin placeholder. La numeración visible es correlativa y salta los huecos.

**Fuera de alcance de este ADR:** PWA, offline, RAG, multi-propiedad, impresión.

**Consecuencia negativa:** el HTML deja de ser autocontenido. Un cambio de contenido pasa a tocar dos archivos hasta que exista un paso de build. Y con `fetch`, si el JS falla la página queda en blanco: obliga a un `<noscript>` y a manejo de error que muestren al menos el contacto y la hora de salida.

---

## 4 · Backlog

La crítica es correcta: solo una compuerta es falsable. Las demás son orden de prioridad y se nombran como tal.

### Orden · sin condición externa

| # | Ítem | Nota |
|---|---|---|
| 1 | ADR-005 y migración del contenido al contrato | Va primero. Todo lo demás lo hereda |
| 2 | Ajustes de jerarquía visual del HTML | Escala tipográfica, bandas de NIEBLA, filete TEJA, ritmo desigual |
| 3 | Decidir alojamiento y URL | Bloquea el paso 4 |
| 4 | Enlace al final del mensaje de bienvenida | Es el momento en que el producto existe |

### Compuerta falsable · WI-002-A

**Condición:** promedio de mensajes operativos por estadía, medido sobre al menos dos estadías, con las etiquetas `ya-estaba` / `falta`.

**Umbral, fijado antes de medir:**

| Resultado | Consecuencia |
|---|---|
| 0–2 | Los ítems de abajo se **eliminan**, no se aplazan |
| 3–6 | Entra solo contenido. Nada de PWA ni video |
| 7+ | Entran todos |

**Ítems bajo esta compuerta:** PWA y offline, loops de video de electrodomésticos, mapa interactivo.

**Advertencia de medición:** la muestra actual son estadías de 2 noches. El negocio vive de 28–30. Si la muestra queda solo con estadías cortas, el umbral no aplica — el resultado dice que se midió el segmento equivocado, no que el producto no sirve.

### Orden · requiere contenido del propietario

| Ítem | Estado |
|---|---|
| Sección 1: cocina, TV, calefacción, edificio | 2 de 6 ítems escritos |
| Sección 3: Popayán | 0 escrito. Requiere caminar con cronómetro |

Criterio de completitud: todos los ítems del índice tienen texto, o están declarados como no aplicables. Sin ítems a medias.

### Requiere evidencia previa · RAG

No es decisión de gusto. Antes de decidirlo se mide: **qué porcentaje de las preguntas de huésped ya las responde el contenido estático.** Si es alto, el RAG resuelve lo que resuelve la sección 1.

Esa medición sale del mismo registro `ya-estaba` / `falta` de WI-002-A, sin trabajo extra.

Riesgo de dominio que persiste aunque la evidencia favorezca: un asistente que responde sobre reglas de la casa puede equivocarse en una regla.

### Requiere segunda propiedad

Multi-propiedad, i18n activo, plantillas de instanciación. Hoy no hay caso de uso. El contrato de datos los deja posibles sin construirlos.

---

## 5 · Costo de este documento

El backlog compuertado cuesta lo mismo que uno plano en trabajo de definición. La compuerta no reduce el costo de especificar: reduce el costo de **construir lo que no hacía falta**. Se dice explícito para que nadie lo descubra a mitad de camino.

---

## 6 · Dónde vive esto

Este documento y `guia-huesped-v0.1.md` son el corpus del producto. Se archivan bajo la metodología cuando exista ruta legítima; hasta entonces viven juntos, versionados, en una sola ubicación.

Dos archivos, no tres. Un tercer sitio donde viva la verdad es el defecto que este proyecto ya arrastró con cuatro corpus de marca.
