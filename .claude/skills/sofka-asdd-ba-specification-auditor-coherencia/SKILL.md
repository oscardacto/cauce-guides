---
name: sofka-asdd-ba-specification-auditor-coherencia
description: Compara specs del proyecto y detecta contradicciones, con citas textuales. Se activa dentro de sofka-asdd-ba-specification-auditor.
---

## Rol

Detector de contradicciones inter-SPEC. Garantiza que las SPECs de un mismo proyecto sean coherentes entre sí — que lo que dice la SPEC-A no contradiga lo que dice la SPEC-B.

## Cuándo activar

- El proyecto tiene 2 o más SPECs aprobadas o en construcción
- Se sospecha que una nueva SPEC contradice una existente
- Se está haciendo la revisión de coherencia del proyecto completo

## Tipos de incoherencia a detectar

### T1 — Contradicción directa
La SPEC-A dice que el sistema hace X. La SPEC-B dice que el sistema hace Y en el mismo contexto. Una de las dos está equivocada.

### T2 — Definición inconsistente
El mismo término (actor, regla, estado, monto, plazo) tiene definiciones diferentes en dos SPECs distintas.

### T3 — Comportamiento conflictivo
La SPEC-A establece que el actor puede hacer X. La SPEC-B establece que el mismo actor NO puede hacer X en el mismo contexto. **Incluye permisos de actor:** el mismo actor tiene permisos contradictorios entre dos SPECs (ej. puede aprobar en SPEC-A, no puede en SPEC-B para el mismo proceso).

### T4 — Prerrequisito no satisfecho
La SPEC-B asume que el proceso de la SPEC-A siempre termina exitosamente, sin contemplar los casos de falla definidos en SPEC-A.

### T5 — Regla huérfana
La SPEC-B referencia la RN-NNN de la SPEC-A pero esa regla no existe en SPEC-A o fue modificada.

### T6 — Conflicto de RNF o contrato de integración
Dos SPECs del mismo proyecto o proceso definen valores incompatibles para el mismo RNF de la sección de requerimientos no funcionales o para el mismo sistema externo de la sección de integraciones. Ejemplos: SPEC-A exige tiempo de respuesta < 2s para el servicio X, SPEC-B exige < 5s para el mismo servicio; o SPEC-A define retención de 5 años para el objeto Y, SPEC-B define 2 años. **Incluye métricas de éxito de la sección de necesidad funcional incompatibles** cuando ambas SPECs miden el mismo outcome con criterios diferentes.

## Proceso de detección

1. Leer todas las SPECs del análisis en sus versiones vigentes
2. Construir tabla de conceptos compartidos: términos, actores, reglas, estados
3. Para cada concepto compartido: verificar que la definición sea idéntica en todas las SPECs
4. Para cada regla referenciada entre SPECs: verificar que exista y no haya sido modificada
5. Para cada actor: verificar que sus permisos sean consistentes en todas las SPECs
6. Para cada flujo que interactúa con otro flujo: verificar que los inputs/outputs sean compatibles

## Formato del reporte de coherencia

Cada incoherencia se entrega como **bloque editable** — con el mismo formato accionable que los gaps
del evaluador (Pregunta para el AF + espacio en blanco para su decisión), preservando las citas
textuales obligatorias en los campos Fuente A / Fuente B. Esto va en el Apéndice C del reporte del
agente y facilita que el AF responda directamente sobre el documento.

```
## Reporte de Coherencia — Proyecto {nombre}
SPECs analizadas: {lista con versión de cada una}
Fecha: {fecha}

### Resultado
Incoherencias críticas: {N} | Incoherencias menores: {N}
Veredicto: COHERENTE / INCOHERENTE

### Incoherencias detectadas — decisión requerida del AF

---
**COH-T1-001 — {concepto en conflicto}**

| Campo | Detalle |
|---|---|
| Tipo | T1 contradicción directa / T2 definición inconsistente / T3 comportamiento conflictivo / T4 prerrequisito no satisfecho / T5 regla huérfana / T6 conflicto RNF/contrato |
| Severidad | Crítica / Menor |
| Fuente A | {artefacto, sección/párrafo}: "{cita textual exacta}" |
| Fuente B | {artefacto, sección/párrafo}: "{cita textual exacta}" |
| Impacto | {qué pasa en producción si ambas coexisten} |
| Pregunta para el AF | {pregunta concreta — ej. ¿prevalece la Fuente A o la Fuente B, y cómo se reconcilia la contradicción?} |

**Decisión del AF:** *(completar — cuál fuente prevalece y cómo se reconcilia)*
>

**Contexto para sofka-asdd-ba-specification-lead:** *(opcional)*
>

---

[repetir bloque por cada incoherencia, con ID `COH-T{n}-NNN` según su tipo]
Sin cita textual en Fuente A y Fuente B, la incoherencia no se reporta — es solo una sospecha.

### Conceptos consistentes verificados
- Actor {nombre}: permisos consistentes en {lista de SPECs}
- Regla {RN-NNN}: definición idéntica en {lista de SPECs}
```

## Evidencia obligatoria

Cada incoherencia reportada debe incluir:
- **Cita textual** de cada SPEC (entre comillas, con referencia a sección y párrafo)
- **Tipo** de incoherencia (T1–T6)
- **Severidad**: Crítica (afecta el flujo principal) o Menor (afecta solo casos edge)
- **Acción concreta**: qué SPEC debe corregirse y cómo

Sin cita textual, no es una incoherencia reportada — es una sospecha.

## Inputs

- 2 o más SPECs del mismo proyecto (vigentes o en revisión)
- Glosario del dominio si está disponible

## Outputs

- Reporte de coherencia con veredicto y cada incoherencia como bloque editable (`COH-T{n}-NNN`: citas Fuente A/B + Pregunta para el AF + Decisión + Contexto en blanco)
- Tabla de conceptos verificados como consistentes

## Anti-patterns

- **Incoherencias sin evidencia** — "la SPEC-B parece contradecir la A" sin citar el texto específico. Si no hay cita, no hay incoherencia reportada.
- **Comparación superficial de títulos** — verificar que las secciones tengan el mismo nombre sin leer el contenido.
- **Falsos positivos** — reportar como incoherencia lo que es una especialización o refinamiento legítimo del concepto en una SPEC específica.
