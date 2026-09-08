---
name: asdd-ba-requirements
description: Elicita e inventaría FR-NNN y NFR-NNN de negocio por hoja. Se activa dentro de asdd-ba-specification-lead.
---

> Rutas en **Layout B** (carpeta por nodo) — ver `.claude/reference/ba/asdd-ba-specs-layout.md`.

Skill de levantamiento de requerimientos del `asdd-ba-specification-lead`. Organiza qué debe hacer el sistema (FR) y bajo qué cualidades/restricciones debe hacerlo (NFR), en un inventario trazable que alimenta el spec-funcional.

> Referencia los elementos de la spec por **nombre** (Reglas de Negocio → `RN-NNN`, Flujo de Negocio, RNF de negocio, tabla de Decisiones Requeridas y Gaps → `GAP-NNN`), nunca por número de sección — la numeración de la plantilla es inestable.

## Alcance y frontera con otros skills

- **Este skill (`requirements`)**: elicita y estructura **FR + NFR de negocio** como inventario trazable. Cubre el hueco de los **NFR de negocio** que ningún otro skill atiende, y organiza los **FR** como vista de "qué debe hacer" que complementa (no reemplaza) las Reglas de Negocio y el Flujo de Negocio.
- **`asdd-ba-specification-lead-extraccion`**: extrae Reglas de Negocio (RN) desde documentos fuente crudos (RFP/BRD) — bottom-up. `requirements` es elicitación/organización, no extracción.
- **Frontera con seguridad**: los NFR de **seguridad técnica** (OWASP, controles, contenido de `spec-seguridad`) son del agente `asdd-security` — este skill solo levanta el NFR de **negocio** (ej. "los datos de tarjeta deben cumplir PCI", no el control técnico que lo implementa).

## FR — Requerimientos Funcionales

Inventario de lo que el sistema **debe hacer**, en lenguaje de negocio, atómico y trazable.

| Campo | Contenido |
|---|---|
| ID | `FR-NNN` |
| Requerimiento | "El sistema debe {capacidad}" — verificable, atómico (sin conjunciones "y también") |
| Actor | quién lo ejerce |
| Prioridad | Must / Should / Could (MoSCoW) |
| RN relacionadas | `RN-NNN` de las Reglas de Negocio que gobiernan este FR |
| Flujo relacionado | paso(s) del Flujo de Negocio que lo realizan |

Regla: cada FR `[Must]` debe estar cubierto por al menos una Regla de Negocio o un paso del Flujo. Un FR `[Must]` sin RN ni flujo es un gap → registrar en la tabla de Decisiones Requeridas y Gaps (`GAP-NNN`), no dejarlo implícito.

## NFR — Requerimientos No Funcionales (de negocio)

Inventario de las **cualidades y restricciones** que el sistema debe cumplir, en categorías de negocio (no técnicas):

| Categoría | Ejemplos de negocio |
|---|---|
| Rendimiento percibido | tiempo de respuesta aceptable para el usuario; volumen/concurrencia esperados |
| Disponibilidad | ventana de servicio del proceso de negocio; tolerancia a interrupción |
| Usabilidad | nivel de los usuarios; accesibilidad requerida; idioma |
| Cumplimiento / regulatorio | normas aplicables (habeas data, retención documental, auditoría de negocio) |
| Seguridad de negocio | quién puede ver/hacer qué (no el control técnico); segregación de funciones |
| Trazabilidad / auditoría de negocio | qué eventos de negocio deben quedar registrados y por cuánto tiempo |

| Campo | Contenido |
|---|---|
| ID | `NFR-NNN` |
| Categoría | una de las de arriba |
| Requerimiento | restricción verificable en términos de negocio |
| Métrica / criterio | cómo se verifica (valor, umbral, condición) |
| Origen | brief / regulación / stakeholder / SME |

Regla: un NFR sin métrica/criterio verificable es un deseo, no un requisito. Si el valor no se puede cuantificar aún → registrar el pendiente en la tabla de Decisiones Requeridas y Gaps (nunca inventarlo).

## Proceso

1. Leer el brief (`docs/specs/_proyecto/brief-{feature}.md`) y la hoja EDT — fuente de objetivos y restricciones; legacy Layout A plano: `docs/specs/brief-{feature}.md`
2. Derivar los FR desde los objetivos del brief + el flujo esperado; asignar prioridad MoSCoW.
3. Elicitar los NFR **recorriendo las 6 categorías** — no marcar "no aplica" sin verificar contra el brief/dominio.
4. Trazar cada FR a su(s) Regla(s) de Negocio o paso(s) del Flujo; cada NFR a su métrica.
5. Marcar valores no disponibles como pendientes en la tabla de Decisiones Requeridas y Gaps, sin inventarlos.
6. Escribir el inventario en `docs/specs/{codigo}-{slug}/requirements-{codigo}.md`.

## Output

Escribe el inventario de requerimientos en **`docs/specs/{codigo}-{slug}/requirements-{codigo}.md`** (tabla FR-NNN + tabla NFR-NNN con su trazabilidad). Ese inventario es el insumo que `asdd-ba-specification-lead` refleja luego en las **Reglas de Negocio** y los **RNF de negocio** del spec-funcional. El inventario es un artefacto de trabajo trazable; no reemplaza al spec-funcional.

## Write boundary

Escribe ÚNICAMENTE `docs/specs/{codigo}-{slug}/requirements-{codigo}.md`. **NUNCA** modifica el spec-funcional directamente — el volcado de los FR/NFR a las Reglas de Negocio y los RNF de negocio lo hace `asdd-ba-specification-lead` (el agente anfitrión).

## Checklist de salida

- [ ] Cada FR es atómico, verificable, con actor y prioridad MoSCoW
- [ ] Cada FR `[Must]` está trazado a al menos una Regla de Negocio o paso del Flujo
- [ ] Las 6 categorías de NFR fueron recorridas (ninguna omitida por defecto)
- [ ] Cada NFR tiene métrica/criterio verificable, o su valor pendiente registrado en la tabla de Decisiones Requeridas y Gaps
- [ ] NFR de seguridad técnica derivados a `spec-seguridad` (no redactados aquí)
- [ ] Sin valores inventados — los faltantes van a la tabla de Decisiones Requeridas y Gaps
- [ ] Inventario guardado en `docs/specs/{codigo}-{slug}/requirements-{codigo}.md`

## Anti-patterns

- **NFR sin métrica** — "debe ser rápido" no es un requisito; "respuesta < 3s en el 95% de las consultas" sí.
- **Inventar umbrales** — poner un SLA que nadie confirmó. El valor faltante va a la tabla de Decisiones Requeridas y Gaps.
- **Duplicar las RN como FR** — el FR dice "qué debe hacer"; la RN dice "bajo qué regla". Trazar, no copiar.
- **Redactar seguridad técnica** — los controles técnicos son de `asdd-security` (`spec-seguridad`); aquí solo el NFR de negocio.
- **Saltar categorías de NFR** — marcar "no aplica" sin verificar contra el brief deja huecos que reaparecen en UAT.
- **Modificar el spec-funcional desde este skill** — solo escribe su inventario; el volcado lo hace el agente.
