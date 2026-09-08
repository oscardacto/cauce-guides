# Run Manifest — 2026-07-18-001

| Campo | Valor |
|---|---|
| run_id | `2026-07-18-001` |
| status | complete |
| Inicio | 2026-07-18 12:21 UTC |

## Artefactos por fase

### Fase: specify (complete)

**Completados:** auditoría técnica persistida, baseline v2 procesable creado, brief Runtime Efficiency v2 redactado

- `docs/tech/2026-07-18-001-SPECIFY-001-runtime-performance-audit.md`
- `docs/baselines/asdd-runtime-baseline-v2.json`
- `docs/specs/2026-07-18-001-SPECIFY-002-brief-runtime-efficiency-v2.md`

### Fase: analyze (complete)

**Completados:** spec funcional redactado, spec backend/runtime redactado, spec seguridad redactado, spec QA redactado, INDEX incremental redactado

- `docs/specs/2026-07-18-001-ANALYZE-003-runtime-efficiency-v2-funcional.md`
- `docs/specs/2026-07-18-001-ANALYZE-004-runtime-efficiency-v2-backend.md`
- `docs/specs/2026-07-18-001-ANALYZE-005-runtime-efficiency-v2-seguridad.md`
- `docs/specs/2026-07-18-001-ANALYZE-006-runtime-efficiency-v2-qa.md`
- `docs/specs/2026-07-18-001-ANALYZE-007-runtime-efficiency-v2-index.md`

### Fase: design (complete)

**Completados:** SPIKE-1 contexto y fan-out completados; latencia secuencial invalidada para runtime, SPIKE-1R-A baseline paralelo y análisis collector completados, SPIKE-1R-B prototipo dispatcher, benchmark, diferencial y collector completados, D1 propuesta ADR-017 y Enmienda 2 de ADR-005 redactadas, D2 ADR-018 lista para aprobación, D3 propuesta ADR-019 redactada, D1-D3 y Enmienda 2 aprobados explícitamente por el usuario

- `docs/tech/2026-07-18-001-DESIGN-008-runtime-efficiency-spike-benchmark.md`
- `docs/baselines/2026-07-18-001-spike-1-runtime-benchmark.json`
- `docs/architecture/decisions/ADR-017-presupuesto-efectivo-y-carga-contextual.md`
- `docs/architecture/decisions/ADR-018-dispatcher-consolidado-de-hooks.md`
- `docs/architecture/decisions/ADR-019-routing-de-modelos-y-presupuesto-de-subagentes.md`
- `docs/adoption/ADR-005-conditional-rule-loading.md`
- `docs/tech/2026-07-18-001-DESIGN-009-runtime-efficiency-spike-1r.md`
- `docs/baselines/2026-07-18-001-spike-1r-parallel-hooks.json`
- `.claude/scripts/benchmark-pretool-hooks.mjs`
- `docs/baselines/2026-07-18-001-spike-1r-dispatcher-prototype.json`
- `.claude/scripts/sofka-asdd-pre-tool-dispatcher-prototype.mjs`
- `.claude/scripts/test-pretool-dispatcher-prototype.mjs`
- `.claude/scripts/test-dispatcher-collector-coexistence.mjs`

### Fase: build (complete)

**Completados:** SPIKE-1 contexto/fan-out: reconciliado con INDEX, SPIKE-1R dispatcher: reconciliado con INDEX, D1: ADR-017 y Enmienda 2 de ADR-005 aprobados, D2: ADR-018 aprobado tras SPIKE-1R-B, D3: ADR-019 aprobado, S1: contrato de seguridad, corpus diferencial y rollback cerrados, B1: parser YAML compartido y gate de contexto efectivo por capas, B2: reconciliación consciente de fase y H-09 corregido, B3: dispatcher único PreToolUse, DFX-001 y rollback cerrados, B4: routing e inyección ORC condicional con turno normal de cero palabras

- `docs/tech/2026-07-18-001-BUILD-010-runtime-efficiency-s1-security-contract.md`
- `.claude/hooks/sofka-asdd-pre-tool-use-dangerous-bash.mjs`
- `.claude/scripts/fixtures/sofka-asdd-pretool-dispatcher-s1.json`
- `.claude/scripts/test-pretool-dispatcher-contract.mjs`
- `.claude/scripts/test-pretool-dispatcher-prototype.mjs`
- `docs/tech/2026-07-18-001-BUILD-011-runtime-efficiency-b1-context-budget.md`
- `docs/baselines/2026-07-18-001-b1-context-budget.json`
- `.claude/scripts/lib/sofka-asdd-frontmatter-lib.mjs`
- `.claude/scripts/lib/sofka-asdd-context-budget-lib.mjs`
- `.claude/scripts/test-frontmatter-parser.mjs`
- `.claude/scripts/test-context-budget.mjs`
- `.claude/scripts/sofka-asdd-runtime-metrics.mjs`
- `.claude/scripts/validate-template.mjs`
- `.sofka-asdd/context-budget.json`
- `docs/baselines/asdd-runtime-baseline.json`
- `docs/tech/2026-07-18-001-BUILD-012-runtime-efficiency-b2-phase-reconciliation.md`
- `docs/baselines/2026-07-18-001-b2-reconciliation-matrix.json`
- `.claude/scripts/lib/sofka-asdd-run-reconciliation-lib.mjs`
- `.claude/scripts/sofka-asdd-reconcile-run-state.mjs`
- `.claude/scripts/test-reconcile-run-state.mjs`
- `.sofka-asdd/asdd-run.schema.json`
- `docs/tech/2026-07-18-001-BUILD-013-runtime-efficiency-b3-pretool-dispatcher.md`
- `docs/baselines/2026-07-18-001-b3-pretool-dispatcher.json`
- `.claude/hooks/sofka-asdd-pre-tool-dispatcher.mjs`
- `.claude/scripts/fixtures/sofka-asdd-pretool-legacy-hooks.json`
- `.claude/scripts/sofka-asdd-pretool-mode.mjs`
- `.claude/scripts/test-pretool-dispatcher.mjs`
- `.claude/scripts/test-dispatcher-dfx-001.mjs`
- `.claude/scripts/test-pretool-dispatcher-registration.mjs`
- `docs/tech/2026-07-18-001-BUILD-014-runtime-efficiency-b4-conditional-orc-injection.md`
- `docs/baselines/2026-07-18-001-b4-conditional-orc-injection.json`
- `.claude/hooks/sofka-asdd-user-prompt-submit.mjs`
- `.claude/scripts/test-conditional-orc-injection.mjs`
- `.claude/scripts/benchmark-prompt-injection.mjs`
- `docs/tech/2026-07-18-001-BUILD-015-runtime-efficiency-b5-always-on-rules.md`
- `docs/baselines/2026-07-18-001-b5-always-on-rules.json`
- `.sofka-asdd/rule-loading.json`
- `.claude/scripts/test-conditional-rule-loading.mjs`
- `.claude/scripts/test-rule-resolver.mjs`
- `docs/tech/2026-07-18-001-BUILD-016-runtime-efficiency-b6-lazy-capabilities.md`
- `docs/baselines/2026-07-18-001-b6-lazy-capabilities.json`
- `.sofka-asdd/capability-loading.json`
- `.claude/scripts/test-lazy-capability-loading.mjs`
- `docs/tech/2026-07-18-001-BUILD-017-runtime-efficiency-b7-thin-coordinators.md`
- `docs/baselines/2026-07-18-001-b7-thin-coordinators.json`
- `.sofka-asdd/coordinator-loading.json`
- `.claude/scripts/test-thin-coordinator-loading.mjs`
- `docs/tech/2026-07-18-001-BUILD-018-runtime-efficiency-b8-model-routing-subagent-budgets.md`
- `docs/baselines/2026-07-18-001-b8-model-routing-subagent-budgets.json`
- `.sofka-asdd/subagent-budget.json`
- `.claude/scripts/test-subagent-budget-routing.mjs`
- `.claude/scripts/benchmark-subagent-budget.mjs`
- `docs/tech/2026-07-18-001-BUILD-019-runtime-efficiency-b9-integral-benchmark.md`
- `docs/baselines/2026-07-18-001-b9-runtime-integral.json`
- `.claude/scripts/benchmark-runtime-integral.mjs`
- `.claude/scripts/eval-orchestrator-model-routing.mjs`
- `.claude/scripts/test-runtime-efficiency-consumer-e2e.mjs`
- `.claude/scripts/test-runtime-efficiency-nested-git-consumer.mjs`

### Fase: verify (complete)

**Completados:** B9 gates locales 6/6 y consumidor integral 16/16 verificados, routing y seguridad sin regresiones, consumidor CLI materializado solo desde distribution[]

- `docs/baselines/2026-07-18-001-b9-runtime-integral.json`
- `.claude/scripts/test-runtime-efficiency-consumer-e2e.mjs`
- `.claude/scripts/test-cli-runtime-distribution.mjs`

### Fase: document (complete)

**Completados:** DOC-1: baseline final consolidado, guía de adopción y troubleshooting publicada, changelog Unreleased actualizado, run, INDEX y manifest cerrados

- `docs/tech/2026-07-18-001-DOCUMENT-020-runtime-efficiency-v2-closeout.md`
- `docs/baselines/asdd-runtime-baseline-final-v2.json`
- `.claude/docs/adoption/runtime-efficiency.md`
- `ASDD-CHANGELOG.md`

## Decisiones (ADRs)

- [ADR-017-presupuesto-efectivo-y-carga-contextual.md](../../docs/architecture/decisions/ADR-017-presupuesto-efectivo-y-carga-contextual.md)
- [ADR-018-dispatcher-consolidado-de-hooks.md](../../docs/architecture/decisions/ADR-018-dispatcher-consolidado-de-hooks.md)
- [ADR-019-routing-de-modelos-y-presupuesto-de-subagentes.md](../../docs/architecture/decisions/ADR-019-routing-de-modelos-y-presupuesto-de-subagentes.md)

## Referencias adicionales

- Testing ATF: `docs/testing/atf/2026-07-18-001/` (si existe)
- Reportes QA ATF: `docs/qa/atf/2026-07-18-001/` (si existe)

---
_Generado automáticamente por `sofka-asdd-run-manifest.mjs` (hook SessionStart, Tier C)._
_No editar manualmente — se sobrescribe en cada sesión mientras el run esté activo._