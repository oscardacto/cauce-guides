# Spec Backend — Runtime Efficiency v2

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Rol destino | Solution Architect + Developer backend/tooling |
| Prerrequisito | Brief, auditoría, baseline v2 y spec funcional del run 001 |
| Dependencias | `...-005-...-seguridad.md` para invariantes |
| Output esperado | Métricas correctas, dispatcher, loaders, routing y reconciliación eficientes |

> Ver `2026-07-18-001-ANALYZE-005-runtime-efficiency-v2-seguridad.md`
> §11 para el contrato de seguridad. Este slice no lo redeclara.

## 5. Contrato técnico

### 5.1 Medición de contexto efectivo

El analizador debe parsear frontmatter con semántica YAML real o un parser
mínimo probado que soporte, al menos:

- lista inline: `skills: [a, b]`;
- lista de bloque;
- lista vacía;
- comillas y espacios válidos;
- skills ausentes;
- skill inexistente reportada como error de integridad, no como cero palabras.

La medición efectiva mínima es:

```text
always_on
+ agent
+ eager_skills
+ active_command
+ hook_injection
= measured_effective_context
```

`tool_schemas`, `MCP schemas` y contexto interno no observable se publican en
`unmeasured_components[]`. Los gates comparan categorías homogéneas y nunca
mezclan palabras observadas con estimaciones sin etiquetarlas.

### 5.2 Reconciliación consciente de fase

`asdd-run-reconciliation` aplica esta matriz:

| Estado | Comportamiento |
|---|---|
| Sin run | skip explícito |
| Specify activo/completo sin INDEX | skip explícito |
| Analyze activo sin INDEX | skip hasta generar INDEX |
| Analyze completo o fase posterior | INDEX obligatorio, existente y reconciliado |
| `build.index_ref` presente en cualquier fase | validar path e integridad |

No se acepta apuntar `build.index_ref` a brief, auditoría u otro archivo.

### 5.3 Dispatcher consolidado

Un único proceso recibe el evento y construye una vez:

```js
{
  event,
  projectRoot,
  toolName,
  normalizedInput,
  gitContext?,
  runState?,
  authorizationContext?
}
```

Los guards exportan funciones sin lectura de stdin ni `process.exit`. El
dispatcher:

1. filtra guards por tool y forma del comando;
2. ejecuta todos los guards aplicables en orden determinista;
3. conserva sus effects autorizados y recopila todas las decisiones;
4. combina con precedencia `deny > defer > ask > allow` sin perder reason codes;
5. emite un único resultado compatible con Claude Code.

Git, specs y run-state se resuelven lazy y como máximo una vez por evento.

El dispatcher solo consolida comandos `asdd-*` del proyecto. No descubre,
invoca ni reescribe hooks globales/locales de telemetría o terceros.
`guide-collector emit` conserva handlers independientes para `PreToolUse` y
`PostToolUse`, y recibe el payload original directamente de Claude Code.

### 5.4 Inyección condicional

`UserPromptSubmit` ejecuta routing determinista y emite:

- nada o señal compacta para un turno normal;
- recordatorio especializado para Figma, seguridad, ambigüedad o challenge;
- núcleo completo solo en SessionStart, post-compact o recuperación explícita.

La aprobación de challenge conserva su procesamiento atómico actual.

### 5.5 Lazy capabilities generalizadas

El resolver existente se extiende por agente:

- capability canónica declarada en el plan;
- máximo una skill inicial;
- segunda capability solo por dependencia aprobada;
- registro efímero de carga;
- bloqueo de operación protegida si capability aprobada y cargada no coinciden.

Tech Lead, UI, Solution Architect, Producto, UX y DevOps migran incrementalmente.

### 5.6 Coordinadores delgados

ATF Web y BA Descomponedor conservan en el agent file:

- rol y límites;
- state machine;
- invariantes críticas;
- routing de phase specs;
- contrato de salida.

Ejemplos, comandos extensos, schemas y edge cases pasan a skills/references con
lector explícito. `tools: all` se reemplaza por allowlists o perfiles de fase.

### 5.7 Routing de modelos y subagentes

La precedencia sigue siendo:

`skill override > agent pinning > phase default > agent frontmatter`.

El default del orquestador se evalúa contra Sonnet; Opus queda para decisiones de
alta complejidad/riesgo y Haiku para discovery acotado cuando las evals lo
permitan.

Presupuesto inicial por ruta:

| Ruta | Subagentes | Turnos por agente |
|---|---:|---:|
| TRIVIAL | 0 | — |
| LIGHT | 1 | 10–20 |
| MEDIUM | 1–2 | 20–35 |
| FULL | máximo 3 concurrentes | 30–50 por slice |

Los límites definitivos quedan en Design después de SPIKE-1.

## 9. Validaciones de configuración

- Paths de reglas y skills deben resolver dentro del proyecto.
- Skills duplicadas o aliases ambiguos fallan.
- Un budget inválido, negativo o sin unidad falla.
- Una regla en reference sin lector conocido falla cuando está marcada
  `load_required`.
- El dispatcher rechaza eventos malformed sin lanzar operaciones secundarias.
- El validador distingue procesos ASDD de hooks independientes; nunca exige un solo proceso total por evento.

## 13. Controles y auditoría

- Baselines incluyen schema, run, fecha, branch, commit, unidad y método.
- Métricas no guardan prompts, comandos completos, tokens, secretos ni contenido
  de archivos.
- Excepciones de budget requieren owner, reason y expiración.
- Cada slice actualiza baseline solo después de pruebas verdes.

## Criterios de completitud

- [x] Contratos de métrica, reconciliación y dispatcher especificados.
- [x] Lazy loading y coordinadores definidos sin duplicar §11.
- [x] Modelo/subagentes definidos como hipótesis medibles.
- [x] Componentes no observables tratados explícitamente.
- [x] Alternativas arquitectónicas resueltas en ADR-017/018/019; B1 implementa
  parser YAML compartido y gate por capas.
