---
name: sofka-asdd-tech-lead-new-bug
description: Reporte de bug estructurado — dónde, qué, por qué, severidad, prioridad y fix sugerido, listo para estabilización.
---

# Sofka ASDD — Nuevo Reporte de Bug

> Genera el artefacto de entrada del flujo de estabilización: un reporte
> estructurado con evidencia `archivo:línea`, severidad y prioridad ISTQB,
> y fix sugerido. **Este skill solo escribe el reporte — no implementa
> ningún fix.**

## Rol

Documentador de defectos. Convierte una observación informal del usuario
("falla cuando…", "no carga…", "devuelve 500…") en un reporte trazable que
alimenta directamente la fase de estabilización ASDD, respetando el
contrato mínimo "dónde + qué + por qué + severidad/prioridad + fix
sugerido" definido en `sofka-asdd-atf-api-qa-engineer.md (embedded: ISTQB Cultura de Calidad)` (sección
Gestión de Defectos).

## Cuándo activar

Señales en el prompt:

- "reporta este bug", "documenta el defecto", "abre un BUG", "crea el reporte de la falla"
- Hallazgo de QA, soporte o post-mortem que requiere ser registrado antes de tocar código
- Bug detectado durante code review que no debe corregirse en el mismo PR (`SBR-003`)
- Defecto identificado en producción que aún no tiene ticket

**Fase ASDD:** estabilización / **Verificar**. Es el insumo previo al
diagnóstico (`sofka-asdd-explorer`) y al fix (`sofka-asdd-developer-bug-fix`
para el flujo de bugfix quirúrgico).

## Proceso

1. **Generar el ID del bug**
   - Listar reportes existentes: `Glob docs/specs/*-bug-*.md` (ART-001 pone el run_id adelante, así que el tema queda en el slug).
   - Próximo ID = mayor `NNN` existente + 1. Formato: `BUG-{NNN}` con tres dígitos (`BUG-001`, `BUG-042`).
   - Fecha de reporte = fecha del día (`{YYYY-MM-DD}`).

2. **Recolectar evidencia mínima** — el reporte NO se escribe sin estos campos:
   - **Dónde**: módulo, archivo, endpoint o componente afectado.
   - **Qué**: comportamiento observado vs comportamiento esperado.
   - **Por qué**: hipótesis preliminar de causa raíz (si existe) con referencia `archivo:línea` (`SBR-001`).
   - **Cómo reproducirlo**: pasos numerados deterministas.
   - **Impacto**: usuarios afectados, frecuencia, severidad funcional.

3. **Clasificar severidad y prioridad** (ver tablas abajo).

4. **Sugerir fix** (sin implementar): hipótesis de arreglo + archivos candidatos. Marcar como *propuesta a validar*, no como decisión cerrada.

5. **Escribir el reporte** en la ruta que devuelve el helper de naming, usando el template:
   ```bash
   node .claude/scripts/sofka-asdd-artifact-name.mjs --phase {fase} --slug bug-{kebab-case-descripcion}
   ```
   ART-001 lo enforza en el guard de naming y en el hook nativo `pre-commit`.

6. **Confirmar al usuario** la ruta del archivo creado y los próximos pasos del flujo de estabilización.

## Clasificación de severidad (ISTQB)

| Severidad | Significado | Ejemplos |
|---|---|---|
| **CRITICAL** | Pérdida de datos, brecha de seguridad, sistema caído | Filtración de PII, downtime total, corrupción de BD |
| **HIGH** | Funcionalidad principal rota, sin workaround | Login no funciona, checkout falla siempre |
| **MEDIUM** | Funcionalidad degradada, workaround disponible | Listado lento, validación incorrecta corregible manualmente |
| **LOW** | Defecto estético o de menor uso | Texto sin tilde, alineación incorrecta |

## Clasificación de prioridad (ISTQB)

| Prioridad | Significado | Plazo |
|---|---|---|
| **P0** | Bloquea release o operación crítica | Inmediato (mismo día) |
| **P1** | Debe resolverse en el sprint actual | Esta iteración |
| **P2** | Próximo sprint | Iteración siguiente |
| **P3** | Backlog | Sin fecha comprometida |

> Severidad ≠ prioridad. Un bug LOW puede ser P0 si bloquea una demo
> ejecutiva, y un HIGH puede ser P2 si solo afecta un rol con bajo uso.

## Categoría preliminar del defecto

Cuando el bug proviene del flujo ATF API, alinear la categoría con
`sofka-asdd-atf-api-qa-engineer.md (embedded: ATF API Defect Classification)`:

| Categoría | Cuándo aplica |
|---|---|
| `bug` | Defecto real en el código del servicio bajo prueba (`DEF-001`) |
| `precondition` | Falla por dato de prueba inválido o setup ausente |
| `env_issue` | Infraestructura, red, certificados, servicios externos |
| `script_issue` | Error en el spec/automatización, no en el producto |

> Si el reporte no nace del flujo ATF API, este campo queda como
> `bug` por defecto y se reclasifica durante el diagnóstico.

## Template del reporte

**Ruta**: `docs/specs/{run_id}-{PHASE}-{SEQ}-bug-{kebab-case-descripcion}.md` (la devuelve `sofka-asdd-artifact-name.mjs`)

```markdown
# BUG-{NNN}: {Título corto en imperativo}

**Módulo**: {módulo / bounded context}
**Severidad**: CRITICAL | HIGH | MEDIUM | LOW
**Prioridad**: P0 | P1 | P2 | P3
**Categoría preliminar**: bug | precondition | env_issue | script_issue
**Reportado**: {YYYY-MM-DD}
**Estado**: Abierto

## Descripción

{Resumen claro y conciso del defecto en 2-3 oraciones.}

## Pasos para reproducir

1. {Paso 1 — acción concreta del usuario o llamada al sistema}
2. {Paso 2}
3. {Paso 3}

## Comportamiento esperado

{Qué debería pasar según la spec, la regla de negocio o el contrato.}

## Comportamiento actual

{Qué está pasando. Incluir mensajes de error, códigos HTTP, trazas,
logs relevantes y correlation IDs si existen.}

## Ambiente

- **Ambiente**: local | dev | qa | prod
- **Versión / commit**: {sha o tag si aplica}
- **Cliente**: {browser, app, integración — si aplica}
- **Rol del usuario**: {si la reproducción depende del rol}
- **Endpoint**: {URL o ruta del endpoint afectado, si aplica}

## Evidencia

- **Screenshot / video**: {ruta o adjunto}
- **Log relevante**: {fragmento citando archivo y línea cuando sea código}
- **Correlation ID**: {si existe}

## Análisis preliminar (SBR-001)

- **Archivo(s) sospechoso(s)**: `src/path/to/file.ext:línea`
- **Causa probable**: {hipótesis inicial con evidencia archivo:línea}
- **Impacto**: {funcionalidad afectada, número/porcentaje de usuarios, frecuencia}
- **Áreas de regresión en riesgo**: {módulos o flujos a verificar tras el fix}

## Fix sugerido (propuesta — validar en diagnóstico)

- **Cambio propuesto**: {qué tocar — sin implementar}
- **Archivos candidatos**: `src/path/...`, `src/path/...`
- **Tests requeridos**: {test reproducible que debe escribirse antes del fix}
- **Riesgo del fix**: {bajo | medio | alto + breve justificación}

## Notas

{Workarounds conocidos, bugs relacionados, decisiones previas, ADRs aplicables.}
```

## Outputs

- `docs/specs/bug-{NNN}-{kebab-case-descripcion}.md` — reporte completo del defecto.
- Mensaje al usuario con la ruta del archivo y los próximos pasos:
  1. Invocar a `sofka-asdd-explorer` para diagnóstico read-only (`SBR-001` + bloque "Diagnóstico Read-Only" de `.claude/docs/stabilization-bug-rules.md`).
  2. Escribir test que falla reproduciendo el bug (regla "Test Reproducible ANTES del Fix").
  3. Aprobación del plan por el usuario.
  4. `sofka-asdd-developer-bug-fix` aplica el fix mínimo (`SBR-002`, `SBR-003`).

## Checklist antes de cerrar el reporte

- [ ] El reporte cumple "dónde + qué + por qué + severidad/prioridad + fix sugerido" (`sofka-asdd-atf-api-qa-engineer.md (embedded: ISTQB Cultura de Calidad)`, Gestión de Defectos).
- [ ] Hay al menos un par `archivo:línea` en "Análisis preliminar" o la hipótesis declara explícitamente que no fue posible localizar la línea exacta (`SBR-001`).
- [ ] Severidad y prioridad están justificadas con impacto (no solo etiquetas).
- [ ] Los pasos de reproducción son deterministas y reproducibles por un tercero.
- [ ] La sección "Fix sugerido" está marcada como propuesta — no como decisión.
- [ ] Ortografía en español correcta: tildes obligatorias, signos dobles `¿…?` y `¡…!` (`sofka-asdd-spanish-orthography.md`).

## Relación con skills y reglas existentes

- **`sofka-asdd-tech-lead-code-review`**: si el bug nace de un code review, este skill formaliza el hallazgo en lugar de corregirlo en el mismo PR (`SBR-003`).
- **`sofka-asdd-developer-bug-fix`** (flujo de bugfix quirúrgico): consume este reporte como input. `new-bug` **crea** el reporte; el developer lo **corrige** siguiendo `.claude/docs/stabilization-bug-rules.md` (Test Reproducible ANTES del Fix, Impact Map, Scope Declaration).
- **`sofka-asdd-explorer`**: ejecuta el diagnóstico read-only después de que este reporte exista. Nunca al revés.
- **`sofka-asdd-atf-api-step-6-execution-runner`**: si el bug proviene del flujo ATF API, este skill genera el reporte con categoría preliminar alineada a `DEF-001` y schema compatible con `DEF-005` para reclasificación posterior (`DEF-006`).
- **`sofka-asdd-tech-lead-quality-gate`**: blockers nuevos detectados durante el quality gate alimentan a este skill para abrir el reporte formal antes de mergear.

Reglas citadas por ID:

- `.claude/docs/stabilization-bug-rules.md` → `SBR-001` (Think Before Coding con evidencia `archivo:línea`), `SBR-002` (Simplicity First), `SBR-003` (Surgical Changes), `SBR-004` (Goal-Driven Execution), bloque "Diagnóstico Read-Only", bloque "Test Reproducible ANTES del Fix".
- `sofka-asdd-atf-api-qa-engineer.md (embedded: ATF API Defect Classification)` → `DEF-001` (categorías), `DEF-005` (schema del defecto), `DEF-006` (reclasificación).
- `sofka-asdd-atf-api-qa-engineer.md (embedded: ISTQB Cultura de Calidad)` → Gestión de Defectos (contrato severidad/prioridad y reporte mínimo).

## Cuándo NO invocar

- El usuario quiere **corregir** el bug, no documentarlo → invocar `sofka-asdd-developer-bug-fix` directamente con el flujo de bugfix de `.claude/docs/stabilization-bug-rules.md`.
- El defecto ya tiene reporte abierto → actualizar el archivo existente, no crear un duplicado. Verificar con `Glob docs/specs/bug-*.md`.
- El hallazgo es una propuesta de mejora o deuda técnica sin defecto observable → usar `sofka-asdd-tech-lead-refactoring-plan`.
- El defecto proviene de una ejecución ATF API y ya fue clasificado por `sofka-asdd-atf-api-step-6-execution-runner` → ese flujo escribe el defecto en `docs/qa/atf/{run_id}/` con su propio schema (`DEF-005`); no duplicar en `docs/specs/`.
- Es una vulnerabilidad de seguridad → escalar primero a `sofka-asdd-security` antes de documentar públicamente.

## Anti-patterns

- **Bug sin evidencia `archivo:línea`** — "el módulo de pagos falla" no es un reporte, es una queja. Sin hipótesis localizada, el diagnóstico arranca a ciegas y degrada `SBR-001`.
- **Severidad inflada por urgencia política** — etiquetar CRITICAL para "que lo prioricen". Severidad mide impacto técnico; prioridad mide urgencia de negocio. Son ejes independientes.
- **Pasos de reproducción no deterministas** — "a veces falla cuando hago clic". Si no es reproducible, primero registrar el patrón observado y marcar el bug como `flaky` candidato hasta confirmar (analogía con `DEF-004`).
- **Fix sugerido implementado en el reporte** — el reporte propone; el developer decide. Mezclar reporte y fix viola `SBR-003` y pierde la separación entre diagnóstico y corrección.
- **Reporte sin "comportamiento esperado"** — sin el contraste esperado vs actual, no hay defecto verificable, solo una observación.
- **Crear el reporte y empezar a editar código** — este skill termina al escribir el archivo. Tocar código aquí viola `ORC-000` (delegación pura) y `SBR-003`.
