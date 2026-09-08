# ASDD Orchestration — Pre-execution Plan Gate

Regla **ORC-010**: evaluación obligatoria antes de ejecutar cualquier tarea — tanto en el orquestador como en cada agente invocado. Complementa `sofka-asdd-orchestration.md` y `sofka-asdd-orchestration-ops.md`.

## ORC-010: Pre-execution Plan Gate

**Aplica a**: el orquestador antes de delegar, y a cada agente antes de iniciar su trabajo.

El objetivo es que el usuario siempre sepa **qué se va a hacer, quién lo va a hacer y con qué comandos** antes de que se ejecute cualquier acción. El plan no es un documento — es una declaración de intención de máximo 10 líneas que el usuario puede corregir antes de que sea demasiado tarde.

---

## Matriz de aplicación del plan

| Ruta | Tipo request | ¿Requiere plan? | Confirmación requerida |
|---|---|---|---|
| TRIVIAL | Query / solo lectura | No | No |
| LIGHT | Cambio atómico, scope explícito | No | No |
| MEDIUM | Bug/cambio multicomponente acotado | Sí — plan breve | Solo W/D o dominio sensible |
| FULL | Cualquiera | Sí — plan completo | Sí |
| Cualquiera | Contiene operaciones CLI / infra / cloud | Sí — plan con comandos | **Sí, siempre** |
| LIGHT | Operación git (commit, push, MR/PR, branch) | No — vía rápida ORC-010-F | No aquí: la pide GS-003 / GS-008 / GS-009 con el comando exacto |

**Regla override**: si la tarea incluye cualquier operación CLI, IaC, cloud (az/aws/gcloud), base de datos, pipeline o sistema externo → el plan con lista de comandos es **obligatorio** independientemente del tipo o ruta, y requiere **confirmación explícita** antes de proceder.

---

## Formato del plan

El plan se presenta como bloque en la conversación **antes de invocar cualquier agente o ejecutar cualquier comando**:

```
📋 **Plan de ejecución**
Tarea: {descripción en una línea}
Ruta: {LIGHT Tipo N | FULL fase {fase}}

Agentes:
  1. @sofka-asdd-{nombre} (model: {modelo}, turns: {N}, retries: {N}) — {qué hará}
  [2. @sofka-asdd-{nombre} (model: {modelo}, turns: {N}, retries: {N}) — {qué hará}]

Artefactos esperados:
  - {artefacto 1}
  [- {artefacto 2}]

[Comandos a ejecutar:           ← solo si aplica (ver regla CLI abajo)
  $ {comando 1}
  $ {comando 2}]

[⚠ Confirmación requerida: respondé afirmativamente para continuar (ok / dale / procedé / aprobado…) o corregí el plan.]
```

Omitir secciones vacías. El plan **nunca supera 15 líneas**. Si el plan no cabe en 15 líneas, es señal de que el scope es demasiado amplio — escalar a FULL o dividir en subtareas.

---

## Regla CLI / Infra / Cloud (obligatoria)

Cuando la tarea involucra alguno de los siguientes agentes o dominios:

- `sofka-asdd-devops-engineer` (cualquier skill)
- `sofka-asdd-cloud-architect` ejecutando operaciones reales (no solo diseño)
- `sofka-asdd-developer-backend` corriendo migraciones, scripts de DB o seeds
- `sofka-asdd-security` ejecutando scanners, herramientas SAST o de auditoría
- Cualquier agente que invoque `az`, `aws`, `gcloud`, `kubectl`, `terraform`, `pulumi`, `helm`, `docker`, `psql`, `mysql`, `mongosh`, u otro CLI de infraestructura o datos

El plan **debe listar explícitamente cada comando** que se ejecutará, en el orden en que se ejecutará, bajo la sección `Comandos a ejecutar`. No se permiten comandos implícitos ni "se ejecutará algo similar a".

### Niveles de riesgo de comandos CLI

Cada comando en el plan se clasifica con un prefijo de riesgo:

| Prefijo | Nivel | Ejemplos |
|---|---|---|
| `[R]` | Read — solo lectura, sin cambios | `az resource list`, `kubectl get pods`, `terraform plan` |
| `[W]` | Write — crea o modifica recursos | `kubectl apply`, `terraform apply`, `helm install` |
| `[D]` | Destructive — elimina o no tiene rollback | `terraform destroy`, `kubectl delete`, `az group delete`, `DROP TABLE` |

Ejemplo de plan con comandos clasificados:

```
📋 **Plan de ejecución**
Tarea: desplegar nuevo servicio de notificaciones en AKS
Ruta: FULL fase Construir

Agentes:
  1. @sofka-asdd-devops-engineer (model: sonnet, skill: devops-engineer-iac) — construir y publicar imagen Docker, aplicar manifiestos K8s
  2. @sofka-asdd-devops-engineer (model: sonnet, skill: devops-engineer-cloud) — validar despliegue y diagnosticar si hay fallas

Artefactos esperados:
  - Imagen Docker publicada en ACR
  - Deployment y Service en AKS
  - Health check confirmado

Comandos a ejecutar:
  [R] $ az acr list --resource-group rg-production
  [W] $ docker build -t myapp/notifications:1.2.0 .
  [W] $ az acr login --name myregistry
  [W] $ docker push myregistry.azurecr.io/notifications:1.2.0
  [W] $ kubectl apply -f k8s/notifications-deployment.yaml
  [R] $ kubectl rollout status deployment/notifications

⚠ Confirmación requerida: respondé afirmativamente para continuar (ok / dale / procedé / aprobado…) o corregí el plan.
```

---

## Validación de contenido del plan — OBLIGATORIA antes de presentarlo (#3577)

**El orquestador valida el contenido del plan ANTES de mostrárselo al usuario.** Un plan inválido nunca llega al usuario — se corrige primero (o se aplica el protocolo de excepción ORC-000).

### Checklist de validación (todo debe cumplirse)

| # | Regla | Incumplimiento → acción |
|---|---|---|
| V1 | Cada paso en "Agentes:" tiene un `@sofka-asdd-{nombre}` como responsable | Reasignar al agente correcto |
| V2 | Ningún paso asigna herramientas de dominio al orquestador (Figma, DB, cloud API, MCP externo) | Reasignar paso a `@sofka-asdd-ui`, `@sofka-asdd-devops-engineer`, etc. |
| V3 | Los agentes mínimos para las señales detectadas están en el plan (ver WF-xxx correspondiente) | Agregar los agentes faltantes |
| V3b | La sección "Artefactos esperados" incluye todos los artefactos obligatorios de la fase según WF-xxx ("Completitud") — sin que el usuario los reclame (#3577 AC4) | Agregar artefactos faltantes al plan |
| V4 | No hay pasos sin agente responsable ("TBD", "orquestador", vacío) — salvo excepción etiquetada | Ver AC6 abajo |
| V5 | Pasos etiquetados como `EXCEPCIÓN ORC-000 (orquestador)` tienen justificación explícita | Agregar justificación o reasignar a agente |

### AC6 — Gate rechaza planes con pasos sin agente (#3577)

Si después de corregir sigue habiendo un paso sin agente responsable:
1. El orquestador aplica el protocolo `EXCEPCIÓN ORC-000 (orquestador)` (ver ORC-000 en `sofka-asdd-orchestration.md`)
2. El paso queda etiquetado y justificado en el plan
3. El gate requiere confirmación **explícita** del usuario para ese paso específico, señalado con `⚠ EXCEPCIÓN: el orquestador ejecutará este paso directamente por: {razón}`

Un plan con pasos anónimos (sin `@sofka-asdd-X` ni `EXCEPCIÓN ORC-000`) **nunca se presenta al usuario**.

---

## Reglas de comportamiento

### Para el orquestador

1. Evaluar si la tarea requiere plan (ver matriz arriba) **antes de anunciar agentes** (ORC-008).
2. **Validar el contenido del plan** (checklist V1-V5 de arriba) — corregir ANTES de presentar al usuario.
3. Si requiere plan → presentarlo y esperar confirmación cuando corresponda **antes** de invocar el primer agente.
4. Si el usuario ya indicó `/sofka-asdd:do` (ruta LIGHT explícita) → omitir confirmación pero **igual presentar el plan** si hay comandos CLI o excepción ORC-000.
5. Si el usuario responde con correcciones al plan → **no** rehacer la ceremonia por default. El
   challenge queda enmendado (ORC-010-E): si la corrección no cambia agentes, `scope[]`, `commands[]`
   ni budget, aprobar el lote original con `amend --challenge-id <id> --confirm-unchanged` y ejecutar,
   propagando la corrección en el prompt del agente. Solo si cambia el envelope emitir un challenge
   nuevo con el delta y preguntar al usuario si quiere ver el plan revisado o que se proceda directo.
6. El plan se registra en `.asdd-run.json` bajo `execution_plan` del step correspondiente (ORC-007).

### ORC-010-A: Autorización estructurada por lote

Antes de mostrar un plan que requiere confirmación, el orquestador emite un challenge con el plan canónico:

```
node .claude/scripts/sofka-asdd-plan-authorization.mjs issue --plan-json '{
  "request_id":"{id}",
  "task":"{tarea}",
  "budget_policy_version":1,"route":"FULL","phase":"build","risk":"medium","confidence":0.9,"max_concurrent":1,
  "agents":[{"agent":"sofka-asdd-X","capability":"sofka-asdd-X-primary","dependencies":["sofka-asdd-X-dependency"],"scope":["ruta"],"commands":["comando"],"model":"sonnet","max_turns":40,"retries":0}]
}'
```

- La respuesta de aprobación confirma únicamente el challenge activo y vigente. Una afirmación aislada, sin challenge, no crea autorización.
- `UserPromptSubmit` consume el challenge ante cualquier afirmación explícita; el orquestador no ejecuta después `plan-authorization.mjs approve` sin argumentos, `status` ni `--help`. Debe invocar el lote aprobado o pedir un plan/challenge nuevo.
- El hook genera una autorización interna, de uso único para el lanzamiento, para cada agente del lote.
- El Agent se invoca con el mismo `model` lógico y con el marcador exacto `[ASDD-BUDGET route=... phase=... model=... max_turns=... retries=...]` dentro de su prompt. Un mismatch consume y bloquea la autorización; requiere plan nuevo.
- **Cuando el agente tiene `capability` aprobada, el prompt de lanzamiento debe contener además la línea literal `node .claude/scripts/sofka-asdd-load-capability.mjs {capability}`** — la ruta relativa exacta, no la absoluta ni una variante. `assertBudgetedLaunch` la exige junto con el marcador y, si falta, deniega el launch con `launch-budget-mismatch`. No es redundante con ART-003: ART-003 obliga al agente a **cargar** la capability como primera operación, y esta línea es lo que garantiza que la vea en su prompt.
- `sofka-asdd-plan-gate.mjs` consume el lanzamiento exacto. Si no hay lote ASDD activo conserva `ask`; si existe pero el agente no coincide, expiró o ya se consumió, devuelve `deny` y exige plan/challenge nuevo.
- Un agente **ya lanzado** conserva su autorización hasta su propio TTL aunque se apruebe un lote nuevo: conservar un binding intacto no es reutilizarlo ni ampliarlo. Aprobar un lote nuevo no revoca al agente en vuelo — solo lo reemplaza un lote nuevo que **redeclare ese mismo agente**, y en ese caso gana el binding nuevo. La entrada conservada mantiene su `expires_at` original, que no se renueva.
- El presupuesto de ruta (TRIVIAL/LIGHT/MEDIUM/FULL) acota **el lote**: cuánto trabajo paralelo declara y lanza un plan. No acota la **autoridad simultánea viva**, porque las autorizaciones de agentes en vuelo de lotes anteriores se conservan y su vencimiento lo gobierna cada `expires_at`, no el `max_concurrent` del plan vigente.
- Un hook de operaciones valida `Write`/`Edit` contra `scope[]` y Bash sensible contra `commands[]`, usando `agent_id` y `agent_type` runtime. Cambiar agentes, scope o comandos exige emitir un challenge nuevo.
- El hook tolera una **composición read-only benigna**: el comando se parte en partes atómicas por `;`, `|`, `&&` y `||` respetando comillas y escapes, y se le quitan las redirecciones que no llevan datos a ningún lado (`2>&1`, `2>/dev/null`, `>/dev/null`). Si **cada** parte es un comando read-only allow-listed — o un loader de capabilities en la cabeza de la cadena, uno o varios: un plan con `dependencies[]` pide dos capabilities y `load A && load B` es la forma en que un agente las carga — la operación pasa. Cada loader se valida por ruta exacta y cada capability se contrasta contra el lote, así que una no aprobada sigue siendo `capability-mismatch`. La tolerancia **no** alcanza a `commands[]`: un comando declarado se ejecuta verbatim o no se ejecuta, así que `<comando declarado> | head` sigue siendo `command-mismatch`. Un `&` de background, una comilla sin cerrar, `$(...)`, backtick, cualquier `>` remanente, `find -exec/-delete` y `sort -o` también.
- El hook tampoco exige declaración para el **control-plane que las reglas obligan a ejecutar**: `sofka-asdd-resolve-rule.mjs` (lo pide el bloque "Carga condicional obligatoria" de las 9 reglas always-on), `sofka-asdd-resolve-capability.mjs`, `validate-template.mjs` y `git worktree list` (AL-005). `test` entra por el léxico de lectura: consulta el filesystem y no tiene forma de escritura. Los tres scripts tienen cero escrituras, y el allowlist es por **ruta** dentro del proyecto: un homónimo en otro directorio no pasa. `sofka-asdd-resolve-workspace.mjs` queda afuera porque escribe estado y ninguna regla se lo manda a un agente; `sofka-asdd-plan-authorization.mjs` y `sofka-asdd-run-bootstrap.mjs` también, porque son control-plane del orquestador (ORC-010-A, ART-002).
- `sofka-asdd-system-integrity` obliga a cerrar con el validador y el runner de tests del proyecto, y la invocación exacta no se conoce al planificar. El hook admite `npm test` y `npm run <script>` **solo** en su forma canónica sin argumentos extra, **solo** si el script está declarado en el `package.json` del proyecto y **solo** si su nombre es de verificación (`test`, `build`, `lint`, `typecheck`, `validate`, `check`, `format`, `coverage`, `verify` y sus variantes `nombre:sufijo`). `setup`, `hash:regen` y cualquier script de entrega quedan afuera, igual que `npm test -- --coverage`.
- `Write`/`Edit` no necesitan declarar en `scope[]` las rutas que el propio framework obliga a escribir: `.claude/agent-memory/{agente}/**` — solo el directorio del agente dueño de la autorización —, `.asdd-run.json` y `.tmp/**`, la zona de scratch gitignoreada que `sofka-asdd-ephemeral-artifacts` le designa a todo agente. El conjunto es fijo y no configurable desde el plan; el resto de `.claude/` y la raíz del repo siguen exigiendo scope.
- Para todo agente listado en `.sofka-asdd/capability-loading.json`, cada entrada canónica incluye una `capability` primaria permitida. Puede declarar como máximo una segunda en `dependencies[]`; debe pertenecer al catálogo del mismo agente, ser distinta de la primaria y estar aprobada en el challenge. El runtime registra las cargas sin reemplazar la primaria. Antes de Edit/Write/Bash sensible el agente carga el `SKILL.md` primario con `sofka-asdd-load-capability.mjs`; una carga no aprobada o una tercera capability produce `capability-mismatch`.
- La pertenencia al manifiesto es lo único que decide: `normalizeCapability` es
  fail-closed en las dos direcciones, así que un agente listado sin `capability`
  declarada corta la emisión del plan y uno no listado con `capability` también.
  Un agente overlay no listado se conserva en el plan sin `capability` ni
  `dependencies`; no se elimina ni se agrega al manifest durante el run.
  `sofka-asdd-domain-expert` **está listado desde 3.7.0**, con una capability por
  sector: es overlay por cómo elige su skill —uno solo, el del dominio del init—,
  no por quedar afuera del manifiesto, y su entrada declara `capability`.
- Un apoyo read-only puede declarar `budget_class: "support"` para usar el
  techo reducido de la ruta sin inflar su presupuesto al mínimo del agente
  primario.
- Antes de emitir el challenge, el orquestador reserva cada ruta documental.
  `scope[]` contiene rutas exactas con
  `{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`, nunca placeholders o nombres clásicos.
- `git commit` queda excluido del lote y mantiene el challenge GS-003. Por eso las operaciones git
  entran por la vía rápida ORC-010-F: el lote ORC-010 no puede autorizarlas y exigir además su
  ceremonia significa dos confirmaciones para una sola operación.
- `APROBACIÓN_ORQUESTADOR: confirmada` es texto informativo legado y nunca prueba de autoridad.

### ORC-010-E: respuesta del usuario — cuatro intenciones

`sofka-asdd-approval-intent-lib.mjs` clasifica la respuesta por **raíz morfológica**, no contra una
lista cerrada de palabras. Una lista cerrada reproduce el bug que esta regla cierra: el usuario
tipea lo que la documentación promete y el gate no lo reconoce.

| Intención | Ejemplos | Efecto en el runtime | Qué hace el orquestador |
|---|---|---|---|
| Aprobación | `ok` · `dale` · `procedé` · `aprobado` · `de acuerdo` · `tal cual` · `ok, dale` · 👍 | El hook consume el challenge y crea las autorizaciones del lote | Invoca el lote aprobado |
| Rechazo | `no` · `cancelá` · `pará` · `mejor no` | El hook **revoca** el challenge | No invoca nada; pregunta qué corregir |
| Corrección | `ok pero usá tabs` · `dale, aunque antes cambiá el paso 2` | El hook marca el challenge **enmendado** (sigue emitido, ya no aprobable por la vía normal) | Resuelve las tres salidas de abajo |
| Ninguna | prompt largo, pregunta, request nuevo | Sin efecto | Sigue esperando |

**Cola larga.** Una afirmación que no matchea ninguna raíz (`brutal`, `va`, `impecable`) deja el turno
**elegible**: el hook no aprueba, habilita. El orquestador ejecuta
`plan-authorization.mjs approve --challenge-id <id>` solo si interpreta que el usuario aprobó. La
elegibilidad exige challenge activo, es de un solo uso y no sobrevive al turno.

**Corrección — tres salidas, sin ceremonia por default:**

1. La corrección **no** cambia agentes, `scope[]`, `commands[]` ni budget → `amend --challenge-id <id>
   --confirm-unchanged` y ejecutar el lote original, propagando la corrección en el prompt del agente.
   No se vuelve a presentar el plan.
2. La corrección **sí** cambia el envelope → emitir un challenge nuevo con el delta ya incorporado y
   preguntarle al usuario, en una línea, si quiere ver el plan revisado o que se proceda directo.
3. No se puede determinar cuál de los dos casos es → preguntar. Nunca ejecutar el lote original sin
   resolver 1 o 2.

`amend` no amplía permisos: aprueba el lote que el usuario ya vio. Si el agente intenta salir de
`scope[]`, el hook de operaciones lo bloquea igual.

---

### ORC-010-F: vía rápida — qué NO pasa por el plan gate

| Caso | Por qué | Gate que sí aplica |
|---|---|---|
| Operación git (commit, push, MR/PR, branch, stash, rebase) | El lote ORC-010 no puede declarar `git commit` (GS-003 lo rechaza en `issueChallenge`), así que la ceremonia no autoriza nada de la operación | GS-001/GS-003 (commit), GS-008 (push), GS-009 (MR/PR) — muestran el comando exacto antes de confirmar |
| Cambio LIGHT con scope exacto resoluble (hasta 3 archivos; mover/renombrar incluye el destino si su carpeta padre existe) | El scope está determinado por el prompt; no hay nada que el usuario deba elegir | Hook de operaciones contra `scope[]` |

Force push, `reset --hard` y reescritura de historia **no** entran en la vía rápida: caen al flujo
normal y fuerzan confirmación explícita.

---

### Para los agentes

1. Al iniciar su trabajo, el agente evalúa si su porción de la tarea requiere plan propio (por ejemplo, un devops-engineer que recibe scope amplio).
2. Si el agente necesita ejecutar un comando sensible no anticipado en el plan del orquestador → **pausar, reportar al orquestador** con:
   ```
   PLAN UPDATE REQUERIDO
   Comando adicional detectado: {comando}
   Motivo: {por qué es necesario}
   Clasificación: [R|W|D]
   ```
3. El orquestador presenta el update al usuario y espera un challenge/aprobación nuevos. Lecturas locales allow-listed no consumen `commands[]`; cualquier Bash no read-only debe estar declarado.

### Casos que NO requieren plan

- Tipos 1 y 2 sin operaciones CLI: ejecutar directamente, sin fricción.
- Lecturas de archivos locales del proyecto (`Read`, `Glob`, `Grep`): nunca requieren plan.
- Llamadas MCP de solo lectura (consultar Jira, leer docs, buscar en Context7): nunca requieren plan.
- Control-plane determinístico previo al plan:
  `sofka-asdd-run-bootstrap.mjs` y `sofka-asdd-artifact-name.mjs` con su gramática
  cerrada. Solo crean/reanudan estado local y reservan nombres/scopes; no
  ejecutan agentes ni producen contenido de dominio.

---

## Posición en el flujo de decisiones del orquestador

El plan gate se evalúa **después** de ORC-001-B (clasificar complejidad) y **antes** de ORC-002 (seleccionar agentes) / ORC-008 (anunciar agentes):

```
ORC-001 (fase) → ORC-001-B (TRIVIAL/LIGHT/MEDIUM/FULL) → ORC-001-D (codebase_size)
  → ORC-010 (plan gate) ← aquí
    → ORC-002 (agentes) → ORC-002-B (modelos) → ORC-003 (modo invocación)
      → ORC-008 (anuncio) → invocación
```

Si ORC-010 espera confirmación y el usuario no ha respondido → el orquestador no avanza al siguiente paso. No hay timeout implícito — esperar respuesta del usuario.
