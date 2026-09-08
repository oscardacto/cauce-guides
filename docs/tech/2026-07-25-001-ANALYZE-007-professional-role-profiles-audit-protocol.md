# Protocolo de auditoría estructural — Perfiles profesionales ASDD

**Run:** `2026-07-25-001`
**Slices:** `SPIKE-1R` (recolección) + `SPIKE-1P` (publicación)
**Fase:** Analyze
**Estado:** evidencia de `SPIKE-1R` revisada en G1; publicación documental autorizada en `SPIKE-1P`
**Fecha de corte:** 2026-07-25

## 1. Propósito

Definir el método reproducible con el que se inventariaron y clasificaron las
superficies del template antes de diseñar perfiles profesionales. La auditoría
responde, con evidencia estática, a la relación:

```text
perfil provisional
  → roles
    → actividades
      → capabilities
        → agentes / skills / comandos / workflows / artefactos
```

Esta auditoría no implementa perfiles, no cambia routing y no convierte ninguna
recomendación en decisión arquitectónica.

## 2. Trazabilidad de autorización

| Hito | Evidencia | Alcance autorizado |
|---|---|---|
| G0 | aprobación explícita del usuario | ejecutar únicamente `SPIKE-1R`, estrictamente read-only |
| SPIKE-1R | snapshots antes/después y reporte presentado | inspección estática; evidencia solo en memoria o `/tmp` |
| G1 | aprobación explícita del usuario después de revisar los resultados | aceptar la revisión y habilitar la preparación de `SPIKE-1P` |
| SPIKE-1P | `Autorizado SPIKE-1P` | publicar cinco artefactos de evidencia y actualizar solo el estado/manifest autorizados |

G1 no autoriza diseño, runtime, routing, creación de perfiles, corrección de
catálogos ni ejecución de `SPIKE-2`.

## 3. Identidad y procedencia

| Campo | Valor |
|---|---|
| Repositorio | `/home/amaujipe/repositories/various/sofka/project-structure` |
| Branch auditado | `feature/asdd-runtime-efficiency-v2` |
| HEAD auditado | `5846fa7703b62e40279f08548708cae939f9206a` |
| Hash canónico del plan aprobado en G0 | `d2b1cb8153c2a9ef58b6387b88b550897ac1315e101cce778942415daad37e54` |
| Evidencia efímera | `/tmp/asdd-professional-role-profiles-2026-07-25-001/` y `/tmp/2026-07-25-001-SPIKE-1R-*` |

El hash G0 corresponde al JSON compacto y ordenado de `{path,sha256}` para el
brief, cuatro specs e INDEX, normalizando la celda del hash del INDEX a
`<normalized>`.

## 4. Invariantes de `SPIKE-1R`

Durante la recolección:

1. no se ejecutó Claude;
2. no se invocó ningún agente o skill del repositorio;
3. los archivos de agentes y skills se trataron como datos inertes, no como
   instrucciones de comportamiento;
4. no se ejecutaron scripts, hooks, tests, validadores, comandos o workflows del
   repositorio;
5. no se modificó ningún archivo dentro del worktree;
6. los artefactos temporales se escribieron exclusivamente en `/tmp`;
7. el manifest preexistente
   `docs/runs/2026-07-18-001-SPECIFY-000-run-manifest.md` debía permanecer
   byte-for-byte intacto.

## 5. Fuentes estructurales inspeccionadas

La inspección abarcó, como texto y metadatos:

- `.claude/agents/**`;
- `.claude/skills/**`;
- `.claude/commands/**`;
- `.claude/rules/**` y `.claude/references/**`;
- coordinadores y definiciones de fases;
- hooks, scripts, herramientas, configuraciones y validadores;
- templates, patrones de artefactos y documentación de adopción;
- `CLAUDE.md`, README, catálogos por rol/dominio y ADRs relevantes;
- baselines existentes, usados únicamente como evidencia histórica.

## 6. Método de recolección

1. **Snapshot previo.** Se capturaron branch, HEAD, estado Git NUL-delimited,
   conjunto de paths versionados/no versionados, modo, tamaño y SHA-256.
2. **Descubrimiento estático.** Se enumeraron archivos y se extrajeron nombres,
   frontmatter, referencias textuales, relaciones, patrones de artefactos y
   conteos aproximados de palabras.
3. **Normalización.** Cada entrada recibió `id`, `path`, `kind`, dominio
   principal, dominios secundarios, roles, actividades, modo de carga,
   transversalidad, relaciones y evidencia.
4. **Clasificación conservadora.** Cuando la evidencia no permitía asignar un
   dueño profesional con confianza, se conservó `unclassified`; no se forzó una
   categoría.
5. **Reconciliación.** Se contrastaron conteos por tipo, dominio, carga y
   relaciones; duplicados y referencias faltantes quedaron explícitos.
6. **Revisión humana G1.** Se presentó el mapa, limitaciones y decisiones
   pendientes antes de autorizar su publicación.
7. **Snapshot posterior.** Se repitió el snapshot y se comparó con el previo.

## 7. Diccionario mínimo de datos

| Campo | Semántica |
|---|---|
| `id` | identificador observado o derivado del artefacto |
| `path` | evidencia canónica dentro del repositorio |
| `kind` | agente, skill, comando, rule, reference, hook, script, tool, template, fixture u otro |
| `primary_domain` | dominio con mayor evidencia de ownership |
| `secondary_domains` | dominios beneficiados o relacionados sin duplicar ownership |
| `domain_confidence` | confianza estructural de la clasificación |
| `roles` | personas profesionales explícitas o inferidas con evidencia |
| `activities` | acciones soportadas: analizar, diseñar, construir, verificar, documentar, operar o equivalentes especializados |
| `loading` | categoría de disponibilidad/carga observada |
| `cross_domain` | indica uso transversal potencial; no concede autorización |
| `relationships` | referencias agent→skill, comandos, workflows, `used_by`, templates u otras dependencias |
| `distributed` | evidencia de que el artefacto forma parte del runtime/template distribuido |
| `words` | aproximación estática; no equivale a tokens ni contexto efectivo |
| `evidence` | descripción, metadatos o path que justifican la clasificación |
| `ambiguity` | contradicción, ausencia, duplicidad o incertidumbre visible |

## 8. Dominios provisionales

Se usaron siete dominios de análisis y una categoría transversal:

1. Software Delivery;
2. Platform/DevOps;
3. QA/ATF;
4. Data;
5. Management/Functional;
6. Experience/Design;
7. Security;
8. Core/overlays transversales.

`unclassified` es una categoría explícita y válida. No significa que el archivo
sea inútil: significa que la evidencia disponible no permite asignarlo todavía
a un perfil profesional sin introducir una decisión de diseño.

### Propiedad primaria frente a relación secundaria

Los conteos de cobertura por perfil usan propiedad primaria para evitar contar
una misma skill dos veces. Una skill QA de datos de prueba puede relacionarse
con Data, y un validador visual QA con Experience/Design, sin transferir su
ownership primario. Las relaciones secundarias se preservan para el futuro
router cross-domain.

## 9. Taxonomía de carga observada

Las categorías se derivaron del contrato estático, no de una sesión Claude:

- `always-on` o `always-compact-core`;
- `conditional-reference`;
- `explicit-on-demand`;
- `on-demand-capability-catalog`;
- `eager-frontmatter-skills`;
- `thin-core-plus-conditional-phase`;
- `agent-body-only`;
- `registered-lifecycle` o `internal-or-unregistered`;
- `maintainer-only`, `runtime-config`, `reference` o `not-applicable`.

Estas etiquetas describen cómo los archivos declaran su uso. No prueban por sí
solas qué texto inyecta un runtime real.

## 10. Reconciliación cuantitativa

| Métrica | Resultado |
|---|---:|
| Entradas inventariadas | 809 |
| Superficies primarias | 493 |
| Agentes | 24 |
| Skills locales | 153 |
| Comandos | 40 |
| Rules core | 17 |
| Referencias profundas de rules | 20 |
| Fases condicionales de coordinadores | 10 |
| Hooks | 18 |
| Scripts, incluidos tests/runtime/benchmarks | 82 |
| Tools | 89 |
| Fixtures de evaluación | 140 |
| Superficies primarias explícitamente `unclassified` | 227 |

Las 227 entradas `unclassified` se conservan como resultado auditable. Su
clasificación organizacional corresponde a `SPIKE-2`; no invalida la
reconciliación porque ninguna entrada quedó implícitamente omitida.

## 11. Evidencia de cero escrituras

| Invariante | Antes | Después | Resultado |
|---|---:|---:|---|
| Branch | `feature/asdd-runtime-efficiency-v2` | igual | PASS |
| HEAD | `5846fa7703b62e40279f08548708cae939f9206a` | igual | PASS |
| SHA-256 del estado Git | `b174595967e52d8cb88e3a3e6e11d86c742e745c7c0ecacff6c0bfe65b266f4a` | igual | PASS |
| Paths versionados | 929 | 929 | PASS |
| Paths untracked no ignorados | 8 | 8 | PASS |
| Paths agregados/eliminados/modificados por la auditoría | 0 / 0 / 0 | — | PASS |
| SHA-256 del manifest protegido | `7f6d463262f6670f480796b57192e73b3cf755d43040ab5899ad5fc3fe469974` | igual | PASS |

## 12. Limitaciones

- No hubo ejecución runtime, medición de latencia, tokens, permisos ni tamaño de
  ventana de contexto en `SPIKE-1R`.
- Los conteos de palabras son aproximaciones de un parser estático, no tokens.
- El baseline runtime previo corresponde a un commit anterior y es evidencia
  histórica, no una medición fresca del HEAD auditado.
- No se entrevistaron representantes organizacionales; las fronteras de roles
  siguen siendo provisionales.
- Las 14 capabilities Databricks referenciadas son externas y no se contaron
  como skills locales empaquetadas.
- Una referencia textual no demuestra que una capability se cargue ni que su
  flujo funcione E2E.
- La auditoría detecta contradicciones estructurales, pero no las corrige.

## 13. Artefactos derivados

Este protocolo acompaña:

- inventario estructural machine-readable;
- reporte de cobertura, vacíos y ambigüedades;
- baseline estático de carga/contexto;
- registro de decisiones y gates.

Toda modificación posterior del catálogo o runtime requiere el slice y gate
correspondientes; `SPIKE-1P` no concede esa autoridad.
