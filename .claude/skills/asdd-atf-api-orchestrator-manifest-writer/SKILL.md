---
name: asdd-atf-api-orchestrator-manifest-writer
description: Escribe el run-manifest.md canónico consolidando bootstrap, partición y dependencias del run ATF API.
used_by:
  - asdd-atf-api-orchestrator
---

## Propósito

Generar `docs/testing/atf/{run_id}/run-manifest.md` — el **documento maestro de la corrida**. Es la fuente única de verdad para:

- Qué se va a probar (Work Items)
- En qué orden (dependencias y niveles topológicos)
- Con qué insumos (inventario de requirements/)
- Qué preguntas están abiertas (Q-NNN)
- Qué pasos están activos vs `skipped`

Los agentes hijos (Steps 1-7) leen este manifest al inicio y NO releen `appapi.yaml` ni `asdd-atf.lock` — el manifest contiene un snapshot suficiente del session_config.

## Cuándo invocar

Tras `dependency-mapper`. Cuarto y último skill del orquestador en bootstrap.

También se invoca en variantes:
- `regression` / `fast-track` → escribir manifest con anotación de herencia del baseline
- `retest` → manifest simplificado con scope de 1 defecto

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `bootstrap_context` | object | Output de `run-bootstrap` |
| `partition_result` | object | Output de `work-item-partitioner` |
| `dependency_map` | object | Output de `dependency-mapper` |
| `session_config` | object | De `shared-config-loader` |
| `open_questions` | array | Preguntas críticas detectadas |

## Estructura canónica del run-manifest.md

```markdown
# Run Manifest — {run_id}

**Generado por:** asdd-atf-api-qa-engineer (Fase 1 — Bootstrap)
**Fecha de creación:** {ISO date}
**Estado inicial:** `{ready | needs_info | blocked}`
**Tipo de ciclo:** {baseline | regression | fast-track | retest}

---

## 1. Resumen de la Corrida
[tabla con run_id, app.url, version, environment, auth, baseline_run_id si aplica]

## 2. session_config (snapshot)
[JSON con campos requeridos para agentes hijos]

## 3. Inventario de Entradas
[tabla SRC-NNN con archivos y utilidad]

## 4. Partición en Work Items
[criterio de partición + tabla de WIs]

## 5. Dependencias y Orden de Activación
[grafo en ASCII + niveles topológicos + plan de paralelismo por step]

## 6. Plan de Activación de Steps
[tabla con step_id, agente, switch en appapi.yaml, estado: enabled/skipped, orden]

## 7. Track Inicial de Work Items
[tabla con wi_id y track esperado: full_pipeline | regression_minor | fast_track | retest_only]

## 8. Preguntas Abiertas Consolidadas
[tabla Q-NNN con criticidad y bloqueo]

## 9. Protocolo de Rate Limit
[snippet con instrucción al pausar — copiado de la regla rate-limit-protocol]

## 10. Próximo Paso Recomendado
[acción concreta + comando si aplica]
```

## Proceso

1. Validar inputs completos. Si falta alguno → fail (`MAN-001`).
2. Resolver el `estado inicial`:
   - `ready` — sin preguntas críticas bloqueantes, todos los WIs ready
   - `needs_info` — preguntas medias pendientes, pero la corrida puede iniciar
   - `blocked` — preguntas críticas que impiden Step 2 o Step 3 — escalar al usuario
3. Renderizar cada sección desde el template.
4. Asegurar **idempotencia**: escribir `run-manifest.md.tmp` y renombrar (mismo patrón de `shared-checkpoint-manager`).
5. Invocar `shared-checkpoint-manager → create(run_id, initial_state)` con `status: in_progress`.
6. Devolver:
   ```json
   {
     "manifest_path": "docs/testing/atf/{run_id}/run-manifest.md",
     "checkpoint_initialized": true,
     "initial_state": "ready | needs_info | blocked",
     "ready_to_dispatch_step_1_and_step_2": true
   }
   ```

## Reglas de redacción

- **Idioma:** español (campo `document_output_language` del session_config).
- **Tono:** profesional, claro, directo, preciso y conciso (campo `style_of_communication`).
- **Tablas:** preferir Markdown nativo. Una columna por dimensión, sin nesting.
- **JSON embebido:** bloques ` ```json` para `session_config`. No mezclar con texto narrativo.
- **Citas literales** de la HU/Swagger entre comillas dobles.
- **Sin acentos en identificadores técnicos** (`wi-001`, no `wi-ñ001`).

## Errores comunes

| Código | Causa |
|---|---|
| `MAN-001` | Falta `partition_result` o `dependency_map` — invocar antes los skills correspondientes |
| `MAN-002` | `output_folder/{run_id}/` no existe — bootstrap debió crearlo |
| `MAN-003` | Intento de escribir manifest cuando `checkpoint.json → status: completed` — sospecha de bug, no sobreescribir |

## Cuándo NO invocar

- Solo se quiere consultar un manifest existente — leer con `Read`
- Tarea LIGHT — no genera manifest formal
- Reanudación de corrida — el manifest ya existe, no se sobreescribe

## Anti-patterns

- **Re-leer `appapi.yaml` desde este skill.** Todo el config llega como input.
- **Embeber lógica de partición** aquí. Este skill solo formatea — la decisión es del `work-item-partitioner`.
- **Sobreescribir el manifest** si ya existe. Si hace falta corregir, hacer git history visible (escribir `run-manifest.md` + `run-manifest.previous.md` con la versión anterior).
- **Omitir el snapshot de session_config.** Los hijos necesitan acceso a `app.url`, `cycle.type`, `model_strategy_resolved` sin tener que cargar `appapi.yaml` de nuevo.

## Referencias

- Template Markdown: `templates/run-manifest.template.md`
- Ejemplo realista: `examples/example-run-manifest-clienteejemplo.md`
