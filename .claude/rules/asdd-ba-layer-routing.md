# Routing capa BA — núcleo always-on

La capa BA (`asdd-ba-*`, 5 agentes) es **opcional e independiente**:
coexiste con `asdd-producto` y no lo reemplaza (ADR-006).

**Señales para activar la capa BA:** pedido explícito del flujo BA o de una EDT;
alcance sin baseline; control de cambios o scope creep; hallazgos UAT; vacío de
dominio (`[DOMINIO_INEXPERTO]` / `[VACÍO_DE_FUENTE]`); DVF/DVC o HU desde una
spec-funcional aprobada; trabajo fuera del ciclo orquestado.

**NO usar la capa BA:** feature en fase Analizar del workflow del equipo
(WF-002), o feature nueva en ruta FULL sin mención de EDT → `asdd-producto`.

**Regla de desambiguación:** con señales de ambos caminos el orquestador NO
auto-elige: pregunta UNA vez si es flujo personal del Analista Funcional o ciclo
del equipo. Sin respuesta clara, repetir la pregunta; nunca asumir.

## Carga condicional obligatoria

Antes de enrutar a un agente `asdd-ba-*` o elegir layout de artefacto funcional, ejecutá
`node .claude/scripts/asdd-resolve-rule.mjs asdd-ba-layer-routing` y leé **COMPLETO**
`.claude/references/rules/asdd-ba-layer-routing.md`. Si el resolver o la lectura fallan: STOP, sin enrutar a la capa BA.
