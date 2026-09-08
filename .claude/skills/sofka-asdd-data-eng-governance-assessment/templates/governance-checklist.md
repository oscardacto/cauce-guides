---
fecha: YYYY-MM-DD
actualizado: YYYY-MM-DD
estado: En ejecución
generado_por: sofka-asdd-data-governance
alcance: {tablas/datasets evaluados}
---

# Governance Assessment — {Proyecto / Dataset}

---

## Resumen ejecutivo

| Dimensión | Estado | Gaps críticos |
|---|---|---|
| Lineage | 🔴/🟡/🟢 | {descripción breve} |
| Calidad | 🔴/🟡/🟢 | |
| PII y datos sensibles | 🔴/🟡/🟢 | |
| Retención | 🔴/🟡/🟢 | |
| Control de acceso | 🔴/🟡/🟢 | |
| Compliance | 🔴/🟡/🟢 | N/A si no aplica |

🔴 No existe o crítico | 🟡 Parcial o en progreso | 🟢 Completo y operativo

---

## Lineage
🔴/🟡/🟢 ¿Está trazado el origen de cada tabla hasta su destino final?
Notas: {___}
🔴/🟡/🟢 ¿El lineage llega a nivel de columna para datos regulados?
Notas: {___}
🔴/🟡/🟢 ¿Hay herramienta de lineage activa o documentación manual actualizada?
Notas: {___}

## Calidad de datos
🔴/🟡/🟢 ¿Hay contratos de datos activos para cada integración inter-equipo?
Notas: {___}
🔴/🟡/🟢 ¿Hay monitores de calidad activos en producción (no solo en desarrollo)?
Notas: {___}
🔴/🟡/🟢 ¿Las reglas de calidad están documentadas por tabla en el diccionario de datos?
Notas: {___}

## PII y datos sensibles
🔴/🟡/🟢 ¿Los campos PII están identificados y marcados en el diccionario de datos?
Notas: {___}
🔴/🟡/🟢 ¿Los campos PII están clasificados por nivel de sensibilidad?
Notas: {___}
🔴/🟡/🟢 ¿Los datos en reposo están cifrados?
Notas: {___}
🔴/🟡/🟢 ¿Hay proceso de enmascaramiento o anonimización para ambientes no productivos?
Notas: {___}

## Retención
🔴/🟡/🟢 ¿Hay política de retención definida por capa (Bronze/Silver/Gold)?
Notas: {___}
🔴/🟡/🟢 ¿El proceso de purge está implementado o tiene fecha comprometida?
Notas: {___}
🔴/🟡/🟢 ¿Los períodos de retención están alineados con los requisitos del negocio y regulatorios (si aplican)?
Notas: {___}

## Control de acceso
🔴/🟡/🟢 ¿El ACL sigue el principio de mínimo privilegio?
Notas: {___}
🔴/🟡/🟢 ¿Los accesos están revisados y son actuales (no hay accesos de ex-empleados o proyectos cerrados)?
Notas: {___}
🔴/🟡/🟢 ¿Hay proceso formal de onboarding/offboarding de accesos a datos?
Notas: {___}

## Compliance (completar solo si aplica al proyecto)
🔴/🟡/🟢 ¿La regulación aplicable al proyecto y al cliente está identificada?
Notas: {___}
🔴/🟡/🟢 ¿Los controles requeridos están documentados y tienen owner?
Notas: {___}
🔴/🟡/🟢 ¿Hay un responsable de compliance nombrado dentro del equipo del cliente?
Notas: {___}

---

## Gaps priorizados

| Gap identificado | Dimensión | Severidad | Owner responsable | Fecha esperada de resolución |
|---|---|---|---|---|
| {descripción del gap} | {dimensión} | {Critical/High/Medium/Low} | {nombre/equipo} | {fecha} |

**Criterio de severidad:**
- Critical: bloquea el go-live o implica riesgo legal
- High: debe resolverse antes del go-live, no bloquea inmediatamente
- Medium: mejora importante, puede resolverse post go-live
- Low: mejora recomendada sin impacto operativo inmediato

---

## Acciones en Excel

Lista plana de lo que el arquitecto o data steward debe completar en el Excel.
Derivada de los gaps con `tipo_accion = excel-update` del reporte anterior.

| Pestaña | Columna | Qué completar |
|---|---|---|
| {pestaña} | {columna} | {instrucción concreta} |

---

## Historial de sincronización

| Versión | Fecha | Cambio |
|---|---|---|
| Sync {YYYY-MM-DD} | {YYYY-MM-DD} | {descripción breve de qué cambió en este Sync} |
