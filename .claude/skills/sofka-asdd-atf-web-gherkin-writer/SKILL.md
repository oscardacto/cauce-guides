---
name: sofka-asdd-atf-web-gherkin-writer
description: Genera escenarios BDD y charters de exploración por risk level, con tags ATF. Devuelve contenido, no escribe archivos.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

> **Notas de evolución (resumen)** — el protocolo activo integra:
> - **PASO 1.bis** — Inferencia de estados/roles implícitos del actor.
> - **PASO 3.bis** — Validaciones por dimensión de entrada detectada (catálogo de 10 dimensiones: auth, form, monetary, date, file, search, pagination, identifier, dropdown, numeric-range).
> - **PASO 5.bis** — CPs cross-cutting automáticos por dimensión funcional (OTP, auth, datos personales, servicios externos, sesiones, compliance).
> - **PASO 6.bis** — Atributos de calidad transversal (4 sub-bloques: ux-consistency, network-efficiency, data-robustness, client-observability).
> - **Cobertura exigida por CA** — mínimo 1 happy + 1 unhappy por Criterio de Aceptación del flow.
> - **Guardarraíles anti-alucinación** — prohibición de CPs genéricos, mensajes exactos literales, aserciones negativas explícitas, datos realistas contextualizados.
> - **Taxonomía de tags ampliada** — dimensiones `@otp`, `@audit`, `@compliance`, `@habeas-data`, `@anti-enumeracion`, `@rate-limiting`, `@brute-force`, `@data-protection`, `@regla-negocio-implicita`, `@input-dimension-validation`, `@ux-consistency`, `@network-efficiency`, `@data-robustness`, `@client-observability`.
> - **Compliance normativo extensible** — catálogo regional detectable, no hardcoded.
> - **Resumen estadístico + cobertura CA→CPs + supuestos** como comentarios estructurados en el header del `.feature`.
> - **Checklist de entrega** ejecutado por el skill antes de emitir el output.

---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `flow` | object | Flow del flow_map.json |
| `risk_level` | string | `critical` · `high` · `medium` · `low` |
| `data_sets` | object | Sets de test_data.json indexados por `scenario_type` |
| `assumptions` | array | Supuestos de testability_assumptions.md (si existen) |
| `scenario_types_requested` | array | `["functional","a11y","performance","responsive","exploratory"]` |
| `cross_cutting_mode` | string | `literal` (default) · `expanded` · `shift_left`. Resuelto desde `appweb.yaml → enrichment.cross_cutting_mode`. Controla la agresividad de la generación cross-cutting en PASO 3.bis / 5.bis / 6.bis. Sin override → `literal`. |
| `documented_limits` | object | Mapa `{ "{campo}": { "min": N, "max": N, "source": "CA-X / nota / mockup" } }` con los límites numéricos/longitud DOCUMENTADOS en HU. Las dimensiones de PASO 3.bis y 4 que no aparezcan aquí NO disparan BVA — solo charter exploratorio. |

---

## PASO 1 — Sistema de Tags

**Obligatorios:** `@flow_{flow_id} @{risk_level} @{scenario_type} @executor_{executor_id}`

**Opcionales comunes:** `@smoke` (happy path críticos), `@regression` (critical+high), `@auth` (requiere auth), `@supuesto-{id}`, `@requiere-validacion`, `@data-{data_id}`, `@req-{req_id}`, `@risk-elevated @reason-{motivo}`.

**Catálogo de dimensiones funcionales** (cuando aplique al escenario):

| Tag | Aplica cuando |
|-----|---------------|
| `@validation` | Validaciones de campos, formato, longitud |
| `@security` | Controles de seguridad (brute force, tokens, injection) |
| `@otp` | Flujos de código OTP |
| `@integration` | Llamadas a servicios externos |
| `@ux` | Experiencia de usuario (redirecciones, estados visuales) |
| `@audit` | Registro de eventos de auditoría |
| `@compliance` | Cumplimiento regulatorio (regional — ver PASO 3) |
| `@session` | Manejo de sesiones |
| `@concurrency` | Control de sesiones simultáneas |
| `@data-protection` | Protección de datos personales |
| `@rate-limiting` | Protección contra abuso de endpoints |
| `@brute-force` | Protección contra fuerza bruta |
| `@anti-enumeracion` | Anti-enumeración (mensajes genéricos, timing indistinguible) |
| `@boundary` | Valores frontera (Scenario Outlines) |
| `@habeas-data` / `@sarlaft` / `@lfpdppp` | Compliance regional específico |

**Tags provenientes de los pasos especializados:**

| Tag | Generado por |
|-----|--------------|
| `@regla-negocio-implicita` + `@requiere-validacion` | PASO 1.bis (estados implícitos) |
| `@supuesto-obligatorio` + `@requiere-validacion` + `@cp-derivado` | PASO 1.ter (patrón "algunos campos (X)") |
| `@input-dimension-validation` + dimensión específica | PASO 3.bis (validaciones por dimensión de entrada) |
| `@supuesto-longitud` + `@requiere-validacion` + `@charter-only` | PASO 3.bis / PASO 4 cuando la dimensión NO tiene `documented_limits` |
| `@ux-consistency` / `@network-efficiency` / `@data-robustness` / `@client-observability` | PASO 6.bis (atributos de calidad transversal) |
| `@cp-derivado` | Cualquier CP cuyo origen NO sea un CA literal (cross-cutting, transversal, AI_EDGE, charter-promovido). Marca de auditoría para que el QA pueda filtrar rápido los "no literales". |

**Semántica de tags de control de calidad** (rendereados con estilos diferenciados en el reporte):

| Tag | Significado | Acción del lector |
|-----|-------------|-------------------|
| `@requiere-validacion` | El CP descansa en un supuesto no confirmado por el PO | Revisar antes de ejecutar; PQ pendiente |
| `@supuesto-longitud` | Límites de longitud inferidos por el skill, NO documentados en HU | Confirmar límites con producto |
| `@supuesto-obligatorio` | Campo asumido como obligatorio por contexto, sin marca explícita en HU | Confirmar obligatoriedad con producto |
| `@cp-derivado` | CP NO trazable a CA literal — proviene de cross-cutting, transversal, AI_EDGE o charter | Filtrar/priorizar según política del run |
| `@charter-only` | NO se ejecuta como CP automático; pertenece a `charter_{flow_id}.md` | No envíar al executor |

**⛔ NUNCA credenciales literales en Gherkin.** Siempre referencias: `"{data.credentials.CRED-001.role}"`.

---

## PASO 1.bis — Inferencia de estados/roles implícitos del actor

**Propósito:** capturar variantes de rol/estado que un QA Senior detectaría por oficio pero
que el flow no documenta explícitamente.

**Protocolo de 5 pasos** (siempre se ejecuta):

| # | Paso | Salida |
|---|------|--------|
| 1 | Extraer `rol_principal` del flow | string |
| 2 | Inferir estados alternos plausibles del rol (retirado, bloqueado, suspendido, dado de baja, en_proceso, etc.) | lista |
| 3 | Detectar actores adyacentes que podrían intentar el mismo flow (cliente vs empleado vs tercero, etc.) | lista |
| 4 | Por cada estado/actor con impacto plausible → generar 1 escenario con tag `@regla-negocio-implicita @requiere-validacion` | escenarios |
| 5 | Tabular cada variante en el bloque de supuestos del header | comentario |

Si tras el protocolo no hay variantes plausibles, registrar como comentario:
`# Estados implícitos: no se detectaron variantes relevantes para el flow {flow_id}`.

---

## PASO 1.ter — Detección de patrón "algunos campos (X)" (anti-omisión por literalidad)

**Propósito:** la HU a veces redacta CAs ambiguos del estilo *"comprueba obligatoriedad de algunos campos (Organization Name)"*, *"valida varios campos como Name"*, *"campos obligatorios (Email)"*. Tomados literalmente, generan UN solo CP para el campo enumerado y dejan el resto del formulario sin cobertura. Tomados con expansión silenciosa, inventan obligatoriedad sin huella. Este paso resuelve la tensión con un protocolo determinista.

**Disparadores (regex sobre cada CA):**

| Patrón | Ejemplos |
|---|---|
| `\balgunos\s+campos\b` | "algunos campos (Name)" |
| `\bvarios\s+campos\b` | "varios campos como Email" |
| `\bcampos\s+obligatorios\b\s*\(` | "campos obligatorios (Org Name)" |
| `\bentre\s+(?:los\s+)?cuales\b` | "entre los cuales Name" |

**Protocolo (cuando un CA dispara):**

1. **CP literal**: emitir 1 CP para el/los campo(s) explícitamente nombrados (sin tag de supuesto).
2. **Inspeccionar contexto enumerable**: buscar lista de campos en, por orden:
   - `flow.fields[]` o `flow.form.fields[]` si existe.
   - `precheck.knowledge_excerpts.app_behavior` (sección "campos obligatorios" / mockup descrito).
   - Comentarios del CP (mockup ASCII / lista de campos en `# Diseño:`).
3. **CPs derivados** (si la inspección encontró ≥1 campo no enumerado en el CA):
   - Emitir 1 CP por campo adicional, con tags `@supuesto-obligatorio @requiere-validacion @cp-derivado`.
   - Comentario previo: `# Supuesto SUP-AOX-{N}: HU dice "algunos campos ({campo_literal})" — campo "{otro_campo}" se asume obligatorio por contexto del formulario.`
4. **Sin enumeración disponible**: NO inventar lista de campos. Generar UN supuesto explícito en el bloque de header (`# SUP-AOX-{N} | origen: PASO 1.ter | cps: cp_NN | descripción: HU enumera solo {campo}; lista completa de obligatorios pendiente de PO`) y registrar el PQ en `assumptions.md` mediante el campo `assumptions[]` del output del CP (consumido por design-team → diagnostician).

**Ejemplo (caso OrangeHRM HU01):**

CA literal: *"el Admin comprueba obligatoriedad de algunos campos (Organization Name) → label 'Required'"*

- CP-NNN literal: validación obligatorio Organization Name (sin supuesto).
- CP-(NNN+1) derivado (si mockup expone Email/Country/etc.): validación obligatorio {otro campo} con `@supuesto-obligatorio @requiere-validacion @cp-derivado`.
- Sin mockup → solo CP literal + supuesto SUP-AOX-01 en header.

---

## PASO 2 — Dosificación por risk level

| Risk Level | Mín CPs funcionales | Tipos obligatorios | Cross-cutting (PASO 5.bis) | Multidim (PASO 5) | Atributos transversales (PASO 6.bis) | Charter (PASO 7) |
|------------|:--:|---|:--:|:--:|:--:|:--:|
| `critical` | 6+ por CA | Happy · Validación · Error · Boundary · Variante rol · Recuperación | Todos los que apliquen | A11y + Perf + Responsive si UI | Los 4 sub-bloques aplicables | SI (20 min) |
| `high` | 4+ por CA | Happy · Error · Boundary · Recuperación | Todos los aplicables directamente | A11y + Responsive si UI | Los 4 sub-bloques aplicables | SI (15 min) |
| `medium` | 2+ por CA | Happy · Error | Solo los que aplican al CA | Responsive si UI pública | ≥2 sub-bloques priorizados | Opcional (10 min) |
| `low` | 1+ por CA | Happy | Solo obligación legal | No | Solo ux-consistency si UI | No |

**Cobertura exigida por CA (inviolable):** si el `flow` tiene criterios de aceptación identificables (CA-1, CA-2, ...), cada CA recibe **mínimo 1 happy + 1 unhappy** independientemente del risk_level. Si el flow no expone CAs discretos, el risk_level guía la dosificación global.

**Elevación puntual:** si un CA individual de un flow `medium` toca PII/auth, marcarlo con `@risk-elevated @reason-pii` y aplicarle cobertura `high` solo a ese CA.

---

## PASO 3 — Escenario estándar + reglas de sintaxis

```gherkin
@flow_{id} @{risk_level} @functional @executor_functional @smoke
Escenario: {Objetivo} - flujo exitoso
  Dado que {precondición: estado inicial}
  Cuando {acción principal del usuario}
  Entonces {resultado observable en UI}
```

### Reglas de sintaxis — OBLIGATORIAS

1. **Secuencia estricta `Dado → Cuando → Entonces`.** NUNCA `Cuando` después de `Entonces` (acción tras verificación → nuevo escenario). NUNCA `Dado` después de `Cuando`.
2. **Todo escenario requiere al menos un `Cuando`.**
3. **Un escenario = UN objetivo de prueba.** Dos objetivos → dos escenarios.
4. **Validar antes de emitir:** ¿Cada escenario tiene `When`? ¿Secuencia correcta? ¿Objetivo único? Si algo falla → corregir.

### Guardarraíles anti-alucinación (inviolables)

5. **Sin CPs genéricos.** Cada escenario debe mapear a un requisito concreto del flow, a un control cross-cutting justificado, a una validación canónica por dimensión, o a una variante de estado implícito. **Si no puedes citar la regla/CA/control que origina el escenario, NO lo emitas.**

6. **Mensajes exactos literales.** Si el flow o los CAs especifican el texto exacto de un mensaje, reproducirlo entre comillas tal cual — nunca parafrasear.

7. **Aserciones negativas explícitas.** Cuando el flow prohíbe algo ("NO revelar", "NO almacenar", "sin exponer"), usar `Entonces ... NO ...` literalmente. Ejemplo: `Entonces el sistema NO revela si el correo está registrado`.

8. **Datos realistas contextualizados.** Usar valores coherentes con la región del flow:
   - **Colombia**: CC/CE, dominios `.com.co`, COP, nombres colombianos, Ley 1581/2012 (Habeas Data), SARLAFT, Circular 026/2008 SFC
   - **México**: CURP/RFC, MXN, LFPDPPP, Circular Única de Seguros (CNSF)
   - **Región no especificada**: usar datos neutros pero coherentes; NUNCA valores "Lorem ipsum" o `user@test.com`

9. **Compliance normativo extensible.** Para escenarios de compliance, incluir referencia a la norma aplicable como comentario sobre el escenario: `# Compliance: Ley 1581/2012 (Habeas Data)`. El catálogo regional es extensible — agregar normas sin modificar la lógica del skill.

10. **Ambigüedad → supuesto explícito, no decisión silenciosa.** Si dos interpretaciones razonables del mismo CA son posibles, generar el escenario con `@supuesto-{id} @requiere-validacion` en lugar de elegir una en silencio.

### Background

Válido: navegación a URL, login con referencia a datos, acción UI con steps concretos.
Inválido: estado asumido sin steps, precondición de datos externos no controlados.
Estado previo extenso → referenciar dataset: `Dado que el estado de prueba "{data_id}" está configurado`.

---

## PASO 3.bis — Validaciones por dimensión de entrada

**Mecanismo:** escanear el `flow` buscando dimensiones de input. Por cada dimensión detectada, disparar la familia de validaciones asociada. Catálogo extensible sin tocar la lógica base.

### REGLA DE ORO BVA (anti-alucinación de límites)

Para CUALQUIER dimensión que requiera valores de frontera (`@form-input` longitud, `@monetary` boundaries, `@numeric-range`, `@identifier-input` longitud exacta, `@file-upload` tamaño, `@search-filter` longitud):

1. Si el campo tiene entrada en `documented_limits[campo]` (proviene de CA explícito, nota técnica de la HU o constraint declarado en knowledge) → emitir BVA estricto con esos valores: `at_min`, `below_min`, `at_max`, `above_max`. Tag estándar `@boundary` + dimensión.
2. Si NO hay `documented_limits[campo]` → **NO emitir Scenario Outline con valores absolutos**. En su lugar:
   - Generar 1 CP exploratorio con tags `@charter-only @supuesto-longitud @requiere-validacion @cp-derivado`.
   - El CP NO va al `.feature`; va al `charter_{flow_id}.md` como pregunta dirigida al PO.
   - Comentario en el header: `# SUP-LEN-{N} | origen: PASO 3.bis | campo: {campo} | descripción: límite no documentado en HU; se promueve a charter exploratorio`.

**Justificación:** inventar `255 / 300 / 500 caracteres` sin huella documental viola REGLA 8 (no inferir contenido), produce CPs `@known_bug` falsos cuando el sistema responde distinto a la heurística, y satura el reporte de FAILs por umbrales nunca validados con producto.

**Aplica TAMBIÉN a la dimensión `@form-input` por defecto** — la fila *"Cualquier formulario con inputs de texto"* dispara Scenario Outline solo cuando `documented_limits` cubre el campo. Sin eso → solo el bloque exploratorio en charter.

| Dimensión detectada | Señales en el flow | Familia de escenarios a generar |
|---------------------|--------------------|---------------------------------|
| `@authentication` | "login", "credenciales", "contraseña", "token", "SSO", "Azure AD" | Case sensitivity password (rechaza), insensitivity username/email (acepta), trim de espacios, longitud máxima, paste/copy, autocompletado |
| `@form-input` | Cualquier formulario con inputs de texto | Longitud máxima, caracteres especiales, whitespace trim, unicode/emojis, paste que excede, XSS básico |
| `@monetary` | "monto", "prima", "valor", "importe", "tarifa", moneda | Precisión decimal, separadores (coma vs punto), cero, negativos, boundaries mínimo/máximo, redondeo, moneda en display |
| `@date-picker` | "fecha", "vigencia", "emisión", "nacimiento", "calendario" | Formato local (dd/MM/yyyy), timezone, fechas pasadas/futuras, años bisiestos, boundaries, fecha inválida |
| `@file-upload` | "cargar documento", "adjuntar", "upload" | Tipo MIME permitido, extensión real ≠ declarada, tamaño máximo, archivo vacío, archivo corrupto |
| `@search-filter` | "buscar", "filtrar", "consulta" | Query vacía, muy larga, patrones SQL/XSS, wildcards, acentos, sin resultados |
| `@pagination` | "paginación", "página", "lista" | Página 0, > total, items-per-page en boundaries, navegación tras borrar items |
| `@identifier-input` | "CC", "CE", "CURP", "RFC", "número de póliza", "ID" | Longitud exacta, checksum/dígito verificador, caracteres no válidos, formato con/sin separadores |
| `@dropdown-select` | "seleccionar", "tipo de…", "lista desplegable" | Valor por defecto, "seleccione una opción" como valor, opción única, carga diferida |
| `@numeric-range` | "entre X y Y", "rango", "cantidad", "edad", "plazo", código numérico (OTP) | at_min, below_min, at_max, above_max, cero, negativos, decimales (si solo entero) |

**Aplicación por risk_level** (modulada por `cross_cutting_mode` — ver cuadro abajo):
- `critical/high`: todos los escenarios de cada familia detectada
- `medium`: al menos 3 escenarios representativos por familia
- `low`: solo el boundary más sensible de cada familia

**Gate por `cross_cutting_mode`** (resuelto desde `appweb.yaml → enrichment.cross_cutting_mode`):

| Modo | Comportamiento de PASO 3.bis |
|---|---|
| `literal` (default, apps internas/admin) | Solo dimensiones donde el CA exponga el constraint explícito (ej. CA dice "longitud 100" → activa `@form-input`). Sin constraint explícito → SKIP de la dimensión completa. La REGLA DE ORO BVA ya filtra valores absolutos sin documentar. |
| `expanded` (apps con UI cara al usuario, formularios públicos) | Dimensiones detectadas por keyword en flow disparan validaciones con prioridad por risk_level. La REGLA DE ORO BVA sigue vigente. |
| `shift_left` (apps críticas / alto rigor) | Todas las dimensiones aplicables disparan, incluyendo combinaciones poco probables. La REGLA DE ORO BVA sigue vigente — sin override. |

**Tagging:** `@input-dimension-validation` + dimensión específica (`@authentication`, `@monetary`, etc.).

**Un mismo campo puede disparar varias dimensiones** (ej. campo "importe" dispara `@monetary` + `@form-input` + `@numeric-range`).

---

## PASO 4 — Scenario Outline (boundary y variantes)

```gherkin
@flow_{id} @{risk_level} @boundary @data-{data_id}
Esquema del escenario: {Objetivo} - validación de {campo}
  Dado que {precondición}
  Cuando ingresa <valor> en "{nombre_campo}"
  Entonces {resultado esperado para <resultado>}

  Ejemplos:
    | valor | resultado |
    | {at_min} | éxito |
    | {below_min} | error_validacion |
    | {at_max} | éxito |
    | {above_max} | error_validacion |
    | "" | campo_requerido |
```

**Separación datos/lógica:** los datos viven en la tabla `Ejemplos`, no hardcodeados en los steps. Si el orquestador provee `data_sets`, referenciar por ID (`@data-{data_id}`).

**Vínculo con REGLA DE ORO BVA (PASO 3.bis):** los valores `at_min`/`at_max`/`below_min`/`above_max` provienen exclusivamente de `documented_limits[campo]` o de la tabla `data_sets` indexada por `scenario_type`. PROHIBIDO inventar `255` / `300` / `500` cuando el dato no está documentado. Sin límite documentado → ese campo NO recibe Scenario Outline; el escenario se promueve a charter con `@charter-only @supuesto-longitud`.

---

## PASO 5 — Escenarios especializados (condicionales)

**Condiciones de activación** (auto-detectadas o por `scenario_types_requested`):
- `a11y`: si `risk_level ≥ high` y el flow expone UI interactiva
- `performance`: si `risk_level ≥ high` y el flow involucra carga de datos/APIs
- `responsive`: si el flow describe UI pública accesible por cliente final

**A11y** (`@a11y @wcag-aa`): labels asociados, contraste ≥ 4.5:1, navegación teclado completa, mensajes error vía aria-live, sin parpadeo >3/s, focus visible, orden lógico de tabulación.

**Performance** (`@performance @core-web-vitals`): LCP ≤ 2.5s, FID/INP ≤ 100ms, CLS ≤ 0.1, APIs ≤ 500ms p95.

**Responsive** (`@responsive`): viewports mobile 375×812, tablet 768×1024, desktop 1440×900. Sin overflow horizontal, touch target ≥ 44×44px, contenido crítico visible.

---

## PASO 5.bis — CPs cross-cutting automáticos

**Disparo por dimensión funcional detectada en el flow:**

| Dimensión detectada | Escenarios cross-cutting a generar |
|---------------------|-----------------------------------|
| **OTP** | Brute force (N intentos según especificación del flow), expiración por timeout, cooldown de reenvío, bloqueo tras límite |
| **Autenticación** | Audit trail de eventos (login/fallo/bloqueo), mensajes genéricos anti-enumeración, enmascaramiento de credenciales en DOM |
| **Datos personales** | Checkbox Habeas Data/LFPDPPP + evidencia, enmascaramiento en pantalla/logs, limpieza post-logout/abandono |
| **Servicios externos** | Timeout → mensaje genérico + estado consistente, caída (5xx) → no deja estado inconsistente, log del evento |
| **Sesiones** | Timeout por inactividad, concurrencia (N sesiones/usuario), prevención retorno vía back button, token blacklisting |
| **Compliance** | Registro de versión de documento legal aceptado, bloqueo de empleado retirado/suspendido, anti-enumeración transversal |
| **Rate limiting** (si aplica) | Umbral por IP en endpoints sensibles, HTTP 429, registro del evento en log de seguridad |

**Aplicación por risk_level y `cross_cutting_mode`** (combinación):

| `cross_cutting_mode` | `critical/high` | `medium` | `low` |
|---|---|---|---|
| `literal` (default — apps internas/admin) | Solo dimensiones EXPLICITAS en CA (compliance regulatorio nombrado, OTP/auth solo si CA habla de OTP/auth, datos personales solo si CA menciona PII) | Solo obligación legal explícita | Solo obligación legal explícita |
| `expanded` (apps cara al usuario) | Todos los aplicables al flow | Solo los directamente relacionados con el CA | Solo si hay obligación legal explícita |
| `shift_left` (apps críticas / alto rigor) | Todos + combinaciones | Todos los aplicables | Cross-cutting de auth/sesión si flow tiene auth |

**Inviolable:** los CPs generados por PASO 5.bis siempre llevan tag `@cp-derivado` y, cuando aplique, `@requiere-validacion` si la inferencia depende de un constraint regulatorio no confirmado por el PO. PROHIBIDO en modo `literal` generar XSS/SQLi sobre campos admin-only (e.g. CRUD de configuración interna) — el campo debe ser cara-al-usuario o tener tag explícito `@public-facing` en el flow.

---

## PASO 6 — Supuestos

Por cada escenario basado en un supuesto no confirmado:
- Tag `@supuesto-{id}` + `@requiere-validacion` si `risk_level ≥ high`
- Comentario previo: `# Supuesto: {descripción breve}`

Todos los supuestos del flow se listan en el bloque de comentarios del header del `.feature` (ver sección "Comentarios estructurados del header" abajo), con columna "origen" (PASO 1, PASO 1.bis, PASO 3 ambigüedad, PASO 5.bis).

---

## PASO 6.bis — Atributos de calidad transversal

**Disparo por tipo de output del flow:**

| Tipo de output | Sub-bloques que aplican |
|----------------|-------------------------|
| UI interactiva | Los 4 sub-bloques |
| API / backend sin UI | Solo network-efficiency + client-observability |
| Proceso batch | Solo client-observability (logs) |

**Mínimos por risk_level y `cross_cutting_mode`:**

| `cross_cutting_mode` | `critical/high` | `medium` | `low` |
|---|---|---|---|
| `literal` | ux-consistency + sub-bloques explícitamente aplicables al CA | 1 sub-bloque (ux-consistency) | (nada — solo si HU lo pide) |
| `expanded` | Todos los sub-bloques aplicables | 2 de los 4 | ux-consistency si hay UI |
| `shift_left` | Todos los 4 sub-bloques | Todos los 4 | ux-consistency + client-observability |

### Sub-bloque A — UX consistency (`@ux-consistency`)

1. Ortografía y coherencia de textos visibles
2. Alineación/distribución de campos según sistema de diseño
3. Popups y overlays bloquean correctamente los elementos debajo
4. Campos no editables visualmente diferenciados
5. Consistencia tipográfica y de espaciado

### Sub-bloque B — Network efficiency (`@network-efficiency`)

1. Payload mínimo al front (solo campos necesarios para renderizar)
2. No llamadas a servicios innecesarios al cargar la pantalla
3. Carga de maestros coherente (cache, no repetición)
4. Sin llamadas redundantes al backend durante interacciones

### Sub-bloque C — Data robustness (`@data-robustness`)

1. Longitudes máximas explícitas en todos los campos
2. Consistencia en digitación entre campos del mismo tipo
3. Comportamiento ante paste que excede límite (truncar vs rechazar — política documentada)

### Sub-bloque D — Client observability (`@client-observability`)

1. Consola del navegador sin información de desarrollo en producción
2. Mensajes de error de backend adaptados al contexto del usuario
3. Sin errores silenciosos en respuestas HTTP 200
4. Estado consistente ante fallas de backend (pantalla recuperable, sin loaders infinitos)
5. Tiempos de respuesta > 2s identificados y diferenciados por origen

---

## PASO 7 — Charter de exploración (archivo separado)

**Condición:** generar si `risk_level ∈ {critical, high}` o si hay supuestos no confirmados detectados.

```markdown
## Charter: {flow_name}
**ID:** charter_{flow_id} | **Sesión:** {20min critical | 15min high | 10min medium}
**Objetivo:** Descubrir comportamientos no documentados en {flow_name}

### Preguntas guía
- ¿Variaciones de entrada no contempladas en los CAs?
- ¿Condiciones límite o combinaciones inusuales?
- ¿Mensajes de error claros, consistentes, sin exponer info técnica?
- ¿Inconsistencias de UI entre pantallas del mismo flujo?
- ¿Supuestos documentados (@supuesto-*, @regla-negocio-implicita) se cumplen en la implementación real?

### Señales a reportar
- Comportamiento ≠ documentación
- Errores en consola / logs servidor
- Estados inconsistentes tras acciones concurrentes
- Flujos sin retorno claro
- Datos sensibles expuestos (pantalla/logs/URL/storage)

### Entregables
1. Notas de observaciones (timestamp + descripción + evidencia)
2. Defectos candidatos (título + pasos + severidad)
3. Sugerencias de CPs adicionales para v+1
4. Supuestos validados o invalidados
```

---

## Campos GNP Tabulares (cuando `matrix_format == "gnp"`)

Cada CP incluye además del Gherkin:
- `ca_number` (int)
- `cp_sequence` (int)
- `gnp_id` (`"{ca}.{seq}"`)
- `funcional_ref` (`"HU{N} - CA{ca}"`)
- `preconditions` (prosa)
- `steps` (numerados)
- `description_gnp` (narrativa ~100-200 palabras)
- `expected_result_text` (descriptivo, NO "PASS")
- `test_type` (`"Positivo"`/`"Negativo"`/`"Alterno"`)

---

## Comentarios estructurados del header (compatible con `.feature`)

El `.feature` emitido empieza con un bloque de comentarios que lleva resumen estadístico, cobertura CA→CPs y tabla de supuestos. Esto no rompe el parsing de Gherkin (los comentarios `#` son válidos) y permite al orquestador ingerir la metadata.

```gherkin
# language: es
# flow_id: {flow_id}
# risk_level: {critical/high/medium/low}
# risk_justification: {señal detectada}
#
# === RESUMEN ESTADÍSTICO ===
# total_cps: NN
# happy_path: NN | unhappy_path: NN | boundary: NN
# critical: NN | high: NN | medium: NN | low: NN
# input_dimension_validation: NN (dimensiones: [auth, form, ...])
# regla_negocio_implicita: NN
# cross_cutting: NN (dimensiones: [otp, audit, ...])
# a11y: NN | performance: NN | responsive: NN
# ux_consistency: NN | network_efficiency: NN | data_robustness: NN | client_observability: NN
# basados_en_supuestos: NN
#
# === COBERTURA POR CA ===
# CA-1: cp_01, cp_02, cp_03 (dimensiones: functional, validation)
# CA-2: cp_04, cp_05 (dimensiones: functional, security)
# ...
#
# === SUPUESTOS A VALIDAR ===
# SUP-01 | origen: PASO 1.bis | cps: cp_I01 | descripción breve
# SUP-02 | origen: PASO 3 ambigüedad | cps: cp_08 | descripción breve
# ...

Feature: {Título del flow}
  {narrativa del flow}

  Background:
    ...

  # ========================================================================
  # Bloque 1 — CA-1 funcionales
  # ========================================================================
  @flow_{id} @{risk_level} @functional @executor_functional @smoke
  Escenario: ...
  ...

  # Bloque 2 — CA-2 funcionales
  ...

  # Bloque N — Validaciones por dimensión de entrada (PASO 3.bis)
  ...

  # Bloque N+1 — Estados implícitos del actor (PASO 1.bis)
  ...

  # Bloque N+2 — Escenarios especializados (PASO 5: a11y/perf/responsive)
  ...

  # Bloque N+3 — Cross-cutting automáticos (PASO 5.bis)
  ...

  # Bloque N+4 — Atributos de calidad transversal (PASO 6.bis)
  ...
```

---

## Checklist de entrega (ejecutado por el skill antes de emitir)

Antes de devolver el `.feature`, verificar:

### Cobertura
- [ ] Cada CA del flow tiene mínimo 1 happy + 1 unhappy
- [ ] Cantidad de CPs ≥ mínimo RBT del PASO 2 para el `risk_level` recibido
- [ ] PASO 1.bis ejecutado y resultado documentado (aunque sea "sin variantes")
- [ ] PASO 1.ter ejecutado: si algún CA matchea patrón "algunos campos (X)" → CP literal + supuesto SUP-AOX-{N}
- [ ] PASO 3.bis ejecutado por cada dimensión de input detectada **y filtrada por `cross_cutting_mode`**
- [ ] PASO 3.bis: ningún Scenario Outline emitido con valores absolutos de longitud sin entrada en `documented_limits`
- [ ] PASO 5.bis ejecutado **respetando el gate por `cross_cutting_mode`** (literal: solo CAs explícitos; expanded: todos directamente; shift_left: todos + combinaciones)
- [ ] PASO 5.bis: ningún CP de XSS/SQLi sobre campos admin-only en modo `literal`
- [ ] PASO 6.bis ejecutado según tipo de output, mínimo RBT y `cross_cutting_mode`
- [ ] Charter generado si `risk_level ∈ {critical, high}` o hay supuestos
- [ ] Charter recibe los CPs `@charter-only` (de PASO 3.bis sin `documented_limits`)

### Sintaxis y guardarraíles
- [ ] Todo escenario tiene al menos un `Cuando`
- [ ] Ningún `Cuando` tras `Entonces`, ningún `Dado` tras `Cuando`
- [ ] Un escenario = un objetivo verificable
- [ ] Sin credenciales literales (solo referencias `{data.credentials.*}`)
- [ ] Sin CPs genéricos (cada escenario trazable a CA/control/dimensión)
- [ ] Mensajes literales de la HU reproducidos entre comillas
- [ ] Aserciones negativas explícitas donde el flow prohíbe algo
- [ ] Datos contextualizados a la región del flow

### Supuestos y tags
- [ ] Supuestos no confirmados etiquetados `@supuesto-*` + `@requiere-validacion`
- [ ] Estados implícitos etiquetados `@regla-negocio-implicita`
- [ ] Validaciones canónicas etiquetadas `@input-dimension-validation` + dimensión
- [ ] Transversales etiquetadas con sub-bloque correspondiente

### Trazabilidad
- [ ] Header del `.feature` contiene resumen estadístico
- [ ] Header del `.feature` contiene cobertura CA → CPs
- [ ] Header del `.feature` contiene tabla de supuestos con columna "origen"

### Contrato de salida
- [ ] Un solo `.feature` para un solo `flow_id`
- [ ] Si `matrix_format == "gnp"`, campos GNP tabulares presentes por CP
- [ ] Charter (si aplica) en archivo separado `charter_{flow_id}.md`

Si algún ítem no se cumple → corregir antes de emitir. No emitir output inválido.

---

## Output

```
docs/testing/atf-web/{run_id}/planning/features/{flow_id}_{slug}.feature
docs/testing/atf-web/{run_id}/planning/charters/charter_{flow_id}.md
```

**⛔ Una invocación = UN `.feature` = UN `flow_id`.** NUNCA mezclar flow_ids. El analizador de cobertura requiere correspondencia 1:1.

---

## Referencias ISTQB aplicadas

| Dimensión | Práctica ISTQB | Paso del skill |
|-----------|----------------|----------------|
| Pruebas basadas en riesgos | Nivel Avanzado — Test Manager | PASO 2 (matriz RBT) |
| Cuadrantes ágiles Q1–Q4 | Extensión Ágil | PASO 5 + PASO 6.bis |
| Pruebas exploratorias | Extensión Ágil — Session-Based | PASO 7 (charter) |
| Técnicas caja negra (partición / frontera) | Nivel Básico | PASO 4 + PASO 3.bis |
| Testabilidad / gestión de supuestos | Nivel Avanzado — Test Analyst | PASO 1.bis + PASO 6 + tag `@supuesto-*` |
| Análisis de roles y actores | Nivel Avanzado — Test Analyst | PASO 1.bis (protocolo 5 pasos) |
| Atributos no funcionales | Nivel Avanzado — Technical Test Analyst | PASO 5 + PASO 6.bis |
| Trazabilidad requisito → prueba | Nivel Básico | Header del `.feature` (resumen + cobertura CA) |
