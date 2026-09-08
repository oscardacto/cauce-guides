# Smart Data — Políticas de Retención

Regla de governance del addon Smart Data ASDD. Obliga a que **toda tabla en producción tenga una política de retención definida antes de su creación**. Aplica con rigor especial a tablas con datos PII o regulados. Complementa `asdd-data-eng-lineage.md` (trazabilidad), `asdd-data-eng-inter-contracts.md` (contratos inter-equipo) y se evalúa dentro de `asdd-data-eng-governance-assessment`.

Esta regla guía activamente al usuario que parte de cero: si no hay retención definida, **no se avanza**. El agente de governance la define antes de continuar el flujo `discover → design → build → validate → publish`.

---

## RET-001: El principio — ninguna tabla sin retención, ningún campo PII sin retención de campo

La retención opera en **dos niveles** con reglas distintas:

**Retención de capa** — definida en el `smart-data-eng-design` para cada capa Medallion (ej. Landing 30 días, Bronze 7 años, Silver permanente, Gold permanente). Se aplica **por defecto a todos los campos no-PII**. No se documenta campo a campo en el diccionario — vive en el spec.

**Retención de campo PII** — definida en el diccionario de datos, solo para campos con `PII = sí`. Prevalece sobre la retención de capa cuando es más estricta. Un campo PII sin retención explícita es un **gap crítico**.

> Un campo no-PII con la columna "Retención" vacía en el diccionario **no es un gap** — hereda su capa. Solo los campos PII necesitan retención explícita en el diccionario.

> Regla mental: si el campo tiene PII y no podés responder "¿cuánto tiempo vive y qué pasa al vencimiento?", ese campo no está listo para producción.

---

## RET-002: Qué es una política de retención en Smart Data

Una política de retención responde tres preguntas por tabla y por columna sensible:

| Pregunta | Qué define |
|---|---|
| **¿Cuánto tiempo?** | El período durante el cual los datos se conservan en cada capa |
| **¿Qué pasa al vencimiento?** | La acción al expirar: `purge` (eliminación definitiva) o `archive` (archivado a almacenamiento frío) |
| **¿Quién y cómo?** | Para PII: el proceso de purge — quién lo ejecuta y cómo se verifica |

**Para campos PII**, la retención está determinada por el **caso de uso** y la **regulación aplicable**. Smart Data es agnóstico de país: no asume una jurisdicción concreta. El equipo determina con el cliente, durante `discover`, qué regulación aplica y qué período exige.

---

## RET-003: Retención por capa (referencia base — ajustar con el cliente)

Los siguientes valores son una **referencia inicial**, no una imposición. La retención exacta la define el equipo junto al cliente durante la fase `discover`, según el caso de uso, el volumen y la regulación.

| Capa | Horizonte típico | Razón | Acción típica al vencimiento |
|---|---|---|---|
| **Landing** | Corto — días/semanas | Zona temporal previa a Bronze; los datos se promueven o se descartan | `purge` |
| **Bronze** | Largo — años | Registro histórico inmutable; fuente de verdad para reprocesos | `archive` |
| **Silver** | Medio-largo — años | Datos limpios con contratos; base de modelos y consumo | `archive` o `purge` según contrato |
| **Gold** | Medio — meses/años | Agregaciones de consumo; reconstruibles desde Silver | `purge` |

**Reglas de ajuste:**
- Si una capa contiene PII, su retención **no puede ser "indefinida"** ni heredar el horizonte largo de Bronze sin justificación regulatoria explícita.
- Bronze conserva el histórico crudo, pero los campos PII dentro de Bronze siguen sujetos a su propia política de retención y purge.
- La decisión final de cada celda se registra como una fila en el `layer-decision-matrix.md`.

---

## RET-004: Cuándo aplica esta regla

El agente y el usuario aplican esta regla en estos momentos del flujo:

1. **Al crear cualquier tabla nueva** en Bronze, Silver o Gold → definir su retención antes de emitir el DDL.
2. **Al agregar un campo PII** al diccionario de datos → ese campo DEBE recibir retención explícita en la misma edición.
3. **Antes de pasar a `validate`** → todas las tablas del proyecto deben tener retención definida; es un criterio de salida de `build`.
4. **En cada `governance-assessment`** → la retención es una dimensión evaluada de forma obligatoria.

Si en cualquiera de estos momentos se detecta una tabla sin retención —o peor, un campo PII sin retención— se activa el protocolo de RET-007.

---

## RET-005: Campos PII y retención

Los campos PII tienen requisitos reforzados:

- **Todo campo marcado como PII** en el diccionario de datos DEBE tener retención explícita. Sin excepción.
- `"Indefinido"`, `"sin definir"`, `"TBD"` o una celda vacía **no son políticas de retención válidas para PII**. Se tratan como gap crítico.
- La retención de PII implica además definir el **proceso de purge**:
  - **Quién lo ejecuta** — equipo o rol responsable (ej. data engineering, governance steward).
  - **Cómo se verifica** — evidencia de que el dato fue efectivamente eliminado o anonimizado al vencimiento.
- Si una columna PII se propaga de Bronze → Silver → Gold, su política de retención debe ser **coherente o más estricta** en cada capa descendente, nunca más laxa sin justificación.

| Estado del campo PII | Veredicto |
|---|---|
| Retención + acción + proceso de purge definidos | OK |
| Retención definida, sin proceso de purge | Gap — completar antes de `validate` |
| `Indefinido` / vacío / `TBD` | **Gap crítico — bloquea `publish`** |

---

## RET-006: Dónde vive la política de retención

La política se documenta en tres artefactos del proyecto, cada uno con un nivel de granularidad distinto:

| Artefacto | Granularidad | Qué registra |
|---|---|---|
| `data-dictionary.md` | Por columna | Campo **"Retención"** en cada fila; obligatorio para columnas PII |
| `layer-decision-matrix.md` | Por capa | Horizonte y acción al vencimiento de cada tabla por capa Medallion |
| `governance-checklist.md` | Por proyecto | Retención como dimensión evaluada en el assessment de governance |

Los tres deben ser **consistentes entre sí**. Si el diccionario dice 90 días para un campo y la matriz dice "indefinido" para esa capa, eso es un conflicto que el agente de governance debe resolver antes de continuar.

---

## RET-007: Qué hacer si se detecta una tabla sin política

Cuando el usuario o un agente detecta una tabla —o un campo PII— sin política de retención definida:

1. **Detener el avance.** No proceder a `publish` con tablas PII sin retención definida.
2. **Invocar `@asdd-data-governance`** para definir la política antes de continuar:

```
→ @asdd-data-governance — definir política de retención para {tabla/columna}
   antes de avanzar a {fase}. Capa: {bronze|silver|gold}. PII: {sí|no}.
```

3. El agente de governance produce: período de retención, acción al vencimiento (`purge`/`archive`) y, si hay PII, el proceso de purge con responsable y verificación.
4. Registrar el resultado en los tres artefactos de RET-006.
5. Recién entonces, retomar el flujo desde la fase en que se detuvo.

**Regla absoluta:** una tabla PII sin retención definida **nunca** pasa a `publish`. El gap crítico es bloqueante, no advertencia.

---

## Resumen operativo

- Definir retención **antes** de crear la tabla — en las tres capas.
- PII sin retención explícita = gap crítico bloqueante.
- `"Indefinido"` no es una política válida para PII.
- Documentar en `data-dictionary.md` + `layer-decision-matrix.md` + `governance-checklist.md`, consistentes entre sí.
- Ante un gap → `@asdd-data-governance` define la política antes de continuar.
- La retención exacta se acuerda con el cliente en `discover`; los valores por capa son referencia, no dogma.
