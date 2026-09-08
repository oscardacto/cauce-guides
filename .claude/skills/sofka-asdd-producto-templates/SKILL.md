---
name: sofka-asdd-producto-templates
description: Plantillas canónicas de briefs y specs ASDD. El agente escribe solo en la ruta run-trazable reservada.
---

# Plantillas de artefactos de producto — ASDD

Provee la estructura canónica de los dos artefactos centrales del flujo Especificar → Analizar.

## Cuándo usar

- Fase **Especificar** (`/sofka-asdd:specify`) → leer `reference/brief-template.md` y producir el brief.
- Fase **Analizar** (`/sofka-asdd:analyze`) → leer `reference/spec-template.md` y producir el spec consolidado.

## Reglas de uso

0. La ruta llega resuelta en el plan/prompt y cumple
   `{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`. No inventar nombres ni usar fallbacks
   como `brief-{proyecto}.md`; si falta la ruta, retornar `PLAN UPDATE REQUERIDO`.
1. Copiar la estructura completa del template; no omitir secciones.
2. Si una sección no aplica, escribir explícitamente "No aplica — {razón}" en lugar de eliminarla.
3. Mantener trazabilidad: cada historia (`HU-NNN`) referencia el caso de uso (`CU-NNN`) que la origina, y cada caso de uso referencia las reglas de negocio (`RN-NNN`) que lo gobiernan.
4. Las secciones técnicas (arquitectura, seguridad, tech) se completan SOLO si los roles correspondientes fueron invocados (ver triggers en los commands).

## Archivos

- `reference/brief-template.md` — estructura canónica del brief (fase Especificar)
- `reference/spec-template.md` — estructura canónica del spec (fase Analizar)

## Cuándo NO invocar

- Ya existe una spec o brief para el feature en `docs/specs/` — si el artefacto existe, usar directamente los skills `po`, `ba` o `funcional` para enriquecerlo; invocar `templates` para re-crear un artefacto existente produce duplicados que divergen y generan confusión sobre cuál es la fuente de verdad.
- El requerimiento es documentar trabajo ya completado (brief post-implementación) — las plantillas están diseñadas para capturar decisiones antes de construir; usarlas post-hoc produce documentos que omiten las alternativas reales descartadas y los riesgos que se materializaron, resultando en artefactos de valor nulo para futuros ciclos.
- El equipo necesita análisis de negocio profundo (gap analysis, modelado AS-IS/TO-BE, elicitación de reglas de negocio) — ese trabajo corresponde a `sofka-asdd-producto` con skill `ba`; las plantillas proveen estructura, no el análisis en sí.

## Anti-patterns

- **Plantilla sin adaptar al contexto del proyecto** — copiar el template y dejarlo con placeholders sin completar (`{nombre del cliente}`, `{fecha}`, `{descripción del sistema}`) o con secciones de ejemplo del template que no aplican al proyecto real. Un artefacto con placeholders visibles no puede usarse como input para el siguiente agente y bloquea el flujo ASDD.
- **Template de HU cuando se necesita un brief de proyecto** — usar `reference/spec-template.md` (orientado a historias de usuario y criterios de aceptación) para documentar el alcance y contexto inicial de un proyecto completo. El brief (`brief-template.md`) responde qué construimos y para quién; el spec responde cómo lo verificamos; confundir ambos produce un artefacto que no satisface ninguna de las dos preguntas.
- **Completar el template antes de la sesión de refinamiento** — rellenar el spec o brief de forma unilateral (sin el Product Owner ni el domain expert) y presentarlo como validado. Las plantillas capturan el output de una sesión de refinamiento; si se completan antes, contienen asunciones que serán rebatidas por el negocio en el review, obligando a reescribir secciones completas y perdiendo la trazabilidad de los cambios.
