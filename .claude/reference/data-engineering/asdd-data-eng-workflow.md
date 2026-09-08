# Smart Data Workflow Rules

Define las 5 fases del flujo Smart Data ASDD y los **criterios formales de entrada y salida** de cada una. Orden secuencial por defecto:

```
discover → design → build → validate → publish
```

Claude usa esta rule para **verificar que el prerequisito de cada fase esté cumplido ANTES de proceder**. Si el prerequisito no está cumplido, no avanzar: indicar qué falta y sugerir qué correr primero. El usuario que prueba el sistema parte de cero — esta guía lo conduce activamente fase por fase.

## Cómo aplicar esta rule

Antes de ejecutar cualquier fase, Claude debe:

1. Identificar la fase solicitada a partir del prompt o del command `/asdd:data-{fase}`.
2. Verificar que existan los **artefactos de entrada** de esa fase (criterio de entrada).
3. Si falta un artefacto de entrada → **detener**, informar qué falta y sugerir la fase previa a correr.
4. Si la entrada está cumplida → ejecutar la fase con su agente primario.
5. Al terminar → validar que el **artefacto de salida** exista y esté completo antes de habilitar la siguiente fase.

> **Regla absoluta de prerequisitos**: nunca saltar una fase. Si el usuario pide `design` y no existe `smart-data-eng-discovery-{cliente}.md`, Claude responde qué falta y propone correr `discover` primero. No improvisar el artefacto faltante.

Convención de nombres: `{cliente}` es el slug del cliente en `snake_case` o `kebab-case` (ej. `fincondor`). Todos los artefactos viven bajo `docs/`.

---

## SD-001: DISCOVER — `/asdd:data-eng-discover`

Captura el contexto del proyecto de datos: fuentes, dominio, requisitos, restricciones y postura de gobernanza inicial. Agente primario: `asdd-data-architect` con soporte de `asdd-data-governance`.

| Criterio | Detalle |
|---|---|
| **Entrada** | Existe material de preventa (**Procedimiento A** — Documento de Preventa, brief, levantamiento previo) **O** hay acceso al equipo técnico del cliente post-firma (**Procedimiento B** — entrevistas, sesiones de discovery). Al menos uno de los dos debe estar disponible. |
| **Salida** | `docs/specs/smart-data-eng-discovery-{cliente}.md` y `docs/specs/smart-data-eng-governance-assessment-{cliente}.md` **validados** — ver definición operacional abajo. `docs/specs/smart-data-eng-dictionary-{cliente}.md` recomendado. |
| **Bloqueo** | Sin `smart-data-eng-discovery-{cliente}.md` o `smart-data-eng-governance-assessment-{cliente}.md` validados → **NO proceder a design**. Sin `smart-data-eng-dictionary-{cliente}.md` → design.md advierte e invita a completar el Procedimiento B, pero no bloquea. |

> **Definición operacional de "validado" (Procedimiento C — cierre de gaps):** un artefacto está validado cuando tiene **cero gaps `tipo_accion = conversation` sin resolver** y **cero gaps `Critical` abiertos**. Gaps `High`/`Medium`/`Low` y los de `tipo_accion = design-decision`/`build-task` pueden quedar abiertos con owner y fecha — no bloquean el avance a design, quedan documentados como puntos que design/build heredan. Gaps `human-approval` solo bloquean `publish`, nunca discover ni design. Ver Procedimiento C en `data-eng-discover.md` para el flujo de cierre.

> **Equivalente-brief de la rama Data (ADR-003):** los artefactos `smart-data-eng-*-{cliente}.md` de esta fase no dependen de un `brief-*.md` — su prerrequisito es el Excel de trabajo del cliente `docs/smart-data/data/smart-data-eng-{cliente}.xlsx` (derivado de la plantilla `smart-data-eng-cliente.xlsx`). El hook `asdd-pre-tool-use-analyze-guard` lo verifica mecánicamente antes de permitir `Write`/`Edit` sobre esos archivos. Ver `docs/adoption/ADR-003-domain-aware-analyze-guard.md` para el contrato completo (M1/M2/M3).

Si no hay ni preventa ni acceso al equipo técnico → no se puede hacer discovery. Informar al usuario que debe conseguir uno de los dos antes de continuar.

---

## SD-002: DESIGN — `/asdd:data-eng-design`

Construye el modelo conceptual de datos **y** la arquitectura técnica en tres pasos: **PASO A** (modelo conceptual + propuesta, sin generar archivos), **PASO B** (resolución interactiva de puntos abiertos uno por vez — una pausa genera un draft del spec para poder retomar), **PASO C** (aprobación + generación o actualización del spec). Agente primario: `asdd-data-architect` con soporte de `asdd-data-governance` para los contratos. Modelo recomendado: `opus`.

| Criterio | Detalle |
|---|---|
| **Entrada** | `docs/specs/smart-data-eng-discovery-{cliente}.md` existe (**obligatorio**). `docs/specs/smart-data-eng-governance-assessment-{cliente}.md` y `docs/specs/smart-data-eng-dictionary-{cliente}.md` recomendados — el arquitecto los usa en PASO A para consolidar PII, restricciones de compliance y verificar tipos contra el origen. |
| **Salida** | `docs/architecture/smart-data-eng-design-{cliente}.md` con `Estado: approved` (incluye tabla de puntos abiertos y modelo conceptual) + al menos **un contrato Silver** en `docs/specs/contracts/`. Los contratos pueden generarse en la misma sesión o en una sesión posterior al spec, pero deben existir antes de `build`. |
| **Bloqueo** | Sin `smart-data-eng-discovery-{cliente}.md` → **NO proceder**. Spec con `Estado: draft` → **NO proceder a build**. Sin salida de design completa → **NO proceder a build**. |

El `smart-data-eng-design-{cliente}.md` es **el contrato de implementación**: build se ejecuta estrictamente contra él. Sin `Estado: approved` en el spec, no se habilita build. El contrato Silver fija el schema esperado (incluyendo `schemaHints` obligatorios) que validate verificará después.

---

## SD-003: BUILD — `/asdd:data-eng-build`

Implementa los pipelines siguiendo arquitectura Medallion. Es la única fase donde opera el agente especialista de plataforma. Agente primario: `asdd-data-eng-databricks` (requiere MCP Databricks activo). Modelo recomendado: `sonnet`.

| Criterio | Detalle |
|---|---|
| **Entrada** | `smart-data-eng-design-{cliente}.md` existe y está **aprobado** + contratos Silver disponibles en `docs/specs/contracts/` + **MCP Databricks activo**. |
| **Salida** | Pipelines implementados (Bronze → Silver → Gold) + Jobs serverless configurados + entregable según modo acordado en el spec (DABs / scripts .py / SDP standalone) + `docs/specs/smart-data-eng-build-run-{cliente}.md` con corridas registradas. |
| **Bloqueo** | Sin salida de build → **NO proceder a validate**. |

---

## SD-004: VALIDATE — `/asdd:data-eng-validate`

Verifica que lo construido respeta el `smart-data-eng-design` y los contratos Silver. Requiere doble sign-off: arquitectura + governance. Agentes primarios: `asdd-data-architect` + `asdd-data-governance` (en paralelo).

| Criterio | Detalle |
|---|---|
| **Entrada** | `docs/specs/smart-data-eng-build-run-{cliente}.md` con al menos una corrida `SUCCEEDED` por cada pipeline del spec, sin corridas `FAILED` o `ERROR_PRE_RUN` sin `SUCCEEDED` correspondiente + `smart-data-eng-design-{cliente}.md` aprobado + contratos Silver disponibles. |
| **Salida** | Reporte de validación arquitectónica + governance sign-off con semáforo R/A/G + `docs/specs/smart-data-eng-validate-signoff-{cliente}.md`. |
| **Bloqueo** | Gaps críticos o FAIL en cualquiera de los dos sign-offs → **NO proceder a publish**. Ámbar requiere decisión explícita documentada. Sin doble PASS → **NO proceder**. |

---

## SD-005: PUBLISH — `/asdd:data-eng-publish`

Cierre del ciclo en el ambiente de desarrollo/QA del cliente y preparación del entregable para handoff al equipo DevOps. Agentes: `asdd-data-eng-databricks` (verificación final) + `asdd-data-governance` (cierre governance) + `asdd-data-architect` (cierre spec).

| Criterio | Detalle |
|---|---|
| **Entrada** | `docs/specs/smart-data-eng-validate-signoff-{cliente}.md` con `Estado: PASS`. Sin ese archivo o con `Estado: FAIL` → **no proceder**. |
| **Salida** | Entregable validado en dev/QA + `smart-data-eng-design` actualizado al estado productivo + governance assessment final + diccionario de datos actualizado + contratos vigentes + `_client_repo/` sincronizado (databricks.yml + resources/ + src/ + README.md). |
| **Bloqueo** | Gaps críticos pendientes → **NO publicar**. Tablas PII sin retención definida → **NO publicar** (regla absoluta de retención). |

