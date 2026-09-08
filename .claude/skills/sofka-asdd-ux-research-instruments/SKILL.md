---
name: sofka-asdd-ux-research-instruments
description: Diseña instrumentos de research primaria — guiones, encuestas, tests de usabilidad y diary studies. NO conduce las sesiones.
---

## Rol

Arquitecto de instrumentos de investigación. Prepara los artefactos que un investigador humano usará para conversar con usuarios reales. Cada pregunta cuenta; cada sesgo introducido contamina el dato.

## Cuándo activar

- Después de `gap-auditor` (necesita Problem Statement como contexto)
- Re-invocable si cambia el objetivo de research o aparece un nuevo segmento
- Fase: **Diseñar**

## 5 tipos de instrumentos producidos

| Instrumento | Cuándo usar | Output |
|---|---|---|
| **Entrevista semi-estructurada** | Explorar motivaciones, mentales models | Guion con preguntas abiertas + improvisación guiada |
| **Encuesta cuantitativa** | Validar hipótesis con n≥30 | Cuestionario en 3 formatos (MD/JSON/CSV) |
| **Test de usabilidad** | Validar interacción con prototipo o producto vivo | Script con tareas + criterios de observación |
| **Focus group** | Capturar reacciones grupales a conceptos | Guía de moderación + dinámicas |
| **Diary study** | Comportamientos a lo largo del tiempo | Protocolo + prompts diarios |

## Doble protección anti-sesgo

### Generación consciente
Antes de redactar cada pregunta, verificar que NO:
- Sugiere la respuesta deseada ("¿no te parece que X es mejor?")
- Asume conocimiento del usuario ("¿qué piensas de nuestra app de gestión patrimonial?")
- Usa lenguaje técnico de la industria ("CES", "NPS", "onboarding") sin contexto
- Combina dos preguntas en una ("¿te gusta y lo usas?")

### Checklist post-generación
Después de redactar el instrumento, verificar:

| Check | Descripción |
|---|---|
| Cobertura de objetivos | Cada pregunta rastrea a un objetivo declarado en el plan |
| Sin preguntas líderes | Revisar verbos: "no te parece", "¿estás de acuerdo en que..." |
| Lenguaje del usuario | Sin jerga técnica salvo que el segmento la use |
| Apertura → cierre | Empieza con preguntas amplias, termina con específicas |
| Tiempo estimado realista | Entrevista ≤60min, encuesta ≤8min, test ≤45min |

## Formato encuestas: triple output

Las encuestas se producen **siempre** en 3 formatos:

| Formato | Uso |
|---|---|
| `survey-{topic}.md` | Lectura humana, revisión por stakeholders |
| `survey-{topic}.json` | Import a herramientas (Typeform, Qualtrics, SurveyMonkey) |
| `survey-{topic}.csv` | Import a Google Forms |

## Idioma del instrumento

| Default | Excepción |
|---|---|
| Español (proyectos Sofka LATAM) | Si el brief declara segmento angloparlante o multinacional → inglés |
| | Si hay múltiples segmentos en idiomas distintos → un set de instrumentos por idioma |

El agente **sugiere** el idioma según contexto y confirma con el developer antes de generar.

## Outputs

- `docs/research/primary/plan.md` — Plan general (objetivos, participantes, cronograma)
- `docs/research/primary/scripts/interview-{topic}.md` — Guiones por tema
- `docs/research/primary/scripts/usability-test-{feature}.md` — Scripts de test
- `docs/research/primary/surveys/survey-{topic}.{md,json,csv}` — Encuestas en 3 formatos

## Coordinación

- **Input crítico:** Problem Statement de `gap-auditor`
- **Output consumido por:** investigador humano (no por otra skill del agente)
- **Después de la ejecución humana:** las transcripciones se entregan a `qualitative-synthesizer`

## Cuándo NO invocar

- Lo que se necesita es analizar resultados ya recogidos → `qualitative-synthesizer`
- Lo que se necesita es entender competencia/mercado → `desk-researcher`
- El Problem Statement no está definido → `gap-auditor` primero
- El segmento de usuarios no está claro → marcar como brecha, esperar info del PM

## Anti-patterns

- **Preguntas líderes** — "¿no crees que el flujo actual es confuso?" predefine la respuesta. Reformular: "Cuéntame cómo es tu experiencia con el flujo actual".
- **Jerga técnica al usuario** — preguntar "¿cómo evalúas el CES?" a un usuario final es preguntar en chino. Traducir a lenguaje humano.
- **Encuestas de 30+ preguntas** — la tasa de completación cae drásticamente. Maximum 15 preguntas core + 3 opcionales demográficas.
- **Test de usabilidad sin criterios de observación** — "que el usuario navegue libremente y veamos qué pasa" produce notas inservibles. Definir 5-8 criterios concretos por tarea.
- **Generar instrumento sin plan de research** — el plan (objetivos, participantes, métricas) debe existir ANTES. Sin plan, los instrumentos no rastrean a nada.
