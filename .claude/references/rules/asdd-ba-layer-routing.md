# Routing — Capa BA del Analista Funcional

Define cuándo el orquestador activa la capa BA (`asdd-ba-*`) en lugar de
(o además de) `asdd-producto`. Complementa `asdd-routing-heuristics.md`.
La capa BA es **opcional e independiente**: coexiste con `asdd-producto`,
no lo reemplaza ni fusiona su modelo de trabajo (ver ADR-006 en `docs/adoption/`).

## Señales para activar la capa BA

- El usuario pide explícitamente el flujo BA. Los **5 agentes** de la capa son:
  `asdd-ba-functional-architect` (brief + EDT), `asdd-ba-specification-lead`
  (contenido funcional de la spec + DVF/HU + FR/NFR), `asdd-ba-specification-auditor`
  (auditoría de 19 filtros + MECE + coherencia), `asdd-ba-scope-manager`
  (alcance temprano + control de cambios + hallazgos UAT) y `asdd-ba-functional-sme`
  (vacíos de dominio).
- El AF necesita **encuadrar el alcance ANTES de que exista baseline** (discovery/brief/EDT) → `asdd-ba-scope-manager` (skill `early-scope`).
- El AF necesita evaluar una solicitud de cambio, un hallazgo de alcance o un posible scope creep contra el baseline acordado → `asdd-ba-scope-manager` (skill `scope-control`, activable en Fase 5/6).
- El AF necesita clasificar los hallazgos de una sesión de UAT (defectos, gaps, cambios de alcance, dudas) y enrutarlos a su dueño → `asdd-ba-scope-manager` (skill `uat-classifier`, Fase 5 — Gestión de Hallazgos UAT).
- El AF necesita **registrar** lecciones aprendidas al cerrar un ciclo → skill `asdd-ba-log-lessons-learned` (invocado por `functional-architect` o `scope-manager`). La **consulta** de lecciones al inicio es lectura directa de `docs/lecciones/` por `asdd-ba-functional-architect` (no es un skill aparte).
- El AF necesita resolver un vacío de dominio (`[DOMINIO_INEXPERTO]` /
  `[VACÍO_DE_FUENTE]`) → `asdd-ba-functional-sme` como soporte transversal, activable
  desde cualquier fase BA (no pertenece a un paso fijo).
- El AF trabaja de forma personal/standalone, EDT-driven: construir el brief y descomponer un
  alcance amplio en una EDT jerárquica (1.X.Y) con `asdd-ba-functional-architect` → construir el contenido
  funcional de una spec-funcional hoja por hoja con `asdd-ba-specification-lead` → auditarla contra el
  framework de 19 filtros (+ MECE / coherencia) con `asdd-ba-specification-auditor` → registrar en la bitácora BA (skill `change-log`).
- El AF pide un **Documento de Validación con Cliente (DVF/DVC)** para firma del
  negocio, o una **Historia de Usuario (HU)** ágil para el backlog del equipo,
  a partir de una spec-funcional aprobada o de `inputs/` + EDT →
  `asdd-ba-specification-lead` (skills `client-validation` / `user-story`).
- El trabajo ocurre **fuera** del ciclo ASDD orquestado del equipo (sin
  `.asdd-run.json` activo para ese feature, sin coordinación multi-dominio).

## Cuándo NO usar la capa BA (usar `asdd-producto` en su lugar)

- El feature corre dentro del workflow ASDD del equipo, fase **Analizar**
  (WF-002, modelo spec-per-área ADR-004) — ahí `asdd-producto` (skills
  `ba` → `funcional` → `po`) es el autor único del spec-funcional y coordina
  la autoría multi-dominio (Mapa de dominios, INDEX, Gate DOR).
- El request es una feature/HU nueva en ruta FULL sin mención explícita de EDT
  ni del flujo BA — por defecto usar `asdd-producto`.

## Artefacto compartido — mismo template, layouts distintos

Ambos caminos producen el **mismo artefacto funcional** usando
`spec-funcional-template.md` (skill `asdd-producto-templates`, ADR-004), pero
cada camino usa su propio layout de archivos:

**Ciclo ASDD del equipo (`asdd-producto`):** Layout ART-001 plano en `docs/specs/`:
```
{run_id}-{PHASE}-{SEQ}-{slug}-funcional.md
```

**Capa BA standalone:** una carpeta por nodo EDT en `docs/specs/`:
```
{codigo}-{slug}/
  {codigo}-funcional-{slug}.md
```

Ver `.claude/reference/ba/asdd-ba-specs-layout.md` para la convención completa.

La capa BA solo redacta las secciones AF (§1, §2, §3, §4, §6, §7, §14) del
spec-funcional. En el **ciclo del equipo**: nunca el Mapa de dominios multi-área,
el INDEX del ciclo (`{run_id}-*-index.md`) ni los `spec-{area}` de otros dominios
— esos son responsabilidad exclusiva de `asdd-producto`. En modo **standalone
AF**: la capa BA SÍ crea el `{codigo}-index.md` del nodo vía skill
`asdd-ba-spec-index` — ese index es distinto del INDEX del equipo.

## Regla de desambiguación

Si el request tiene señales de ambos caminos (ej. "descomponé este backlog en
EDT" + "esto es para el sprint del equipo con INDEX activo"), el orquestador
**NO auto-elige**. Pregunta al usuario UNA sola vez:

> ¿Este trabajo es tu flujo personal de Analista Funcional (EDT → capa BA,
> standalone) o parte del ciclo ASDD orquestado del equipo (spec-per-área,
> `asdd-producto`)?

Sin respuesta clara → repetir la pregunta; nunca asumir.

## Nota — dimensión de dominio (routing bidimensional futuro)

Esta distinción encaja como una dimensión de **"dominio de trabajo"** (BA
personal vs. equipo orquestado) ortogonal a la fase ASDD (ORC-001) — precedente
para un futuro routing bidimensional (fase × dominio, R5). Por ahora se resuelve
con la pregunta de desambiguación de arriba, no con una tabla de arbitraje formal.
