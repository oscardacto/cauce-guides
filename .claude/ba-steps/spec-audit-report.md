# spec-audit-report — Template de Reporte de Evaluación BA
<!-- CONTRACT:spec-audit-report:v1 -->

> Módulo de carga condicional. `asdd-ba-specification-auditor` lo lee
> COMPLETO antes de escribir el reporte de evaluación en `docs/specs/`.

## Formato del reporte de evaluación

El reporte es un **documento de trabajo** que el AF edita (la sección de gaps)
antes de enviar a `asdd-ba-specification-lead`. La sección de gaps contiene
las brechas con campos en blanco para que el AF escriba su decisión y el contexto
que necesita el constructor.

```markdown
## Reporte de Evaluación — {SPEC-nombre}
Fecha: {fecha} | Versión evaluada: {N}

**Veredicto:** APROBADA / RECHAZADA / APROBADA CON OBSERVACIONES

---

## Resumen ejecutivo para el AF

> **Vista rápida de todo lo que el AF debe resolver.** Esta sección va SIEMPRE al
> inicio del reporte (obligatoria — condición de salida). Consolida el estado de
> las **cuatro** dimensiones de análisis (gaps propios, gaps heredados, MECE,
> coherencia) en un solo golpe de vista, antes de cualquier detalle.

**Estado global:** {RIESGO CRÍTICO/ALTO/MEDIO/BAJO} — {N} ítems bloqueantes · {N} a confirmar · {N} sin objeción

| Dimensión | Estado | Bloqueantes | A confirmar | OK | Detalle en |
|---|---|---|---|---|---|
| Gaps propios (19 filtros) | CRÍTICO/ALTO/MEDIO/BAJO | {N} CRÍTICO/PENDIENTE | {N} IMPLÍCITO | {N} DEFINIDO | §Gaps + Apéndice A |
| Gaps heredados de otros artefactos | {N} sin resolver / OK | {N} | {N} | {N} | §Gaps heredados |
| MECE | ME: PASS/FAIL · CE: PASS/FAIL | {N} vacío/solapamiento ALTO | {N} MEDIO/BAJO | — | Apéndice B |
| Coherencia | COHERENTE / INCOHERENTE | {N} T1/T3 | {N} T2/otros | — | Apéndice C |

> _Nota de conteo (breve):_ esta tabla cuenta **por dimensión** (un hallazgo que
> cruza dos dimensiones se cuenta en cada una); el "Resumen extendido" cuenta
> **deduplicado**. Cuando dos IDs refieren el mismo hallazgo raíz, mostrar el
> total de raíces junto al de IDs. Cuando dos dimensiones exhiban una misma cifra
> midiendo conjuntos distintos, aclarar que son poblaciones disjuntas.

**Prioridad de ataque:** ver la sección **"Resumen extendido — pendientes por
resolver"** (abajo). Su tabla, ordenada P1→P4, y el bloque **"Conteo de
pendientes"** son la única fuente del orden de resolución y del desglose por quién
debe resolver cada ítem.

> **Para el AF:** completar la columna "Decisión" de cada gap PENDIENTE e IMPLÍCITO
> (propios y heredados) antes de enviar este reporte a
> `asdd-ba-specification-lead`. Un gap sin decisión bloquea la construcción.

---

## Resumen extendido — pendientes por resolver (priorizado)

> **La lista de trabajo del AF.** Contiene ÚNICAMENTE lo que falta resolver, en las
> 4 dimensiones. **No incluye nada DEFINIDO ni ya resuelto.** Ordenado P1→P4.
> La columna "Qué hay que resolver" explica cada ítem en lenguaje claro para el
> negocio — el AF debe entender qué se resuelve **sin abrir el bloque de detalle**.

**Regla de prioridad (compuesta: criticidad × impacto en Ola 0).** Ola 0 = hojas
de nivel topológico 0 en la EDT (sin dependencias — arrancan la implementación).
La columna "Ola 0" es binaria: `Sí` si el ítem afecta al menos una hoja nivel 0;
`No` en caso contrario.

| Nivel | Criterio |
|---|---|
| **P1** | Crítico/bloqueante **Y** bloquea o condiciona una hoja de **Ola 0** |
| **P2** | Crítico/bloqueante de una ola posterior · **Ó** bloqueante de Ola 0 aunque no sea crítico |
| **P3** | Bloqueante / PENDIENTE no crítico de olas posteriores |
| **P4** | IMPLÍCITO / a confirmar |

_Desempate dentro de cada nivel: mayor número de hojas afectadas → más arriba._

### Conteo de pendientes ({N})

> **Obligatorio — abre la sección, antes de la tabla.**

De los {total evaluados} ítems evaluados, **{N} siguen pendientes**; los otros {M}
ya están DEFINIDOS o resueltos.

**Por prioridad**

| Nivel | Qué es | Pendientes |
|---|---|---|
| 🔴 P1 | Crítico + afecta hoja de Ola 0 | {N} |
| 🟠 P2 | Crítico de ola posterior · o bloqueante de Ola 0 | {N} |
| 🟡 P3 | Pendiente no crítico | {N} |
| ⚪ P4 | A confirmar (severidad MEDIA/BAJA) | {N} |

**Por quién debe resolverlo** (los tres grupos suman {N})

| Tipo de acción | Pendientes | Ítems |
|---|---|---|
| 🟢 Solo confirmación del AF — propuesta lista: confirmar / ajustar / rechazar | {N} | {IDs} |
| 🟣 Decisión propia del AF (sin propuesta previa, no requiere terceros) | {N} | {IDs} |
| 🔵 Requiere insumo externo (Negocio / Cliente / Arquitectura / otro rol) | {N} | {IDs o "el resto"} |

> Destacar cuántos ítems (🟢 + 🟣) puede cerrar el AF **sin esperar a terceros**.
> Si no queda nada pendiente → "Sin pendientes por resolver. SPEC lista para construcción."

| Prioridad | ID | Dimensión | Qué hay que resolver | Hoja(s) EDT | Ola 0 | Owner sugerido |
|---|---|---|---|---|---|---|
| P1 | {ID} | {dimensión} | {una frase clara para el negocio} | {1.5.2} | Sí | AF / Arquitecto / Negocio |
| P2 | … | … | … | … | No | … |
| P3 | … | … | … | … | … | … |
| P4 | … | … | … | … | … | … |

_Si no queda nada pendiente → "Sin pendientes por resolver. SPEC lista para construcción."_

---

## Gaps funcionales — decisión requerida del AF

| Estado | Cantidad | Requiere decisión del AF |
|---|---|---|
| CRÍTICO / PENDIENTE | {N} | Sí — bloquea construcción |
| IMPLÍCITO | {N} | Sí — confirmar o descartar |
| DEFINIDO | {N} | No — detalle en Apéndice A |

_Si no hay gaps PENDIENTE ni IMPLÍCITO → "Sin brechas pendientes. SPEC lista para construcción."_

### CRÍTICO / PENDIENTE (decisión requerida antes de construir)

---
**GAP-EV-001 — {nombre descriptivo}**

| Campo | Detalle |
|---|---|
| Riesgo | CRÍTICO / PENDIENTE |
| Filtro | {número y nombre del filtro que lo detectó} |
| Descripción | {lo que detectó el evaluador — qué escenario o definición falta} |
| Pregunta para el AF | {pregunta específica que el AF debe resolver antes de construir} |

**Decisión del AF:** *(completar — puede ser decisión propia o referencia a stakeholder consultado)*
>

**Contexto para asdd-ba-specification-lead:** *(opcional — dato, restricción o referencia que aplique a la decisión)*
>

---

_[repetir bloque por cada gap CRÍTICO/PENDIENTE]_

### IMPLÍCITO (confirmar o documentar)

---
**GAP-EV-00N — {nombre}**

| Campo | Detalle |
|---|---|
| Filtro | {número y nombre del filtro que lo detectó} |
| Descripción | {descripción del evaluador} |
| Acción sugerida | {qué confirmar, descartar o documentar} |

**Decisión del AF:** *(confirmar si aplica, descartar con motivo, o indicar dónde queda documentado)*
>

---

_[repetir bloque por cada gap IMPLÍCITO]_

---

## Gaps heredados de otros artefactos

> **Obligatorio si aplica.** Gaps, decisiones pendientes o brechas YA reportadas
> por otro agente/artefacto (EDT, ADR, diccionario, otra SPEC). No reescribir con
> formato distinto — presentar con el **mismo formato de bloque** que los gaps
> propios, agrupados por origen.
>
> Convención de ID: `GAP-{ORIGEN}-NNN` — donde `{ORIGEN}` es un código corto
> (`EDT`, `ADR`, `DIC`, `SPEC-xxx`). Ejemplo: `GAP-EDT-001`.
>
> Si no hay gaps heredados → "No se hallaron gaps previos reportados en otros artefactos."

### Origen: {nombre del artefacto — p. ej. "EDT — docs/specs/{run_id}-SPECIFY-001-edt-{slug}.md"}

---
**GAP-{ORIGEN}-001 — {nombre descriptivo}**

| Campo | Detalle |
|---|---|
| Riesgo | CRÍTICO / PENDIENTE / IMPLÍCITO |
| Origen | {artefacto + sección/línea donde estaba reportado} |
| Reportado por | {agente o autor — p. ej. asdd-ba-functional-architect} |
| Descripción | {la brecha tal como fue reportada — sin distorsionarla} |
| Estado en el origen | {abierto / parcialmente resuelto / bloqueante} |
| Pregunta para el AF | {qué debe resolver el AF, formulada de forma accionable} |

**Decisión del AF:** *(completar)*
>

**Contexto para asdd-ba-specification-lead:** *(opcional)*
>

---

_[repetir bloque por cada gap heredado; agrupar por "### Origen:" cuando provienen de varios artefactos]_

---

## Próximos pasos

_Leer después de que el AF completó la sección de gaps._

### Acciones bloqueantes
- [ ] {acción concreta — owner}

### Acciones de apoyo
- [ ] {acción concreta — owner}

---

## Diagrama [OPCIONAL]

_Si el AF pidió diagrama o los filtros E16–19 detectaron estados implícitos: ver sección **Diagrama en el reporte** al final de este módulo._

---

## Apéndice A — Gaps funcionales completos

Todos los gaps: CRÍTICO, PENDIENTE, IMPLÍCITO y DEFINIDO.

| # | Filtro | Gap | Estado | Detalle |
|---|---|---|---|---|
| 1 | {nombre del filtro} | {nombre del gap} | PENDIENTE | {descripción} |

## Apéndice B — Análisis MECE (si se activó)

Cada solapamiento o vacío como **bloque editable** con el mismo formato que los gaps.

| Resultado | ME: PASS/FAIL · CE: PASS/FAIL | Solapamientos: {N} | Vacíos: {N} |

---
**MECE-VACIO-001 — {nombre corto del vacío}**

| Campo | Detalle |
|---|---|
| Tipo | Vacío (CE) / Solapamiento (ME) |
| Impacto | ALTO / MEDIO / BAJO |
| Conjunto evaluado | reglas de negocio / flujo / criterios |
| Elementos implicados | {RN-003 y RN-007 / rango [100,500) / bifurcación sin SINO} |
| Descripción | {qué se solapa o qué caso queda sin cubrir} |
| Pregunta para el AF | {pregunta concreta} |

**Decisión del AF:** *(completar — regla que prevalece, o confirmar vacío intencional)*
>

**Contexto para asdd-ba-specification-lead:** *(opcional)*
>

---

_[repetir bloque por cada solapamiento (`MECE-SOLAP-NNN`) y vacío (`MECE-VACIO-NNN`)]_

## Apéndice C — Coherencia entre SPECs (si se activó)

Cada incoherencia como **bloque editable** con citas textuales obligatorias.

| Resultado | COHERENTE / INCOHERENTE | Críticas (T1/T3): {N} | Menores: {N} |

---
**COH-T1-001 — {concepto en conflicto}**

| Campo | Detalle |
|---|---|
| Tipo | T1 contradicción directa / T2 definición inconsistente / T3 comportamiento conflictivo / T4 / T5 / T6 |
| Severidad | Crítica / Menor |
| Fuente A | {artefacto, sección}: "{cita textual exacta}" |
| Fuente B | {artefacto, sección}: "{cita textual exacta}" |
| Impacto | {qué pasa en producción si ambas coexisten} |
| Pregunta para el AF | {pregunta concreta} |

**Decisión del AF:** *(completar — cuál fuente prevalece y cómo se reconcilia)*
>

**Contexto para asdd-ba-specification-lead:** *(opcional)*
>

---

_[repetir bloque por cada incoherencia, con ID `COH-T{n}-NNN` según su tipo]_
```

## Diagrama en el reporte [OPCIONAL]

Activar si se cumple **alguna** de estas condiciones:
- El AF pidió explícitamente un diagrama en el reporte.
- Los filtros E (16–19) detectaron una máquina de estados implícita no diagramada en §4 de la SPEC.

**Insertar en el reporte** después de la sección Próximos pasos y antes de los Apéndices, bajo el encabezado `## Diagrama`.

| Caso | Tipo Mermaid | Cuándo |
|---|---|---|
| Máquina de estados del objeto principal | `stateDiagram-v2` | Filtros E16–E19 detectaron estados implícitos en §4 |
| Flujo de negocio sin diagrama en §4 | `flowchart TD` | §4 tiene bifurcaciones pero no diagramó el proceso |

**Reglas:**
- Solo incluir estados o pasos que el evaluador puede inferir del texto de §4 — sin inventar.
- Si los estados están incompletos por un gap (E16): agregar `> Estados inferidos — sujetos a decisión del AF` como nota.
- El diagrama es descriptivo, no definitivo — el AF puede ajustarlo al completar los gaps.
- Si no hay máquina de estados ni flujo complejo: no incluir diagrama; declarar en Próximos pasos que no aplica.

