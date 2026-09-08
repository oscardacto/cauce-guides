# Smart Data → v2.24.0 — Plan de implementación

> **⚠ UBICACIÓN PROVISIONAL.** Hogar canónico: `docs/architecture/` o `docs/adoption/` (según elección del maintainer). Vive en `docs/adoption/` para bypassear los guards de WF-002/WF-003 mientras no hay run activo.

**Fase:** Diseñar (plan de implementación)
**Fecha:** 2026-07-02
**Autor:** sofka-asdd-solution-architect
**Rama de trabajo:** `feat/smart-data-integration` (contenido = template v2.24.0)
**Rama origen (READ-ONLY):** `.tmp/smart-data-branch/` (base v2.21.1, 282 commits de desfase)
**ADR de respaldo:** ADR-002 «smart-data flow isolation» (Aceptada — 4 decisiones locked). Vive en el repositorio del template ASDD; no se distribuye.
**Análisis previo:** `docs/adoption/smart-data-integration-analysis.md` (V1–V5)

> Este documento es el **plan** — NO implementa código. El orquestador lo convierte en plan-gate (ORC-010) para presentar al usuario y luego ejecuta por slices con delegación a los agentes correspondientes.

---

## A. Port de los 30 artefactos Data onto v2.24.0

### A.1 — Lista exacta de archivos a copiar desde el worktree

**A.1.1 — Agentes (3) → `.claude/agents/`**

| Archivo origen (worktree) | Destino v2.24.0 | Adaptación requerida |
|---|---|---|
| `.claude/agents/sofka-asdd-data-architect.md` | `.claude/agents/sofka-asdd-data-architect.md` | Reemplazar refs a `sofka-asdd-architect` (viejo nombre) por `sofka-asdd-solution-architect`. Agregar triggers negativos + cross-pointer (§B.1). Endurecer scope-check a `ESCALAMIENTO REQUERIDO` con recomendación explícita. |
| `.claude/agents/sofka-asdd-data-governance.md` | idem | idem — refs y triggers negativos hacia `sofka-asdd-security`. |
| `.claude/agents/sofka-asdd-data-eng-databricks.md` | idem | idem — refs y triggers negativos hacia `sofka-asdd-cloud-architect`. Confirmar que el Databricks AI Dev Kit (skills externos) sigue disponible en el entorno destino. |

**A.1.2 — Skills (4) → `.claude/skills/`**

| Directorio origen | Destino | Adaptación |
|---|---|---|
| `.claude/skills/sofka-asdd-data-discovery/` | idem | Auditar `SKILL.md` para refs cruzadas a rules del core del template — actualizar cualquier ref a nombre viejo. |
| `.claude/skills/sofka-asdd-data-architecture-design/` | idem | idem — verificar refs a `sofka-asdd-solution-architect-*` skills (numeración de ADR-001, artifact-name-guard). |
| `.claude/skills/sofka-asdd-data-governance-assessment/` | idem | idem — verificar template `data-dictionary-template.xlsx` se copia como binario. |
| `.claude/skills/sofka-asdd-data-contract/` | idem | idem. |

**A.1.3 — Reglas (6) → `.claude/rules/`**

Copiar tal cual, con adaptaciones:

- `sofka-asdd-data-routing.md` — reemplazar `sofka-asdd-architect` → `sofka-asdd-solution-architect` (D0 derivation). **Agregar sección de arbitraje ORC-001 ↔ D0-D7** (§C). **Agregar tabla de correspondencia D → fase ORC** (§C).
- `sofka-asdd-data-workflow.md` — auditar refs a `sofka-asdd-workflow.md` base (WF-001..006) por si cambiaron IDs entre v2.21.1 y v2.24.0.
- `sofka-asdd-data-schema-contracts.md` — copiar tal cual, verificar refs a `sofka-asdd-data-inter-contracts.md` (integridad del set).
- `sofka-asdd-data-inter-contracts.md` — idem.
- `sofka-asdd-data-lineage.md` — idem.
- `sofka-asdd-data-retention.md` — auditar cross-refs a la nueva regla `sofka-asdd-data-privacy-guard.md` si existiera; si no existe, marcar como TODO en el port (no bloquea si es aditivo).

**A.1.4 — Comandos (5) → `.claude/commands/sofka-asdd-data/`**

Copiar los 5 comandos (`discover`, `design`, `build`, `validate`, `publish`) tal cual. Auditar refs a agentes por nombre viejo dentro de la prosa del comando.

**A.1.5 — Configuración y auxiliares (2)**

- `.sofka-asdd/extract-xlsx.ps1` → copiar tal cual. **Gap conocido: solo Windows.** Marcar como cross-OS-limitation en el CLAUDE.md (Data section). Alternativa cross-OS queda como TODO fuera de este port.
- Sección **"Dominio de datos — Smart Data ASDD"** del `CLAUDE.md` de la rama → aplicar como parche sobre el `CLAUDE.md` v2.24.0 (§B.5), NO copiar el archivo completo.

**Total: 3 + 4 + 6 + 5 + 2 = 20 archivos "puros" copiables + 3 mods al core (§B) + actualización lock/contract + parche CLAUDE.md. Cuenta cerrada: 30 artefactos y modificaciones auxiliares alineadas con el "30/34 Data-owned + 3/34 core" verificado por el orquestador.**

### A.2 — Adaptaciones de refs / naming / convención v2.24.0

Auditoría automatizable con un solo grep antes del port:

```
grep -rn "sofka-asdd-architect\b" .tmp/smart-data-branch/.claude/{agents,skills,rules,commands}/*data*
```

Traducciones obligatorias (rename v2.11→v2.24):

| Ref vieja | Ref v2.24.0 |
|---|---|
| `sofka-asdd-architect` | `sofka-asdd-solution-architect` |
| `sofka-asdd-developer` (singular) | `sofka-asdd-developer-frontend` **o** `sofka-asdd-developer-backend` (según contexto — Data raramente los cita; si aparece, decidir por dominio de la ref) |
| Refs a `docs/architecture/decisions/ADR-001-*` (ADR viejo de codebase-size, ya removido) | Remover — ADR-001 vigente es `orc-enforcement-3-tiers` (interno del template, no distribuido) |
| Refs a rules ATF antiguas (si aparecieran) | mapear a `sofka-asdd-atf-web-*` o `sofka-asdd-atf-api-*` según corresponda |

Convención de naming ya cumple (`sofka-asdd-data-*` respeta el regex del `cli-contract.json` — check 14 pasará).

---

## B. Modificaciones al core (una por una)

### B.1 — Descripciones de agentes que colisionan

**Motivación:** Capa 1 del ADR — descripciones mutuamente excluyentes + triggers negativos + cross-pointer. Precedente: patrón ATF-web ↔ ATF-api ("NO para APIs REST → usar sofka-asdd-atf-api-qa-engineer"). Colisiones detectadas en v2.24.0: **3 pares** (no solo 1).

| Archivo | Cambio concreto | Por qué |
|---|---|---|
| `.claude/agents/sofka-asdd-solution-architect.md` (frontmatter `description`) | Después de "Fase principal: Diseñar." agregar: `"NO para arquitectura de plataformas de datos, lakehouse, Medallion, Star schema, ETL/ELT, Databricks, Data Lake, Data Warehouse → usar sofka-asdd-data-architect."` | Colisión primaria (V2 del análisis). Sin este trigger negativo, el orquestador auto-selecciona el architect base ante prompts de "arquitectura de data lake". |
| `.claude/agents/sofka-asdd-cloud-architect.md` (frontmatter `description`) | Agregar `"NO para pipelines Azure Databricks / AWS Glue / Auto Loader / Unity Catalog en dominio de ingeniería de datos → usar sofka-asdd-data-eng-databricks."` | Cloud-architect cubre Azure/AWS genérico; sin trigger, un pipeline Databricks matchea "Azure/AWS cloud" y aterriza en el agente equivocado. |
| `.claude/agents/sofka-asdd-security.md` (frontmatter `description`) | Agregar `"NO para governance de datos (PII por campo, retención por capa Medallion, contratos de datos inter-equipo, lineage analítico) → usar sofka-asdd-data-governance."` | Security cubre PII genérica; sin trigger, prompts de "PII en Silver" o "retención en Bronze" pueden aterrizar en security en vez del governance especializado. |
| Los 3 agentes Data (recíproco) | En `description` de cada uno agregar `"NO para {dominio ajeno}: arquitectura de software transaccional / CRUD / microservicios / OWASP genérico / FinOps cloud genérico → usar sofka-asdd-{solution-architect\|cloud-architect\|security}."` | Simetría de la Capa 1. Cierra la mis-selección Data → base también en runtime. |
| En la prosa de los 3 agentes base (`solution-architect`, `cloud-architect`, `security`) | Al inicio de "Cuándo NO invocar" agregar bloque `## Scope check recíproco (Capa 3 ADR-002)` con `"Si el request es de plataforma de datos (Medallion, lakehouse, Databricks, PII de datos, lineage, retención por capa) → reportar ESCALAMIENTO REQUERIDO / motivo: dominio_datos / recomendación: sofka-asdd-data-{X}."` | Capa 3 del ADR — cierra el gap unidireccional del scope-check actual (que hoy protege solo Data → base). |

**Nota:** los agentes que NO colisionan y NO se tocan: `tech-lead` (estándares/quality gate no colisiona con contratos de datos), `explorer` (mapea codebase, no compite semánticamente), `researcher` (colisión leve — se cubre con Capa 2, no requiere cambio de descripción), `producto`, `ux`, `ui`, `developer-*`, `devops-engineer`, `domain-expert`, `meta`, agentes ATF.

### B.2 — Hook `.claude/hooks/sofka-asdd-user-prompt-submit.mjs` (regex + rama de desambiguación)

**Motivación:** Capa 2 del ADR — transformar el hook de amplificador (V1) a árbitro.

**Cambios concretos:**

1. **Separar la regex `DATA_ARCH_RE` en 2 regex distintas**:
   ```js
   // Señales inequívocas de dominio DATOS (Medallion, lakehouse, plataforma analítica)
   const DATA_DOMAIN_RE = /\bdata\s*warehouse\b|\bdata\s*lake\b|\blakehouse\b|\bmedallion\b|\bdatabricks\b|\b(bronze|silver|gold)\s+(layer|tier|capa)\b|\bunity\s*catalog\b|\bauto\s*loader\b|\bbigquery\b|\bsnowflake\b|\bredshift\b|\bglue\b|\bathena\b|\betl\b|\belt\b|\bpipeline de datos\b|\bstar\s*schema\b|\bhechos y dimensiones\b/i;

   // Señales de ARQUITECTURA DE SOFTWARE (aplicación transaccional con persistencia)
   const SOFTWARE_ARCH_RE = /\bmicroservicios?\b|\bnueva api\b|\bcontrato api\b|\bapi\s*rest\b|\bbackend\b|\bm[oó]dulo transaccional\b|\bCRUD\b|\bmodelo de dominio\b|\bintegraci[oó]n de sistemas\b|\bescalabilidad\b|\b(stack|tecnolog[ií]a)\b/i;

   // "base de datos" queda deliberadamente FUERA de DATA_DOMAIN_RE — es señal de SOFTWARE_ARCH_RE (todo backend tiene BD).
   ```

2. **Actualizar la rama que hoy inyecta el mis-route**:
   - Si `DATA_DOMAIN_RE.test(prompt) && !SOFTWARE_ARCH_RE.test(prompt)` → inyectar `"DEBES enrutar a sofka-asdd-data-architect (o sofka-asdd-data-eng-databricks si hay señales de pipeline/build)."` — reemplaza al mensaje actual que llevaba al `solution-architect`.
   - Si `SOFTWARE_ARCH_RE.test(prompt) && !DATA_DOMAIN_RE.test(prompt)` → inyectar el reminder actual (`sofka-asdd-solution-architect`).
   - Si **ambos** matchean → nueva rama de desambiguación: inyectar `"## AMBIGÜEDAD DATOS↔SOFTWARE — el prompt matchea ambas taxonomías. ANTES de elegir agente, PREGUNTÁ al usuario UNA sola vez: '¿Este request es sobre plataforma de datos/analytics (Data), o arquitectura de software transaccional (Software)?'. Sin respuesta clara → repetir pregunta; NO auto-elegir."`

3. **Retro-compatibilidad:** conservar variable env `SOFKA_ASDD_DELEGATION_INJECT_DISABLE` intacta.

**Testing (§D):** cada rama con ≥2 casos + casos borde ("data warehouse migration → software CRUD" ambiguo).

### B.3 — Registro en tablas del `CLAUDE.md` raíz + `sofka-asdd-phases-reference.md` + routing

**Motivación:** compromiso entre auto-routing (D3) y reducción de superficie de auto-selección (V4 del análisis).

- **`CLAUDE.md` raíz — tabla de agentes disponibles:** los 3 agentes Data entran en la tabla principal (D1 exige "siempre presente"). Se agrega la columna "Dominio" para diferenciar `Core | ATF-API | ATF-Web | Data`. Descriptions cortas que incluyen los triggers negativos.
- **`CLAUDE.md` raíz — nueva sección "Dominio de datos — Smart Data ASDD":** parche que copia la sección de la rama pero **actualiza los 5 comandos como referencia inequívoca** y añade la tabla de correspondencia D → ORC (§C).
- **`.claude/rules/sofka-asdd-phases-reference.md`:** **NO agregar** los agentes Data como primarios de fases WF-xxx. Se agrega **una nota al pie**: `"Nota: los agentes sofka-asdd-data-* (dominio Smart Data) siguen su propio routing D0–D7 mapeado a las fases ORC vía sofka-asdd-data-routing.md. Ver ADR-002."` Motivo: registrarlos en las tablas WF sube la probabilidad de auto-selección genérica; el routing D0-D7 es el árbitro correcto.
- **`.claude/rules/sofka-asdd-routing-heuristics.md`:** agregar sección `## Arbitraje ORC-001 ↔ D0-D7 (ADR-002)` con la tabla de correspondencia (§C). Este es el punto único donde el orquestador aprende a arbitrar.

### B.4 — `cli-contract.json` — re-aplicar el addon `data_platform` sobre v2.24.0

**Motivación:** D4 — traer el addon como personalization, sin importar el `sofka-asdd-smart-data.lock` viejo.

Agregar al array `personalize[]` de `.sofka-asdd/cli-contract.json` v2.24.0 (justo después de `project-stack`):

```json
{
  "id": "data-platform",
  "file": ".sofka-asdd/sofka-asdd-smart-data.lock",
  "json_path": "data_platform",
  "prompt": "Plataforma de datos objetivo (informativo — no apaga el dominio Data)",
  "required": false,
  "type": "enum",
  "values": ["none", "azure-databricks", "aws", "other"],
  "default": "none"
}
```

Nota crítica: **el flag es informativo** (dice qué plataforma usa el cliente para que los agentes Data lo lean), NO enciende/apaga el dominio (D1). Se copia el `sofka-asdd-smart-data.lock` de la rama SOLO como esqueleto con `data_platform` y `model_strategy` del addon; los conteos `repository` se recalculan.

Además, agregar `docs/data/` al `create_dirs[]` con `gitkeep: true` como directorio de outputs de los agentes Data (equivalente a `docs/architecture/` para el architect base).

### B.5 — Actualizar `sofka-asdd.lock` v2.24.0 — conteos y sub_locks

**Cambios exactos:**

- `variants.claude.agents`: **17 → 20** (+3 Data)
- `variants.claude.rules`: **28 → 34** (+6 Data)
- `variants.claude.skills`: **142 → 146** (+4 Data)
- `variants.claude.commands`: **35 → 40** (+5 Data)
- `variants.claude.hooks`: **21 → 21** (sin cambio — solo se modifica el existente, no se añade uno nuevo)
- `capabilities[]`: agregar `"smart-data"` al array actual `["atf-api", "atf-web"]`
- `sub_locks`: agregar entrada `"sofka-asdd-smart-data"` con `path: ".sofka-asdd/sofka-asdd-smart-data.lock"` (patrón idéntico al de `sofka-asdd-atf-web`)
- **NO tocar** `version` (se mantiene `2.24.0` — el port es de una feature, no un release major; el bump lo decide el maintainer al mergear)
- `updated_at`: fecha del port

**Verificación mecánica:** el validador (`node .claude/scripts/validate-template.mjs`) valida la coherencia lock ↔ filesystem (memoria `installer-no-prune-orphans`). Baseline actual 30/0/0 → objetivo tras port 30/0/0 con conteos nuevos.

---

## C. El árbitro de routing (ORC-001 ↔ D0-D7)

**Regla de arbitraje** — vive en `sofka-asdd-routing-heuristics.md` y `sofka-asdd-data-routing.md` (sección espejo):

```
El orquestador arbitra en 2 pasos SIEMPRE:

Paso 1: ORC-001 → determinar FASE ASDD (Especificar…Documentar).
   Aplica el hook NÚCLEO ORC (v2.24.0 actual). No se toca.

Paso 2: si el request es de dominio Data (según señales de DATA_DOMAIN_RE del hook, o comando /sofka-asdd-data:*):
   D0-D7 → determinar SUB-FASE DATA (discover, design, build, validate, publish, governance)
   dentro de la fase ORC ya elegida. La tabla de correspondencia es obligatoria:

   D1 discover  → fase ORC "Especificar" (con soporte de "Analizar")
   D3 design    → fase ORC "Diseñar"
   D4 build     → fase ORC "Construir"
   D5 governance → transversal (cualquier fase ORC)
   D6 validate  → fase ORC "Verificar"
   D7 publish   → fase ORC "Verificar" (release-gate) o "Documentar"
   D0 (fuera)   → NO enrutar a Data; ORC-001 estándar.
```

**Regla de desempate:** si ORC-001 dijo "Diseñar" pero D0-D7 no matchea nada de Data → aplicar la regla WF-003 estándar (`solution-architect`). Si D0-D7 matchea múltiples tipos → aplicar Regla 3 de `sofka-asdd-data-routing.md` ("señales de múltiples tipos → preguntar UNA sola cosa").

**Sanity check para el orquestador:** cualquier turno donde D0-D7 se active DEBE también tener una fase ORC-001 explícita en el anuncio ORC-008 (`→ Orquestador ASDD — Ruta FULL → activando workflow ASDD fase {fase} + sub-flujo Data {D#}`). Sin ambos, el arbitraje está mal.

---

## D. Testing y validación

Matriz de tests **PRE-merge** — la mayoría son manuales de conversación (no unitarios), con excepción del validator + tests del hook.

### D.1 — Validador estático del template

```
node .claude/scripts/validate-template.mjs
```

- Baseline actual: 30 checks pass / 0 fail / 0 warn.
- **Objetivo post-port: idem 30/0/0.** Un check nuevo del validador podría ser deseable ("counts en `sofka-asdd.lock` coinciden con filesystem incluyendo Data") pero NO es prerrequisito del port — se puede sumar en una iteración posterior.
- Verifica naming-convention strict (check 14) — los 20 archivos Data cumplen el regex `^sofka-asdd-[a-z][a-z0-9-]*` por construcción.

### D.2 — Tests del hook (nuevo — recomendado si el equipo mantiene testing de hooks)

Test unit del `sofka-asdd-user-prompt-submit.mjs` con casos:

| Caso | Prompt | Rama esperada del hook | Reminder inyectado |
|---|---|---|---|
| Puro Data | "Diseñá el data lake de Medallion en Databricks" | Data | Enruta a `sofka-asdd-data-architect` |
| Puro Software | "Necesitamos un microservicio para el checkout" | Software | Enruta a `sofka-asdd-solution-architect` (comportamiento actual conservado) |
| Ambiguo | "Migrar la base de datos del CRM a un data warehouse" | Ambigüedad | Pregunta desambiguación |
| Vacío / genérico | "Ayudame con el proyecto" | Ninguna | Solo NÚCLEO ORC |
| Env off | Con `SOFKA_ASDD_DELEGATION_INJECT_DISABLE=1` | Exit 0 | Nada |

Framework sugerido: node `--test` (sin deps) o Vitest si el equipo ya lo usa.

### D.3 — Tests de no-interferencia (conversacionales)

Suite manual (o promptfoo si el equipo la usa) — el escenario que "ya falló con QA". Al menos un caso por par de colisión:

| # | Prompt | Agente que DEBE elegir el orquestador | Agente que NO debe elegir |
|---|---|---|---|
| N1 | "Diseñá la arquitectura del data lake Medallion en Databricks" | `sofka-asdd-data-architect` | `sofka-asdd-solution-architect` |
| N2 | "Diseñá los bounded contexts del sistema de facturación" | `sofka-asdd-solution-architect` | `sofka-asdd-data-architect` |
| N3 | "Armá el pipeline Bronze→Silver con Auto Loader" | `sofka-asdd-data-eng-databricks` | `sofka-asdd-cloud-architect` |
| N4 | "Diseñá el deployment de la app en EKS con VPC privada" | `sofka-asdd-cloud-architect` | `sofka-asdd-data-eng-databricks` |
| N5 | "Definí retención y clasificación PII de las tablas de clientes en Silver" | `sofka-asdd-data-governance` | `sofka-asdd-security` |
| N6 | "Auditá dependencias OWASP del servicio de pagos" | `sofka-asdd-security` | `sofka-asdd-data-governance` |
| N7 | "Migrar la base de datos del CRM a un data warehouse" | Orquestador PREGUNTA (rama de desambiguación) | Cualquier agente sin preguntar |

Criterio de pass: 7/7 con el agente correcto (y en N7 la pregunta explícita). Ejecutar en sesión limpia (post-`/clear`) para que el frontmatter cargue fresco.

### D.4 — Rendering de reglas y hooks activos

Verificar en runtime que `sofka-asdd-data-routing.md` se carga en el contexto del orquestador (grep sobre transcript). Verificar que el hook DATA/SOFTWARE actualizado dispara en los prompts de prueba.

### D.5 — Ejecución de comandos `/sofka-asdd-data:*`

Los 5 comandos deben aparecer en autocomplete. Cada uno se dispara una vez con un prompt mínimo para validar que el command handler está bien registrado (no ejecutar el flujo entero — solo confirmar activación).

### D.6 — Regresión de dominios existentes

Confirmar que ATF-API, ATF-Web, UX/UI, developer-*, y flujos ASDD estándar (specify/analyze/design/build/verify/document) **no se degradaron**. Ejecutar 1-2 prompts representativos de cada uno y confirmar auto-routing correcto.

---

## E. Estrategia de PRs — 4 slices encadenados

Los ~30 artefactos + mods core superan el budget de 400 líneas de review (GS-006 + `.claude/docs/`). Se parten en **4 slices** con dependencia lineal. Cada PR es reviewable en aislamiento pero el orden es obligatorio.

### PR 1 — Port aditivo puro (~800 líneas, low-risk)

**Contenido:**
- Los 20 archivos Data-owned (3 agentes + 4 skills + 6 reglas + 5 comandos + PS1 + skeleton `sofka-asdd-smart-data.lock`).
- Rename de refs a `sofka-asdd-architect` → `sofka-asdd-solution-architect` dentro de esos archivos (§A.2).
- Sin mods al core del template.
- Sin cambios en el CLAUDE.md raíz.

**Racional:** aterrizar el código Data en el repo sin activar mis-selección (los agentes existen pero el hook aún no los enruta). Falla segura: si algo se olvida, el impacto queda contenido.

**Testing:** solo D.1 (validador — objetivo 30/0/0). Los tests D.2-D.6 fallarían acá porque falta el core-side (por diseño — PR2 los desbloquea).

**Tamaño estimado:** ~800 líneas de código + docs, mayormente aditivo, sin diffs cross-file complicados.

### PR 2 — Mitigación core: descripciones + hook + routing (~250 líneas, HIGH-risk)

**Contenido:**
- §B.1: mods a `description` de `solution-architect`, `cloud-architect`, `security` (3 agentes base) + recíproco en los 3 agentes Data + scope-check con escalamiento en prosa (Capa 3).
- §B.2: hook `sofka-asdd-user-prompt-submit.mjs` — separar regex, agregar rama de desambiguación.
- §B.3: sección de arbitraje en `sofka-asdd-routing-heuristics.md` + nota al pie en `sofka-asdd-phases-reference.md`.
- §C: reglas de arbitraje ORC ↔ D0-D7 (aterriza en `data-routing.md` + `routing-heuristics.md`).

**Racional:** este es el PR crítico. Cambio quirúrgico y concentrado (~250 líneas). El review debe focalizarse en la regex y la rama de desambiguación del hook.

**Testing:** D.1 + D.2 (tests unitarios del hook) + D.3 (7 casos de no-interferencia) + D.4 + D.6. **Todos deben pasar antes de mergear.** Si N7 falla (desambiguación), es blocker.

### PR 3 — Registro en manifest y lock (~50 líneas, low-risk)

**Contenido:**
- §B.4: `cli-contract.json` — agregar `data-platform` en `personalize[]` + `docs/data/` en `create_dirs[]`.
- §B.5: `sofka-asdd.lock` — actualizar conteos (17→20 agents, 28→34 rules, 142→146 skills, 35→40 commands), agregar `smart-data` a `capabilities[]`, sumar sub_lock.
- Parche a `CLAUDE.md` raíz — nueva sección "Dominio de datos — Smart Data ASDD".

**Racional:** cambios de manifiesto/configuración pequeños pero visibles. Requieren revisión del maintainer para confirmar que la versión NO se bumpea y que los conteos son exactos.

**Testing:** D.1 (validador — conteos deben coincidir) + D.5 (los comandos aparecen en autocomplete).

### PR 4 — Documentación y CHANGELOG (~150 líneas, low-risk)

**Contenido:**
- Merge de los docs producidos por este agente:
  - `docs/adoption/ADR-002-smart-data-flow-isolation.md` → mover a `docs/architecture/decisions/ADR-002-smart-data-flow-isolation.md`.
  - `docs/adoption/smart-data-integration-analysis.md` → mover a `docs/architecture/smart-data-integration-analysis.md`.
  - `.claude/docs/adoption/smart-data-integration-plan.md` → conserva ubicación en `docs/adoption/` (es doc de adopción del template).
- Entrada en `ASDD-CHANGELOG.md`: `### [Unreleased] — feat(smart-data): integrate Smart Data domain (3 agents, 4 skills, 6 rules, 5 commands) with 3-layer disambiguation (ADR-002)`.
- Auditoría final de refs en toda la doc.

**Racional:** cierre documental, aislado del código.

**Testing:** D.1 (baseline final).

### Orden y dependencia

```
PR 1 (port aditivo) ── merge ──► PR 2 (mitigación core) ── merge ──► PR 3 (manifest/lock) ── merge ──► PR 4 (docs/changelog)
                                            ▲
                              todos los tests D deben pasar acá
                              antes de habilitar PR 3
```

**Regla de bloqueo:** si PR2 no pasa los 7 casos de D.3, se rediseña el hook antes de continuar — no se avanza a PR3 con PR2 parcial. El objetivo del port es cerrar V1+V2+V3, no solo portar los agentes.

---

## F. Riesgos residuales y decisiones menores pendientes

### F.1 — Riesgos residuales (mitigar o aceptar)

- **RR-1 — Frontmatter siempre cargado.** Claude Code no descarga agentes por regla. Los `description` Data están en contexto igual que el resto. Mitigación: descripciones estrechas + no registrar en tablas WF (V4) + escalamiento con recomendación. **Aceptado** — es la naturaleza del runtime.
- **RR-2 — Falso negativo del hook.** Un prompt de datos que use vocabulario no capturado por `DATA_DOMAIN_RE` (ej. "modelo dimensional" sin nombrar Star schema) puede no matchear y caer en `solution-architect`. Mitigación: los agentes base tienen scope-check recíproco y escalan → auto-correción. **Aceptado con auto-corrección**.
- **RR-3 — Falso positivo del hook.** Un prompt de software que use la palabra "ETL" en contexto no-analítico (ej. "necesito un ETL sencillo entre 2 tablas del microservicio") puede matchear Data y desambiguar. Mitigación: la rama de desambiguación pregunta antes de enrutar. **Aceptado — user-facing pregunta se activa**.
- **RR-4 — Databricks AI Dev Kit (skills externos).** El `data-eng-databricks` referencia skills que no viven en `.claude/skills/`. Si el kit no está instalado en el entorno del consumidor, el agente falla en runtime al invocar el skill. **Mitigación:** documentar en el CLAUDE.md sección Data que este agente requiere el kit externo (dependencia explícita). **Riesgo aceptado**, cubierto por doc.
- **RR-5 — PS1 solo Windows.** `extract-xlsx.ps1` no corre en macOS/Linux. Consumidores en esos OS pierden el Sync procedimiento del data-architect. **Mitigación:** marcar en CLAUDE.md; queda como TODO fuera de este port ofrecer un fallback cross-OS (posiblemente node + `xlsx` npm package).

### F.2 — Decisiones menores pendientes (no bloquean el port)

- **DM-1:** ¿Se agrega un check nuevo al `validate-template.mjs` que valide `capabilities[]` ↔ existencia de sub_locks? Recomendación: sí, en iteración posterior — no bloquea PR1-4.
- **DM-2:** ¿La nueva sección "Dominio de datos" del CLAUDE.md raíz vive antes o después de la sección ATF? Recomendación: después de ATF-Web, antes de "Estructura de documentación" — sigue orden alfabético de dominios (ATF < Data).
- **DM-3:** ¿El `sofka-asdd-smart-data.lock` v2.24.0 esqueleto incluye `model_strategy` propio (heredado de la rama v2.21.1) o se difiere a la resolución del `sofka-asdd.lock` base? Recomendación: heredar el `model_strategy` propio (opus para design/validate, sonnet para discover/build, haiku para publish) — es una decisión ya tomada por el owner del addon, no re-litigar.
- **DM-4:** ¿Se agrega `data-lineage-guard` o `data-privacy-guard` como hooks nuevos en algún futuro? **Fuera del alcance de este port** — se documenta en el CLAUDE.md sección Data como posible evolución.

---

## Resumen del plan

- **PR1** aterriza los 20 archivos Data (bajo riesgo).
- **PR2** aplica las 3 capas de mitigación en el core (alto riesgo, testing exhaustivo — 7 casos de no-interferencia).
- **PR3** actualiza manifest y lock counts (bajo riesgo, mecánico).
- **PR4** cierra la documentación y el changelog.

**Total: 4 PRs encadenados, ~1250 líneas de código+docs, con testing definido por slice. El PR2 es el gate crítico — sin sus 7 casos verdes, no avanza el port.**
