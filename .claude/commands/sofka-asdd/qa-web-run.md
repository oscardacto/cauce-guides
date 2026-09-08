---
description: Punto de entrada único del ATF Web — detecta el modo desde appweb.yaml y delega al Orquestador. No ejecuta fases del pipeline directamente.
mode: 'agent'
---

## INSTRUCCIÓN ÚNICA

Tu única tarea es detectar el modo y ejecutar el Orquestador en este contexto.
No ejecutes ninguna fase del pipeline directamente — delega al Orquestador.
No tomes decisiones de ejecución. El Orquestador hace eso.

---

## PASO 1 — Leer configuración

Leer `docs/testing/atf-web/config/appweb.yaml`.
Buscar archivos `.xlsx` en `docs/testing/atf-web/requirements/` (excluir `procesados/`).

---

## PASO 2 — Detectar modo (primera señal que coincida)

| Señal | Modo |
|-------|------|
| Existe `.xlsx` en `docs/testing/atf-web/requirements/` (fuera de `procesados/`) | FÁBRICA |
| `run_id` apunta a carpeta existente con `session_context.json` | CONTINUACIÓN |
| Ninguna anterior | FULL FLOW |

Mostrar el modo detectado:

```
[MODO DETECTADO: {MODO}]
```

---

## PASO 3 — Ejecutar el Orquestador en este contexto

> ⚠️ **CRÍTICO — NO usar Agent tool para el orquestador.**
> El orquestador necesita acceso al Agent tool para crear sub-agentes (design-team,
> executor, etc.). Si se lanza como sub-agente, pierde esa capacidad porque
> Claude Code no permite Agent tool en contextos anidados (nivel 2+).
> El orquestador DEBE ejecutarse en el contexto primario.

Ejecuta las instrucciones del orquestador en este contexto primario:

1. Leer el spec completo: `{project-root}/.claude/agents/sofka-asdd-atf-web-qa-engineer.md`
   > ⛔ **ANTI-SELF-READ:** Leer **UNA SOLA VEZ** por invocación — en este paso, antes de ejecutar nada más.
   > **En modo CONTINUACIÓN:** NO releer `sofka-asdd-atf-web-qa-engineer.md` una segunda vez para "encontrar la sección de continuación". Localiza la sección `⚡ CONTINUATION SHORTCUT` con un `view_range` mínimo, NO releas el spec completo.
   > **Causa raíz de la violación:** el modelo lee el spec en este paso, luego al detectar CONTINUACIÓN lo relee para localizar las instrucciones → doble tokenización (~15-20s de overhead). Leerlo aquí una vez y usar tu memoria para el resto del pipeline.
2. Ejecutar sus instrucciones desde PASO 0.0 sin saltarte ningún paso
3. No asumas ningún valor de configuración — léelos desde appweb.yaml en PASO 0.1
4. Cuando las instrucciones dicen `[CALL]` o `[AGENT TOOL]`, usar el Agent tool
   disponible en este contexto primario para crear sub-agentes
5. Cuando las instrucciones dicen ejecutar lógica de coordinación (leer/escribir
   archivos de estado, ejecutar scripts Node.js de `tools/`), hacerlo directamente

> **Nota sobre REGLA 16 del orquestador (ANTI-BYPASS):** La prohibición protege contra sub-agentes que lean un `.agent.md` y lo ejecuten inline. Este contexto primario está **exento parcialmente** — su propósito arquitectónico es ejecutar las instrucciones del orquestador directamente, porque el orquestador necesita acceso al Agent tool (que no existe en contextos anidados nivel 2+).
>
> **Lo que SÍ puede hacer este contexto primario inline:**
> - Leer archivos de configuración y estado (`appweb.yaml`, `session_context.json`, `exec_context.json`)
> - Ejecutar scripts Node.js de `tools/` (generate-report, generate-checkpoint, etc.)
> - Escribir archivos de estado y artefactos del run
> - Leer el spec del orquestador (`sofka-asdd-atf-web-qa-engineer.md`) para ejecutarlo
>
> **Lo que NUNCA puede hacer inline (siempre Agent tool):**
> - Ejecutar fases del pipeline: diagnostician, strategist, design-team, executor
> - Ejecutar skills como sub-agentes directamente

Modo pre-detectado: {MODO}

STOP. No ejecutes nada más después de iniciar la ejecución del Orquestador.
Lee su spec y coordina el pipeline completo desde PASO 0.0.

---

## REFERENCIA RÁPIDA — Configuración por escenario

| Escenario | appweb.yaml |
|-----------|----------|
| Pipeline completo | `pipeline: todo true`, depositar HUs en docs/testing/atf-web/requirements/ |
| Solo diagnóstico | `fase_0: true`, demás fases `false` |
| Continuar con ejecución | `run_id: "<id existente>"`, `fase_2c: true` |
| CPs desde Excel | Depositar `.xlsx` en docs/testing/atf-web/requirements/, `fase_2c: true` |
| CPs puntuales | `test_run.mode: custom`, `custom_tags: ["@cp:CP-M1-001"]` |
