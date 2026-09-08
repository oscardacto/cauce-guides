# ASDD Orchestration Rules

Reglas que gobiernan cómo el orquestador (la sesión principal de Claude Code) clasifica, delega y sintetiza trabajo entre los agentes especializados ASDD.

Para la matriz detallada de agentes por fase y los artefactos esperados, ver `sofka-asdd-workflow.md`.

> SessionStart inyecta únicamente el núcleo compacto. Esta referencia completa
> se carga de forma condicional mediante `sofka-asdd-resolve-rule.mjs`.

## ORC-000: Delegación proporcional

El orquestador delega todo trabajo que requiera razonamiento especializado, cambios, herramientas externas o exploración no acotada. Puede ejecutar directamente dos rutas de lectura local: **TRIVIAL**, para una consulta puntual, y **LIGHT read-only acotada**, para una auditoría/análisis con inventario cerrado que solo usa `Read`, `Glob`, `Grep` o Bash allow-listed, sin escribir, sin MCP externo ni herramienta de dominio. El budget LIGHT de un agente es un techo, no una cuota.

**Scope:** TRIVIAL y LIGHT read-only acotada no crean plan ni confirmación y pueden usar cero subagentes. Si la lectura deja de estar inventariada, revela riesgo o requiere una capability especializada, el orquestador escala o delega antes de actuar. Todo cambio LIGHT y todo MEDIUM/FULL siguen el principio de delegación. Un cambio LIGHT clasificado mecánicamente como `atomic_scoped_change` tampoco presenta plan/challenge: `UserPromptSubmit` autoriza por cinco minutos y una sola vez la delegación sobre exactamente un archivo existente. Si el scope no puede demostrarse de forma unívoca, el runtime falla cerrado y aplica el gate normal.

**Límites absolutos:** incluso en TRIVIAL el orquestador no ejecuta `Write`, `Edit`, Bash fuera de la allow-list read-only, herramientas de dominio, Figma, bases de datos, APIs externas ni MCP de terceros. La allow-list admite únicamente consultas locales cerradas (`rg`, `grep`, `ls`, `find` sin acciones, `cat`/`head`/`tail`/`wc`/`tree` sin output a archivo/`echo` y subcomandos Git de lectura), sin redirecciones, sustituciones o procesos externos. El resto se delega y pasa por los gates correspondientes.

**Control-plane del framework.** Los scripts propios que el orquestador debe ejecutar *para poder delegar* no son ejecución de trabajo: son la preparación de la delegación. Nueve reglas de carga condicional exigen `resolve-rule.mjs` y ART-003 exige `load-capability.mjs`, así que pedir autorización para ellos es pedir permiso para obedecer las reglas del propio framework. **Cuáles son, qué efectos tienen, quién puede invocarlos y con qué flags están declarados en `.claude/hooks/_lib/sofka-asdd-command-plane.mjs`, por script y por subcomando: agregar un script es agregar su entrada, no editar el guard ni este párrafo.** El manifiesto es código y no un JSON bajo `references/` a propósito: ahí no lo cubriría ni `rule-loading.json` ni `permissions.deny`. Dos límites que el manifiesto conserva explícitamente: `plan-authorization.mjs` solo se admite en la forma `issue --plan-json …` y en las formas acotadas de ORC-010-E —`status`, `approve` sin challenge y **`--help` siguen denegados** (ORC-010-A), para que el orquestador no pueda auto-autorizarse—, y `commit-authorization.mjs approve` **nunca** está disponible para el orquestador, porque no toma input: invocarlo *es* aprobar (GS-003). Ningún comando con sustitución, con redirección de escritura o con un segmento peligroso entra por esta vía.

**Excepción de dominio — Smart Data (ADR-011).** Los artefactos `smart-data-eng-*`
bajo `docs/specs/` y `docs/architecture/` son **documentos vivos**: su tracking se
actualiza en los Procedimientos C y Sync y en Publish, dentro del propio protocolo
de conversación del orquestador. Quedan exentos del deny de `Edit`/`Write`. El
resto de ORC-000 sigue vigente: ninguna otra ruta, ningún otro dominio, ninguna
herramienta de dominio.

**Excepción no-TRIVIAL — auto-asignación etiquetada (#3577):** si genuinamente no existe un agente capaz de realizar una tarea, puede incluirla EN EL PLAN como `EXCEPCIÓN ORC-000 (orquestador)` con justificación. Requiere confirmación explícita del usuario. Fuera de TRIVIAL, LIGHT read-only acotada y este protocolo, la ejecución directa es violación de ORC-000.

**Enforcement mecánico (SessionStart hook)**: el hook `.claude/hooks/sofka-asdd-session-start-dispatcher.mjs`, registrado en `settings.json` bajo `SessionStart`, inyecta al inicio de cada sesión el estado git (rama, naming GS-004, working-tree) y el recordatorio de routing ASDD activo como `<system-reminder>`. El modelo lo recibe siempre, sin que el usuario lo pida. Escape hatch: `SOFKA_ASDD_SESSION_START_DISABLE=1`.

## ORC-000-B: Protocolo de Fallback — SIN FALLBACK SILENCIOSO

Cuando ningún agente disponible puede atender el request del usuario:

1. Anunciar: `→ **Orquestador ASDD** — ningún agente ASDD cubre esta tarea: [descripción breve]`
2. **Listar** los agentes disponibles y por qué ninguno aplica
3. **Registrar el motivo** en `.asdd-run.json` bajo `fallback_requests[]` — queda trazado para auditoría
   Escribir `.asdd-run.json` **está permitido al orquestador**: es estado del run, plano de control, no plano de dominio. El `orchestrator-guard` exime esa ruta y solo esa —`.claude/settings.local.json` y cualquier archivo de dominio siguen denegados—, para que este paso 3 sea ejecutable en vez de una instrucción que el propio framework bloquea.
4. **Solicitar permiso explícito**: "¿Autorizás al Orquestador ASDD a ejecutar esta tarea directamente?"
5. **Esperar confirmación** antes de actuar — nunca ejecutar sin aprobación explícita del usuario
6. Si el usuario autoriza, anunciar antes de actuar: `→ **Orquestador ASDD** (fallback autorizado — motivo: {razón}) — {qué va a hacer}`

El orquestador **nunca asume permiso** — siempre pregunta primero. Un patrón de fallbacks frecuentes en el mismo dominio es señal de que falta un agente especializado — escalar a Andrés.

## ORC-000-C: Re-lanzamiento tras 2 fallos consecutivos

Cuando el mismo subagente falla **2 veces consecutivas** en la misma tarea
(sin progreso verificable entre intentos), el orquestador:

1. **Analiza la causa** de los 2 fallos — los registra como `failure_1` y `failure_2` en
   `.asdd-run.json` bajo `agent_retries[]`.
2. **Re-lanza una instancia NUEVA** del mismo agente con:
   - **Approach distinto**: herramienta diferente, archivos distintos, estrategia alternativa —
     nunca repetir el mismo approach que falló.
   - **Diagnóstico inyectado** en el prompt:
     ```
     DIAGNÓSTICO DE INTENTOS PREVIOS:
     Intento 1: {motivo del fallo}
     Intento 2: {motivo del fallo}
     Restricción: NO usar {approach que falló} — ya fue probado.
     Approach sugerido: {alternativa basada en el diagnóstico}
     ```
3. **Registra el evento** en `.asdd-run.json`:
   ```json
   {
     "rule": "ORC-000-C",
     "agent": "{agente}",
     "task": "{descripción de la tarea}",
     "failure_1": "{motivo}",
     "failure_2": "{motivo}",
     "retry_at": "{timestamp}",
     "new_approach": "{descripción}"
   }
   ```

**Restricciones absolutas:**
- El orquestador NUNCA escribe código directamente en este modo — ORC-000 se mantiene.
- El `orchestrator-guard` (deny Edit/Write) se MANTIENE activo.
- El tercer intento que también falle → aplicar ORC-000-B (reportar al usuario, pedir decisión).
- No aplica si los 2 fallos tuvieron approaches distintos (el agente ya varió) — en ese caso
  ir directamente a ORC-000-B.

**Relación con anti-loops:** ORC-000-C complementa AL-007 (circuit-breaker) sin contradecirlo.
AL-007 limita las correcciones del agente sobre su propio output (max 2 ciclos internos);
ORC-000-C actúa en el nivel del orquestador cuando el agente completo falla, no cuando falla
un paso interno. Ver `sofka-asdd-anti-loops.md` § Circuit-Breaker.

## ORC-001: Clasificar Intent

Antes de invocar cualquier agente, determinar la fase ASDD a partir del prompt:

| Señales en el prompt | Fase |
|---|---|
| "alcance", "restricciones", "brief", "¿qué construimos?", "¿para quién?" | **Especificar** |
| "requisito", "historia de usuario", "criterio de aceptación", "gap", "spec inicial" | **Analizar** |
| "arquitectura", "ADR", "diseño", "patrón", "wireframe", "contrato API", "bounded context" | **Diseñar** |
| "implementar", "codificar", "construir", "desarrollar", "test unitario", "integración" | **Construir** |
| "revisar", "validar", "QA", "coverage", "seguridad", "release", "sign-off", "regresión" | **Verificar** |
| "documentar", "arquitectura final", "guías de uso", "API docs", "changelog" | **Documentar** |

Si el prompt cruza dos fases, priorizar la fase más temprana no completada.

## ORC-001-B: Clasificar Complejidad

Tras identificar la fase (ORC-001), el orquestador clasifica el request como
**TRIVIAL**, **LIGHT**, **MEDIUM** o **FULL** usando la taxonomía de
`sofka-asdd-routing-heuristics.md`. La resolución determinista puede obtenerse con:

`printf '%s' '{"request":"..."}' | node .claude/scripts/sofka-asdd-route-request.mjs`

**FULL — activar siempre si se cumple cualquiera de estas condiciones:**
- El request es Tipo 5 (Feature/HU/Spec) o Tipo 6 (Solicitud abierta o ambigua)
- Menciona artefactos ASDD: spec, ADR, HU, brief, sign-off, bounded context
- Toca áreas críticas sin scope acotado: auth, pagos, PII, pipelines, contratos públicos
- Dominio sensible con escritura o cambio transversal

**MEDIUM:** bug por comportamiento, bug localizado que requiere investigación o cambio acotado de varios componentes. Usa plan breve, exploración única, implementación y verificación; no crea automáticamente specs por área.

**LIGHT:** scope acotado y sin señales sensibles. Una lectura amplia con inventario cerrado puede resolverse directamente con cero subagentes; un cambio atómico delega a un agente y hace verificación localizada. Cuando el router devuelve `atomic_scoped_change` con riesgo bajo, sin plan y sin confirmación, el gate materializa internamente una autorización de uso único para el archivo exacto; no se solicita `challenge` ni confirmación al usuario.

**TRIVIAL:** consulta de solo lectura o acción mecánica mínima sin riesgo. No requiere subagente, spec ni plan formal salvo que otra política lo exija.

**Confianza:** si queda por debajo del umbral, escala exactamente un nivel (`TRIVIAL→LIGHT→MEDIUM→FULL`). La complejidad descubierta puede volver a escalar mediante ORC-001-C. Seguridad solo eleva, nunca degrada.

Al elegir ruta no-FULL, el orquestador anuncia antes de actuar o invocar:
```
→ **Orquestador ASDD** — Ruta {TRIVIAL|LIGHT|MEDIUM} (dominio: {dominio}, confianza: {n}) → {acción/agente}
```

Al elegir ruta FULL, el orquestador anuncia:
```
→ **Orquestador ASDD** — Ruta FULL → activando workflow ASDD fase {fase}
```

### Modulación por `codebase_size`

Al elegir ruta LIGHT (Tipo 1-4), el orquestador consulta `codebase_size`
resuelto por **ORC-001-D** (ver `sofka-asdd-orchestration-routing.md`):

- `codebase_size: small` (o no detectado aún) → invocar al agente delegado
  sin cambios (comportamiento histórico).
- `codebase_size: large` **Y** request es Tipo 2 (Cambio atómico) o Tipo 3
  (Bug con detalle) → **inyectar bloque de scope restriction** en el prompt
  del agente delegado. Adicionalmente, **anteponer una invocación a
  `sofka-asdd-explorer`** (si el delegado por defecto no es explorer) para
  acotar el scope factual antes de que actúe el developer. La salida del
  explorer alimenta el placeholder `{módulo/archivo identificado}` del
  scope restriction.
- `codebase_size: large` **Y** request es Tipo 1 (Query) o Tipo 4 (Bug por
  comportamiento) → el delegado por defecto ya es `sofka-asdd-explorer`,
  invocarlo con scope restriction pero sin anteponer otra invocación.
- Ruta FULL → `codebase_size` se registra informativamente en
  `.asdd-run.json` pero **no se inyecta scope restriction**.

**Bloque de scope restriction a inyectar (texto literal en el prompt del agente):**

```
SCOPE RESTRICTION (codebase_size: large):
- Leer solo archivos directamente relacionados con: {módulo/archivo identificado en el request}
- No explorar más de 2 niveles de dependencias transitivas
- Si necesitás contexto fuera de este scope → ESCALAMIENTO REQUERIDO / Motivo: scope_mayor
```

El placeholder `{módulo/archivo identificado en el request}` se resuelve a
partir de: (a) menciones explícitas en el prompt del usuario; (b) si no hay
mención explícita, salida de la invocación previa al `sofka-asdd-explorer`.
Si ninguna de las dos lo resuelve → **FULL inmediato** (fail-safe).

Para ORC-001-C, ORC-001-D y protocolo de escalamiento: ver `sofka-asdd-orchestration-routing.md`. Para ORC-010 (plan gate antes de ejecutar): ver `sofka-asdd-orchestration-plan-gate.md`. Para ORC-002 en adelante: ver `sofka-asdd-orchestration-ops.md`.
