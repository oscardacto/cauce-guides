# BA Specs Layout — Layout BA Standalone (Carpetas por Nodo)

La capa BA standalone usa un layout de **carpetas por nodo EDT**. Es independiente
del layout del ciclo ASDD del equipo (que mantiene ART-001 plano). Los dos layouts
coexisten en `docs/specs/` sin conflicto porque usan convenciones de nombre distintas.

## Estructura bajo `docs/specs/`

```
docs/specs/
├── README.md                                        ← sembrado por functional-architect
├── Contexto/                                        ← fuentes originales del cliente (read-only)
├── edt-{slug-proyecto}.md                           ← EDT raíz (transversal, raíz)
├── brief-{slug-proyecto}.md                         ← brief del proyecto (transversal, raíz)
├── change-log.md                                    ← bitácora BA (transversal, raíz)
├── {codigo}-{slug}/                                 ← una carpeta por nodo hoja
│   ├── {codigo}-index.md                            ← índice del nodo (skill sofka-asdd-ba-spec-index) ★
│   ├── {codigo}-funcional-{slug}.md                 ← spec funcional (specification-lead)
│   ├── {codigo}-informe-auditoria.md                ← reporte (specification-auditor)
│   ├── {codigo}-informe-sme.md                      ← dictamen (functional-sme)
│   ├── {codigo}-dvf-{slug}.md                       ← DVF para firma del negocio
│   ├── {codigo}-hu-{slug}.md                        ← HU para el backlog del equipo
│   ├── {codigo}-backend-{slug}.md                   ← slice técnico backend
│   ├── {codigo}-frontend-{slug}.md                  ← slice técnico frontend
│   └── {codigo}-qa-{slug}.md                        ← slice técnico QA
└── ...
```

Ejemplo concreto para el nodo `1.1.1 — Búsqueda Unificada`:

```
docs/specs/
  edt-busqueda-avanzada.md
  brief-busqueda-avanzada.md
  change-log.md
  1.1.1-busqueda-unificada/
    1.1.1-index.md                              ← índice del nodo ★
    1.1.1-funcional-busqueda-unificada.md
    1.1.1-informe-auditoria.md
    1.1.1-informe-sme.md
    1.1.1-dvf-busqueda-unificada.md
    1.1.1-hu-busqueda-unificada.md
    1.1.1-backend-busqueda-unificada.md
    1.1.1-frontend-busqueda-unificada.md
    1.1.1-qa-busqueda-unificada.md
```

## Convención de nombres

Dos patrones según si el artefacto tiene slug o no:

| Patrón | Cuándo | Ejemplo |
|---|---|---|
| `{codigo}-{tipo}-{slug}.md` | Artefactos de contenido del nodo | `1.1.1-funcional-busqueda-unificada.md` |
| `{codigo}-{tipo}.md` | Informes BA sobre el nodo (únicos por nodo) | `1.1.1-informe-auditoria.md` |

## Artefactos transversales en raíz

| Artefacto | Nombre | Agente que lo produce |
|---|---|---|
| EDT del proyecto | `edt-{slug-proyecto}.md` | `sofka-asdd-ba-functional-architect` |
| Brief del proyecto | `brief-{slug-proyecto}.md` | `sofka-asdd-ba-functional-architect` |
| Bitácora BA | `change-log.md` | skill `sofka-asdd-ba-change-log` |

## Artefactos por nodo (dentro de la carpeta del nodo)

| Tipo | Nombre | Agente / Skill |
|---|---|---|
| **Índice del nodo** ★ | `{codigo}-index.md` | skill `sofka-asdd-ba-spec-index` (write-protected) |
| Spec funcional | `{codigo}-funcional-{slug}.md` | `sofka-asdd-ba-specification-lead` |
| Reporte de auditoría | `{codigo}-informe-auditoria.md` | `sofka-asdd-ba-specification-auditor` |
| Dictamen SME | `{codigo}-informe-sme.md` | `sofka-asdd-ba-functional-sme` |
| DVF (firma del negocio) | `{codigo}-dvf-{slug}.md` | `sofka-asdd-ba-specification-lead` (skill `client-validation`) |
| HU (backlog del equipo) | `{codigo}-hu-{slug}.md` | `sofka-asdd-ba-specification-lead` (skill `user-story`) |
| Slice técnico | `{codigo}-{dominio}-{slug}.md` | dominio técnico dueño |

★ El `{codigo}-index.md` es el **punto de entrada** del nodo: contiene el Mapa de dominios
(con sus estados live), el Gate DOR y el Registro de Implementación para el developer AI.
Solo el skill `sofka-asdd-ba-spec-index` puede escribir este archivo — ningún agente
puede editarlo directamente.

## Relación con el ciclo ASDD del equipo

El ciclo ASDD del equipo (`sofka-asdd-producto`) mantiene su propio layout ART-001
plano bajo `docs/specs/`:

```
{run_id}-{PHASE}-{SEQ}-{slug}-funcional.md
```

Los dos layouts coexisten en `docs/specs/` sin conflicto — el layout BA usa carpetas
por nodo; el layout del equipo usa archivos planos con prefijo de run.

## Por qué se revirtió Layout B para la capa BA standalone

Layout B (carpetas por nodo) fue inicialmente descartado por incompatibilidad con
`sofka-asdd-artifact-name.mjs` (orquestador del equipo). La capa BA standalone no
depende del orquestador — el AF maneja los artefactos directamente. En ese contexto,
las carpetas por nodo aportan cohesión (todos los artefactos de un nodo juntos) sin
los costos que afectaban al ciclo del equipo.
