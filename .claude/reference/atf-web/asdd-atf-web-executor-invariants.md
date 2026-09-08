# Invariantes del pipeline de ejecución (executor + orchestrator)

> **Propósito:** Single Source of Truth para los contratos que deben respetar
> los agentes que producen o consumen `result.json`, `module_result.json` y
> `bug_candidate`. Aplica al `agent_executor` y a cualquier agente que lo
> subdivida. Los agentes referencian las reglas por ID en vez de duplicar texto.
>
> **Aplicabilidad por capa:**
>
> | REGLA | Executor | Orchestrator | Agentes auxiliares (runner / evidence-builder) |
> |---|---|---|---|
> | 1 — Fidelidad 1:1 `steps[]` ↔ `steps_raw` | ✅ | ✅ (valida en R4/R5) | ✅ (evidence-builder) |
> | 2 — Aislamiento atómico de source_ids | ✅ | ✅ | ✅ |
> | 2.1 — Slug canónico via `cpIdToFolderFromKnownModules()` | ✅ | ✅ (valida en reset-cp-artifacts) | ✅ |
> | 3 — Schema compliance de `module_result.json` | ✅ | ✅ (ingesta via `generate-report.js`) | ✅ |
> | 4 — `setup_steps[]` vs `steps[]` (ADR-001) | ✅ | — | ✅ |
> | 5 — `bug_candidate` con 12 campos ALM | ✅ | — | ✅ (evidence-builder) |
> | 6 — Prohibición de resultados inferidos | ✅ | ✅ | ✅ |
> | 7 — Validación BD como observación paralela | ✅ (invoca asdd-atf-web-db-validator) | ✅ (propaga db_config a exec_context) | ✅ (renderiza sección BD en evidence.html) |
> | 8 — Protocolo MFA (restauración de storageState) | ✅ (invoca auth-handler PASO 1.5a) | ✅ (propaga mfa_* a exec_context) | — |
> | 27 — Visibilidad literal de conjunciones | ✅ | ✅ (consume el FAIL coherente con expected_result) | ✅ |

---

## REGLA 1 — FIDELIDAD 1:1 ENTRE `steps[]` Y `steps_raw`

El array `steps[]` del `result.json` del CP DEBE tener exactamente `N` entradas,
donde `N = steps_parsed.length` (las líneas parseadas de `steps_raw` del CP).

**Parseo canónico de `steps_raw`:**
1. Split por `\n`
2. Strip `- ` al inicio de cada línea (si existe)
3. Trim whitespace
4. Filtrar líneas vacías

**Mapeo posicional:** `steps_raw` línea 1 → `steps[0]` (n=1), línea 2 → `steps[1]` (n=2), etc.

**Reglas derivadas:**
- PROHIBIDO consolidar, fusionar o resumir múltiples pasos en uno solo.
- PROHIBIDO omitir pasos aunque la receta de navegación los haga implícitos.
- Sub-acciones browser (ej: navegar + llenar + click para ejecutar un paso) van en `interactions[]` del mismo step, NO como steps adicionales.
- `steps[i].text` contiene el texto original de `steps_raw` línea i+1 enriquecido con datos reales (IDs de registro, nombre de producto, monto), pero NO parafraseado.

**Verificación:** `tools/validate-step-fidelity.js --cp-file <ruta> --result-file <ruta>` retorna exit 0 si la fidelidad se mantiene, exit 2 si está rota.

### Optimización de evidencia: reuso de screenshot entre verificaciones

La fidelidad 1:1 aplica al ARRAY `steps[]` (un objeto por línea de `steps_raw`).
NO obliga a que cada step tenga un PNG físicamente distinto. Cuando `evidence_mode='all'`
y N steps consecutivos son **verificaciones** (no acciones que muten el DOM)
del MISMO estado de página, el executor PUEDE referenciar el mismo `evidence_file`
en los N steps en lugar de capturar N screenshots idénticos.

**Heurística para detectar steps de verificación reutilizables:**

Un step `i` puede compartir `evidence_file` con `step[i-1]` SI todas estas condiciones se cumplen:

1. **El verbo del step empieza con verificar / confirmar / validar / asserir / comprobar.**
2. **NO hay acción intermedia que mute el DOM** entre `step[i-1]` y `step[i]` (sin click, fill, navigate, hover, key press).
3. **El step anterior YA capturó el estado relevante** — su screenshot muestra el elemento que este step verifica (o el estado completo de la página).
4. El executor NO altera el highlight entre steps (sin nuevo `browser_evaluate` con highlight de otro selector).

Cuando aplica:
- `steps[i].evidence_file` = mismo archivo que `steps[i-1].evidence_file`.
- `steps[i].interactions[]` describe la verificación con `evaluate_code` y `observation` (lo que cambió es la lógica de validación, no la imagen).
- `validate-step-fidelity.js` sigue retornando OK (cuenta entradas, no archivos únicos).

Cuando NO aplica:
- Cualquier step con verbo de acción (clic, ingresar, navegar, seleccionar) → screenshot propio obligatorio.
- Steps que verifican un highlight DIFERENTE del anterior (ej: step N-1 highlightea `[data-test="error"]`, step N highlightea `[data-test="username"]`) → screenshot propio.
- Steps con verificación que cambia la URL o navega.

**Beneficio:** en CPs con cluster de verificaciones (típico de @security, @validation), ahorra 4-8 screenshots ≈ 10-20 s por CP cuando varios steps verifican el mismo estado post-acción.

### Highlight para steps de navegación

El primer step de un CP suele ser `Navegar a {url}`. Para ese step, NO highlightear
un elemento arbitrario (botón, input). Opciones válidas en orden de preferencia:

1. **Sin highlight, screenshot directo de la página completa post-navigate.** El step
   captura el estado inicial de la app — no hay elemento específico que validar todavía.
2. Highlight de `body` con color verde (visual sutil que no destaca nada en particular).

PROHIBIDO en step de navegación:
- Highlightear elementos del formulario (`#login-button`, `[data-test="username"]`)
  ANTES de que el step correspondiente del CP los toque — confunde la evidencia visual.

---

## REGLA 2 — AISLAMIENTO ATÓMICO DE SOURCE_IDS

Cada `source_id` (renglón del Excel Matriz de Pruebas) es una unidad de ejecución
independiente. Esto implica:

- **Una carpeta por source_id:** `{execution_dir}/{module}/{cp_id_con_source}/`
- **Un `result.json` por source_id** — nunca consolidar múltiples source_ids en un solo artefacto.
- **Screenshots propios:** `evidence_01.png` a `evidence_NN.png` bajo la carpeta del source_id.
- **`cp_id` incluye el source_id:** el `cp_id` generado debe ser `CP-{sheetName}-{idRaw}` para garantizar unicidad (ver `convert-xlsx.js`).

**Razón:** consolidar source_ids rompe la trazabilidad y hace imposible saber
qué renglón del Excel produjo qué hallazgo.

---

## REGLA 2.1 — SLUG CANÓNICO VIA `cpIdToFolderFromKnownModules()`

El nombre de la carpeta de un CP DEBE provenir de
`require('./tools/lib/cp-slug.js').cpIdToFolderFromKnownModules(cp_id, knownModules)`
con `knownModules` derivado del filesystem (`design/cp_modulo_*.json` del run).
Está PROHIBIDO construir nombres manualmente (ej: `cp_m5_002`, `CP-M5-002`, `m5-002`).

> **Por qué `cpIdToFolderFromKnownModules` y no `cpIdToFolder`:** la heurística
> split-by-dash de `cpIdToFolder()` trunca módulos multi-palabra (ej.
> `admin-organization` → `organization-HU01-001` en lugar del canónico
> `HU01-001`), generando carpetas duplicadas en runs cross-módulo. La función
> canónica recibe la lista de módulos conocidos y aplica longest-prefix match,
> soportando correctamente módulos multi-palabra.
>
> `cpIdToFolder()` se conserva como fallback en algunos call sites
> (`reset-cp-artifacts.js` con `safeCpIdToFolder`, `.claude/dashboard/generate-report.js`
> con detección de existencia en disco) **solo para retrocompatibilidad con
> runs antiguos**. Código nuevo SIEMPRE debe usar `cpIdToFolderFromKnownModules`.

**Mapeo canónico (ejemplos):**

| `cp_id` | `knownModules` | Slug |
|---|---|---|
| `CP-M5-002` | `["M5"]` | `002` |
| `CP-Matriz_1-12,01,1` | `["Matriz_1"]` | `12_01_1` |
| `CP-auth-login_happy` | `["auth"]` | `login_happy` |
| `CP-admin-organization-HU01-001` | `["admin-organization", "email-config", "job-titles"]` | `HU01-001` |
| `CP-email-config-007` | `["admin-organization", "email-config", "job-titles"]` | `007` |
| `CP-job-titles-HU2-001` | `["admin-organization", "email-config", "job-titles"]` | `HU2-001` |

**Aplicación:**

- **Sub-agente executor** (full y fast-path) — invoca
  `cpIdToFolderFromKnownModules(cp_id, knownModules)` con `knownModules` derivado
  de `cp_targets_resolved.map(c => c.module_id)` de `exec_context.json`. Ver
  [`execute.md`](../atf-web-steps/execute.md) PASO 2 R2.2 paso A.2 y
  [`execute.md`](../atf-web-steps/execute.md) paso 3.A.2.
- **Scripts internos** — `batch-mkdir-canonical.js`, `preflight-continuation.js`,
  `abort-blocked.js` ya usan la versión canónica.
- **`tools/reset-cp-artifacts.js`** — acepta `--design-dir` para derivar
  `knownModules`; detecta carpetas legacy via mismatch entre slug heurístico y
  canónico, y por **default purga** las carpetas legacy en conflicto. Para
  preservar (caso forensics) usar `--archive-legacy` (las archiva como
  `{canonical}_legacy_{ts}/`). Modo `--legacy-only` ejecuta SOLO la depuración
  sin tocar carpetas canónicas. **`--design-dir` es obligatorio en pipelines
  automatizados** (preflight-continuation, executor) — sin él, la
  detección de módulos multi-palabra cae a heurística split-by-dash y omite la
  limpieza, dejando residuales en disco. El default es `purge` porque las
  archivadas duplicarían evidencia ya persistida en `cp_registry.execution_history`.
- **`.claude/dashboard/generate-report.js --evidence-only --cp-ids`** — prefiere el
  slug canónico; cae al heurístico SOLO si la carpeta canónica no existe en
  disco (compat con runs antiguos). NO procesa pares duplicados.

**Razón:** el dashboard indexa por slug canónico. Slugs ad-hoc o truncados
producen carpetas huérfanas invisibles al reporte y duplicados engañosos.

---

## REGLA 3 — SCHEMA COMPLIANCE DE `module_result.json`

El `module_result.json` que el executor emite DEBE usar el schema EXACTO:

```json
{
  "module_id": "...",
  "summary": {
    "executed": 0,
    "passed": 0,
    "failed": 0,
    "blocked": 0
  },
  "results": [ ... ]
}
```

**Nombres obligatorios del campo `summary`:**
- ✅ `executed`, `passed`, `failed`, `blocked` (primer nivel, numéricos)
- ❌ `pass` (usar `passed`)
- ❌ `fail` (usar `failed`)
- ❌ `this_run_executed` (usar `executed`)
- ❌ `combined_results` (usar campos planos en el nivel raíz)

Nombres incorrectos rompen la ingesta de `generate-report.js` y producen reportes
que muestran 0 casos ejecutados.

---

## REGLA 4 — `setup_steps[]` VS `steps[]` (ADR-001 Opción C')

Si el CP contiene `auto_inferred.preconditions_playbook[]` con al menos un elemento,
el executor DEBE ejecutar los playbooks **antes** de iterar `steps_raw`.

**Contrato de separación (inviolable):**
- `result.json.setup_steps[]` — pasos del playbook (preparatorios, mecánicos del framework)
- `result.json.steps[]` — pasos del `steps_raw` del CP (1:1 con el Excel — REGLA 1)

**Implicaciones:**
- La REGLA 1 (fidelidad 1:1) aplica EXCLUSIVAMENTE a `steps[]`. `setup_steps[]` no entra en el conteo.
- El PASS/FAIL del CP se evalúa SOLO sobre `steps[]`. `setup_steps[]` solo puede producir BLOCKED si falla.
- El reporte ALM (`bug_candidate.steps_to_reproduce`) referencia SOLO `steps_raw` del Excel — no los setup_steps del playbook.

**Acciones posibles por playbook:**
- `action: "block"` → CP = BLOCKED con `blocked_reason = playbook.blocked_reason`. NO ejecutar setup_steps ni steps_raw.
- `action: "execute"` → cargar `setup_steps` del playbook desde `navigation-recipes.md` (vía `tools/detect-playbooks.js`) y ejecutarlos registrándolos en `setup_steps[]`.

Si `auto_inferred.preconditions_playbook[]` NO existe o está vacío → ignorar este
paso, ejecutar el CP iterando `steps_raw` directamente. Compatibilidad retro.

Referencia: `docs/decisions/ADR-001-philosophy-executor-deterministic-vs-inferential.md`.

---

## REGLA 5 — `bug_candidate` CON 12 CAMPOS ALM PARA FAILs

Cuando un CP tiene `status: "FAIL"`, el campo `bug_candidate` del `result.json`
DEBE incluir los 12 campos del formato ALM estándar del framework:

1. `title`
2. `matrix_ref`
3. `environment`
4. `steps_to_reproduce`
5. `expected_result`
6. `actual_result`
7. `evidence_files`
8. `priority`
9. `labels`
10. `assignee`
11. `initial_status`
12. `project_type`

Esta información es la **única fuente de verdad** para el bug — el framework NO
genera archivos `BUG-*.md` separados ni mantiene registros aparte.

El template `evidence_cp.tmpl.html` renderiza estos 12 campos como una sección
ALM copiable dentro del `evidence.html` cuando `status=FAIL`. Los PASS no
muestran esa sección.

---

## REGLA 6 — PROHIBICIÓN DE RESULTADOS INFERIDOS

Nunca generar, sintetizar, estimar ni inferir resultados de CPs (PASS, FAIL,
BLOCKED) sin haber navegado explícitamente cada paso a través de las tools
`browser_*` del MCP activo.

- **Browser MCP es condición necesaria, no suficiente:** el MCP activo permite ejecutar, pero no autoriza inferir. Un CP no navegado en esta sesión es BLOCKED — nunca PASS ni FAIL por deducción.
- **Retry y abort, nunca síntesis:** si el browser no responde en un paso → reintentar hasta 2 veces → si persiste el fallo → marcar el CP como BLOCKED y continuar. Si >50% de CPs resultan BLOCKED → escribir `execution_blocked.json` y detener la fase.
- **`execution_blocked.json` es un output legítimo.** Inventar resultados para evitarlo es una violación de esta regla y contamina toda la trazabilidad del ciclo.
- **Incumplimiento invalida el run:** un `module_result.json` con resultados inferidos hace inválido el run completo. El único remedio es re-ejecutar FASE 2C con browser MCP activo sobre los CPs afectados.

---

## REGLA 7 — VALIDACIÓN BD COMO OBSERVACIÓN PARALELA

Cuando el executor tiene BD habilitada (`exec_context.db_config !== null`) **y**
el CP tiene el tag `@bd` (opt-in CP-level), invoca `asdd-atf-web-db-validator` en
PASO 3.5 del bucle `FOR i` sobre cada paso del CP. Las validaciones resultantes
son **observaciones complementarias** a la evidencia visual del CP — nunca
sustituyen ni alteran el flujo del bucle.

**Doble opt-in:** la activación requiere dos condiciones AND:

1. **App-level:** `exec_context.db_config !== null` — la app tiene BD configurada
   (`credentials.yaml → database.{env}` + `db_tables_registry.{app}.yaml` con
   `enabled: true`). Si alguno falta → skip silencioso global.
2. **CP-level:** el tag `@bd` (case-insensitive) aparece en `cp.tags[]`. Sin
   este tag, el executor **NO invoca** `asdd-atf-web-db-validator` para ese CP —
   aunque la app tenga BD activa y el step contenga keywords de write/read.

**Racional del gate CP-level:** muchos CPs navegan flujos que contienen verbos
como "verificar", "guardar", "listar" sin que el objetivo del CP sea validar
persistencia. Invocar el skill por keyword-match puro genera ruido:
`db_validations[]` se contamina con SKIPPED por `record_id_not_found` o falsas
alarmas `DB_FAIL` en tablas irrelevantes. `@bd` hace explícito el intent del
diseñador del CP: "este CP SÍ debe verificar persistencia".

**Ubicación del tag:** en el array `cp.tags[]` del `cp_modulo_{M}.json`.
Convivir con otros tags (`@high`, `@smoke`, `@m3`) sin orden. Ejemplo:
```json
{ "cp_id": "CP-M3-001", "tags": ["@m3", "@high", "@smoke", "@bd"] }
```

**Contrato de separación (inviolable):**

- `result.json.steps[]` — 1:1 con `steps_raw` (REGLA 1). NO incluir entradas de BD.
- `result.json.db_validations[]` — **campo paralelo nuevo**. Cada entrada referencia el `step_num` del step asociado.
- `result.json.db_connection_failed` — boolean a nivel CP. `true` si al menos una validación tuvo `status: DB_ERROR`.

**Reglas de bloqueo:**

| Status BD | `db_required` | Efecto en el CP |
|---|---|---|
| `DB_PASS` | true \| false | El CP continúa. Entrada verde en `db_validations[]`. |
| `DB_FAIL` | `true` | El CP se marca FAIL. `caused_cp_fail: true` en la entrada. `failed_step: step_num`, `error_message: "DB mismatch — ..."`. |
| `DB_FAIL` | `false` | El CP mantiene su status visual. Entrada roja en `db_validations[]` (evidencia, no blocker). |
| `DB_ERROR` | — | **NUNCA bloquea el CP.** Entrada ámbar + `db_connection_failed: true`. Razón: fallo de infra ≠ defecto de la app. |
| `DB_SKIPPED` | — | **SÍ se agrega entrada** con `reason` (FIX #9). Trazabilidad: el QA ve qué config falta sin investigar. Causas típicas: `module_not_in_registry`, `record_id_not_found`, `no_tables_for_step_type`. |

**Resolución de `{db_required}` (SSoT exclusivo en el registry):**

- Leer `db_tables_registry.{app}.yaml` (path en `exec_context.db_config.registry_path`).
- `{db_required}` = `registry.modules[{module_id}].required` si está definido; fallback a `registry.required` global; default `false` si ninguno existe.
- **No hay override en `appweb.yaml`.** Si se necesita cambiar el comportamiento de bloqueo por run, se edita el registry.

**Feature off (app-level):**

- Si `credentials.yaml → database.{env}` ausente O `db_tables_registry.{app}.yaml` ausente O `enabled: false` → `exec_context.db_config === null`. El executor salta PASO 3.5 silenciosamente. Aplica a SauceDemo y a cualquier app sin BD.

**Feature off (CP-level):**

- Si `cp.tags[]` no contiene `@bd` (case-insensitive) → el executor salta PASO 3.5 para ESE CP. No se añaden entries a `db_validations[]`, incluso si el step contiene keywords de write/read. Otros CPs del mismo run con `@bd` siguen validándose normalmente.

**Skill contract (resumen):**

- `asdd-atf-web-db-validator` construye queries SELECT dinámicamente desde el registry (no desde el CP). Nunca escribe BD.
- `tools/db-query.js` rechaza cualquier query que no empiece con SELECT|WITH (exit 3).
- El adapter se selecciona via `credentials.yaml → database.{env}.driver` (`mssql` | `postgres` | `mock`).

**Verificación:** un `module_result.json` válido con BD activa debe cumplir:

- Cada CP tiene `db_validations: []` (array, aunque esté vacío si no aplicaron writes ni reads).
- `db_connection_failed` es boolean.
- Ninguna entrada de `steps[]` tiene metadata de BD (findings, queries) — solo `db_validations[]`.

---

## REGLA 8 — PROTOCOLO MFA (RESTAURACIÓN DE storageState)

Cuando `exec_context.mfa_type !== ""` AND `exec_context.session_state_file !== ""`,
el framework NO intenta generar códigos OTP. Reutiliza un `storageState` pre-capturado
manualmente por el QA vía `.claude/tools/save-session.js`. El flujo canónico es
**único** y lo implementa `asdd-atf-web-auth-handler` en su PASO 1.5a (executor lo invoca
en el setup atómico del CP, antes del primer `browser_navigate`).

### Fases del protocolo

1. **Verificar archivo.** Si `session_state_file` no existe o es JSON inválido:
   → retornar `{ authenticated: false, error: "mfa_session_file_not_found" | "mfa_session_file_corrupt", action_required: "node .claude/tools/save-session.js --env {env} [--force]" }`.
   El executor escribe `execution_blocked.json` y aborta el batch.

2. **Cargar storageState.** Dos caminos según capacidades del MCP Playwright:
   - **Camino A (nativo):** `browser_new_context({ storage_state: session_state_file })` antes del primer navigate.
   - **Camino B (fallback portable):** `browser_navigate(app_url)` → leer el JSON → inyectar cookies (via `context.addCookies` si disponible; sino `document.cookie` via `browser_evaluate`) → inyectar `localStorage` via `page.evaluate(entries => entries.forEach(e => localStorage.setItem(e.name, e.value)))` → recargar.

3. **Health check.**
   - Si `session_health_check_selector` configurado y visible → sesión válida.
   - Si URL redirigida a `/login|/auth|/signin|/oauth|login.microsoftonline.com` → `mfa_session_expired` → executor escribe `execution_blocked.json`.
   - Si selector no matchea pero no hay indicador de login → warning, fallback a PASO 2 de auth-handler (credenciales clásicas).
   - Si selector ausente → heurística: presencia de `input[type=password]` visible = expirada; otro caso = asumir válida con warning.

4. **Retorno.** Sesión válida → `{ authenticated: true, session: "restored_mfa", auth_method: "mfa_storage_state" }` (el executor salta PASO 2..6 de login clásico y va directo a los steps del CP).

### Seguridad (inviolable)

- `session_state_file` contiene tokens de acceso. NUNCA loguear su contenido.
- Debe estar en `.gitignore` con patrón `docs/testing/atf-web/config/session_state_*.json`.
- Si el token expira a mitad del batch, el executor re-invoca PASO 1.5a; ante `mfa_session_expired` escribe `execution_blocked.json` con `action_required` accionable y DETIENE el batch — no reintenta sin re-auth manual.

### Feature off

- Si `mfa_type === ""` O `session_state_file === ""` → auth-handler salta PASO 1.5a y continúa con el login clásico (PASO 2). Aplica a SauceDemo y apps sin 2FA.

### Fuente única

Este protocolo es la SSoT. `asdd-atf-web-auth-handler/SKILL.md` PASO 1.5a y `agent_executor.md`
deben referenciar REGLA 8 en vez de describir el flujo inline. Cambios al algoritmo
(ej: nuevo MCP Playwright que exponga `storage_state`) se hacen aquí, y las otras
specs los heredan por referencia.

---

## REGLA 27 — VISIBILIDAD LITERAL DE CONJUNCIONES (INVIOLABLE)

Cuando un step de verificación contiene una **conjunción explícita de visibilidad**
(`"[A] y [B] visibles"`, `"se muestran ambos"`, `"los botones X y Y disponibles"`,
`"campos A, B, C presentes"`, `"se visualizan ... y los botones Edit y Save"`),
TODOS los elementos enumerados deben estar **simultáneamente visibles** en el
snapshot del momento del verify. NO en algún momento futuro tras una acción del usuario.

**Aplicabilidad:** REGLA 27 es complemento de REGLA 6 (anti-inferencia). REGLA 6
prohíbe sintetizar resultados sin observar el browser; REGLA 27 prohíbe relajar la
interpretación literal del `expected_result` cuando ya se observó el browser.

**PROHIBIDO:**

- Marcar PASS razonando que un elemento *"aparece después de una acción del usuario"*,
  *"está disponible eventualmente"*, *"se reveal tras toggle/click"*. Eso es **FAIL** —
  el CP requiere coexistencia visual al momento del verify.
- Relajar el criterio invocando *"SPA behavior"*, *"reactive UI"*, *"lazy load"*,
  *"progressive disclosure"*. La app puede tener ese comportamiento, pero el contrato
  del CP describe el estado esperado tras la navegación inicial del step, no tras
  interacciones extra que el step no enumera.
- Inferir intent del CP ("posiblemente el diseñador quiso decir que están disponibles
  cuando el usuario los necesita"). El expected_result es **literal**.

**OBLIGATORIO:**

- Cuando el step lista N elementos visibles con conjunción "y", el sub-agente DEBE
  verificar el conteo real con un selector compuesto:
  ```javascript
  // Ejemplo: "los botones Edit y Save"
  document.querySelectorAll('button').filter(b =>
    /^(Edit|Save)$/i.test(b.textContent.trim())
  ).length === 2
  ```
  Si el conteo < expected → status FAIL, con `failed_step` apuntando al verify y
  `error_message` declarando: *"Expected N elementos enumerados ([A], [B], ...);
  observado solo M ({lista_observada}). El CP requiere visibilidad simultánea — no
  alcance condicional tras interacciones extra."*

- Cuando el FAIL es por una UX donde un elemento se revela tras toggle/click NO
  enumerado en `steps_raw` (ej: Save aparece tras activar Edit toggle), el
  `bug_candidate.actual_result` debe describir literalmente:
  *"El elemento [B] no es visible al cargar la pantalla; solo aparece tras [acción
  no enumerada]. Esto contradice el expected_result que requiere coexistencia."*
  Esto deja claro al revisor de ALM si el bug es de UX (la app debería mostrar
  ambos siempre) o del CP (faltó enumerar el step intermedio).

**Verificación programática (futuro, fuera de scope inmediato):** un linter sobre
`result.json` que detecte `expected_result` con conjunción `(?:y|and)\s+(los\s+botones|el\s+botón|elementos|campos|opciones|sub-opciones)` y verifique que `interactions[].evaluate_code` del step verify cuenta TODOS los elementos enumerados. Si el conteo es 1 cuando el `expected` enumeró ≥ 2, marcar el verdict como `RULE_27_VIOLATION_SUSPECTED`.

---

## Cómo actualizar estas reglas

1. Editar este archivo.
2. Si cambia la semántica de una regla → verificar que los agentes afectados
   siguen siendo consistentes con ella.
3. Si se agrega una regla nueva → actualizar la tabla de aplicabilidad al inicio.
4. Si una regla aplica a una nueva capa → agregar la referencia en la spec del
   agente correspondiente.

**No duplicar el contenido en las specs de los agentes.** Cada agente referencia
las reglas que le aplican por ID, no reescribe el texto.
