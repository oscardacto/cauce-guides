# ADR-019 — Routing de modelos y presupuesto de subagentes

Fecha: 2026-07-18 | Estado: Aceptada
Deciders: Maintainers ASDD  
Relacionado con: ADR-012, ADR-013, run `2026-07-18-001`, D3

## Contexto

`.claude/settings.json` usa Opus como modelo global aunque el lock define
defaults por fase. Esto aplica el modelo más costoso también a routing,
síntesis y solicitudes simples. A la vez, agentes con `maxTurns` 60–120 y
fan-out flexible pueden consumir más latencia/tokens de los que ahorra el
paralelismo.

El modelo no debe compensar contexto sobredimensionado: SPIKE-1 confirma que
Tech Lead y UI cargan 18–20k palabras por skills eager antes del contexto
global.

## Decisión

### 1. Default y precedencia

El orquestador usa Sonnet por defecto. Se conserva:

`skill override > agent pinning > phase default > agent frontmatter`.

Los nombres de modelos se resuelven desde configuración versionada; no se
hardcodean en prompts.

### 2. Política por profundidad y riesgo

| Ruta | Modelo inicial | Escalamiento |
|---|---|---|
| TRIVIAL | Sonnet del orquestador, sin subagente | No aplica; lectura acotada |
| LIGHT | Sonnet; Explorer puede usar Haiku | Opus solo por riesgo/ambigüedad demostrada |
| MEDIUM | Sonnet | Opus para arquitectura, seguridad o baja confianza |
| FULL | Default de fase | Opus en Design/Verify de alto riesgo; Document puede usar Haiku |

La seguridad nunca degrada por costo. Un modelo económico que no alcanza
confianza mínima escala antes de actuar.

### 3. Presupuesto de subagentes

Los valores son máximos, no mínimos. Una ruta LIGHT read-only con inventario
cerrado, tools locales de lectura y sin capability especializada puede usar
cero subagentes; cualquier cambio LIGHT y todo MEDIUM/FULL se delegan.

| Ruta | Máximo | Turnos por agente | Reintentos |
|---|---:|---:|---:|
| TRIVIAL | 0 | — | 0 |
| LIGHT | 1 | 10–20 | 1 |
| MEDIUM | 2 | 20–35 | 1 por agente |
| FULL | 3 concurrentes | 30–50 por slice | 1 por slice |

Pipelines ATF pueden usar batches adicionales únicamente con work items
independientes, límite explícito y checkpoint por batch.

### 4. Criterio de paralelismo

Se paraleliza cuando:

- outputs y scopes son disjuntos;
- no existe dependencia de lectura/escritura;
- la duración esperada supera el cold start;
- el costo de síntesis no anula el ahorro.

Explorer no precede automáticamente a todo agente: se usa cuando el scope no
puede resolverse con lecturas acotadas del agente destino.

### 5. Telemetría

Por invocación se registra metadata no sensible:

- ruta, fase y modelo lógico;
- agente/capability;
- turnos, reintentos y duración;
- motivo de escalamiento;
- resultado útil/bloqueado.

No se persisten prompts ni outputs completos.

## Alternativas consideradas

- **Opus global:** rechazada; costo alto y oculta deuda de contexto.
- **Haiku global:** rechazada; riesgo de precisión en routing/gobernanza.
- **Modelo fijo por agente:** insuficiente; ignora fase, skill y riesgo.
- **Paralelizar siempre:** rechazada; cold start y síntesis pueden empeorar
  latencia.
- **Sin límites de turnos para pipelines:** rechazada; impide presupuestos y
  anti-loop verificables.

## Consecuencias

**Positivas:** menor costo medio y fan-out proporcional.  
**Costo:** evals por ruta/modelo y telemetría de invocación.  
**Riesgo:** degradación de calidad; mitigada con confidence gate, escalamiento y
rollout gradual.  
**Rollout:** primero evals shadow, luego default Sonnet, finalmente budgets
bloqueantes.

## Criterios de aceptación

- TRIVIAL nunca abre subagente.
- LIGHT read-only acotada puede usar 0 agentes sin tratar el máximo como cuota.
- Evals de routing/modelo mantienen baseline de precisión.
- High-risk escala antes de tools.
- Fan-out y turnos fuera de budget bloquean o requieren plan nuevo.
- B9 compara latencia/costo/calidad antes y después.

## Historial de estados

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-18 | — | Propuesta | Design separa selección de modelo de deuda contextual y fija budgets por ruta. |
| 2026-07-18 | Propuesta | Aceptada | Aprobación explícita del usuario después de revisar la evidencia de Design. |
| 2026-07-18 | Aceptada | Aceptada (aclarada) | La validación real de Prompt 00 confirma que los budgets son techos y formaliza la excepción LIGHT read-only acotada. |
