---
name: asdd-ba-change-log
description: Único escritor de docs/specs/change-log.md. Agrega la entrada BC-fecha-autor-NNN por prepend, sin leer el archivo entero.
---

Registrador de cambios BA. **Único escritor autorizado** de `docs/specs/change-log.md`.
Produce una entrada `BC-{AAAA-MM-DD}-{autor}-{NNN}` a partir del contexto provisto por el agente activador.
No razona sobre el negocio — formatea, numera y prepende.

**WRITE-PROTECTED:** ningún agente puede usar `Write` ni `Edit` directamente sobre
`docs/specs/change-log.md`. Toda escritura ocurre exclusivamente a través de este
skill. Ver `.claude/reference/ba/asdd-ba-change-log-contract.md`.

## Cuándo activar

Como paso de cierre del agente obligado (ver contrato de cierre). El agente activador
ya resolvió toda la información necesaria — este skill solo estructura, numera y
prepende.

## Tabla canónica de tipos de cambio

**Fuente única de verdad del sistema BA.** Ningún otro archivo la copia — todos la
referencian aquí.

| Sección de SPEC modificada | Tipo en bitácora |
|---|---|
| Reglas de negocio (Sección 6, RN-NNN) | `REGLA` |
| Flujo de negocio (Sección 4) | `FLUJO` |
| Validaciones de Campos (Sección 9) | `REGLA` |
| Criterios de aceptación Gherkin (Sección 10) | `CRITERIO` |
| Actores y permisos (Sección 2) | `ACTOR` |
| Requerimientos no funcionales (Sección 7) | `RNF` |
| Cambio de estado del artefacto (BORRADOR → APROBADA, etc.) | `ESTADO` |
| Decisión de scope (asdd-ba-scope-manager) | `ALCANCE` |
| Seguridad (Sección 11) | `RNF` |
| Stakeholders del dominio de datos (Sección 12) | `ACTOR` |
| Fuentes de datos (Sección 12) | `REGLA` |
| Restricciones de datos (Sección 12) | `REGLA` |
| Contexto del proyecto de datos (Sección 12) | `REGLA` |
| Cambio post-aprobación mediante CR | Tipo según sección modificada. Descripción: `CR-NNN — {motivo}` |

**Regla multi-sección:** si el cambio toca varias secciones → una entrada por sección,
o una entrada con los tipos listados.
**Regla CR:** la descripción DEBE incluir el número de CR al inicio: `CR-NNN — {descripción}`.
**`ESTADO` nunca nace en UAT** — es exclusivo de transiciones de estado de artefacto.
**Sección 0:** escalar a `asdd-ba-scope-manager`, tipo `ALCANCE`.

## Formato de ID

```
BC-{AAAA-MM-DD}-{autor}-{NNN}
```

- `{AAAA-MM-DD}` — fecha del cambio (ej. `2026-07-24`)
- `{autor}` — slug del usuario: prefijo del email del sistema antes del `@`, con `.` reemplazado por `-` si el AF lo prefiere (ej. `alejandro.lopez` de `alejandro.lopez@sofka.com.co`). Si no está disponible el email → usar el nombre declarado por el agente activador.
- `{NNN}` — secuencial **por autor + fecha**, empezando en `001` cada día por persona

Ejemplos válidos: `BC-2026-07-24-alejandro.lopez-001`, `BC-2026-07-24-carlos.garcia-001`

**Entradas antiguas (formato `BC-NNN`):** se conservan tal cual en el historial. El proceso de numeración nuevo las ignora — el patrón de Grep es distinto y no hay solapamiento posible.

## Header canónico (fijo — no modificar)

`docs/specs/change-log.md` siempre comienza con este header exacto:

```
# Bitácora BA — Change Log
<!-- WRITE-PROTECTED: modificar únicamente vía skill asdd-ba-change-log -->
<!-- Formato de ID: BC-{AAAA-MM-DD}-{autor}-{NNN} — NNN secuencial por autor+fecha. Entradas BC-NNN anteriores son formato legacy, se conservan. -->
```

Este header es el ancla del Edit de prepend. El skill lo conoce por contrato —
no necesita leerlo del disco.

## Proceso

### Inputs requeridos del agente activador

| Campo | Descripción |
|---|---|
| `autor` | Slug del usuario (prefijo del email del sistema, ej. `alejandro.lopez`) |
| `fecha` | Fecha actual AAAA-MM-DD |
| `tipo` | Tipo de cambio según tabla canónica |
| `artefacto` | Nombre del artefacto modificado |
| + resto de campos de la plantilla | ver Plantilla de entrada |

### Primera entrada (archivo no existe)

Crear `docs/specs/change-log.md` con `Write` — ID será `BC-{fecha}-{autor}-001`:

```
# Bitácora BA — Change Log
<!-- WRITE-PROTECTED: modificar únicamente vía skill asdd-ba-change-log -->
<!-- Formato de ID: BC-{AAAA-MM-DD}-{autor}-{NNN} — NNN secuencial por autor+fecha. Entradas BC-NNN anteriores son formato legacy, se conservan. -->

## BC-{fecha}-{autor}-001 — {tipo}
...plantilla completa...
```

### Entradas siguientes (archivo ya existe)

1. `Grep` sobre `docs/specs/change-log.md` — patrón `^## BC-{fecha}-{autor}-\d+`, `head_limit: 1`.
   - **Match encontrado** → extraer el número `NNN` del ID; incrementar en 1.
   - **Sin match** (primera entrada de este autor hoy) → usar `001`.
2. Construir el ID: `BC-{fecha}-{autor}-{NNN}`.
3. Rellenar la plantilla con los valores del agente activador.
4. `Edit` — prepend después del header:
   - `old_string`: las tres líneas del header canónico exacto (incluyendo la línea de comentario de formato)
   - `new_string`: header + línea en blanco + bloque `BC-{fecha}-{autor}-{NNN}` + línea en blanco

El historial existente baja automáticamente. No leer el resto del archivo.

## Plantilla de entrada

```markdown
## BC-{AAAA-MM-DD}-{autor}-{NNN} — {tipo de cambio}

| Campo | Valor |
|-------|-------|
| Artefacto | {SPEC-feature / EDT / DVF-feature / Decisión-alcance-N} |
| Autor | {autor — slug del usuario} |
| Estado anterior | {estado o descripción del estado previo} |
| Estado nuevo | {estado o descripción del estado resultante} |
| Solicitado por | {AF / Cliente / otro rol del equipo} |
| Motivo | {descripción breve del por qué} |
| Impacto en otros artefactos | {lista de artefactos afectados — o "ninguno"} |
| Hallazgo origen | {H-NNN del hallazgo UAT — o "N/A" si no proviene de UAT} |
| Tipo UAT origen | {GAP-INTERNO / GAP-EXTERNO / ALCANCE / DATO / UX — o "N/A"} |
| Sección de SPEC tocada | {RN-NNN / Sección 4 / Escenario Gherkin X / Actores / NFR} |
| Referencia | {solicitud de cambio / decisión que originó el cambio} |
```

## Regla de trazabilidad UAT

Cuando el cambio proviene de un hallazgo UAT, `Hallazgo origen` (H-NNN) y
`Tipo UAT origen` son **obligatorios** — son la clave de unión que
`asdd-ba-log-lessons-learned` usa para correlacionar hallazgos con cambios.

## Anti-patterns

- **Escritura directa por un agente** — `Write` o `Edit` sobre `docs/specs/change-log.md`
  sin pasar por este skill viola el contrato de protección. Si un agente intenta
  hacerlo, detenerlo y redirigirlo al skill.
- **Append en lugar de prepend** — el registro nuevo va SIEMPRE después del header,
  antes de todos los existentes. Agregarlo al final obliga a leer todo el archivo.
- **Leer más de lo necesario** — solo el primer match de Grep para obtener el BC actual.
  No leer el historial completo.
- **Entrada huérfana de hallazgo** — cambio de UAT sin `H-NNN` ni `Tipo UAT origen`.
- **`autor` omitido o genérico** — usar `"agente"`, `"sistema"` o dejar en blanco rompe la unicidad del ID y re-introduce colisiones en merge. El autor siempre es un usuario humano identificable.
- **Usar el Grep de formato legacy (`^## BC-\d+`) para calcular el nuevo NNN** — ese patrón cuenta entradas antiguas y puede producir IDs duplicados con entradas nuevas del mismo día. Usar siempre el patrón `^## BC-{fecha}-{autor}-\d+`.
