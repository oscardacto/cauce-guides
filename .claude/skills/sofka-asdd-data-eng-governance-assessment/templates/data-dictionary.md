---
fecha: YYYY-MM-DD
actualizado: YYYY-MM-DD
estado: En ejecución
generado_por: sofka-asdd-data-governance
plataforma: {Azure + Databricks / AWS nativo}
---

# Diccionario de Datos — {cliente}

> **Nota de sincronización:** este archivo es la copia de trabajo de Claude.
> La fuente de verdad editable es `smart-data-eng-{cliente}.xlsx` (pestaña Diccionario).
> Cuando haya cambios en el Excel, indicarle a Claude que sincronice.

---

**Sistema fuente / tabla:** {nombre de la tabla en el sistema fuente}
**Owner del dataset:** {equipo responsable}

## Descripción
{Para qué sirve esta tabla, qué representa en términos de negocio, quién la produce y quién la consume.}

---

## Schema

### ORIGEN — campos tal como vienen del sistema fuente

| Tabla entrada | Columna / variable | Tipo de dato entrada | Descripción de negocio | Ejemplo | PII | Owner del campo | Retención | Retención aprobada | Regla de calidad |
|---|---|---|---|---|---|---|---|---|---|
| {tabla_fuente} | {columna} | {VARCHAR/INT/DATE} | {qué representa} | {valor real} | {Sí/No} | {equipo} | {5 años} | {Sí/No} | {no nulo, rango válido} |

### BRONZE — ingesta raw

| Columna / variable | Schema hint Bronze | Nombre en Bronze |
|---|---|---|
| {columna} | {string — solo si Auto Loader inferiría mal} | {vacío si mismo nombre} |

### SILVER — limpio y tipado

| Columna / variable | Nombre en Silver | Tipo Silver | Transformación | Nullable Silver |
|---|---|---|---|---|
| {columna} | {vacío si mismo nombre} | {DATE} | {CAST(VARCHAR → DATE)} | {No} |

---

## Historial de cambios
| Versión | Fecha | Cambio | Impacto |
|---|---|---|---|
| 1.0 | {fecha} | Versión inicial | — |
