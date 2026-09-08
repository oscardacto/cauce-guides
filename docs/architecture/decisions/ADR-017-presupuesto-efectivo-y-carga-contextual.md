# ADR-017 — Presupuesto efectivo y carga contextual por capas

Fecha: 2026-07-18 | Estado: Aceptada
Deciders: Maintainers ASDD  
Relacionado con: ADR-005, ADR-013, ADR-016, run `2026-07-18-001`, D1

## Contexto

El gate actual mide `CLAUDE.md + rules` y `agent + skills`, pero su parser
solo reconoce listas YAML de bloque. La sintaxis inline usada por la mayoría de
agentes queda fuera del cálculo. El runtime reporta 11.108 palabras como mayor
payload, mientras el recálculo correcto encuentra 20.351 en Tech Lead.

Además, medir categorías aisladas no expresa el contexto inicial efectivo. El
SPIKE-1 confirmó 16.973 palabras always-on, 145 palabras repetidas por prompt y
payloads eager que superan 14.000–20.000 palabras.

## Decisión

### 1. Presupuesto por capas

La métrica canónica publica separadamente:

```text
always_on
agent
eager_skills
active_command
hook_injection
measured_effective_context
unmeasured_components[]
```

No convierte palabras a tokens mediante un factor fijo. La unidad determinista
es `words`; tokens reales se incorporarán solo cuando exista telemetría
estable.

### 2. Frontmatter con semántica YAML

Agentes y skills se parsean con semántica YAML válida. Listas inline y de bloque
son equivalentes. Una referencia ausente falla integridad: nunca suma cero.

### 3. Gates

- always-on ≤8.000 palabras; stretch ≤6.000;
- prompt normal ≤40 palabras; objetivo 0 sin señal;
- máximo una skill eager por agente;
- agente + skill inicial ≤10.000 palabras;
- coordinador ≤3.500; stretch ≤2.500;
- excepciones con owner, reason y expiración.

Los gates se activan por etapas: medición → warning → error, sin ocultar deuda
durante la transición.

### 4. Carga contextual por contrato

Se generaliza el patrón de ADR-005/ADR-016:

- rules universales conservan un núcleo compacto always-on;
- detalle normativo vive en reference solo con lector explícito;
- agentes reciben una capability inicial;
- segunda capability requiere dependencia autorizada;
- coordinadores cargan phase specs en el punto de uso;
- el validator prueba paths, lectores y ausencia de orfandad.

### 5. No compensar deuda con modelo

No se fuerza Opus para soportar contexto sobredimensionado. Primero se reduce y
mide el contexto; el modelo se decide independientemente por complejidad/riesgo.

## Alternativas consideradas

- **Mantener gates separados:** rechazada; oculta el costo combinado.
- **Estimar tokens con words × constante:** rechazada; varía por idioma,
  contenido y tokenizer.
- **Mover todas las rules a reference:** rechazada; dejaría contratos
  universales sin lector oportuno.
- **Una skill bundle por agente:** rechazada; reintroduce carga eager con otro
  nombre.
- **Límite único de 6.000 always-on:** ajustado; se adopta 8.000 bloqueante y
  6.000 stretch para migración segura.

## Consecuencias

**Positivas:** métricas honestas, gates comparables y menor contexto inicial.  
**Costo:** loaders, lectores y validaciones adicionales por capability/fase.  
**Riesgo:** adelgazar demasiado puede volver crípticos los contratos; QA debe
medir precisión además de tamaño.  
**Migración:** incremental por agente/rule, con rollback individual.

## Criterios de aceptación

- Sintaxis inline y bloque produce el mismo total.
- Referencia rota falla.
- El baseline declara componentes no medidos.
- Cada movimiento fuera de auto-load demuestra lector y E2E.
- B9 cumple gates o registra excepción temporal aprobada.

## Historial de estados

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-18 | — | Propuesta | SPIKE-1 confirmó el falso mínimo y fijó thresholds por capas. |
| 2026-07-18 | Propuesta | Aceptada | Aprobación explícita del usuario después de revisar la evidencia de Design. |
