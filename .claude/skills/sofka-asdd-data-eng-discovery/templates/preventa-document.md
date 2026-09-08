<!--
NOTA DE USO

Este es el Documento de Preventa de Smart Data ASDD. Cumple dos roles:

1. Para el humano (consultor Sofka): es la base que se trabaja en Word/PPT para
   presentar al cliente. Se copia, se rellena reemplazando cada {PLACEHOLDER} y se
   adapta el formato a la marca/plantilla comercial del engagement.

2. Para el agente (sofka-asdd-data-eng-discovery): es el formato de referencia. El agente
   lo usa para estructurar la captura de contexto durante el discovery y para evaluar
   documentos de preventa ya existentes, identificando qué secciones están completas,
   cuáles faltan y dónde hay supuestos sin validar.

El nivel de detalle es FLEXIBLE según el tipo de cliente y engagement:

- Un componente de integración puntual puede resolver varias secciones en una o dos
  líneas (equipo, riesgos, stack ya definido por el cliente).
- Una plataforma greenfield o una migración con coexistencia legacy normalmente
  requiere todas las secciones a fondo, con riesgos y preguntas abiertas detallados.

No todas las secciones pesan igual en todos los proyectos: completar con criterio, no
por obligación. Lo que no aplica, marcarlo como "No aplica" en lugar de borrarlo, para
que la evaluación del agente distinga "omitido" de "no relevante".
-->

# Preventa de Datos — {Nombre del cliente}
Fecha: {fecha} | Versión: {1.0} | Estado: {Borrador / Para revisión / Presentado}
Preparado por: {nombre Sofka} | Engagement lead: {nombre}

---

## Tipo de proyecto
Marcar el que aplica:
- [ ] Plataforma de datos completa (greenfield)
- [ ] Migración / modernización (con o sin coexistencia de sistemas legacy)
- [ ] Componente de integración (un dominio o pipeline puntual dentro de un sistema mayor)
- [ ] Otro: _______________

## Problema de negocio
{Qué problema tiene el cliente, en términos de negocio, no técnicos. Qué decisiones no puede tomar, qué datos no tiene, qué procesos están rotos.}

## Alcance propuesto
{Qué se va a construir.}

Queda EXPLÍCITAMENTE fuera del alcance:
{Qué no se va a hacer en este engagement.}

## Stack tecnológico candidato
Plataforma: {Azure + Databricks (ADF · ADLS Gen2 · Azure Databricks) / AWS nativo (Glue · S3 · Athena) / otra}
Justificación a alto nivel: {por qué esta plataforma para este cliente}
Herramientas complementarias: {orquestación, BI, ingesta, etc.}

## Complejidad estimada
Nivel: {Alta / Media / Baja}
Justificación: {2-3 líneas por qué ese nivel}
Factores de riesgo técnico: {legacy, calidad de datos, equipo del cliente, etc.}

## Equipo requerido (lado Sofka)
| Rol | Dedicación estimada | Observaciones |
|---|---|---|
| Arquitecto de Datos | 100% al inicio — va reduciendo según avance del proyecto | Responsable del diseño y las decisiones arquitectónicas |
| Data Engineer | 100% — idealmente 1 persona. Escala a 2 si el volumen lo justifica | Implementa los pipelines con apoyo de los agentes de ingeniería |

## Riesgos principales
1. {Riesgo 1}: {descripción breve e impacto}
2. {Riesgo 2}: {descripción breve e impacto}
3. {Riesgo 3 si aplica}

## Preguntas abiertas
{Lo que aún no se sabe y hay que resolver antes de comprometer el alcance.}

## Próximos pasos
{Qué sigue después de esta preventa si el cliente dice sí.}
