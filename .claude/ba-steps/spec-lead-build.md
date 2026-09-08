# spec-lead-build — Protocolo de Construcción de Spec Funcional
<!-- CONTRACT:spec-lead-build:v1 -->

> Módulo de carga condicional. `asdd-ba-specification-lead` lo lee COMPLETO
> antes de construir o modificar cualquier spec-funcional.

## Alcance — qué SÍ y qué NO redacta

**SÍ redacta** (secciones AF de `spec-funcional-template.md`, ADR-004):

| Sección | Contenido |
|---|---|
| §1 User Story | User Story única + métrica de éxito + Fuera de alcance (`FAS-NNN`) |
| §2 Actores y Permisos | Actores del sistema — Funcional (AF): quién, qué puede/no puede hacer |
| §3 Trazabilidad | `EDT ref` (nodo `1.X.Y`), Origen, fechas, Estado en ciclo |
| §4 Flujo de Negocio | Pasos numerados + máquina de estados (diagrama base) si aplica |
| §6 Reglas de Negocio | `RN-NNN` tipadas `[CORE]` / `[EDGE]` |
| §7 RNFs de negocio | Los 5 RNFs de negocio obligatorios |
| §14 Decisiones Requeridas y Gaps | `GAP-NNN` con impacto y opciones A/B |
| §15 Historial de Cambios Post-Aprobación | Solo si la spec ya está `APROBADA` — ver Gobernanza de CR |

**NO redacta — delegado al template y a cada dominio dueño:**

- **§0 Mapa de dominios y Gate DOR** — en modo standalone, el spec-funcional incluye solo la tabla de metadatos de §0. El Mapa de dominios y Gate DOR viven en `{codigo}-index.md`.
- **§5, §8, §9, §10, §11, §12, §13** — viven en los `spec-{area}` de cada dominio dueño. No tocarlos ni reemplazarlos. Si el feature necesita contenido de una sección no delegada → anotar como nota para el AF y recomendar el dominio dueño.

## Proceso de construcción

### Paso 0 — Resolver la ruta del artefacto

**Modo standalone AF (sin `.asdd-run.json` activo):**
1. La carpeta del nodo es `docs/specs/{codigo}-{slug-ascii}/` — crearla si no existe.
2. El archivo es `{codigo}-funcional-{slug-ascii}.md` dentro de esa carpeta.
   Ejemplo: `docs/specs/1.1.1-busqueda-unificada/1.1.1-funcional-busqueda-unificada.md`

**Con run ASDD activo (`.asdd-run.json`):** usar nombre resuelto por
`.claude/scripts/asdd-artifact-name.mjs` con slug `{codigo}-funcional-{slug-ascii}`.

Verificar con `Glob` si el archivo ya existe (iteración) o se crea por primera vez.

**Índice del nodo (solo en modo standalone AF):**
- **Primera construcción** (el Glob confirma que el spec-funcional no existía):
  tras crear el spec-funcional, invocar skill `asdd-ba-spec-index` (operación `create`)
  con `codigo`, `slug`, `nombre`, `spec_funcional` y `fecha`.
- **Iteración** (el archivo ya existía):
  invocar skill `asdd-ba-spec-index` (operación `update-artifact`) para actualizar
  el estado del spec funcional en la tabla del index.

### Paso 1 — Contexto (siempre, antes de cualquier sección)

Activar skill `asdd-ba-specification-lead-contexto`. Si el briefing tiene
vacíos `[ESCALAR_ANTES_DE_CONSTRUIR]` sin respuesta del BA humano → detener y
esperar. No continuar.

### Paso 2 — Extracción de fuentes (condicional)

Si hay documentos fuente adicionales junto a la referencia de la EDT (RFP, BRD,
transcripciones) → activar skill `asdd-ba-specification-lead-extraccion`.

### Paso 3 — Crear o abrir el artefacto

- **Si el archivo no existe**: en **modo standalone**, copiar la tabla de metadatos de §0 del template y rellenar solo las secciones del alcance; rellenar el campo `INDEX de implementación` con la ruta al `{codigo}-index.md` del nodo. Las secciones NO delegadas (§5, §8–§13) quedan con el placeholder tal cual.
- **Si el archivo existe**: verificar estado en §0 antes de editar. Si está `APROBADA`, ir a "Gobernanza de CR" antes de cualquier Write.

### Paso 4 — Redactar secciones AF

Redactar en orden: §1, §2, §3, §4, §6, §7, §14.

**§3 — Trazabilidad:** declarar `Nodo EDT: {codigo}`, `Origen: standalone-AF` (o `run:{run_id}` si viene del ciclo del equipo) y `Fase`.

**§4 — Flujo de Negocio:** pasos numerados. Si el objeto principal tiene ciclo de vida propio → incluir máquina de estados (diagrama base). Si no aplica → declarar "No aplica" explícitamente.

**§6 — Reglas de Negocio:** si se activó `asdd-ba-specification-lead-extraccion`, transformar el inventario JSON intermedio en la tabla final del template. Mínimo 3 `RN-NNN [CORE]` + 1 `[EDGE]`. Cada una atomizada, verificable, en presente indicativo.

**§7 — RNFs de negocio:** los 5 RNFs obligatorios del template. Sin placeholders sin reemplazar.

**§14 — Decisiones y Gaps:** si hay vacíos de dominio → registrar cada uno como `GAP-NNN` con impacto concreto + mínimo opciones A y B. Si no hay → declarar "Sin decisiones ni gaps" explícitamente.


### Paso 4.1 — Diagrama de flujo Mermaid [OPCIONAL]

Activar si se cumple **alguna** de estas condiciones:
- El AF pidió explícitamente el diagrama de flujo.
- §4 tiene ≥3 pasos con al menos una bifurcación (condición, excepción o camino alternativo).
- El objeto principal tiene ciclo de vida propio y ya se incluyó máquina de estados en §4.

**Tipo de diagrama según el caso:**

| Caso | Tipo Mermaid | Cuándo usarlo |
|---|---|---|
| Flujo con pasos y decisiones | `flowchart TD` | El proceso tiene ramas o caminos alternativos |
| Ciclo de vida del objeto | `stateDiagram-v2` | El objeto pasa por estados (Borrador → Aprobado…) |

Si ambos aplican → incluir primero el `flowchart TD` y luego el `stateDiagram-v2`.

**Reglas:**
- Embebido en §4, inmediatamente después de los pasos numerados.
- Nodos de decisión con forma de diamante; pasos con rectángulo; estados con texto plano.
- Todo el texto en español, sin abreviaciones técnicas.
- Flujo estrictamente lineal (≤3 pasos sin bifurcaciones): NO generar diagrama — declarar `> Diagrama: no aplica — flujo lineal`.
- El diagrama es un espejo de los pasos escritos — ningún nodo que no esté en el texto numerado de §4.

### Paso 5 — Borrador de criterios de aceptación (condicional)

Si el feature es complejo y conviene anticipar el borrador para `spec-qa §10` →
activar skill `asdd-ba-specification-lead-gherkin`. El resultado va como
**anexo/nota** — NUNCA dentro de §10 del spec-funcional (esa sección es de otro dominio).

### Paso 6 — Levantar requerimientos formales (condicional)

Si el AF necesita un inventario FR/NFR formal antes de redactar §6/§7 →
activar skill `asdd-ba-requirements`.

### Paso 7 — Ejecutar el checklist de salida

Ver sección "Checklist de salida" abajo. No marcar como completo sin haberlo recorrido.

### Paso 8 — Registrar en change-log (obligatorio)

Activar skill `asdd-ba-change-log`:
- Al crear la spec (tipo `ESTADO`: `BORRADOR` creado).
- En cada versión corregida post-evaluación (tipo según sección modificada: `REGLA` / `FLUJO` / `ACTOR` / `RNF`).
- Ver `.claude/reference/ba/asdd-ba-change-log-contract.md`.

## Gobernanza de CR sobre SPEC APROBADA

Si la spec tiene `Estado: APROBADA` en §0 y se necesita modificar cualquiera de las
secciones AF:

1. **Declarar en el chat** antes del primer Edit/Write: `SPG-001 — CR-{NNN} iniciado. Motivo: {motivo}. Sección(es): {lista}`.
2. **Registrar el CR en §15** (Historial de Cambios Post-Aprobación) antes de editar el contenido.
3. **Incrementar `Versión` en §0**.
4. **Agregar marcador `[CR-NNN]` inline** en las líneas modificadas.
5. Luego aplicar los cambios de contenido.
6. Activar `asdd-ba-change-log` con el número CR en la descripción.

Sin este protocolo (SPG-001/SPG-002 en `.claude/references/rules/asdd-spec-guard.md`),
no proceder con la edición. Ver también `.claude/reference/ba/asdd-ba-specification-lead-iteracion.md`.

## Outputs post-aprobación

Tras aprobación de `asdd-ba-specification-auditor`:

- **DVF** — Documento de Validación Funcional para firma del negocio → activar skill `asdd-ba-client-validation`; tras confirmar guardado, invocar `asdd-ba-spec-index` (operación `update-artifact`, `tipo: DVF`, modo standalone AF).
- **HU** — Historia de Usuario para el backlog del equipo → activar skill `asdd-ba-user-story`; tras confirmar guardado, invocar `asdd-ba-spec-index` (operación `update-artifact`, `tipo: HU`, modo standalone AF).

En modo standalone AF, ambos se escriben dentro de la carpeta del nodo (`docs/specs/{codigo}-{slug}/`): DVF como `{codigo}-dvf-{slug}.md` y HU como `{codigo}-hu-{slug}.md`.

## Inputs esperados

- Referencia de la EDT: código de nodo hoja (1.X.Y) + nombre del spec + pregunta de negocio, provenientes de `asdd-ba-functional-architect`.
- Documentos fuente disponibles en `inputs/{feature}/` — opcionales.
- `spec-funcional-template.md` (skill `asdd-producto-templates`) — plantilla canónica.
- `docs/architecture/decisions/` — ADRs que puedan restringir el diseño funcional.

## Outputs

- Contenido funcional (§1–§4, §6, §7, §14, §15 si aplica) en `docs/specs/` (naming ART-001).
- Lista de gaps (§14) para `asdd-ba-functional-sme` o el cliente.
- Si se activó gherkin: borrador de escenarios como anexo — no en §10.
- Tras aprobación (standalone AF): DVF como `{codigo}-dvf-{slug}.md` y HU como `{codigo}-hu-{slug}.md` — dentro de la carpeta `docs/specs/{codigo}-{slug}/`.

## Checklist de salida

- [ ] §1, §2, §3, §4, §6, §7, §14 completos — sin placeholders del template sin reemplazar
- [ ] §5, §8, §9, §10, §11, §12, §13 **intactos** — ningún contenido propio en secciones de otros dominios
- [ ] §0: `Estado` correcto (`BORRADOR` en primera construcción); campo `INDEX de implementación` apuntando al `{codigo}-index.md` del nodo
- [ ] Skill `asdd-ba-spec-index` invocado: operación `create` en primera construcción del nodo, `update-artifact` en iteraciones (solo modo standalone AF)
- [ ] §3: campos `Nodo EDT`, `Origen` y `Fase` declarados
- [ ] §6: mínimo 3 `RN-NNN [CORE]` + 1 `[EDGE]`, atomizadas, verificables, en presente indicativo
- [ ] §7: los 5 RNFs de negocio obligatorios completos
- [ ] §14: cada gap con impacto + opciones A/B, o declaración "Sin gaps"
- [ ] §4: si el flujo tiene bifurcaciones → diagrama Mermaid incluido; si flujo lineal → declarar que no aplica
- [ ] §15: solo tocada si la spec estaba `APROBADA` y se siguió SPG-001/SPG-002
- [ ] Skill `asdd-ba-change-log` activado con el tipo correcto

## Anti-patterns

- **Redactar secciones de otro dominio "para completar"** — construir §8, §10 o §11 porque "faltaban". Genera dos fuentes de verdad. Reportar como nota para el AF.
- **Editar `{codigo}-index.md` directamente** — solo el skill `asdd-ba-spec-index` escribe este archivo. El INDEX del ciclo ASDD del equipo nunca se crea desde este agente.
- **SPEC sin flujo** — solo reglas sin modelar el proceso en §4.
- **Reglas embebidas en el flujo** — mezclar lógica de reglas dentro de los pasos de §4. Las reglas van en §6; el flujo las referencia.
- **Gaps sin opciones** — registrar `GAP-NNN` sin alternativas A/B.
- **Editar SPEC APROBADA sin CR** — cualquier cambio, por mínimo que sea, requiere SPG-001 antes de tocar el contenido.
