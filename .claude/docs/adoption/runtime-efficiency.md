# Runtime Efficiency v2 — guía de adopción y operación

## Qué cambia para el consumidor

Runtime Efficiency v2 reduce el overhead mecánico del template sin relajar
autorización, routing ni trazabilidad:

- una consulta local/acotada usa ruta `TRIVIAL` y cero subagentes;
- una auditoría amplia pero explícitamente read-only usa `LIGHT` aunque cite
  ADR/specs; `UserPromptSubmit` inyecta esta ruta determinista antes de tools;
- `LIGHT`, `MEDIUM` y `FULL` aplican budgets versionados de agentes, modelo,
  turnos y retries;
- un cambio `LIGHT atomic_scoped_change` conserva delegación, pero usa una
  autorización interna de cinco minutos, un solo uso y un único archivo
  existente; no presenta plan/challenge ni solicita `ok`;
- `PreToolUse` usa un dispatcher ASDD único para Bash/Write/Edit; collector y
  hooks externos conservan procesos independientes;
- el turno normal no repite el núcleo ORC;
- rules, capabilities y phase specs especializados se cargan en el punto de uso
  mediante readers/loaders verificables;
- `specify` inicializa o reutiliza el run antes del plan y reserva la ruta exacta
  del primer artefacto, de modo que todos los agentes reciben el mismo nombre;
- Sonnet es el default; high-risk escala a FULL/Opus antes de tools.

## Bootstrap y nombres universales de artefactos

Antes de construir el primer plan de una iniciativa, ejecutar:

```bash
node .claude/scripts/asdd-run-bootstrap.mjs \
  --feature aid-bancolombia \
  --phase specify \
  --artifact-dir docs/specs \
  --artifact-slug brief-aid-bancolombia
```

El helper es determinista e idempotente: crea o reutiliza `.asdd-run.json`,
persiste la política de nombres y devuelve `artifact_path`. Esa ruta exacta se
debe usar en el `scope` del challenge, en el plan aprobado y en el prompt del
agente. No se permiten fallbacks como `brief-cualquier-cosa.md`.

Todo archivo nuevo generado por agentes dentro de `docs/**` usa
`{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`. La regla cubre briefs, specs, ADRs,
diagramas, planes, reportes, evidencias y manifiestos; el código de
implementación fuera de `docs/**` queda excluido. Los artefactos legacy no se
renombran retroactivamente.

## Archivos operativos requeridos

El CLI debe copiar junto con hooks, agents y rules:

- `.claude/ba-steps/`;
- `.claude/references/`;
- `.claude/scripts/lib/`;
- `asdd-{artifact-name,run-bootstrap,commit-authorization,load-capability,
  plan-authorization,resolve-capability,resolve-rule,route-request}.mjs`;
- `validate-template.mjs`.

`cli-runtime-distribution` valida este contrato. Si falta un loader o una lib,
la adopción debe fallar antes de entregar un proyecto parcialmente funcional.

## Verificación post-instalación

```bash
node .claude/scripts/validate-template.mjs
printf '%s' '{"request":"¿dónde está health?"}' \
  | node .claude/scripts/asdd-route-request.mjs
node .claude/scripts/asdd-route-request.mjs \
  --file docs/contexto/prompts/00-auditoria-contexto.md
node .claude/scripts/asdd-resolve-rule.mjs \
  asdd-routing-heuristics
```

El primer comando termina con cero errores; el router devuelve `TRIVIAL`; el
resolver imprime un path dentro de `.claude/references/rules/`.

La variante `--file` es el diagnóstico read-only preferido: acepta únicamente
un path relativo dentro del proyecto y, si el documento contiene una sección
`Prompt para copiar`, enruta el bloque copiable en lugar de sus metadatos y
criterios externos.

## Budgets vigentes

| Ruta | Concurrentes máximos | Turnos | Retry |
|---|---:|---:|---:|
| TRIVIAL | 0 | — | 0 |
| LIGHT | 1 | 10–20 | 1 |
| MEDIUM | 2 | 20–35 primario; soporte según challenge | 1 por agente |
| FULL | 3 | 30–50 primario; soporte según challenge | 1 por slice |

El prompt del Agent debe incluir el marcador `ASDD-BUDGET` exacto emitido por
el challenge. Mismatch de agente, modelo, scope, capability o budget bloquea y
requiere plan nuevo.

Cuando un agente declara `capability`, su prompt de lanzamiento debe contener
el comando canónico
`node .claude/scripts/asdd-load-capability.mjs <capability>` y debe
ejecutarlo antes de cualquier operación protegida. El runtime acepta como
equivalente únicamente la ruta absoluta de ese mismo loader dentro del proyecto;
otra ubicación falla como `command-mismatch`. Sí admite un sufijo benigno sobre
esa invocación (`2>&1`, `2>/dev/null`, un pipe a `head`/`tail`/`sort`): la carga
se registra igual. Agentes overlay como Domain
Expert pueden participar sin inventar una capability. Para asesores acotados,
el plan usa `budget_class: support` en vez de inflar sus turnos al mínimo del
agente primario.

Los valores de la tabla son techos, no cuotas. TRIVIAL usa cero agentes;
LIGHT read-only con inventario cerrado también puede usar cero. Cambios LIGHT
y todo MEDIUM/FULL deben delegarse sin superar su máximo. El reporte operativo
separa `max_agents` de agentes realmente usados. Del mismo modo, SessionStart prueba únicamente la
inyección del núcleo compacto. Las rules nativas de `.claude/rules/` se
atribuyen al mecanismo always-on de Claude Code, no a SessionStart; una
referencia de `.claude/references/rules/` o capability especializada solo se
reporta como cargada cuando exista evidencia del resolver/loader.

En una auditoría LIGHT, resolver primero el índice y agrupar en un mismo turno
las lecturas independientes reduce reprocesamiento de contexto. El orden se
preserva en el análisis, y un checklist final prueba que el inventario quedó
completo; no se debe inferir completitud por haber leído solo los archivos más
relevantes.

## Métricas de referencia

En Linux WSL2, con 5 warm-ups y 30 muestras:

- always-on: `16.973 → 5.863` palabras;
- prompt normal: `145 → 0` palabras;
- auditoría read-only: `117` palabras de ruta/evidencia/batching mecánicos,
  p95 del hook `25,63 ms` (30 muestras, 5 warm-ups);
- procesos ASDD Bash/Edit: `7/8 → 1`;
- p95 fast-path: Bash `-36,69 %`, Edit `-39,52 %` frente a la cadena legacy;
- consumidor integral: `16/16`;
- eval real Opus/Sonnet: `4/4` cada uno.

Sonnet costó menos en la muestra diagnóstica, pero fue más lento y generó más
output. No se promete menor latencia del proveedor.

## Limitaciones y deuda visible

- Nueve agentes especializados permanecen sobre el target staged de eager
  skills; el validator los muestra como warnings, nunca como falsos PASS.
- Tool schemas, MCP schemas y contexto interno del proveedor no son observables.
- Antes de publicar un release se deben repetir las distribuciones de
  rendimiento en macOS y Windows nativos. Los fixtures Windows ejecutados en
  Linux prueban semántica de paths, no timing nativo.

## Troubleshooting

| Síntoma | Diagnóstico |
|---|---|
| `ERR_MODULE_NOT_FOUND` desde un hook | Revisar `.claude/scripts/lib/` y `cli-runtime-distribution`. |
| Rule/capability no disponible | Ejecutar su resolver; path inexistente debe fallar cerrado. |
| Agent bloqueado por budget | Leer el código diagnóstico (`launch-budget-mismatch`, `command-mismatch`, `authorization-expired` o `authorization-replay`) y comparar challenge, modelo, marcador y loader antes de emitir un plan nuevo. |
| Cambio LIGHT atómico pide challenge | Confirmar que el prompt resuelva exactamente un archivo existente y que el Agent use marcador `route=LIGHT`; scopes ambiguos fallan cerrado. |
| Más de un proceso ASDD por PreToolUse | Verificar registro del dispatcher y que la cadena legacy no esté activa. |
| Routing manual difiere del router | Usar la ruta inyectada por `UserPromptSubmit`; verificar con `route-request --file`. |
| Collector sin PostToolUse | Si ASDD denegó la tool es un Pre huérfano esperado; si la tool corrió, revisar collector. |

## Evidencia y decisiones

- Baseline final: `docs/baselines/asdd-runtime-baseline-final-v2.json`.
- Benchmark B9: `docs/baselines/2026-07-18-001-b9-runtime-integral.json`.
- Contexto/carga: ADR-017.
- Dispatcher: ADR-018.
- Model routing/subagentes: ADR-019.
