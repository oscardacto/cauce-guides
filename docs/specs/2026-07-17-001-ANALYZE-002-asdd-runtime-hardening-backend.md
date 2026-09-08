# Spec Backend — Hardening del runtime ASDD

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Rol destino | Solution Architect + Developer de tooling/runtime |
| Prerrequisito | `...-funcional.md` aprobado |
| Dependencias | `spec-seguridad` para autorización e integridad |
| Secciones cubiertas | §5, implementación server/tooling, §13 |
| Output esperado | Hooks, dispatcher, routing, loaders, state reconciler y validator con tests |

> Ver `2026-07-17-001-ANALYZE-001-asdd-runtime-hardening-funcional.md` para flujo, RN y RNFs.  
> Ver `2026-07-17-001-ANALYZE-003-asdd-runtime-hardening-seguridad.md` §11 para el contrato de seguridad.

## 5. Integraciones y Dependencias Externas

| Componente | Contrato actual | Cambio requerido |
|---|---|---|
| Claude Code hooks | Un proceso Node por hook registrado | Dispatcher por evento con guards modulares y resultado compatible |
| Agent/Task runtime | Agentes con listas amplias de skills | Descriptor de invocación con capabilities seleccionadas por fase |
| Rules loader | `.claude/rules` auto-loaded | Catálogo universal/on-demand con lector verificable |
| Plan gate | Marker timestamp `.plan-approved` | Autorización estructurada definida por seguridad |
| Estado | `.asdd-run.json` como hint/estado | Reconciliación con branch, commit, INDEX y schema |
| Validador | Checks estructurales sin budget | Check `context-budget` y métricas reproducibles |

### Arquitectura objetivo incremental

1. **Budget analyzer:** inventaría texto auto-loaded y payload agent+skills; compara contra política versionada.
2. **Router:** produce `{depth, domain, risk, confidence, required_capabilities}`.
3. **Capability loader:** materializa solo skills/references requeridas.
4. **Approval issuer/verifier:** consume el contrato de seguridad sin interpretar texto externo.
5. **Hook dispatcher:** comparte input, repo root, config y estado entre guards.
6. **State reconciler:** compara hint local con Git e INDEX y reporta divergencias.
7. **Telemetry sink:** registra métricas redactadas y correlacionadas por request/run.
8. **Artifact handoff:** entrega rutas y metadata mínima; evita copiar o re-derivar cuerpos completos.
9. **Discovery cache:** reutiliza una exploración entre actores solo si coinciden repo, commit/hash, scope y versión de política.
10. **Result materializer:** persiste el primer retorno completo en una ruta permitida y ejecuta un gate writer-agnostic, sin re-spawn.

### Releases técnicos

| Slice | Entrega | Dependencia |
|---|---|---|
| B1 | Context budget + check del validator | Ninguna |
| B2 | Worktree opt-in y ejecución visible en rama actual | QA |
| B3 | Aprobación de lote sin re-preguntas | seguridad S1 |
| B4 | Routing TRIVIAL/LIGHT/MEDIUM/FULL | B1, B3 |
| B5 | Eliminar inyección duplicada y cachear SessionStart | B1 |
| B6 | Skills on-demand + split ATF/Tech Lead/UI | B1, B4 |
| B7 | Rules on-demand + consolidación ORC | B1, B6 |
| B8 | Dispatcher de hooks | B5, B4 |
| B9 | State reconciler e higiene de `.asdd-run.json` | seguridad S2 |
| B10 | Handoff por path, caché de discovery invalidable y materialización sin reintentos | B1, B4, seguridad S2 |

### Contrato de worktree opt-in

- Un solo developer: trabaja en la rama actual no protegida.
- Dos o más developers paralelos: ORC-011-A calcula scopes; si son disjuntos, usa worktrees.
- Scope solapado: ejecución secuencial sobre la rama actual o worktrees secuenciales, nunca paralelo.
- Pedido explícito del usuario: puede forzar worktree aun con un solo developer.
- Los guards GS-001/GS-008 siguen activos en todos los modos.

### Contrato del context budget

Archivo propuesto: `.asdd/context-budget.json`.

```json
{
  "schema_version": 1,
  "limits": {
    "global_words": 25000,
    "agent_words": 12000,
    "agent_with_skills_words": 24000,
    "command_words": 5000,
    "hook_stdout_words": 1200
  },
  "exceptions": []
}
```

El primer slice implementa medición determinista por palabras/bytes como proxy estable. La telemetría runtime agregará tokens reales cuando el harness los exponga.

## 9. Validaciones de implementación

- Rutas normalizadas y dentro del repo.
- Configuración parseada con schema/version.
- Orden determinista de resultados.
- Excepciones de budget con owner, razón y expiración.
- Fallo claro cuando un agente o agregado excede el límite.
- No ejecutar agentes, skills ni hooks durante el análisis estático del budget.
- Invalidar discovery cache si cambia commit/hash, scope, versión de política o archivos fuente declarados.
- No usar la caché como autorización ni como sustituto de gates de seguridad.
- Reintentar un agente solo cuando el primer retorno no sea materializable; una falla de formato se corrige in-place.
- Ejecutar el gate del artefacto sin depender de cuál actor realizó la escritura y sin agregar un hook global por artefacto.

## Evidencia reutilizable de las ramas SPDD

`origin/feat/spdd` es ancestro de `origin/fix/spdd-optimization`. La segunda concentra las optimizaciones, pero diverge de `dev` desde `b5241e5`, contiene 27 commits propios y cambia 77 archivos; por ello no se integra por merge ni cherry-pick masivo.

Se portan selectivamente estos patrones:

- `9c45f67`: handoff por path y narración intermedia mínima.
- `1c22748`: referencia de artefactos existentes en vez de re-derivación.
- `cf562d3` y `97bef6a`: clasificación/model routing temprano y review proporcional al radio.
- `cceb029`: una exploración persistida y reutilizada tras compactación.
- `0c920ec` y `304babb`: materialización del primer retorno y corrección quirúrgica sin re-spawn.
- `70eada6`: gate post-escritura writer-agnostic; se adopta el contrato determinista, no un nuevo hook global.

No se porta literalmente la semántica Canvas/SPDD, el hook adicional ni el cache sin procedencia. Estas variantes agravarían fan-out o permitirían contexto obsoleto.

## 13. Controles y Auditoría

- Cada decisión de routing incluye versión de política.
- Cada aprobación incluye correlación con plan y request.
- Cada escape hatch registra guard, razón y expiración.
- Cada reconciliación registra fuente declarada, fuente efectiva y divergencias.
- Los logs nunca incluyen prompts completos, secretos o credenciales.

## Criterios de completitud del área

- [x] Arquitectura incremental y contratos definidos.
- [x] Primer slice identificable y testeable.
- [x] Dependencias de seguridad referenciadas sin duplicarlas.
- [x] Estrategia de compatibilidad y reversión definida.
