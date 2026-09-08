---
name: asdd-ux-context-core
description: Inicializa el proyecto UX — estructura de carpetas, validación de inputs obligatorios e índice inicial.
---

## Rol

Setup del proyecto UX. Asegura que la estructura física y los inputs mínimos existan antes de invocar cualquier otra skill UX. Es el "primer paso" del flujo UX dentro de ASDD — sin él, las demás skills pueden operar pero sin garantía de coherencia inicial.

## Cuándo activar

- Inicio de proyecto UX nuevo (primera invocación del agente UX)
- Re-invocable si la estructura se corrompe o cambian los inputs base
- Antes de cualquier otra skill UX en proyectos donde no se ha establecido la estructura
- Fase: **Especificar**

## Qué hace

### 1. Validación de inputs obligatorios

| Input | Origen | Obligatorio | Validación |
|---|---|---|---|
| Brief del proyecto | `docs/specs/brief-{feature}.md` | **Sí** | Existe + tiene contenido > 100 palabras |
| Dominio | Declarado en brief o `docs/specs/domain.md` | **Sí** | Uno de: fintech, insurance, retail, health, logistics, education, otro |
| Tipo de proyecto | Declarado en brief | Recomendado | `fix` (default) o `discovery` |

Si falta alguno: **detener ejecución** y reportar al developer qué obtener antes de continuar.

### 2. Creación de estructura de carpetas

Crear (si no existen):

```
docs/
├── specs/                       # Problem Statement, gaps, KPIs, briefs
│   └── storytelling/            # Narrativas ejecutivas
├── research/
│   ├── desk-research/           # Análisis competitivo, patrones, tendencias
│   ├── primary/                 # Plan, scripts, surveys de research primaria
│   └── qualitative/             # Personas, empathy maps, journeys, insights
│       ├── personas/
│       ├── empathy-maps/
│       └── journeys/
└── design/
    ├── flows/                   # User flows + wireframes por épica
    └── accessibility/           # Audits y reportes WCAG
```

NO sobrescribe carpetas ni archivos existentes.

### 3. Detección del estado del proyecto

Genera `docs/specs/ux-project-index.md` con:

```markdown
# UX Project Index — {nombre del proyecto}

> Generado por: ux-context-core · Fecha: {ISO 8601}

## Estado del proyecto

- **Tipo:** fix / discovery
- **Dominio:** {detectado}
- **Fase ASDD actual:** {detectada del brief o "Especificar" por default}

## Inputs disponibles

| Input | Estado | Ruta |
|---|---|---|
| Brief | ✓ Presente | docs/specs/brief-{feature}.md |
| Dominio | ✓ Detectado | {valor} |
| As-Is | ✗ Ausente | (esperado en docs/specs/as-is-{feature}.md) |
| Stakeholders | ⚠ Parcial | (mencionados en brief, sin doc dedicado) |

## Artefactos UX previos detectados

(Lista de outputs UX ya producidos por sesiones anteriores, si aplica)

## Próximos pasos sugeridos

1. Invocar `ux-gap-auditor` para producir Problem Statement
2. (Opcional) Invocar `ux-desk-researcher` en paralelo para contexto competitivo
3. ...
```

### 4. Validación de coherencia con otros agentes ASDD

Detectar si existen artefactos de otros agentes ASDD relevantes para UX:

- HU en `docs/specs/` producidas por `asdd-producto`
- ADRs en `docs/architecture/decisions/` producidos por `asdd-solution-architect`
- Reportes de seguridad o regulatorios en `docs/security/`

Si encuentra material, lo lista en el índice como **contexto upstream disponible** para que las skills UX downstream lo consuman.

## Modo de operación

| Modo | Cuándo |
|---|---|
| **Completo** | Brief + dominio + tipo de proyecto declarados → ejecuta los 4 pasos |
| **Degradado** | Falta tipo de proyecto → asume `fix` y advierte explícitamente |
| **Bloqueante** | Falta brief o dominio → detiene ejecución, no crea estructura, reporta al developer |

## Outputs

- `docs/specs/ux-project-index.md` — Índice del estado del proyecto UX
- Estructura de carpetas creada bajo `docs/` (research, design, specs si no existen)

NO escribe en otros artefactos ni modifica archivos existentes — solo CREA estructura faltante.

## Coordinación

- **Antes de:** TODAS las otras skills UX (es el entry point)
- **Lee de:** brief del proyecto, ADRs existentes, HU upstream de producto
- **NO modifica:** ningún artefacto producido por otra skill u otro agente
- **Output consumido por:** developer humano (lee el índice) + skills UX subsiguientes (encuentran estructura lista)

## Cuándo NO invocar

- La estructura ya existe y los inputs están validados → invocar `gap-auditor` directamente
- El proyecto no es UX → invocar el agente correspondiente (`asdd-producto`, `asdd-solution-architect`, etc.)
- No hay brief disponible → solicitar al PM antes de invocar (esta skill NO crea el brief)
- Se quiere refinar HU → `asdd-producto-po`, no esta skill

## Anti-patterns

- **Inicializar sin brief válido** — esta skill NO inventa contexto. Si falta el brief, debe detener ejecución y reportar al developer, NO crear estructura "por si acaso".
- **Sobrescribir carpetas o archivos existentes** — la inicialización es **idempotente**: si la estructura ya existe, no la altera. Solo crea lo que falta.
- **Asumir tipo de proyecto sin declarar** — si no está claro `fix` vs `discovery`, asumir `fix` (caso común Guide) y declarar la asunción explícitamente en el índice.
- **Crear inputs ficticios** — si falta `as-is.md`, marcar como brecha en el índice. NO crear archivo placeholder. Eso oculta el problema downstream.
- **Replicar memoria del template ASDD** — el template tiene su propio `ASDD-MEMORY.md` y `.claude/memory/`. Esta skill NO compite con eso, solo gestiona estado UX específico del proyecto en curso.
