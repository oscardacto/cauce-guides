# DOC-1 — Cierre de Runtime Efficiency v2

## Estado

La iniciativa `2026-07-18-001` completa Specify, Analyze, Design, Build,
Verify y Document. B1–B9 conservan evidencia individual y
`asdd-runtime-baseline-final-v2.json` consolida el resultado.

El cierre de la iniciativa no equivale a autorizar release: ADR-018 mantiene
timing nativo macOS/Windows como gate externo pendiente.

## Resultado consolidado

| Dimensión | Antes | Final | Resultado |
|---|---:|---:|---|
| Always-on | 16.973 palabras | 5.863 | -65,46 % |
| Prompt normal | 145 palabras | 0 | -100 % |
| Procesos Bash | 7 | 1 | -85,71 % |
| Procesos Edit | 8 | 1 | -87,50 % |
| Bash p95 paralelo | 55,57 ms | 35,18 ms | -36,69 % |
| Edit p95 paralelo | 55,70 ms | 33,69 ms | -39,52 % |
| Modelo default | Opus | Sonnet | calidad 4/4 en ambos |

E2E final: `16/16`. Consumidor CLI desde `distribution[]`: PASS. Gates B9: `6/6`. Validator final: `32 OK`, `2 warnings staged`, `0 errores`. Seguridad y routing: cero regresiones.

## Hallazgo de cierre y corrección

La auditoría DOC-1 detectó que `cli-contract.json` distribuía hooks y rules,
pero omitía las libs y scripts runtime que estos importan o indican ejecutar.
El repositorio fuente pasaba porque los archivos existían localmente; un
consumidor instalado por la allowlist podía quedar roto.

Se corrigió la allowlist para distribuir `.claude/ba-steps/`,
`.claude/references/`, libs, autorización, routing y loaders; el budget de
contexto usa una fuente distribuida;
se agregó el gate `cli-runtime-distribution` y un E2E que construye un consumidor
solo desde `distribution[]` y comprueba imports del validator, routing TRIVIAL,
resolución de rule, carga de capability y deny del dispatcher.

## Documentación de adopción

`.claude/docs/adoption/runtime-efficiency.md` describe comportamiento observable,
budgets, verificación post-instalación, troubleshooting, métricas y límites. Se
agregó a la distribución del CLI.

`ASDD-CHANGELOG.md` registra el trabajo bajo `[Unreleased]`. No se hace bump ni
tag en DOC-1: el release process requiere primero evidencia nativa macOS/Windows.

## Deuda y checks externos

- 9 warnings staged de eager skills, visibles y sin excepción silenciosa.
- timing macOS nativo pendiente;
- timing Windows nativo pendiente;
- schemas de tools/MCP y contexto interno del proveedor no observables.

Estos puntos no reabren el run: son deuda/filtros de release explícitos y
versionados en el baseline final.

## Rollback

- La documentación y el baseline son aditivos.
- Las nuevas entradas de `distribution[]` se pueden revertir juntas, aunque
  hacerlo reintroduciría el consumidor roto y el validator lo bloquearía.
- B1–B8 mantienen rollback por slice; DOC-1 no modifica sus decisiones runtime.

## Evidencia final

- `docs/baselines/asdd-runtime-baseline-final-v2.json`
- `docs/baselines/2026-07-18-001-b9-runtime-integral.json`
- `.claude/docs/adoption/runtime-efficiency.md`
- `.claude/scripts/test-cli-runtime-distribution.mjs`
- `.claude/scripts/validate-template.mjs`
- `.asdd/cli-contract.json`

Resultado: iniciativa completa, documentación reconciliada y release
condicionado explícitamente a macOS/Windows nativos.
