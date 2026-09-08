---
name: BA Decision Lifecycle
description: Ciclo de vida de decisiones pendientes durante creación y revisión de EDT.
---

## Nomenclatura unificada de decisiones pendientes

Las decisiones pendientes que detectes durante la descomposición deben clasificarse con uno de estos subtipos:

- **`[VACÍO_DE_FUENTE]`** — la fuente no contiene la información necesaria; alguien debe aportar el dato.
- **`[VACÍO_DE_REQUISITO]`** — la funcionalidad está en el alcance pero falta el detalle de cómo opera (lógica, regla, valor).
- **`[CONFLICTO_FUENTES]`** — dos fuentes de verdad describen el mismo aspecto de forma contradictoria; el arquitecto debe dictaminar cuál prevalece.
- **`[INTERFAZ_PENDIENTE]`** — una integración o contrato de API necesario no está definido, no existe aún, o tiene gaps en su payload.
- **`[DECISIÓN_ARQUITECTURA]`** — la resolución requiere una ADR o decisión de arquitectura que no se ha tomado todavía.
- **`[DOMINIO_INEXPERTO]`** — requiere criterio sectorial de asdd-ba-functional-sme para resolverse.
- **`[ESCALAMIENTO_AL_CLIENTE]`** — solo el cliente (área de negocio, dueño del proceso) puede dictaminar.
- **`[BRECHA_DE_FILTRO]`** — no aplica a ti directamente; lo levanta asdd-ba-specification-auditor.

### Marcador de referencia no verificada: `[ESTIMADO]`

Se usa inline en los campos `Fuentes principales`, `Alcance` o `Datos` de una hoja cuando se cita un nombre técnico (evento, tabla, campo) que no pudo verificarse contra su contrato (AsyncAPI o DBML) porque el contrato no estaba disponible. Indica que el dato es una estimación del descomponedor, no un dato verificado.

Ejemplo: `tabla de comisionistas [ESTIMADO — verificar contra DBML antes de construir]`.

No es un subtipo de decisión pendiente — es un marcador de referencia. Toda hoja con al menos un `[ESTIMADO]` debe mencionarse en §0 bajo "Fuentes consultadas" con la nota sobre qué contrato faltaba.

### Scope estricto de TUS decisiones pendientes

**Esta es la regla más importante de esta sección.** Solo levantas decisiones pendientes que cumplen al menos uno de estos tres criterios:

1. **Afectan la delimitación entre hojas** — fronteras ambiguas que harían que dos hojas se solapen o queden sin definición clara.
2. **Afectan la viabilidad de una hoja** — situaciones donde una hoja no se puede dimensionar ni cerrar su alcance sin información que falta.
3. **Afectan la composición del catálogo** — situaciones donde algo del alcance recibido no se puede descomponer porque falta información que determina si entra o sale del catálogo.

### Lo que NO levantas

**No levantas decisiones que asdd-ba-specification-lead descubrirá naturalmente al redactar cada hoja.** Ejemplos que **NO** debes levantar tú:

- Plantillas de documentos específicos que faltan.
- Contratos de API de sistemas legacy no documentados.
- Valores faltantes en celdas específicas de hojas de cálculo.
- NFRs con valor placeholder (SLA exacto, volumetría exacta).
- Modelos de cálculo específicos que requieren criterio actuarial.
- Listas de valores cerrados que el cliente debe definir.

Para estos casos: mencionarlos brevemente en "Notas para el AF" de la hoja afectada como **alerta operativa** (no como decisión pendiente formal).

### Regla práctica

Pregúntate antes de levantar una decisión pendiente: *"¿Esta decisión afecta cómo descompongo el módulo, o afecta cómo se redacta una hoja específica?"*

- Si afecta la descomposición → la levantas tú.
- Si afecta la redacción de una hoja → asdd-ba-specification-lead la detectará y la moverá a Sección 14 de la hoja correspondiente.

---

## Ciclo de vida de las DPs — protocolo de incorporación y limpieza

Cuando el AF entrega respuestas a DPs (formulario, revisión con el arquitecto, directiva en el chat), ejecutar este protocolo en orden. Cada paso es obligatorio antes de pasar al siguiente.

### Paso 1 — Anotar la decisión adoptada en §4

Para cada DP respondida, añadir en su entrada existente de §4:
- `- **Decisión adoptada:** [texto exacto o parafraseado fiel de la respuesta]`
- `- **Estado:** [RESUELTA / PARCIALMENTE RESUELTA / CONFIRMADO-BLOQUEANTE]`

| Estado | Cuándo aplicarlo |
|---|---|
| `RESUELTA` | La decisión cierra la pregunta completamente; asdd-ba-specification-lead puede actuar sin restricciones |
| `PARCIALMENTE RESUELTA` | Tiene respuesta técnica pero quedan aspectos funcionales o de negocio pendientes de escalamiento |
| `CONFIRMADO-BLOQUEANTE` | La DP confirma que la fuente o interfaz requerida no está disponible; las hojas afectadas siguen bloqueadas |

### Paso 2 — Propagar a §2 (notas de hojas afectadas)

En cada hoja referenciada por la DP, reemplazar todo lenguaje `DP-XXX abierta` por la nota resuelta. Hacer la sustitución en: `Notas para el AF`, citas inline en `Alcance`, y citas en `Fuentes principales`.

Formato según estado:
- `✅ **DP-XXX RESUELTA (ver §4):** [resumen ejecutivo de la decisión — suficiente para que asdd-ba-specification-lead actúe]`
- `⚠️ **DP-XXX PARCIALMENTE RESUELTA (ver §4):** [qué está definido; qué sigue pendiente]`
- `🚫 **DP-XXX CONFIRMADO-BLOQUEANTE (ver §4):** [qué falta; cuáles hojas siguen bloqueadas]`

### Paso 3 — Actualizar §3.1 y §3.3

- En §3.1 (tabla de cobertura): reemplazar celdas con `DP-XXX abierta:...` por `DP-XXX RESUELTA:` con resumen de una línea.
- En §3.3a (niveles topológicos): actualizar anotaciones `*(DP-XXX abierta)*` en los ítems afectados.

### Paso 4 — Limpiar §4 (la regla clave)

Una vez aplicados los pasos 1-3 para todas las DPs del lote:

**Eliminar de §4** las entradas con `Estado: RESUELTA`.

**Mantener en §4** únicamente:
- `CONFIRMADO-BLOQUEANTE` — bloquea hojas activamente y requiere seguimiento de programa.
- `PARCIALMENTE RESUELTA` — tiene aspectos funcionales abiertos que pueden surgir en asdd-ba-specification-lead.

**Principio:** §4 es un registro activo de impedimentos, no un historial. Solo viven aquí los ítems que todavía frenan la construcción de una o más hojas. El historial va en §3.5.

Actualizar también la nota introductoria de §4 con el nuevo conteo:
`> **Estado de resolución (AAAA-MM-DD):** N RESUELTAS · M PARCIALMENTE RESUELTA(S) · K CONFIRMADO-BLOQUEANTE(S). Historial completo en §3.5.`

### Paso 5 — Registrar en §3.5

Añadir una entrada de versión en §3.5 con:
- Párrafo introductorio describiendo el lote de resoluciones.
- Tabla: `| DP | Estado | Decisión adoptada (resumen) |` — una fila por DP resuelta en este lote.

### Paso 6 — Actualizar §0 y footer

- Campo `Decisiones pendientes` en §0: actualizar conteo (ej. `17 resueltas · 1 CONFIRMADO-BLOQUEANTE`).
- `Versión`: incrementar minor (`6.1` → `6.2`).
- `Artefacto`: actualizar sufijo de versión.
- Footer: `*Última actualización: AAAA-MM-DD · vX.Y.*`

### Paso 7 — Activar `asdd-ba-change-log`

Tipo `ESTADO` sobre el artefacto EDT. Descripción: "EDT vX.Y → vX.(Y+1): resolución de N DPs — [lista de estados]."

---
