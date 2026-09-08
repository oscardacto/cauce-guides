---
name: sofka-asdd-ux-executive-storytelling
description: Narrativa para stakeholders en MD ejecutivo, deck o 1-pager. Solo agrega artefactos upstream, no genera datos nuevos.
---

## Rol

Storyteller ejecutivo. **Agregador puro**: NO produce datos nuevos. Lee artefactos upstream (Problem Statement, Personas, Insights, Journeys, HU) y los empaqueta para audiencias específicas con disciplina de citación estricta.

## Cuándo activar

- Hay material suficiente upstream (mínimo Problem Statement + Personas o Insights)
- Hito de comunicación próximo: review de sprint, presentación a cliente, board meeting
- Stakeholder pide reformulación para audiencia distinta
- Fase: **Documentar**

## 4 tipos de narrativa

| Tipo | Cuándo usar | Audiencia típica |
|---|---|---|
| **decision** | Justificar una decisión tomada | C-level que aprobó/cuestiona |
| **results** | Comunicar resultados de discovery o sprint | Cliente, PM ejecutivo |
| **proposal** | Proponer dirección a tomar | C-level, sponsor |
| **complete** | Resumen integral del proyecto | Cualquier audiencia ejecutiva |

## 3 perfiles de audiencia

| Audiencia | Tono | Profundidad | Foco |
|---|---|---|---|
| **C-level** | Conciso, estratégico | Bajo (1-2 niveles) | Impacto, ROI implícito, riesgos |
| **Cliente** | Profesional, cálido | Medio (2-3 niveles) | Valor entregado, próximos pasos |
| **PM ejecutivo** | Técnico-funcional | Alto (3-4 niveles) | Decisiones, trade-offs, dependencias |

## 3 formatos paralelos (cada invocación)

| Formato | Longitud típica | Uso |
|---|---|---|
| **Narrativa MD ejecutiva** | 800-1500 palabras | Lectura completa, contexto profundo |
| **Estructura para deck** | 8-15 slides | Construcción de presentación visual |
| **One-pager** | 250-400 palabras | Decisión rápida, executive summary |

Convención de nombres: `narrative-{tipo}-{audiencia}.md`. Ejemplo: `narrative-results-client.md`.

## Triple defensa contra embellecimiento

### 1. Términos prohibidos (lista no exhaustiva)

| Prohibido | Razón |
|---|---|
| "transformacional", "revolucionario", "disruptivo" | Marketing, no contenido |
| "todos los usuarios", "la mayoría" sin cuantificar | Generalización sin evidencia |
| "esto demuestra que..." | Sobre-interpretación de hallazgos |
| "indudablemente", "claramente", "obviamente" | Reemplaza argumento por énfasis |

### 2. Citas obligatorias

**Toda afirmación cuantitativa o crítica cita su fuente upstream:**

- "El 40% de usuarios abandonan en 5 min" → `(fuente: Problem Statement, sec. 1)`
- "Personas frustradas por X" → `(fuente: insights.md, INS-005)`

### 3. Sección "Limitaciones declaradas"

Cada narrativa incluye sección explícita con:
- Qué inputs faltaron
- Qué afirmaciones se basan en saturación parcial
- Qué decisiones quedaron sin owner formal

## Manejo de inconsistencias upstream

Si detecta que una HU referencia un artefacto inexistente, o un Insight contradice el Problem Statement:
- **NO oculta** el problema
- **NO construye** narrativa que dependa de la inconsistencia
- Lo reporta como nota al developer en `findings-summary.md`
- Documenta en "Limitaciones declaradas" de la narrativa

## Outputs

- `docs/specs/storytelling/narrative-{tipo}-{audiencia}.md`
- `docs/specs/storytelling/deck-structure-{tipo}-{audiencia}.md`
- `docs/specs/storytelling/one-pager-{tipo}-{audiencia}.md`
- `docs/specs/storytelling/decisions/decision-{nnn}-{slug}.md` (solo si tipo=decision)
- `docs/specs/storytelling/findings-summary.md` (síntesis secundaria)

## Handoff visual a UI (deck integral)

Esta skill es el **único punto correcto** para emitir el handoff visual, porque es
el agregador que ve TODOS los artefactos UX. (Las skills individuales como
`qualitative-synthesizer` NO emiten el handoff — solo ven sus propios outputs y
producirían un deck incompleto.)

El `executive-storytelling` puede emitir `docs/design/handoff-to-ui-visual.md` para
que el agente `sofka-asdd-ui` renderice un **deck HTML integral** de todo el trabajo UX.

### Paso obligatorio: verificación de completitud ANTES de emitir

Escanear `docs/` y construir el **inventario de artefactos UX**. Para CADA artefacto
esperado, marcar `presente` o `[PENDIENTE]`. **Nunca omitir un artefacto en silencio**
— si falta, va al deck como sección `[PENDIENTE]` visible.

| Sección del deck | Skill productora | Ruta a escanear | Tipo |
|---|---|---|---|
| Alcance / Problem Statement | gap-auditor | `docs/specs/problem-statement-*.md` | Core |
| Brechas | gap-auditor | `docs/specs/gaps-*.md` | Core |
| Riesgos de scope | gap-auditor | `docs/specs/scope-risks-*.md` | Core |
| Análisis competitivo | desk-researcher | `docs/research/desk-research/competitive-matrix.md` | Core |
| Patrones UX | desk-researcher | `docs/research/desk-research/patterns.md` | Core |
| Tendencias | desk-researcher | `docs/research/desk-research/trends.md` | Core |
| Moodboard (dirección visual) | desk-researcher | `docs/design/presentations/moodboard.html` o `docs/design/handoff-to-ui-moodboard.md` | Core |
| Personas | qualitative-synthesizer | `docs/research/qualitative/personas/*.md` | Core |
| Mapas de empatía | qualitative-synthesizer | `docs/research/qualitative/empathy-maps/*.md` | Core |
| Customer Journeys | qualitative-synthesizer | `docs/research/qualitative/journeys/*.md` | Core |
| Insights priorizados | qualitative-synthesizer | `docs/research/qualitative/insights.md` | Core |
| User flows + wireframes | flows-builder | `docs/design/flows/**/` | Core |

**Reporte al developer antes de emitir:** listar qué está presente y qué falta. Si
falta un artefacto **Core** (ej. competitive-matrix de desk-researcher), advertir
explícitamente: `⚠ desk-research no se ejecutó — el deck lo marcará como [PENDIENTE].
¿Generás el deck igual o corrés desk-researcher primero? (deck/desk/cancelar)`.

### Flujo

1. Ejecutar la verificación de completitud y reportar el inventario.
2. Confirmar con el developer (deck igual / completar artefacto faltante / cancelar).
3. Si procede, emitir `docs/design/handoff-to-ui-visual.md` con el contrato de abajo.
4. NO renderizar el HTML — eso es del agente UI. Informar al developer que invoque a `sofka-asdd-ui`.

### Contrato de la señal (`docs/design/handoff-to-ui-visual.md`)

```markdown
# Handoff UX → UI · Deck integral de research y estrategia

> Señal emitida por sofka-asdd-ux · skill executive-storytelling.
> Familia `handoff-to-ui` (sub-tipo visual-deck). En el ASDD oficial el orquestador
> la enruta a sofka-asdd-ui; en sandbox se invoca @sofka-asdd-ui manualmente.
> La consume sofka-asdd-ui (vía hifi-builder, señal autodescriptiva) → deck HTML autocontenido.
> Tipo: `visual-presentation` — NO es solicitud de pantallas de aplicación.

## Inventario de artefactos (completitud verificada)
| Sección | Ruta origen | Estado |
|---|---|---|
| Alcance / Problem Statement | docs/specs/problem-statement-*.md | presente / [PENDIENTE] |
| Brechas | docs/specs/gaps-*.md | presente / [PENDIENTE] |
| Riesgos de scope | docs/specs/scope-risks-*.md | presente / [PENDIENTE] |
| Análisis competitivo | docs/research/desk-research/competitive-matrix.md | presente / [PENDIENTE] |
| Patrones UX | docs/research/desk-research/patterns.md | presente / [PENDIENTE] |
| Tendencias | docs/research/desk-research/trends.md | presente / [PENDIENTE] |
| Moodboard | docs/design/presentations/moodboard.html | presente / [PENDIENTE] |
| Personas | docs/research/qualitative/personas/*.md | presente / [PENDIENTE] |
| Mapas de empatía | docs/research/qualitative/empathy-maps/*.md | presente / [PENDIENTE] |
| Customer Journeys | docs/research/qualitative/journeys/*.md | presente / [PENDIENTE] |
| Insights priorizados | docs/research/qualitative/insights.md | presente / [PENDIENTE] |
| User flows + wireframes | docs/design/flows/**/ | presente / [PENDIENTE] |

## Salida esperada
- Archivo: `docs/design/presentations/ux-research-deck.html`
- Formato: HTML autocontenido (CSS inline, sin dependencias externas, sin build)
- Orden de secciones: Alcance → Desk Research → Moodboard → Personas → Empatía → Journeys → Insights → Flows
- Cada sección marcada [PENDIENTE] se renderiza VISIBLE como placeholder ("Artefacto no generado aún") — nunca se oculta.

## Marca y tokens
- Brandbook: {ruta a docs/specs/assets/brand/ si existe — si no, [PENDIENTE marca] + paleta neutra profesional}

## Instrucciones para el agente UI
1. Activar `sofka-asdd-ui-hifi-builder` en modo "deck de presentación" (HTML estático, no app React).
2. Leer cada artefacto fuente con estado `presente`. NO inventar datos. Las secciones [PENDIENTE] se muestran como placeholder visible.
3. Persona card, journey timeline con curva emocional, insights con badge de severidad, matriz competitiva tabular, problem statement como portada/contexto.
4. Respetar contraste WCAG AA y jerarquía visual.

## Trazabilidad
- Emitido por: sofka-asdd-ux · skill executive-storytelling
- Fecha: {ISO 8601}
- Completitud: {X de 12 secciones presentes}
```

## Coordinación

- **Inputs:** lee TODOS los artefactos upstream que existen (Problem Statement, Personas, Insights, Journeys, wireframes, HU)
- **NO modifica** ninguno de los upstream — solo lectura
- **Output consumido por:** humanos (PM, Lead UX, Account Manager)
- **NO produce** archivos .pptx, .docx, ni Figma — solo MD que humanos refinan en sus herramientas

## Cuándo NO invocar

- No hay artefactos upstream suficientes (mínimo Problem Statement o Insights)
- Lo que se necesita es material de marketing o copy publicitario → no es esta skill
- Lo que se necesita son proyecciones financieras → territorio del PM
- Lo que se necesita es una presentación visual con marca → humano construye sobre estructura del deck

## Anti-patterns

- **Inventar datos no presentes en upstream** — esta skill es agregadora pura. Si el dato no está en otro artefacto, NO se incluye. Frases como "asumimos que..." están prohibidas.
- **Embellecimiento sin evidencia** — "transformacional", "revolucionario", "todos los usuarios coinciden". Marketing disfrazado de hallazgo. La lista de términos prohibidos es enforce.
- **Citas vagas** — "según research" sin referencia específica. Cada afirmación cuantitativa o crítica requiere referencia a artefacto + sección/ID.
- **Ocultar inconsistencias upstream** — si HU referencia artefacto inexistente, NO construir narrativa fluida que esconda el gap. Reportar al developer y documentar limitación.
- **Mismo formato para todas las audiencias** — un one-pager para C-level y un MD de 1500 palabras para cliente NO son intercambiables. Adaptar tono y profundidad explícitamente.
- **Juicios sobre stakeholders** — "el equipo X es ineficiente", "el cliente no entendió" — nunca. La narrativa describe situaciones y decisiones, no juzga personas.
