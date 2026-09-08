---
name: BA EDT Contract
description: Formato, campos, estados y consistencia del entregable EDT.
---

## Formato del entregable

```
# EDT de Descomposición — [Nombre del Alcance Recibido]

## 0. Identificación

| Campo | Valor |
|---|---|
| Proyecto | [Nombre del programa o proyecto] |
| Módulo / Dominio | [Nombre del módulo o bounded context] |
| Artefacto | EDT-{SIGLAS}-v{N} |
| Versión | [N.M] |
| Alcance recibido | [Descripción del alcance que el AF entregó] |
| Fecha de descomposición | AAAA-MM-DD |
| Fuentes consultadas | [Lista de documentos consultados] |
| Profundidad de la EDT | [N] niveles |
| Total de hojas (specs) | [N] |
| HUs excluidas | [Códigos · motivo — o "Ninguna"] |

---

## 1. Resumen ejecutivo del backlog

**Specs identificados:** [N]
**Distribución por tamaño:** [X] L · [Y] M · [Z] S · [W] No estimable (si aplica)
**Specs en ruta crítica:** [N] (ver §3.3b)
**Hojas bloqueadas:** [N]
**Hojas en límite L (riesgo de subdivisión):** [N]

| # | Código | Módulo | Nombre del spec | Tamaño | Nivel topológico | Estado |
|---|---|---|---|---|---|---|
| 1 | 1.1.1 | [Nombre del agrupador padre] | [Nombre breve] | [S/M/L] | [0/1/2/...] | [Listo / Bloqueado / Límite L] |

---

## 2. Árbol EDT

### 2.1 [Nombre de la raíz]

#### 2.1.1 [Nombre del agrupador de nivel 1]
*Propósito: [una o dos líneas]*

##### 2.1.1.1 [Nombre del spec hoja]
- **Pregunta de negocio:** [una línea]
- **Alcance:**
  - Incluye: [qué cubre]
  - No incluye: [qué queda fuera y por qué]
- **Fuentes principales:** [documentos / secciones en docs/ o inputs/]
- **Tamaño:** [S/M/L] — [CORE:xT · EDGE:xT · Flujo:xT · Alt:xT · Estados:xT · Actores:xT · Int:xT → voto S=n M=n L=n]
- **Dependencias:** [códigos de otras hojas o "ninguna"]
- **Dominios sugeridos:** Funcional: Sí · UX/UI: [Sí/No/A confirmar — motivo] · Seguridad: [Sí/No/A confirmar — motivo] · Datos: [Sí/No/A confirmar — motivo] · Arquitectura: [Sí/No] · Developer: [Sí/No] · QA: [Sí/No] · DevOps: [Sí/No]
- **Notas para el AF:** [puntos de atención y alertas operativas]

---

## 3. Análisis del conjunto

### 3.1 Verificación de cobertura
[Declaración explícita de cobertura. Si algo queda fuera, listarlo y justificar.]

### 3.2 Detección de superposiciones
[Pares de hojas con potencial superposición y propuesta de resolución.
Si no hay: "Sin superposiciones detectadas".]

### 3.3a — Niveles topológicos — Orden recomendado de construcción de SPECS

**L0 — Sin dependencias:**
- `1.X.Y` — [Nombre breve]

**L1 — Dependen de L0:**
- `1.X.Y` — [Nombre breve]

**[Ln — continuar por nivel hasta cubrir todos los specs]**

### 3.3b — Ruta crítica

**Cadena:** `1.X.Y → 1.X.Y → 1.X.Y`
**Peso total:** [N] (S=1, M=2, L=3)
**Implicación:** [descripción en una línea — qué determina esta cadena para el proyecto]

| Posición | Spec | Módulo | Tamaño | Peso | Desbloqueado por |
|---|---|---|---|---|---|
| 1 | [Código] — [Nombre] | [Módulo] | [S/M/L] | [1/2/3] | — (sin dependencias) |
| 2 | [Código] — [Nombre] | [Módulo] | [S/M/L] | [1/2/3] | [Código del que depende] |

> Si hay specs bloqueados que pertenecerían a la cadena: excluirlos del cálculo e indicar explícitamente qué segmento está bloqueado y por qué DP.

### 3.3c — Olas de implementación

> ★ = en ruta crítica (iniciar primero dentro de la ola) · ⚠ = Límite L (decidir subdivisión antes de construir)

**Ola 1 — [Nombre descriptivo de la capacidad que se habilita]**

| Spec | Módulo | Tamaño | Señales |
|---|---|---|---|
| [Código] — [Nombre] | [Módulo] | [S/M/L] | [★ / ⚠ / —] |

**Ola 2 — [Nombre descriptivo]**

| Spec | Módulo | Tamaño | Desbloqueado por | Señales |
|---|---|---|---|---|
| [Código] — [Nombre] | [Módulo] | [S/M/L] | [Código desbloqueador] | [★ / ⚠ / —] |

**Specs bloqueados — excluidos de todas las olas**

| Spec | Módulo | Tamaño | Bloqueado por |
|---|---|---|---|
| [Código] — [Nombre] | [Módulo] | [?] | [DP-NNN — descripción breve] |

### 3.4 Criterio de descomposición aplicado
[1-3 párrafos explicando qué criterio se usó, por qué ese y no otro,
y los casos donde se evaluó fusionar o subdividir.]

### 3.5 Comparación con versión anterior

**Primera versión:** escribir `"Primera versión — sin cambios respecto a versión anterior."` y omitir las tablas.

**Versiones posteriores** — esta sección cumple dos usos; incluir los que apliquen:

**Uso A — Fusiones y subdivisiones de hojas:**

| Código nuevo | Hojas originales | Motivo |
|---|---|---|
| 1.X.Y | 1.A.B + 1.C.D | [motivo en una línea] |

**Uso B — Resolución de DPs (activado por el protocolo "Ciclo de vida de las DPs"):**

> [Descripción del lote de resolución: quién respondió, cuándo, cuántas DPs.]

| DP | Estado final | Decisión adoptada (resumen) |
|---|---|---|
| DP-NNN | RESUELTA / PARCIALMENTE RESUELTA / CONFIRMADO-BLOQUEANTE | [resumen en una línea] |

---

## 4. Decisiones pendientes detectadas

**En la primera creación de la EDT** — esta sección contiene todas las DPs detectadas durante la descomposición. Cada DP debe usar este formato:

### DP-NNN — [Nombre de la decisión en lenguaje de negocio]
- **Subtipo:** `[VACÍO_DE_FUENTE]` / `[VACÍO_DE_REQUISITO]` / `[CONFLICTO_FUENTES]` / `[INTERFAZ_PENDIENTE]` / `[DECISIÓN_ARQUITECTURA]` / `[DOMINIO_INEXPERTO]` / `[ESCALAMIENTO_AL_CLIENTE]`
- **Hojas afectadas:** [códigos]
- **Impacto:** [qué no puede construirse sin esta decisión — específico, no genérico]
- **Opciones:** (A) [opción] ; (B) [opción] [; (C) ...]
- **Resuelve:** [AF / Arquitecto / asdd-ba-functional-sme vía AF / Cliente vía AF]

Si no hay DPs: escribir `"Sin decisiones pendientes — la descomposición es accionable tal cual. Las decisiones específicas que surjan al redactar cada hoja las levantará asdd-ba-specification-lead en Sección 14 del spec correspondiente."`

**Tras el primer ciclo de resolución** (protocolo "Ciclo de vida de las DPs") — el título de esta sección cambia a `## 4. Decisiones pendientes — registro activo` y la nota introductoria pasa a:

> **Estado de resolución (AAAA-MM-DD):** N RESUELTAS · M PARCIALMENTE RESUELTA(S) · K CONFIRMADO-BLOQUEANTE(S). Historial completo en §3.5.

Solo permanecen en §4 las DPs con `Estado: CONFIRMADO-BLOQUEANTE` o `Estado: PARCIALMENTE RESUELTA`. Las `RESUELTA` se eliminan de §4 y su registro histórico queda en §3.5 (Uso B). Las DPs activas añaden dos campos al formato estándar:

- **Decisión adoptada:** [texto de la decisión — suficiente para que asdd-ba-specification-lead actúe]
- **Estado:** `CONFIRMADO-BLOQUEANTE` / `PARCIALMENTE RESUELTA`
```

---

## Contrato de campos del entregable (no negociable)

Este agente produce **un único formato de salida**. Ningún campo puede añadirse, eliminarse ni reubicarse, independientemente de cuánta información adicional esté disponible sobre el proyecto. La información de proyecto específica (módulos técnicos, bounded contexts, referencias a ADRs, decisiones de arquitectura) se incluye **dentro** de los campos `Alcance` o `Notas para el AF`, nunca como campos independientes ni como columnas de tabla.

### Campos de la Sección 0 (Identificación)

Los únicos campos válidos en la Sección 0 son exactamente estos, en este orden:

1. `Proyecto` — nombre del programa o proyecto
2. `Módulo / Dominio` — módulo o bounded context que cubre esta EDT
3. `Artefacto` — identificador del documento (ej. `EDT-GCB-v2`)
4. `Versión` — número de versión del documento (ej. `2.0`)
5. `Alcance recibido` — descripción del alcance entregado por el AF
6. `Fecha de descomposición` — formato AAAA-MM-DD
7. `Fuentes consultadas` — lista de documentos en `docs/` o `inputs/`. Si el bounded context tiene contratos AsyncAPI o DBML disponibles en `inputs/`, deben aparecer explícitamente con nombre de archivo y versión. Un §0 que no los lista es evidencia de que no fueron consultados, lo que invalida todas las referencias técnicas de la EDT. Si no están disponibles, declararlo: `"AsyncAPI: no disponible — referencias de evento son estimadas"` y marcar las hojas afectadas con `[ESTIMADO]`.
8. `Profundidad de la EDT` — número de niveles del árbol
9. `Total de hojas (specs)` — conteo de nodos hoja
10. `HUs excluidas` — códigos con motivo, o la palabra `Ninguna` si no aplica

### Columnas de la tabla del Resumen Ejecutivo (Sección 1)

Las únicas columnas válidas son exactamente estas, en este orden:

`| # | Código | Módulo | Nombre del spec | Tamaño | Nivel topológico | Estado |`

`Módulo`: nombre del nodo agrupador inmediatamente padre de la hoja (nombre legible, no el código). Si la hoja es hija directa de la raíz, usar el nombre de la raíz.

### Campos obligatorios por hoja en el Árbol EDT (Sección 2)

Cada hoja **debe** tener exactamente estos 7 campos, en este orden:

1. `**Pregunta de negocio:**` — una línea que completa la frase "este spec define cómo se hace X"
2. `**Alcance:**` — con dos subsecciones obligatorias: `Incluye:` y `No incluye:`
3. `**Fuentes principales:**` — documentos o secciones en `docs/` o `inputs/`
4. `**Tamaño:**` — letra + traza de votación de 7 dimensiones (formato del rubric)
5. `**Dependencias:**` — códigos de otras hojas o la palabra "ninguna"
6. `**Dominios sugeridos:**` — los 8 dominios con valor Sí/No/A confirmar y motivo breve
7. `**Notas para el AF:**` — alertas operativas y consultas previstas a asdd-ba-functional-sme

### Subsecciones obligatorias de §3 (Análisis del conjunto)

La Sección 3 debe contener exactamente estas subsecciones en este orden:

1. **§3.1** — Verificación de cobertura
2. **§3.2** — Detección de superposiciones
3. **§3.3a** — Niveles topológicos — Orden recomendado de construcción de SPECS (lista de specs agrupados por nivel L0, L1, Ln)
4. **§3.3b** — Ruta crítica (cadena con mayor peso acumulado; tabla posición/spec/módulo/tamaño/peso/desbloqueado-por; peso total declarado)
5. **§3.3c** — Olas de implementación (tablas de specs por ola con señales ★ y ⚠; tabla de specs bloqueados)
6. **§3.4** — Criterio de descomposición aplicado
7. **§3.5** — Comparación con versión anterior

No omitir ninguna subsección. §3.3b y §3.3c son obligatorias aunque la EDT tenga una sola ola o no tenga specs bloqueados.

### Regla de campos no definidos

No agregar campos, columnas ni conceptos no definidos en este contrato; no omitir ninguno de los definidos. Si el proyecto aporta información adicional útil (módulos técnicos, bounded contexts, referencias a ADRs), incluirla dentro de `Alcance` o `Notas para el AF`, nunca como campo nuevo. Ejemplo de error a evitar: agregar una columna `Constructibilidad` al resumen porque el contexto del proyecto la hace conveniente.

Si un campo no puede completarse por falta de información, declararlo explícitamente dentro del campo: `Fuentes principales: no disponibles — ver DP-XX`.

### Valores válidos del campo Estado (Sección 1)

| Valor | Cuándo aplicarlo |
|---|---|
| `Listo` | Toda la información necesaria está disponible; la hoja puede entregarse a asdd-ba-specification-lead sin bloqueos conocidos. |
| `Bloqueado` | Una o más decisiones pendientes (Sección 4) impiden cerrar partes del alcance; asdd-ba-specification-lead puede redactar el camino feliz pero encontrará secciones marcadas como incompletas. |
| `Límite L` | El voto general del rubric es L y ninguna dimensión supera el umbral de Subdividir; el AF debe evaluar si subdividir antes de entregar a asdd-ba-specification-lead. |

El campo `Constructibilidad` (Verde / Ámbar / Rojo) **no existe** en el output de este agente. Nunca usar esa terminología.

---
