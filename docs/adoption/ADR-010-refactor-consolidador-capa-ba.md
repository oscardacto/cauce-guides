# ADR-010 — Refactor consolidador de la capa BA: 9 → 5 agentes

> **Ubicación canónica.** Este ADR vive en `docs/adoption/` junto a los demás ADRs consumer-facing distribuidos por el CLI. Ver ADR-004 para el porqué de esta ruta.

- **Estado:** Aceptada
- **Fecha:** 2026-07-22
- **Deciders:** Alejandro López (sponsor / AF), Tech Lead (integración template)
- **Autor:** sofka-asdd-tech-lead (skills `artifact-audit`, `quality-gate`)
- **Supersede parcialmente:** [ADR-006 — Integración de la capa BA del Analista Funcional](ADR-006-integracion-capa-ba-analista-funcional.md)
- **Relacionados:** ADR-004 (spec-per-área), ADR-005 (conditional rule loading), `.claude/rules/sofka-asdd-ba-layer-routing.md`, `.claude/reference/ba/sofka-asdd-ba-specs-layout.md`

---

## 1. Contexto

ADR-006 integró el bundle de capa BA con 4 agentes core y 7 skills, reconociendo
explícitamente que "5 agentes/artefactos referenciados no existen — el flujo BA
queda incompleto en los tramos de SME, DVF, UAT y lecciones aprendidas hasta que
se integren en una iteración futura."

En paralelo, Alejandro desarrolló un refactor extenso del bundle original
(9 agentes, Layout B), testeado en una versión anterior del template. El refactor:

1. Consolida 9 agentes → 5 (eliminando redundancias y completando los tramos
   faltantes identificados en ADR-006).
2. Amplía las capacidades de cada agente con contenido validado en producción.
3. Introduce honestidad epistémica explícita en el SME (5 marcadores canónicos).
4. Añade priorización P1-P4 y "gaps heredados" al auditor.
5. Resuelve el Layout B original con Layout A (ART-001 plano, compatible con el
   orquestador ASDD).

Este ADR formaliza la integración de ese refactor en el template ASDD, respetando
la arquitectura de la nueva versión.

---

## 2. Decisión

### 2.1 Consolidación 9 → 5 agentes

| Agente(s) origen | Agente destino | Razón |
|---|---|---|
| `sofka-asdd-ba-descomponedor` | `sofka-asdd-ba-functional-architect` | Renombre con rol más claro; agrega skills `brief` y `log-lessons-learned` |
| `sofka-asdd-ba-constructor` | `sofka-asdd-ba-specification-lead` | Renombre; agrega skills `client-validation`, `user-story`, `requirements` |
| `sofka-asdd-ba-evaluador` | `sofka-asdd-ba-specification-auditor` | Renombre; agrega P1-P4, gaps heredados (GAP-{ORIGEN}-NNN), resumen ejecutivo |
| `sofka-asdd-ba-control-alcance` + `sofka-asdd-ba-clasificador-uat` | `sofka-asdd-ba-scope-manager` | Unificación: un agente router con 3 skills (`early-scope`, `scope-control`, `uat-classifier`) |
| `sofka-asdd-ba-sme` (inexistente en ADR-006) | `sofka-asdd-ba-functional-sme` | Agente nuevo completo: protocolo epistémico de 5 marcadores, data-boundary, informe SME bajo demanda |
| `sofka-asdd-ba-bitacora` | Eliminado como agente | Sus responsabilidades pasan al skill `sofka-asdd-ba-change-log` (directo por cada agente obligado) |
| `sofka-asdd-ba-documento-espejo` (inexistente en ADR-006) | Skills en `specification-lead` | `client-validation` + `user-story` en `sofka-asdd-ba-specification-lead` |
| `sofka-asdd-ba-filtro-lecciones` (inexistente en ADR-006) | Skill `sofka-asdd-ba-log-lessons-learned` | Skill activable por `functional-architect` o `scope-manager` al cierre del ciclo |

### 2.2 Remap de skills

| Skill origen | Skill destino |
|---|---|
| `sofka-asdd-ba-bitacora-log` | `sofka-asdd-ba-change-log` |
| `sofka-asdd-ba-constructor-contexto` | `sofka-asdd-ba-specification-lead-contexto` |
| `sofka-asdd-ba-constructor-extraccion` | `sofka-asdd-ba-specification-lead-extraccion` |
| `sofka-asdd-ba-constructor-gherkin` | `sofka-asdd-ba-specification-lead-gherkin` |
| `sofka-asdd-ba-evaluador-coherencia` | `sofka-asdd-ba-specification-auditor-coherencia` |
| `sofka-asdd-ba-evaluador-gaps` | `sofka-asdd-ba-specification-auditor-gaps` |
| `sofka-asdd-ba-evaluador-mece` | `sofka-asdd-ba-specification-auditor-mece` |
| _(nuevo)_ | `sofka-asdd-ba-brief` |
| _(nuevo)_ | `sofka-asdd-ba-change-log` |
| _(nuevo)_ | `sofka-asdd-ba-client-validation` |
| _(nuevo)_ | `sofka-asdd-ba-early-scope` |
| _(nuevo)_ | `sofka-asdd-ba-functional-sme-dominio` |
| _(nuevo)_ | `sofka-asdd-ba-functional-sme-sector` |
| _(nuevo)_ | `sofka-asdd-ba-log-lessons-learned` |
| _(nuevo)_ | `sofka-asdd-ba-requirements` |
| _(nuevo)_ | `sofka-asdd-ba-scope-control` |
| _(nuevo)_ | `sofka-asdd-ba-uat-classifier` |
| _(nuevo)_ | `sofka-asdd-ba-user-story` |

### 2.3 Layout A (no Layout B)

ADR-006 no especificaba layout de artefactos porque los agentes originales usaban
Layout B (`docs/specs/{codigo}-{slug}/funcional-{codigo}.md`). Este refactor
adopta **Layout A** plano (ART-001) como única convención:

```
docs/specs/{run_id}-{PHASE}-{SEQ}-{codigo-nodo}-{slug}-funcional.md
```

Razón: Layout B es incompatible con `sofka-asdd-artifact-name.mjs` y con el
INDEX del orquestador. Layout A aporta la misma trazabilidad (código de nodo
en el slug) sin subdirectorios. Ver `.claude/reference/ba/sofka-asdd-ba-specs-layout.md`.

### 2.4 Patrón thin coordinator preservado

Los 5 agentes siguen el patrón de coordinador delgado introducido en ADR-006:
- Core ≤ 2500 palabras; comportamiento detallado cargado desde `.claude/ba-steps/`
- Los tres módulos de ba-steps (`decompose.md`, `edt-contract.md`,
  `decision-lifecycle.md`) se actualizan con los nuevos nombres pero no se
  amplían: el contenido normativo ya era correcto.
- `coordinator-loading.json` actualizado: `sofka-asdd-ba-descomponedor` →
  `sofka-asdd-ba-functional-architect` con SHA-256 recomputados.

### 2.5 Protocolo epistémico del SME (nuevo)

`sofka-asdd-ba-functional-sme` introduce un contrato de 5 marcadores canónicos:
`[CERTEZA]`, `[INFERENCIA]`, `[ESPECÍFICO_CLIENTE]`, `[NO_SÉ]`,
`[RIESGO_REGULATORIO]`. Ningún skill puede crear, renombrar ni sufijar estos
marcadores. Las reglas de anclaje regulatorio y calibración de práctica estándar
evitan certeza falsa en el dato más volátil (regulación). Ver agente para el
contrato completo.

---

## 3. Consecuencias

**Positivas:**
- Los tramos incompletos de ADR-006 (SME, DVF/DVC, UAT, lecciones) quedan
  implementados con contenido validado en producción por el sponsor.
- El flujo BA tiene cobertura completa: brief → EDT → spec → auditoría → SME →
  validación cliente → HU ágil → control de alcance → lecciones.
- La consolidación reduce la superficie de agentes de 9 a 5, simplificando el
  routing y la memoria de los agentes orquestadores.
- Layout A elimina la incompatibilidad con `sofka-asdd-artifact-name.mjs`.

**Negativas / riesgo aceptado:**
- El handoff standalone → equipo (§9 de ADR-006) sigue sin automatizar.
- Los archivos de skills obsoletos (`sofka-asdd-ba-bitacora-log`, `sofka-asdd-ba-evaluador-*`, `sofka-asdd-ba-constructor-*`) quedan en disco como stubs de redirect hasta que el proyecto consumidor pueda borrarlos (requiere `rm -rf` con aprobación explícita).

---

## 4. Validación

- `coordinator-loading.json` actualizado y SHA-256 recomputados.
- `sofka-asdd-spec-guard.md` actualizado (agentes CR, skill change-log).
- `sofka-asdd-ba-layer-routing.md` actualizado (5 nuevos agentes, Layout A).
- `node .claude/scripts/validate-template.mjs` a ejecutar tras merge.
- Conteos del lock a actualizar: `agents` 24→25 (neto +1), skills neto +10
  (17 nuevos − 7 obsoletos), `rules` +1 (`sofka-asdd-ba-layer-routing.md`).
