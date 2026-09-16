---
name: feedback-no-borrar-artefactos-verificacion
description: Los artefactos de verificación (Lighthouse, screenshots, logs) nunca se borran tras mirarlos — quedan en disco como evidencia auditable.
type: feedback
---

Los artefactos de verificación (reportes de Lighthouse, screenshots, logs de test) NUNCA se borran después de mirarlos. Quedan en disco.

**Por qué:** en la maquetación de la guía del huésped (2026-09-15) un agente corrió Lighthouse y un render a 390 px, extrajo los valores, reportó los criterios como cumplidos y borró los reportes. El veredicto sobrevivió; la evidencia no. Nadie puede auditar después si el criterio se cumplió de verdad o si el resumen fue optimista — que es exactamente el patrón de "verificador que declara ok sin evidencia" documentado en el ADR-023 de este repo.

**Cómo aplicarlo:** dejá los artefactos en un directorio de verificación junto al entregable. Si ocupan demasiado o no deben versionarse, decilo y que el dueño decida — no los borres por tu cuenta.
