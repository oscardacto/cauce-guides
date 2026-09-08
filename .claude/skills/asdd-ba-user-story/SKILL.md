---
name: asdd-ba-user-story
description: Genera la HU ágil en formato conextra con flujo, reglas, fuera de alcance y Gherkin, trazable al nodo hoja de la EDT.
---

> Rutas en **Layout B** (carpeta por nodo) — ver `.claude/reference/ba/asdd-ba-specs-layout.md`.

## Rol

Construye una Historia de Usuario ágil completa y consistente. Mantiene trazabilidad 1:1 con el nodo hoja de la EDT: un nodo EDT = una spec-funcional = una HU. La relación es invariante.

## Invariante de trazabilidad

**Un nodo hoja de la EDT = una spec-funcional = una HU.** No se crean HUs para nodos intermedios de la EDT, ni para funcionalidades sin nodo EDT asignado. El nodo hoja se codifica `1.X.Y` en `docs/specs/_proyecto/edt-{proyecto}.md`.

## Detección del modo de construcción

Al activarse, verificar si existe la spec-funcional correspondiente (`Estado` en §0):

```
Si existe docs/specs/{codigo}-{slug}/{codigo}-funcional-{slug}.md con Estado APROBADA o APROBADA CON OBSERVACIONES:
    → Modo A: extracción desde la spec-funcional (+ slices por puntero)

Si existe docs/specs/{codigo}-{slug}/{codigo}-funcional-{slug}.md con Estado BORRADOR:
    → Modo B: construcción desde inputs/ — advertir al AF que la spec-funcional está en BORRADOR
      (la HU puede tener vacíos; registrarlos en la sección "Vacíos pendientes")

Si no existe docs/specs/{codigo}-{slug}/{codigo}-funcional-{slug}.md:
    → Modo B: construcción desde inputs/ + EDT
```

En el **Modo B**, el AF debe declarar cuál es la fuente de verdad funcional primaria para esta HU (qué documentos de `inputs/{feature}/` aplican). Si el AF no lo declaró, preguntar antes de proceder.

## Fuentes por modo

### Modo A — spec-funcional existente (modelo spec-per-área, ADR-004)
- Fuente primaria: `docs/specs/{codigo}-{slug}/{codigo}-funcional-{slug}.md` — de aquí salen User Story (§1), Actores (§2), Flujo (§4), Reglas de Negocio (§6), Fuera de Alcance (§1 subsección FAS-NNN), Trazabilidad (§3, para el EDT ref).
- Fuente de criterios de aceptación: `docs/specs/{codigo}-{slug}/{codigo}-qa-{slug}.md` §10 (Gherkin) **si existe**. Si no existe todavía, generar el borrador con el skill `asdd-ba-specification-lead-gherkin`.
- Identificar las secciones por sus headings tal como aparecen en el documento.

### Modo B — Sin spec-funcional (o en BORRADOR)
- Fuente primaria: documentos en `inputs/{feature}/` declarados por el AF (RFP, BRD, transcripciones, correos, HUs previas del cliente).
- Fuente de trazabilidad: nodo hoja de la EDT en `docs/specs/_proyecto/edt-{proyecto}.md` (o el archivo EDT que el AF indique).
- El AF puede complementar con conocimiento tácito dictado directamente; registrarlo en el campo Fuentes del frontmatter.
- Leer `spec-funcional-template.md` (skill `asdd-producto-templates`) para entender qué tipo de contenido corresponde a cada sección equivalente de la HU.

## Secciones equivalentes spec-funcional → HU

| Sección de la HU | Sección equivalente | Qué extraer / construir |
|---|---|---|
| Historia de Usuario | §1 User Story (funcional) | Como/Quiero/Para + Métrica de éxito |
| Actores | §2 Actores y Permisos (funcional) | Tabla de actores: rol, qué puede hacer, qué no puede hacer |
| Flujo del Proceso | §4 Flujo de Negocio (funcional) | Pasos numerados + flujos alternativos + flujos de error |
| Reglas de Negocio | §6 Reglas de Negocio (funcional) | Reglas [CORE] y [EDGE] con código, tipo y descripción |
| Fuera de Alcance | §1 subsección "Fuera de alcance" (funcional) | Tabla FAS con exclusiones explícitas |
| Criterios de Aceptación | §10 Criterios de Aceptación (`spec-qa`) | Escenarios Gherkin — mantener tal como están en `spec-qa` |

En Modo B: construir cada sección desde la información disponible en los documentos fuente, usando como guía la estructura equivalente del template.

## Plantilla de salida (fija — producir siempre con exactamente esta estructura, en este orden)

```markdown
---
HU-ID:        HU-{codigo-edt}
EDT-nodo:     {codigo-edt} — {pregunta de negocio del nodo hoja}
Spec-origen:  {docs/specs/{codigo}-{slug}/{codigo}-funcional-{slug}.md — o "Sin spec-funcional — construida desde inputs/"}
Version-spec: {campo Versión de la §0 Metadatos de la spec-funcional — o "N/A"}
Estado-HU:    BORRADOR
Fecha:        {fecha de generación}
Fuentes:      {lista de documentos usados: spec-funcional / spec-qa / inputs/archivo.md / EDT / input verbal AF}
---

# HU-{codigo-edt} — {Nombre de la funcionalidad}

---

## Historia de Usuario

**Como** {actor principal},
**quiero** {capacidad o función},
**para** {valor de negocio obtenido}.

**Métrica de éxito:** {indicador cuantificable}. Validado por {actor validador} mediante {método de validación}.

---

## Actores

| Actor | Rol | Puede hacer | No puede hacer |
|-------|-----|-------------|----------------|
| {actor 1} | {rol} | {capacidades} | {restricciones} |

---

## Flujo del Proceso

### Flujo principal

1. {paso 1}
2. {paso 2}
...

### Flujos alternativos

| ID | Condición | Desvío |
|----|-----------|--------|
| FA-001 | {condición} | {descripción del desvío} |

### Flujos de error

| ID | Condición de error | Comportamiento esperado |
|----|-------------------|------------------------|
| FE-001 | {condición} | {respuesta del sistema} |

---

## Reglas de Negocio

| Código | Tipo | Descripción | Condición de aplicación |
|--------|------|-------------|------------------------|
| RN-001 | [CORE] | {descripción de la regla} | {cuándo aplica esta regla} |
| RN-002 | [EDGE] | {descripción de la regla borde} | {cuándo aplica esta regla} |

> En Modo A: extraer desde §6 de la spec-funcional, manteniendo los códigos RN-NNN originales.
> En Modo B: construir desde los documentos fuente; asignar códigos RN-NNN correlativos empezando en RN-001.
> Mínimo: todas las reglas [CORE] del flujo principal deben estar presentes.

---

## Fuera de Alcance

| # | Exclusión | Por qué podría asumirse incluida | Dónde vive si existe |
|---|-----------|----------------------------------|----------------------|
| FAS-001 | {exclusión} | {razón de confusión probable} | {referencia} |

> Si no hay exclusiones identificadas: "No se han identificado exclusiones de alcance para esta HU."

---

## Criterios de Aceptación

Feature: {nombre de la funcionalidad en lenguaje de negocio}

### SCN-001: {nombre del escenario}
**Tipo:** {happy path | negativo | edge operativo | edge regulatorio | seguridad}

\`\`\`gherkin
Dado que {contexto}
Cuando {acción}
Entonces {resultado esperado}
\`\`\`

### SCN-002: {nombre del escenario}
...

> Cobertura mínima obligatoria: un escenario de cada tipo (happy path, negativo, edge operativo, edge regulatorio, seguridad).
> Ver skill asdd-ba-specification-lead-gherkin para los criterios de calidad de cada tipo.

---

## Vacíos pendientes de definición _(completar antes de construir)_

{Incluir solo cuando hay información insuficiente. Si toda la información está completa, omitir esta sección.}

| # | Vacío | Sección HU afectada | Responsable |
|---|-------|---------------------|-------------|
| VP-001 | {pregunta sin respuesta} | {Historia / Actores / Flujo / Reglas / FAS / Criterios} | AF |
```

## Reglas de construcción

- **HU-ID:** `HU-{codigo-edt}` donde `{codigo-edt}` es el código del nodo hoja en la EDT (ej. nodo `1.3.2` → `HU-1.3.2`). Buscarlo en el campo `EDT ref` de la §3 (Trazabilidad) de la spec-funcional (Modo A), o en la EDT directamente (Modo B). Este ID EDT-driven es distinto del retirado `HU-\d+` secuencial del modelo antiguo (ADR-004 §6) — la HU ágil de la capa BA sí conserva un código, y es el del nodo EDT.
- **Estado inicial:** toda HU recién generada tiene siempre `Estado-HU: BORRADOR`, independientemente del estado de la spec-funcional.
- **Gherkin se mantiene:** a diferencia del DVF, la HU mantiene los criterios en formato Gherkin. La HU es para el equipo técnico.
- **Códigos SCN-NNN y RN-NNN:** en Modo A, copiar desde `spec-qa §10` (escenarios) y §6 de la funcional (reglas) sin modificar. En Modo B, asignar correlativos nuevos.
- **Modo B sin Gherkin en los inputs:** si los documentos fuente no tienen escenarios, invocar el skill `asdd-ba-specification-lead-gherkin` para generarlos. La HU no se entrega sin criterios de aceptación.
- **Flujos alternativos y de error:** en Modo A, extraerlos del Flujo de Negocio (§4) de la spec-funcional. En Modo B, inferirlos de las condiciones descritas en los documentos fuente. Si no hay suficiente información, agregar fila en Vacíos pendientes.
- **Sección Vacíos pendientes:** incluirla solo cuando hay vacíos reales. Si toda la información está completa, omitirla.

## Proceso

1. Verificar si existe `docs/specs/{codigo}-{slug}/{codigo}-funcional-{slug}.md` y su `Estado` en §0 → determinar Modo A o Modo B.
2. **Modo A:** leer la spec-funcional completa; identificar secciones por sus headings. Verificar con Glob si existe `docs/specs/{codigo}-{slug}/{codigo}-qa-{slug}.md` para extraer los Gherkin de §10; si no existe, invocar `asdd-ba-specification-lead-gherkin` para el borrador.
3. **Modo B:** identificar los documentos fuente en `inputs/{feature}/` declarados por el AF; leerlos; leer el nodo hoja de la EDT en `docs/specs/_proyecto/edt-{proyecto}.md`; leer `spec-funcional-template.md` (skill `asdd-producto-templates`) para entender la estructura equivalente de cada sección.
4. Construir la HU siguiendo la plantilla fija de este skill, sección por sección, en orden.
5. Verificar cobertura mínima de criterios (5 tipos). Si faltan tipos, invocar `asdd-ba-specification-lead-gherkin`.
6. Registrar en Vacíos pendientes todo lo que no pudo resolverse con las fuentes disponibles.
7. Verificar el checklist de salida.
8. Guardar en `docs/specs/{codigo}-{slug}/{codigo}-hu-{slug}.md`.
9. Informar al agente `asdd-ba-specification-lead` para que active:
   - `asdd-ba-spec-index` — operación `update-artifact` con `archivo: {codigo}-hu-{slug}.md`, `tipo: HU`, `estado: BORRADOR`, `fecha: {fecha}` (solo modo standalone AF).
   - `asdd-ba-change-log` — tipo `ESTADO`: HU generada en BORRADOR.

## Checklist de salida

- [ ] El HU-ID usa el código del nodo hoja de la EDT (formato HU-X.Y.Z)
- [ ] El campo EDT-nodo tiene código + pregunta de negocio del nodo hoja
- [ ] La historia de usuario sigue exactamente el formato "**Como**… **quiero**… **para**…" con métrica de éxito
- [ ] La tabla de actores tiene las columnas: Actor / Rol / Puede hacer / No puede hacer
- [ ] El flujo principal está numerado; flujos alternativos y de error están en sus propias tablas
- [ ] La sección Reglas de Negocio tiene todas las reglas [CORE] del flujo principal como mínimo
- [ ] Los códigos RN-NNN provienen de §6 de la spec-funcional sin modificar (Modo A) o son correlativos nuevos (Modo B)
- [ ] La sección Fuera de Alcance tiene la tabla FAS (o la nota de "no hay exclusiones")
- [ ] Criterios de aceptación en formato Gherkin con cobertura mínima de 5 tipos
- [ ] Los códigos SCN-NNN provienen de `spec-qa §10` sin modificar (Modo A) o son correlativos nuevos (Modo B)
- [ ] La sección Vacíos pendientes está presente si hubo información insuficiente
- [ ] HU guardada en `docs/specs/{codigo}-{slug}/{codigo}-hu-{slug}.md`
- [ ] Skill `asdd-ba-spec-index` invocado vía `asdd-ba-specification-lead` — operación `update-artifact` registrando la HU en la tabla del index del nodo (solo modo standalone AF)

## Anti-patterns

- **HU sin HU-ID** — una HU sin código EDT no se puede rastrear al plan del proyecto. El backlog pierde coherencia con la EDT.
- **Gherkin humanizado** — convertir Given/When/Then a lenguaje natural en la HU rompe el contrato con QA. Eso es el DVF; la HU mantiene Gherkin.
- **HU sin reglas de negocio** — omitir las reglas deja al equipo de desarrollo sin los contratos funcionales que definen el comportamiento del sistema. Las reglas son el contrato, no los comentarios del flujo.
- **HU construida desde nodo EDT intermedio** — solo los nodos hoja generan HUs. Un nodo intermedio produce más de una spec-funcional/HU; no consolidar.
- **Criterios incompletos** — entregar una HU sin los 5 tipos de escenario deja al equipo sin cobertura de pruebas desde el inicio.
- **Vacíos ignorados** — construir la HU sin registrar lo que falta lleva a que el equipo descubra los vacíos durante la construcción.
- **Inventar el contenido de `spec-qa`** — en Modo A, si `spec-qa` no existe, no fabricar escenarios como si vinieran de ahí: generarlos con `asdd-ba-specification-lead-gherkin` y declararlo en el campo Fuentes.
