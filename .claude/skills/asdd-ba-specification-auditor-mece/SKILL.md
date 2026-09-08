---
name: asdd-ba-specification-auditor-mece
description: Valida que reglas o criterios sean MECE. Se activa dentro de asdd-ba-specification-auditor.
---

## Rol

Validador de completitud y exclusividad lógica. Detecta solapamientos entre reglas y vacíos de cobertura que el asdd-ba-specification-lead puede no haber visto.

## Cuándo activar

- Se necesita validar que las reglas de la sección de reglas de negocio no se solapan ni se contradicen
- Se necesita verificar que el flujo de la sección de flujo de negocio cubre todos los escenarios posibles
- Se detectan reglas que parecen duplicadas o que podrían aplicar al mismo caso

## Definiciones operacionales

**Mutuamente Excluyente (ME)**: dos elementos son ME cuando no puede aplicarse ambos al mismo caso simultáneamente. Si el caso A activa la RN-003 y también la RN-007, y ambas dan respuestas diferentes, no son ME.

**Colectivamente Exhaustivo (CE)**: un conjunto es CE cuando cubre todos los casos posibles del espacio definido. Si las reglas cubren montos < $100 y montos > $500 pero no montos entre $100 y $500, no son CE.

## Proceso de validación MECE

### Paso 1: Construir la matriz de condiciones
Para cada regla o paso, identificar:
- Condición de activación (qué contexto la dispara)
- Condición de exclusión (qué contexto la descarta)
- Rango de valores si aplica (montos, tiempos, cantidades)

**Ejemplo de matriz para reglas de monto:**

| Regla | Condición de activación | Condición de exclusión | Rango |
|---|---|---|---|
| RN-001 | monto < $100 | monto ≥ $100 | [0, 100) |
| RN-002 | monto ≥ $100 y monto < $500 | monto < $100 o monto ≥ $500 | [100, 500) |
| RN-003 | monto ≥ $500 | monto < $500 | [500, ∞) |

En este ejemplo: ME=PASS (rangos no se solapan), CE=FAIL (¿qué pasa con monto = exactamente $100 si el operador hubiera sido `>`?).

### Paso 2: Verificar exclusividad mutua
- Buscar dos elementos cuyas condiciones de activación puedan ser verdaderas simultáneamente
- Si se encuentran → marcar como solapamiento `[SOLAP-NNN]`

### Paso 3: Verificar exhaustividad colectiva
- Construir el espacio de posibilidades (ej. si hay una condición de monto, cubrir: 0, negativo, valor mínimo, valor exacto del umbral, valor justo encima del umbral, valor máximo)
- Identificar combinaciones de condiciones no cubiertas → marcar como vacío `[VACÍO-NNN]`

### Paso 4: Verificar los límites
- Los umbrales son especialmente propensos a vacíos: `< 100` y `> 100` dejan sin cubrir exactamente `= 100`
- Los operadores lógicos compuestos (A Y B, A O B) requieren verificar las 4 combinaciones posibles

## Formato del reporte MECE

Cada solapamiento y vacío se entrega como **bloque editable** — con el mismo formato accionable que
los gaps del evaluador (Pregunta para el AF + espacio en blanco para su decisión). Esto va en el
Apéndice B del reporte del agente y facilita que el AF responda directamente sobre el documento.

```
## Reporte MECE — {nombre del conjunto validado}
Conjunto evaluado: {pasos del flujo de negocio / reglas de negocio / otro}
Total elementos: {N}

### Resultado
ME: PASS / FAIL ({N} solapamientos detectados)
CE: PASS / FAIL ({N} vacíos detectados)
Veredicto MECE: PASS / FAIL

### Brechas MECE — decisión requerida del AF

---
**MECE-VACIO-001 — {nombre corto del vacío}**

| Campo | Detalle |
|---|---|
| Tipo | Vacío (CE) / Solapamiento (ME) |
| Impacto | ALTO / MEDIO / BAJO |
| Conjunto evaluado | reglas de negocio / flujo / criterios |
| Elementos implicados | {RN-003 y RN-007 / rango [100,500) / bifurcación sin SINO} |
| Descripción | {qué se solapa o qué caso queda sin cubrir} |
| Pregunta para el AF | {pregunta concreta — ej. ¿qué regla aplica cuando monto = exactamente $100?} |

**Decisión del AF:** *(completar — regla que prevalece, o confirmar vacío intencional)*
>

**Contexto para asdd-ba-specification-lead:** *(opcional)*
>

---

[repetir bloque por cada solapamiento (`MECE-SOLAP-NNN`) y vacío (`MECE-VACIO-NNN`)]
Si no hay ninguno → "Sin solapamientos ni vacíos. Conjunto MECE."
```

## Casos típicos donde MECE falla

- **Umbrales sin el caso exacto**: `monto < $1000` y `monto > $1000` — ¿qué pasa con exactamente $1000?
- **Condiciones con OR implícito**: "si el cliente es VIP o si tiene más de 2 años" — ¿qué pasa con alguien que es VIP Y tiene más de 2 años? ¿se aplica dos veces?
- **Flujo sin rama de error**: el flujo tiene SI pero no tiene SINO explícito — vacío en la rama negativa
- **Reglas con "generalmente"**: una regla que aplica "generalmente" deja sin cubrir los casos excepcionales

## Criterios MECE específicos para el flujo de negocio

Cuando se valida el flujo (no reglas):
- **ME de bifurcaciones**: toda bifurcación SI debe tener SINO explícito — si solo existe el camino del SI, hay un vacío
- **CE de estados**: si existe máquina de estados, todo estado debe ser alcanzable desde algún paso del flujo y tener al menos una transición de salida
- **Sin pasos inalcanzables**: ningún paso del flujo puede ser inalcanzable desde el paso inicial dado el conjunto de reglas declaradas
- **Vacío de rango temporal**: si hay TIMEOUT y el flujo define qué pasa al vencer, verificar que también define qué pasa si la acción ocurre *justo en* el límite del timeout

## Inputs

- La sección de reglas de negocio y/o la sección de flujo de negocio de la SPEC
- (Opcional) Criterios de aceptación Gherkin para validación cruzada

## Outputs

- Reporte MECE con veredicto ME y CE por separado
- Solapamientos (`MECE-SOLAP-NNN`) y vacíos (`MECE-VACIO-NNN`) como bloques editables (Pregunta para el AF + Decisión + Contexto en blanco)

## Anti-patterns

- **MECE superficial** — revisar que los nombres de las reglas sean diferentes sin verificar las condiciones de activación reales.
- **Declarar PASS sin evidencia** — si el evaluador no construyó la matriz de condiciones, no puede afirmar que el conjunto es MECE.
