---
name: asdd-atf-api-shared-config-loader
description: Carga única de appapi.yaml, credentials.yaml y asdd-atf.lock. Devuelve session_config y redacta credenciales.
used_by:
  - asdd-atf-api-orchestrator
  - asdd-atf-api-step-1-requirement-review
  - asdd-atf-api-step-2-api-context
  - asdd-atf-api-step-3-test-plan
  - asdd-atf-api-step-4-test-cases
  - asdd-atf-api-step-5-automation
  - asdd-atf-api-step-6-execution
  - asdd-atf-reporting-qa-engineer
  - asdd-atf-api-security
  - asdd-atf-api-performance
---

## Propósito

Centralizar la lectura de configuración del framework. Ningún agente debe leer `appapi.yaml`, `credentials.yaml` o `asdd-atf.lock` directamente — todos invocan a este skill y reciben un `session_config` normalizado.

**Por qué centralizar:** garantiza consistencia (todos los agentes ven los mismos valores), evita duplicar lógica de defaults, y permite redactar credenciales en un solo lugar antes de exponerlas en logs o evidencias.

## Cuándo invocar

- Al inicio de cualquier step (carga inicial)
- Al reanudar una corrida desde checkpoint
- Cuando un sub-skill necesita la URL base, credenciales redactadas o el `model_strategy`

## Inputs

| Parámetro | Tipo | Default | Descripción |
|---|---|---|---|
| `project_root` | string | `cwd` | Raíz del proyecto |
| `agent_name` | string | requerido | Nombre del agente que invoca (para resolver `agent_pinning`) |
| `phase` | string | requerido | Fase actual (`bootstrap` \| `analyze` \| `design` \| `automate` \| `execute` \| `report`) |
| `skill_name` | string | opcional | Skill que invoca (para resolver `skill_override`) |
| `redact_credentials` | boolean | `true` | Si `true`, devuelve credenciales como `{credentials.{ROLE}}` placeholders |

## Proceso

1. **Resolver paths:**
   - `{project_root}/docs/testing/atf/config/appapi.yaml`
   - `{project_root}/docs/testing/atf/config/credentials.yaml` (puede no existir)
   - `{project_root}/.asdd/asdd-atf.lock`
   - `{project_root}/.asdd/testing-capabilities.yaml`

2. **Cargar y parsear** los 4 archivos. Si alguno requerido falta, retornar error explícito con el path buscado.

3. **Validar `appapi.yaml`:**
   - `app.url` no vacío y bien formado
   - `cycle.type` ∈ `{baseline, regression, fast-track, retest}`
   - Si `cycle.type` ≠ `baseline` → `cycle.baseline_run_id` requerido
   - Si `cycle.type` == `retest` → `cycle.defect_id` requerido

4. **Resolver `run_id`:**
   - Si `appapi.yaml → run_id` no vacío → usar ese
   - Si vacío → derivar `{app.name-kebab}-v{app.version}-{YYYYMMDD}-{HHmm}`

5. **Resolver modelo** según cadena `skill_override > agent_pinning > phase_default > frontmatter`:
   - Si `skill_name` y `lock.model_strategy.skill_override[skill_name]` existe → usar ese
   - Sino, si `lock.model_strategy.agent_pinning[agent_name]` existe → usar ese
   - Sino, `lock.model_strategy.phase_default[phase]`
   - Sino, mantener el `model:` del frontmatter del agente (no override)

6. **Construir `session_config`:**
   - Si `redact_credentials: true`, sustituir cada password/token por placeholder `{credentials.{ROLE}}`
   - Calcular `output_folder` = `{project_root}/docs/output/{run_id}`
   - Cachear el resultado durante la corrida (key = `run_id`)

## Output

```json
{
  "run_id": "PruebaAPIClienteEjemplo-v1.0-20260521-1030",
  "project_root": "C:/.../ATF-API",
  "output_folder": "C:/.../ATF-API/docs/output/PruebaAPIClienteEjemplo-v1.0-20260521-1030",
  "knowledge_base_path": "C:/.../ATF-API/docs/output/knowledge",
  "app": {
    "name": "Prueba API ClienteEjemplo",
    "url": "https://api-qa.example.com/v1",
    "version": "v1.0",
    "environment": "qa"
  },
  "cycle": {
    "type": "baseline",
    "baseline_run_id": null,
    "defect_id": null
  },
  "auth": {
    "requires_auth": false,
    "default_role": null,
    "additional_roles": []
  },
  "functional_docs": {
    "folder": "C:/.../ATF-API/docs/requirements",
    "primary_files": []
  },
  "optional_pipelines": {
    "security": false,
    "performance": false
  },
  "test_run": {
    "mode": "full",
    "custom_tags": [],
    "custom_flow_scope": "all"
  },
  "credentials": {
    "_redacted": true,
    "_note": "Use {credentials.{ROLE}} references in artifacts. Real values resolved at runtime by Step 5 via env vars.",
    "available_roles": ["admin", "standard_user"],
    "base_url": "https://api-qa.example.com/v1"
  },
  "model_strategy": {
    "resolved_model": "sonnet",
    "resolution_source": "agent_pinning",
    "skill_override": {},
    "agent_pinning": {"asdd-atf-api-orchestrator": "sonnet"},
    "phase_default": {"bootstrap": "sonnet", "...": "..."}
  },
  "routing": {
    "mode": "adaptive",
    "always_full": false,
    "hard_exclusions": ["auth", "pagos", "PII", "compliance", "contratos-publicos"]
  },
  "testing_capabilities": {
    "runner": {"command": "bun test", "framework": "Bun + Playwright TS"},
    "api_specific": {"...": "..."}
  },
  "loaded_at": "2026-05-21T10:30:00-05:00",
  "loaded_by": "asdd-atf-api-orchestrator"
}
```

## Errores comunes

| Error | Mensaje | Recuperación |
|---|---|---|
| `appapi.yaml` no existe | `CONFIG-001: appapi.yaml no encontrado en {path}` | Crear desde `appapi.yaml.example` o solicitar al usuario |
| `app.url` vacío o malformado | `CONFIG-002: app.url inválido o vacío en appapi.yaml` | Escalar al usuario |
| `cycle.type` inválido | `CONFIG-003: cycle.type "{value}" no válido. Esperado: baseline\|regression\|fast-track\|retest` | Escalar al usuario |
| Falta `baseline_run_id` para regression/fast-track/retest | `CONFIG-004: cycle.type "{type}" requiere cycle.baseline_run_id` | Escalar al usuario |
| `credentials.yaml` no existe pero `requires_auth: true` | `CONFIG-005: credentials.yaml requerido pero no encontrado` | Crear desde `.example` o desactivar `requires_auth` |

## Cuándo NO invocar

- Necesitas leer un artefacto generado (no config) — usar `Read` directo sobre el path
- Necesitas escribir config — este skill es solo lectura; usar `Edit` con cuidado, o (mejor) regenerar via dashboard

## Anti-patterns

- **Releer `appapi.yaml` directamente desde un agente** — usar siempre este skill. Si el dashboard sobreescribe el yaml mientras la corrida está activa, la cache evita inconsistencias.
- **Devolver credenciales en plano por defecto** — `redact_credentials: true` es el default por seguridad. Solo Step 5 (al escribir env vars en runtime) puede pedir `false`, y aún así nunca persistirlas en disco.
- **Inventar defaults silenciosamente** — si falta un campo requerido, fallar con `CONFIG-XXX` explícito.
- **Hardcodear paths** — todo path se deriva de `project_root` para soportar el portado al template base.

## Referencias

- Templates de retorno: `templates/session-config.template.json`
- Ejemplo realista: `examples/example-session-config.json`
- Reglas relacionadas: `.claude/rules/asdd-atf-api-qa-engineer.md (embedded: ATF API Orchestration Rules) → ORC-002` (resolución de modelo)
