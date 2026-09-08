# Changelog — project-structure (ASDD)

Este template sigue [Semantic Versioning](https://semver.org/lang/es/) y
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/). Ver
`ASDD-VERSIONING.md` para la política completa (cuándo bump MAJOR/MINOR/PATCH,
flujo de deprecation, release process, guías de migración).

## [Unreleased]


## [3.7.0] - 2026-08-31

### Fixed

- **El flujo Smart Data quedaba bloqueado por dos guards que no conocían su dominio.** Los
  artefactos `smart-data-eng-*` no se trazan por run ASDD —su equivalente-brief es el Excel de
  trabajo del cliente y su contrato de nombres vive en `_lib/smart-data-naming.mjs`—, pero
  `artifact-name-guard` los medía contra ART-001 y `orchestrator-guard` denegaba el `Edit`/`Write`
  que su propio protocolo de conversación necesita: en Smart Data los artefactos son **documentos
  vivos**, y su tracking se actualiza en los Procedimientos C y Sync y en Publish, sin agente que
  medie.

  Se restaura la exención de nombres (ADR-003) —removida sin registro en `5c425b3` junto con las
  otras ocho cláusulas de `isExempt()`— y esta vez exige el prefijo canónico `smart-data-eng-`:
  `isDataArtifact()` por sí solo no alcanza, porque tolera un prefijo de run que es del
  analyze-guard y no del guard de nombres. Y se declara la excepción de ORC-000 para los documentos
  vivos bajo `docs/specs/` y `docs/architecture/` (ADR-011), acotada por ruta **y** por nombre: sin
  las dos condiciones, cualquier archivo llamado `smart-data-eng-*` en cualquier carpeta quedaría
  escribible.

  `ART-001` y su reference vuelven a decir lo mismo: la enumeración que listaba «Smart Data» entre
  lo que no admite excepciones se corrigió, porque contradecía a la excepción que la propia regla
  declara dos párrafos más abajo.

- **Los agentes y los comandos del flujo Data podían inventar rutas.** Los tres agentes Data
  reciben el contrato ART-002 —las rutas llegan literales en el prompt, no se recalculan, y un
  artefacto no previsto se devuelve como `PLAN UPDATE REQUERIDO` en vez de escribirse en otro
  lado— y las cinco fases declaran sus rutas exactas en un Paso 0 bloqueante, con la aclaración
  de que los artefactos Data no pasan por `run-bootstrap` ni por `artifact-name.mjs`.

  Suite nueva: `test-orchestrator-guard-data`, verificada por sabotaje — falla si se quita la
  excepción de documentos vivos y pasa con ella.

- **El guard del orquestador mandaba a `ask` todo lo que no reconocía.** Comparaba la sintaxis de
  cada comando contra cuatro allow-lists del mismo concepto y, cuando ninguna matcheaba, caía a
  `ask` por descarte. El orquestador terminaba pidiendo permiso para operaciones que el propio
  framework le ordena — entre ellas las de su control-plane.

  La decisión pasa a ser una **partición por plano** —lectura, control-plane, integridad, dominio,
  peligro— resuelta por un único motor de comandos, `.claude/hooks/_lib/asdd-command-plane.mjs`,
  con el control-plane declarado subcomando por subcomando en un manifiesto. `ask` deja de ser el
  `else`: solo se alcanza si la operación no es clasificable, y en ese caso
  `asdd-hueco-clasificacion.mjs` describe el hueco en vez de dar un rechazo mudo.
  `asdd-orchestrator-guard.mjs` queda en 345 líneas contra 697, y
  `asdd-plan-authorization-lib.mjs` pierde las 106 líneas de clasificación que duplicaba.
  Suites nuevas: `test-control-plane-manifest` (manifiesto ↔ archivos en disco ↔
  `permissions.allow`) y `test-hueco-clasificacion`.

- **El hook de inyección le pasaba al modelo `ORC-010-L`, un ID que ninguna regla define.**
  Aparecía una sola vez en todo el árbol y esa aparición era la cita misma. La norma real es
  `ORC-010-F`, que cubre los dos carriles de la vía rápida. `ORC-010-F` queda declarado en
  `required_markers`, así que borrar o renombrar la norma ahora rompe el validador — antes nada lo
  impedía, y es por eso que un ID inventado pudo convivir con el real sin que se notara.

  `test-orc-ids-inyectados` cierra el hueco de cobertura que lo permitió: extrae los IDs que el
  hook inyecta y falla nombrando el que no resuelve contra `rules/`, `references/rules/` o
  `CLAUDE.md`. Medido: 15 IDs con 1 huérfano antes, 14 con 0 después. Falla cerrado si no encuentra
  el hook, no puede leer las reglas o no extrae ningún ID — los tres significan que dejó de medir.

- **Aprobar un lote de plan revocaba la autorización de todo subagente en vuelo.**
  `grantChallenge` construía el store solo con los agentes del plan nuevo y lo escribía encima, así
  que un subagente que siguiera corriendo de un lote anterior perdía su autorización: desde ahí,
  hasta un `pwd` suyo daba `agent-mismatch`. Ahora conserva las entradas que ya consumieron su
  launch, no expiraron y el lote nuevo no redeclara; si el store no se puede leer, no conserva nada
  — falla cerrado. ORC-010 decía que un mismatch exige plan nuevo sin distinguir al agente en
  vuelo: aclarado en las dos copias de la regla, con `reference_sha256` regenerado.

- **El token de la vía rápida heredaba el scope del run.** Cuando el prompt nombraba rutas y
  ninguna resolvía, el token caía al artefacto del run como scope: autorizaba escribir la spec en
  curso mientras el usuario había pedido otra cosa. Ahora falla cerrado y el pedido va al camino
  normal, que es reversible. Además, la regex exigía directorio —`CLAUDE.md` y `package.json` no
  entraban como scope— y tomaba `4.0.0` por ruta, lo que mataba la vía rápida cuando el prompt
  mencionaba una versión; la extensión ahora debe empezar con letra. `promptScopes` devuelve
  `mentioned` para distinguir «no nombró rutas» de «nombró y ninguna resolvió», que antes
  colapsaban en `length === 0`.

- **`always_on_words` era una sola clave con dos definiciones y un solo límite.**
  `asdd-context-budget-lib.mjs` la medía como `CLAUDE.md` + `.claude/rules/**`
  —3.978 palabras contra un techo de 8.000, verde con 2x de aire— y el check
  `context-budget` la enforzaba en stage `error` desde `37417ce`, donde el límite
  nació junto a esa medición. `measure-context-footprint.mjs` reusó la misma clave
  para el piso completo, que incluye descripciones e inyección de hooks: 9.723
  palabras. El resultado era un target que se leía rojo en la herramienta y verde en
  el validador, comparando cada uno contra un techo escrito para el otro. El límite de
  8.000 queda donde siempre sirvió, renombrado a `always_on_core_words`, mismo stage
  `error` y sin cambio de comportamiento. El piso completo pasa a `measured_components`
  como `always_on_floor_words`: **se mide y se reporta, sin techo declarado**. Es
  deliberado —esto es un marco agéntico y el piso depende del alcance que cada proyecto
  instale: no paga lo mismo quien usa las 164 skills que quien hace solo backend—, así
  que un techo inventado no gobierna nada, obliga a justificar cada palabra contra una
  cifra que nadie decidió y enseña a saltear el gate. Si algún día se decide uno, agregar
  `always_on_floor_words` a `targets` alcanza: la herramienta lo toma sola.

- **La inyección de hooks se medía sumando ramas que no pueden coincidir.** El conteo
  recorría solo `push(` con literales y sumaba las 11 ramas de
  `asdd-user-prompt-submit.mjs` como si dispararan en el mismo turno. Erraba en
  las dos direcciones: los cuatro intents de plan son excluyentes entre sí y el dominio
  `data`/`software`/ambiguo también, mientras que `nucleoOrc` (315 palabras) y
  `getDeterministicRouteReminder` (298) —los dos bloques que **sí** entran en todo turno
  no-TRIVIAL— no se contaban, porque viven en un `const [...]` y se inyectan por
  `unshift`. Ahora se cobra la rama mayor de cada grupo excluyente, los incondicionales
  se cuentan, y el reporte desglosa sesión / por turno / peor condicional. El total sube
  de 1.325 a 1.509: el número viejo era favorable por accidente.

- **Una señal nueva en el hook ya no se descuenta en silencio.** Toda señal que el hook
  consulte y cuya guarda el medidor no ubique se reporta como
  `hook_injection_unclassified` y hace fallar `--strict`. El análisis es estático a
  propósito: `issueDirectLightAuthorization` escribe una autorización en disco, así que
  ejecutar el hook para medirlo acuñaría autorizaciones reales.

- **`asdd-cloud-architect` declaraba `allowed-tools:` en vez de `tools:`.** En el
  frontmatter de un **agente** la clave es `tools:`; `allowed-tools:` pertenece a los
  slash-commands y a `SKILL.md`. Como clave desconocida se ignoraba en silencio, así que el
  agente no quedaba restringido a esa lista: **heredaba todas las herramientas**. Era el único
  de los 25 agentes con esa clave, y ningún check del validador lo miraba.

- **El agente de soluciones referenciaba 16 veces skills que no existen con ese nombre.**
  Nombraba `architect-*` mientras los directorios son `asdd-solution-architect-*` — 13
  en su tabla de skills y 3 en su tabla de enrutado. Verificado tras el cambio: las referencias
  resuelven a los 13 directorios reales.

  Tres de las 16 son el resto de un renombrado que quedó a medias; las otras 13 eran
  anteriores. El check `agent-skill-references` del validador pasaba en verde porque no mira
  las referencias del cuerpo, solo las declaradas — **no sirve para detectar esto**.

- **`mcp__context7__query-docs` no es un tool real.** `@upstash/context7-mcp@3.2.1` expone
  `resolve-library-id` y **`get-library-docs`**. El nombre errado estaba en
  `asdd-solution-architect-dep-audit/SKILL.md` y en `.claude/docs/mcps-by-domain.md`, y
  se había propagado al frontmatter del agente. Corregido en los tres lugares.

- **Quedaba una skill sin barrer.** `asdd-solution-architect-diagrams` conservaba su
  `allowed-tools:` cuando las otras 131 ya lo habían perdido.

- **`.asdd/context-budget.json` medía cero.** Declaraba
  `hook_injection_words: 0` —falso: los literales de SessionStart y
  UserPromptSubmit suman 1.509 palabras en el peor turno— y las descripciones de skills, agents y
  commands, el rubro más caro del piso, no figuraban ni en `measured_components` ni
  en `unmeasured_components`. Ahora hay seis componentes medidos, tres targets nuevos
  de longitud de descripción y un bloque `measurement` que nombra la herramienta.

- **`security`, `researcher` y `cloud-architect` se revierten de la migración a carga
  on-demand.** Los tres tienen flujos documentados en su propio cuerpo que encadenan
  3–4 skills en una sola corrida (`secrets-scan → code-scan → dependency-audit →
  compliance`; `spike → benchmark → comparison`; `design (+finops) →
  cloud-architect-security`), pero `max_dependencies: 1` solo permite 1 primary + 1
  dependency por plan: la 3ª/4ª skill de esas cadenas disparaba `capability-mismatch`
  a mitad de tarea. Es el mismo motivo por el que `atf-reporting-qa-engineer`,
  `ba-specification-lead` y `ba-specification-auditor` ya habían quedado fuera del
  manifiesto — se aplica el mismo criterio a los 3 casos restantes. Vuelven a declarar
  `skills:` eager en frontmatter y salen de `.asdd/capability-loading.json`. El
  costo es acotado: ~14.529 tokens vuelven al total eager (26.298 → ~40.827; la
  reducción contra el original 70.056 baja de −62,5% a −41,7%) y solo pesa cuando se
  invoca a esos 3 agentes puntuales — el piso always-on (−44,8%, 17.611→9.723) no se
  toca.

- **`.asdd/context-budget.json` tenía 4 valores medidos desactualizados**
  respecto de lo que mide hoy `measure-context-footprint.mjs` (+16 palabras del
  último commit del changelog, no reflejadas en el artefacto): `always_on_floor_words`
  9707→9723, `discovery_surface_skill_descriptions_words` 2802→2811,
  `discovery_surface_agent_descriptions_words` 742→743,
  `discovery_surface_command_descriptions_words` 676→682.

- **`nucleoOrc` (315 de 613 palabras "incondicionales") se contaba como costo de cada
  turno, y solo se inyecta bajo `profile.mode === "full"` (reinyección explícita, no
  cada turno).** `measure-context-footprint.mjs` ahora lo separa: incondicional real
  por turno no-TRIVIAL baja de 613 a 298 palabras, y `nucleoOrc` se suma del lado
  condicional (peor combinación sube de 685 a 1.000). El total del piso no cambia
  (9.723) — es una corrección de clasificación, no de conteo.

- **La detección por forma exacta de `nucleoOrc` y del route reminder no tenía guarda
  contra deriva.** Un rename del bloque (ej. `nucleoOrc` → `orcCore`) dejaba caer esas
  palabras a 0 en silencio. Ahora `measure-context-footprint.mjs` reporta
  `hook_injection_pattern_not_found` y corta en `--strict`, mismo tratamiento que ya
  tenía `unclassified` para señales no ubicadas.

- **`target-not-declared` solo atrapaba una dirección: una clave medida y no declarada.**
  Una clave declarada en `targets` que ningún `target()` invoca en la corrida (ej. si
  `coordinators` queda desactualizado y `thin_coordinator_words` deja de dispararse)
  pasaba desapercibida. `context-budget-lib.mjs` ahora también falla cerrado en esa
  dirección (`target-never-invoked`).

- **`skill_description_chars`, `agent_description_chars` y `command_description_chars`
  eran `warning` pese a ser límites por artefacto que el MR sí decidió con número.**
  Suben a `error` en `validate-template.mjs` y en `context-budget.json` — sin
  ofensores hoy, el cambio es de severidad, no de contenido.

- **`reference-path-integrity` no atrapaba referencias rotas a `.claude/rules/*.md`
  (solo `reference(s)/{dominio}/{archivo}`, dos niveles).** Se agrega un segundo patrón
  para referencias directas de un solo nivel a `.claude/rules/`.

- **`governance-checklist.md` y `meta-platform/SKILL.md` entrenaban al healthcheck a
  pedir que CLAUDE.md liste agentes/skills** — insatisfacible desde que el catálogo se
  sacó de CLAUDE.md en este mismo MR. Se quitan esos ítems y sus ejemplos de respuesta.

- **`add-agent.md` se contradecía: el paso 4 prohíbe tocar CLAUDE.md, la plantilla de
  reporte del paso 6 seguía imprimiendo "CLAUDE.md: tabla de agentes actualizada".** Se
  quita la línea de la plantilla.

- **La leyenda de `phases-reference.md` decía "el resto son soportes por señal" cuando
  hoy todas las filas llevan `*` (primario) salvo `Meta`.** Se corrige la leyenda para
  reflejar el estado real.

- **`ba-functional-architect`, `ba-scope-manager` y `ba-functional-sme` declaraban una
  skill eager en frontmatter que también estaba en el catálogo on-demand de
  `capability-loading.json`** (`ba-change-log` los dos primeros, `ba-spec-index` el
  tercero) — dos señales opuestas sobre el mismo slot de `max_eager_skills: 1`. Se
  quita el campo `skills:` de los tres; la carga on-demand ya cubre esas skills.

- **14 descripciones de skill perdieron el puntero inverso a su agente padre**
  (`Se activa dentro de X` / `Pertenece a X`) durante la compresión, verificado contra
  el diff `8543df8...c6d0254`: `ba-brief`, `ba-early-scope`,
  `ba-functional-sme-dominio`, `ba-functional-sme-sector`, `ba-requirements`,
  `ba-scope-control`, `ba-specification-auditor-coherencia`,
  `ba-specification-auditor-mece`, `ba-specification-lead-extraccion`,
  `ba-specification-lead-gherkin`, `ba-uat-classifier`, `data-eng-contract`,
  `data-eng-discovery`, `data-eng-governance-assessment`. Restituido el puntero en los
  14, recortando el resto de la descripción para entrar en el presupuesto de 140
  caracteres (ahora `error`, no `warning` — ver arriba).

- **`qa-web-perf` y `qa-web-visual-ux-a11y` perdieron la cláusula "Independiente del
  flujo CP-by-CP", y sus skills contraparte (`atf-web-lighthouse-validator`,
  `atf-web-visual-ux-a11y-validator`) perdieron el espejo "Invocado por
  /asdd:qa-web-\*".** Restituidas en versión corta en los 4 archivos.

- **`ba-log-lessons-learned` perdió su cláusula anti-ruteo** ("la consulta de lecciones
  no es un skill, se lee `docs/lecciones/` directo") en la compresión de descripción
  (502→101 caracteres). El ruteo ocurre antes de leer el cuerpo del skill, así que la
  cláusula solo protege si está en la `description:`. Restituida en versión corta.

- **`asdd-system-integrity` y `asdd-memory-hygiene` quedaron con normas
  reales solo en la referencia condicional, detrás de un trigger que no se dispara en
  el momento que gobiernan** ("NUNCA adivinar" al trabarse; "Necesito: [archivo] para
  [razón]" antes de cada lectura). Se ajustan los triggers de "Carga condicional
  obligatoria" de ambos núcleos para cubrir esos momentos.

- **El changelog no documentaba tres cambios de comportamiento del validador que el
  diff de `fix/carga-de-contexto` sí hacía:** el escaneo de `reference-path-integrity`
  extendido a `.claude/atf-web-steps` y `.claude/ba-steps`, el nuevo fallo de
  `conditional-capability-loading` por falta de `Bash` en el manifiesto, y el fin del
  fail-open de `target()` en `context-budget-lib.mjs` — este último corrige un bug
  publicado en `[3.6.0]`.

- **20 skills eran invocables solo por un alias truncado que ningún loader acepta, y los
  6 dominios de `domain-expert` no eran invocables en absoluto (B6).** Los dos loaders
  —`asdd-load-capability.mjs` y `asdd-resolve-capability.mjs`— exigen
  `^asdd-[a-z0-9-]+$` y resuelven contra el nombre exacto del directorio. Los sitios
  que cargan skills usaban el nombre corto: el `skills:` del frontmatter de los seis
  phase-specs de ATF Web (`data-generator`, `risk-scorer`, `instance-planner`,
  `testability-scorer`, `knowledge-distiller`, `material-reference-detector`,
  `enrichment-analyzer`, `enrich-deep-cp`, `gherkin-writer`, `test-data-needs`) y 50
  marcadores `[SKILL: x]` en phase-specs, referencias de coordinador y SKILL.md
  (`browser-lifecycle`, `checkpoint-writer`, `context-manager`, `rate-limit-handler`,
  `notebooklm-query`, `auth-handler`, `response-integrator`, `visual-ux-a11y-validator`).
  60 sitios normalizados al nombre canónico —10 de frontmatter y 50 marcadores—; ninguno
  resolvía antes.

  `asdd-domain-expert` era el caso severo: sin `skills:` en el frontmatter, sin
  entrada en `capability-loading.json` y con su tabla de dominios listando
  `domain-expert-fintech`. Los seis dominios de negocio —fintech, seguros, retail, salud,
  logística, educación— existían en `.claude/skills/`, se ofrecían al usuario y **no tenían
  ningún camino de carga**. Ahora el agente entra al manifiesto con `max_eager_skills: 0`
  (son mutuamente excluyentes: el plan declara uno y el resto no se precarga),
  `max_dependencies: 1`, `Bash` en `tools:` para poder correr el loader, y la sección
  `## Carga bajo demanda de capacidades` que el check `conditional-capability-loading`
  exige. La tabla y la secuencia "Cómo se activa" pasan a nombres canónicos; el paso 2
  decía que "Claude Code detecta el dominio por contexto y activa el skill", mecanismo que
  no existe.

  También `asdd-atf-api-security-zap-runner` y
  `asdd-atf-api-performance-perf-threshold-evaluator`, que solo aparecían truncados
  en `qa-automate.md`, en la secuencia de Fase 4 del agente ATF API y en el `next_step` de
  `k6-script-generator`.

  **Por qué el validador nunca lo vio.** `skill-references` (check 4) resuelve exacto,
  igual que el loader, pero solo miraba el frontmatter de `.claude/agents/**`: los
  phase-specs y los marcadores `[SKILL: x]` quedaban fuera de su barrido.
  `agent-skill-references` (check 15h) sí los cruzaba, pero acepta resolución **por
  sufijo** —`[...skillSet].some(s => s.endsWith('-' + n))`— porque su trabajo es la prosa,
  donde un `hifi-builder` suelto es una referencia legible. Aplicada a un sitio de carga,
  esa tolerancia convierte en verde exactamente lo que el runtime rechaza. Se extiende el
  check 4 a `.claude/atf-web-steps` y `.claude/ba-steps` y a los marcadores `[SKILL: x]`
  de agentes, skills, commands y referencias, con resolución exacta y **sin saltear code
  fences**: la mayoría de los marcadores viven dentro de un bloque de código con sus
  argumentos debajo, y son sitios de carga, no ejemplos. La resolución laxa de 15h queda
  como está — es la correcta para prosa. Verificado en ambos sentidos: con los 60 sitios
  normalizados el check pasa, y al revertir uno solo vuelve a fallar.

  Fuera de alcance a propósito: el resto de la prosa de los comandos `qa-*`, que nombra
  los skills del pipeline ATF API en forma corta (`step-1-hu-parser`,
  `shared-config-loader`, …). Esos sí tienen camino canónico —el agente los lista
  completos— así que la inconsistencia es de convención de naming, territorio de `W4-2`,
  y no de cargabilidad.

### Fixed — menores (R2, M1-M21)

- **`.asdd/context-budget.json` vuelve a quedar desactualizado tras los propios
  cambios de esta rama** (M8/M9 suman palabras al núcleo, S13-S16 recortan
  descripciones) — re-sincronizado una vez más al cierre: `claude_md_words` 952,
  `always_on_rules_words` 3064, `discovery_surface_skill_descriptions_words` 2772,
  `discovery_surface_command_descriptions_words` 690, `always_on_floor_words` 9730.
- **`measure-context-footprint.mjs` no nombraba al ofensor en agents y commands**
  (`relative(...).split(sep).slice(-2)[0]` daba el directorio padre genérico —
  "agents" o "asdd" — en vez del archivo). Ahora usa el nombre del propio
  archivo salvo para skills, que sí viven en `{slug}/SKILL.md` (M2).
- **`skill-preflight`: "Antes de el Paso 0"** corregido a "Antes del Paso 0" en el
  núcleo y en el fixture de eval (M5).
- **`CLAUDE.md` apuntaba a `capability-loading.json` sin aclarar que solo cubre 16 de
  25 agentes** — se agrega la aclaración de que el resto declara `skills:` eager en su
  propio frontmatter (M6).
- **`claude-md-maintenance` se contradecía: "más de 200 líneas" y "Máx ~150" en el
  mismo bullet.** El check real (`claude-md-size`) usa 200 — se unifica el texto del
  núcleo y de la referencia a esa cifra (M7).
- **`system-integrity` y `spanish-orthography` habían perdido el imperativo "DEBE" +
  "Sin excepciones"** en la compactación — restituido en ambos núcleos y en los
  fixtures de eval que los inlinean byte a byte (M8).
- **5 citas a secciones que viven en la referencia, no en el núcleo, no aclaraban a
  qué archivo apuntaban** (`cross-impact` ×1, `bug-fix` ×2, `continuous-improver` ×2)
  — se agrega la ruta completa a `.claude/references/rules/` en cada cita. Las 3
  citas que R2 apuntó (`safe-refactor:39`, `continuous-improver:63`,
  `artifact-audit:180`) no contienen la palabra "sección" en el HEAD actual — no
  reprodujeron (M9).
- **`ba-functional-sme` y `ba-scope-manager` mencionaban `Edit` en el boilerplate de
  carga de capacidades sin declararlo en `tools:`** — corregido en los 2 (los mismos
  4 que señaló R2 para `security` y `researcher` ya no tienen ese boilerplate, ver B1
  arriba) (M12).
- **2 fixtures `-loaded` atribuían al resolver una salida de contenido completo que
  `asdd-resolve-rule.mjs` no produce** (solo imprime la ruta) — corregido el
  comentario en `memory-hygiene-loaded.txt` y `system-integrity-loaded.txt` (M15).
- **`evals/README.md` tenía dos conteos de la suite desactualizados y contradictorios
  entre sí** ("45 configs, ~306 llamadas" a 27 líneas de "62 archivos / 223 tests") —
  ambos se actualizan al conteo real vigente tras M-anterior: 63 archivos / 228 tests
  (M16).
- **`test-context-footprint.mjs` creaba un directorio temporal con `mkdtempSync` y
  nunca lo borraba.** Se agrega `rmSync` al final (M21). *Alcance parcial:* la suite
  sigue cubriendo solo `measureHookInjection` — el número titular y las 3 mediciones
  de descripciones quedan sin test porque `measureDescriptions` no está exportado;
  extenderlo requiere exportar más superficie del módulo, fuera de este cambio.

**Verificado sin reproducir — sin acción:**
- M4 (conteo de commands ya coincide), M10 (la deuda de `atf-reporting-qa-engineer` y
  `data-eng-databricks` ya se nombra en cada corrida del validador), M11 (el mecanismo
  descrito en `atf-web-visual-ux-a11y-validator:260` coincide con el stub real de
  `execute.md:781`), M20 (`ba-early-scope` sigue exactamente en 140/140, sin holgura,
  no es un error).
- M17, M18, M19: el texto citado no existe en ningún archivo versionado del repo —
  vive solo en la descripción del MR en GitLab, igual que B3. No hay archivo que
  editar; corrección pendiente de aplicarse ahí directamente.

### Added

- **`system-rule-system-integrity-loaded.txt`** — dos rubrics preexistentes de
  `evals-system-integrity.yaml` (líneas 41 y 56) pedían contenido que la compresión de
  `fix/carga-de-contexto` sacó del núcleo y dejó solo en
  `.claude/references/rules/asdd-system-integrity.md`, que el harness de evals no
  carga (recibe el system prompt, sin tools). Se agrega el fixture `-loaded` —mismo
  patrón que ya tenía `memory-hygiene`— y los 2 tests que lo necesitan repuntan ahí.

- **`.claude/evals/6-rules/capability-loading/evals-capability-loading.yaml`** — ningún
  eval ejercía `asdd-load-capability.mjs`. Cubre los 5 agentes migrados que
  quedan sin suite propia (`data-architect`, `data-governance`, `ba-scope-manager`,
  `ba-functional-architect`, `ba-functional-sme`): cada test verifica que el agente
  identifica la capability primaria correcta y nombra el comando exacto del loader, sin
  precargar el catálogo ni asumir una segunda capability no aprobada por el plan.
  (`security`, `researcher` y `cloud-architect` no necesitan esta cobertura — vuelven a
  ser eager en este mismo trabajo, ver arriba.) Total de la suite: 62→63 archivos,
  223→228 tests.

- **`.claude/scripts/test-context-footprint.mjs`** — cubre las tres formas en que el
  medidor mentía, con hooks sintéticos para no atar el test al texto de los reales:
  incondicionales contados, ramas excluyentes cobradas por la mayor, y la guarda contra
  deriva reportando una señal no ubicada. `measure-context-footprint.mjs` pasa a ser
  importable sin ejecutarse.

- **`.claude/tools/measure-context-footprint.mjs`** — mide el piso always-on por
  componente contando bytes en disco. Soporta `--json` para CI y `--strict` (exit 1
  si una descripción excede su target, si aparece una señal de hook sin clasificar, o
  si algún día se le declara techo al piso). La medición autoritativa de lo que carga el
  runtime sigue siendo `/context` dentro del proyecto.

- **Check `skill-description-budget`** (warning) en `validate-template.mjs`: valida
  cada descripción de skill, agent y command contra su límite y reporta el promedio
  por superficie.

### Changed

- **El agente de reportería ATF sube de `haiku` a `sonnet` en el lock.**
  `.asdd/asdd-atf.lock` declaraba `model_strategy.phase_default.report: haiku` y
  `agent_pinning["asdd-atf-reporting-qa-engineer"]: haiku`. Los dos pasan a `sonnet`.

  El frontmatter del agente ya decía `sonnet` desde **#3618** (v2.22.0, *«el agente evalúa
  Quality Gate Score»*); el lock nunca se reconcilió y quedó siendo la única declaración de
  modelo del repositorio que contradice a su agente — los otros tres agentes pineados
  (`atf-api-qa-engineer`, `atf-web-qa-engineer`, `explorer`) coinciden con su lock.

  El pin viejo además contradecía la política del propio framework: `haiku` está prohibido en
  la fase `verify` por riesgo de razonamiento insuficiente, y este agente es **primario en
  Verificar** — emite el veredicto PASS/FAIL del quality gate. El bloqueo existe en el
  validador solo para `phase_default`, no para `agent_pinning`, y por eso no se detectó.

- **`asdd-security` gana `Write`.** Su definición de terminado le exige dejar el reporte
  de hallazgos en un archivo y no tenía permiso de escritura.

- **`asdd-cloud-architect` gana `Glob`, `Grep` y `Edit`.** Podía leer y escribir pero no
  buscar ni editar, así que no podía revisar la infraestructura existente antes de proponer
  cambios sobre ella.

- **Piso de contexto always-on de 17.611 a 9.723 palabras (−44,8%).** El template
  declaraba `always_on_words: 8000` con stage `error`, y nada fallaba porque ese
  target medía `CLAUDE.md` + `.claude/rules/**` —7.632 palabras, dentro del techo—
  mientras el piso que se paga de verdad, con descripciones e inyección de hooks
  incluidas, era 2,3× ese número y no lo medía nadie. Las dos mediciones quedaron
  separadas — ver la entrada de `always_on_words` más arriba. Intervenciones:
  - `CLAUDE.md` de 226 a 149 líneas (2.214 → 932 palabras). Se quitaron las tablas
    "Agentes disponibles" y "Skills disponibles por agente" y el listado literal de
    los 40 comandos: repetían en prosa el catálogo que el runtime ya inyecta, y se
    pagaba dos veces por turno. Ahora cumple su propia regla
    `asdd-claude-md-maintenance` (máx ~150 líneas).
  - **8 reglas partidas** en núcleo compacto always-on más reference on-demand, con
    la estrategia `compact-always-on-core-plus-explicit-reference-reader` que el
    template ya usaba en otras 9: `system-integrity`, `ba-layer-routing`,
    `phases-reference`, `memory-hygiene`, `skill-preflight`, `spanish-orthography`,
    `artifact-naming` y `claude-md-maintenance`. `.claude/rules/` pasa de 5.418 a
    3.046 palabras. `memory-privacy` queda entero a propósito: es guardrail de PII y
    el ahorro no justifica el riesgo.
  - **Descripciones comprimidas**: 164 skills de 255 a 109 chars promedio, 25 agents
    de 428 a 211, 40 commands de 184 a 106. Se conservan los sustantivos que
    discriminan y la frontera contra el artefacto vecino; se eliminan ADRs, rutas de
    salida, mecánica de invocación y justificación arquitectónica, que ya viven en el
    cuerpo.
  - `ba-layer-routing` era un **duplicado byte-idéntico**: 722 palabras pagadas
    always-on en `rules/` con la misma copia sin usar en `references/rules/`.

  Cada número de esta entrada sale de correr
  `node .claude/tools/measure-context-footprint.mjs` en las dos puntas —`origin/dev` y
  esta rama—, no de una estimación. La inyección de hooks no cambia entre las dos
  (1.509 palabras en ambas): lo que baja es contenido, no enforcement.

- **8 agentes migrados a carga de capacidades bajo demanda** (cuerpos de `SKILL.md`
  cargados eager: 70.056 → 26.298 tokens, −62,5%; el manifiesto pasa de 8 agentes a 16). Un agente con `skills:` en el
  frontmatter carga el **cuerpo completo** de cada `SKILL.md` antes de hacer nada.
  Pasan a catálogo en `.asdd/capability-loading.json` + loader
  `asdd-load-capability.mjs`, el patrón que el template ya corría en 8 agentes:
  - **Sin eager** (una skill por invocación): `data-architect`, `data-governance`,
    `cloud-architect`, `security`, `researcher`.
  - **Con 1 eager** —su escritor de registro, que toda corrida usa—:
    `ba-scope-manager` y `ba-functional-architect` (`ba-change-log`),
    `ba-functional-sme` (`ba-spec-index`).
  - **Sin migrar a propósito:** `atf-reporting-qa-engineer` (7 eager),
    `ba-specification-lead` y `ba-specification-auditor` (2 cada uno). Sus flujos
    usan 3 a 5 skills en una sola corrida y el runtime autoriza **primaria + 1
    dependencia** (`max_dependencies: 1`, enforzado en
    `asdd-plan-authorization-lib.mjs` → `capability-mismatch`): migrarlos los
    rompía. Su deuda de `eager_skills` queda visible en el validador, como antes.

  La deuda `eager_skills` pasa de 12 a 4 agentes. `data-eng-databricks` sigue afuera:
  sus 14 skills son externas al repo (Databricks AI Dev Kit) y no pesan acá.

- **Bloque `MODO visual_ux_a11y` fuera de `.claude/atf-web-steps/execute.md`**
  (55.805 → 46.754 bytes, ~−2.200 tokens por carga de fase del executor). El propio
  documento lo declaraba peso muerto — "NO INVOCAR ESTE MODO COMO SUB-AGENTE", "la
  lógica vive INLINE en el command" — y se cargaba en cada batch sin gobernar
  ninguna acción. Movido a
  `.claude/reference/atf-web/asdd-atf-web-vua-conceptual-reference.md`.

- **`compatibility.min_cli_version` se reafirma en `0.9.8`**, y `min_cli_version_reviewed_at`
  pasa a `3.7.0`. Revisión del piso del CLI exigida por el bump MINOR (el umbral de
  `min_cli_version_reviewed_at` es MINOR, no PATCH): el piso se revisó y **no** había que
  moverlo. Sigue siendo el que introdujeron las 7 entradas de `moves[]` con
  `requires_cli: "0.9.8"`, y esta versión no agrega ninguna capacidad del contrato que exija
  un CLI más nuevo — el `contract_version` no cambia.

  El canal lo admite: en el repositorio del CLI existen publicados los tags `v0.9.8-dev` y
  `v0.9.8-qa` (y también los de `0.9.9`), así que el piso no excede al binario del canal que
  alimentan `dev` y `qa`. Esa es la regla de orden entre los dos repositorios de §5.1, la
  única que el validador no puede comprobar solo.

### Removed

- **El contador de denegaciones `deny-metrics.json`.** Era telemetría de escritura pura: nada lo
  leía salvo la función que lo incrementaba, ningún reporte lo consumía y ninguna prueba lo
  aseveraba. Nunca se reseteaba, así que acumulaba desde la creación del árbol y sus números no se
  podían atribuir a un run. El detalle con comando y agente está en `.claude/metrics/`, que tiene
  estrictamente más información. Se van la constante `DENY_METRICS_PATH`, la función
  `recordOperationDeny` y su único call site en el hook de operaciones.

## [3.6.0] - 2026-08-25

### Fixed

- **El hook de operaciones ORC-010 dejaba inalcanzables sus propias allowlists read-only.**
  `normalizeCommand` rechazaba `> | & ;` **antes** de consultar `isSafeReadOnlyCommand`, así que
  `ls x 2>/dev/null | head -20` moría con `command-mismatch` pese a que `ls` estaba allow-listed.
  En la corrida completa de 6 fases de `bench-consumer` (46 transcripts) hubo **126 denegaciones
  ORC-010 reales**, 83 de ellas `command-mismatch`; el replay contra el guard corregido muestra
  que **52 de esas 83 eran falsos positivos**.

  Ahora `splitBenignCommand` parte el comando en partes atómicas por `;`, `|`, `&&` y `||`
  respetando comillas y escapes, quita las redirecciones que no llevan datos a ningún lado
  (`2>&1`, `2>/dev/null`, `>/dev/null`) y permite la operación solo si **cada** parte es un
  comando read-only allow-listed. La relajación **no** alcanza a `commands[]`: un comando
  declarado se ejecuta verbatim o no se ejecuta, así que el conjunto de comandos ejecutables no
  crece. Siguen denegados `| sh`, `| tee`, `&& rm`, `cat >`, heredocs, `$(...)`, backtick, el `&`
  de background y la comilla sin cerrar.

  Se amplían las allowlists con los comandos que los agentes usan de verdad: `cd`, `pwd`, `true`,
  `basename`, `dirname`, `realpath`, `stat`, `file`, `diff`, `printenv`, `which`, `type`, `date`;
  sondas `<tool> --version`; y git read-only `rev-parse`, `rev-list`, `ls-files`, `describe`,
  `remote`, `config --get`, con prefijo `git -C <path>`. `git rev-parse --abbrev-ref HEAD` lo
  exige el PRE-FLIGHT de 9 skills y el guard lo denegaba — el framework mandaba correr un comando
  que él mismo bloqueaba.

- **`find -exec`/`-delete` y `sort -o` escribían pese a estar allow-listed como read-only.**
  Agujero preexistente: ambos nombres estaban en `SAFE_READ_COMMAND_RE`, y `SHELL_CONTROL_RE`
  nunca vio el `\;` escapado de `find -exec`. Se rechazan `-exec`, `-execdir`, `-ok`, `-okdir`,
  `-delete`, `-fprint`, `-fprintf`, `-fls` y `-o`/`--output`.

- **El comando más mandado del framework estaba denegado.** Las 9 reglas always-on exigen
  `node .claude/scripts/asdd-resolve-rule.mjs <regla>` en su bloque "Carga condicional
  obligatoria", y el hook de operaciones lo rechazaba: `SAFE_CAPABILITY_RESOLVER_RE` cubría el
  resolver hermano (`resolve-capability`) y no este. Detectado auditando las 358 superficies de
  instrucción de `.claude/` — 549 comandos que reglas, skills, agentes y comandos ordenan
  ejecutar — contra el guard. En las reglas always-on los comandos denegados bajaron de 15 a 4,
  y los 4 restantes no son contradicciones: `run-bootstrap` es control-plane del orquestador y
  los otros tres son fragmentos de prosa.

  Se allow-listean por **ruta dentro del proyecto** (un homónimo en otro directorio no pasa) los
  tres scripts del framework con cero escrituras que las reglas mandan: `resolve-rule`,
  `resolve-capability` y `validate-template`. `resolve-workspace` queda afuera porque escribe
  estado y ninguna regla se lo manda a un agente; `plan-authorization` y `run-bootstrap` también,
  por ser control-plane del orquestador. Se agrega `git worktree list` (AL-005).

- **`asdd-system-integrity` obliga a correr el validador y los tests del proyecto**, pero la
  invocación exacta no se conoce al planificar. Ahora el hook admite `npm test` y
  `npm run <script>` en su forma canónica, solo si el script está declarado en el `package.json`
  del proyecto y su nombre es de verificación. `setup`, `hash:regen`, cualquier script de entrega
  y `npm test -- --coverage` siguen exigiendo declaración.

- **`asdd-ephemeral-artifacts` era inaplicable.** La regla aplica a TODO agente y le ordena
  crear scratch en `.tmp/` (gitignoreado), prohibiendo explícitamente la raíz del repo. Ningún
  `scope[]` declara `.tmp/`, así que el guard dejaba al agente sin la única zona permitida.

- **Las rutas que el propio framework obliga a escribir daban `scope-mismatch`.**
  `.claude/agent-memory/{agente}/**` y `.asdd-run.json` nunca aparecen en el `scope[]` de un plan,
  pero `asdd-memory-hygiene` ordena persistir memoria y ORC-007 obliga a checkpointear el
  run: 7 de las 18 denegaciones de scope de la corrida. Ahora son scope implícito, fijo y no
  configurable desde el plan; un agente solo alcanza su propio directorio de memoria y el resto de
  `.claude/` sigue exigiendo scope.

- **`.claude/scripts/asdd-resolve-workspace.mjs` volvió a `distribution`.** La ruta se
  perdió al resolver un merge el 11-ago y estuvo ausente en v3.4.0, v3.5.0 y v3.5.1, pese a que
  `.asdd/workspace.schema.json` —que sí se distribuye— la declara como fuente de verdad en
  runtime. Ningún check la detectaba: `cli-runtime-distribution` solo ve una ruta caída si otro
  artefacto distribuido la nombra por su path, y el schema la nombra dentro de una descripción que
  el barrido no alcanzaba. Es el caso que motiva el check nuevo de más abajo.

- **La checklist de adopción pedía verificar un archivo que la guía de migración manda borrar.**
  `.claude/docs/adoption/adoption-checklist.md` incluía «`.asdd/checklist.json` existe»
  entre los pasos de verificación manual, mientras `.claude/docs/migrations/3.3-to-3.4.md` indica
  eliminarlo — los dos documentos se distribuyen. Quien siguiera la checklist concluiría que la
  adopción falló. Se quitó el ítem y el encabezado ahora aclara que la checklist ejecutable vive
  en el repositorio template y no se copia al proyecto.

- **El fast-path de vía rápida clasificaba operaciones git destructivas como `TRIVIAL`/sin plan.**
  Un prompt como "hacé push --force" o "borrá la rama X" podía ejecutarse sin plan ni confirmación
  explícita: `DANGEROUS_GIT` no cubría `rebase` a secas ni las formas con tilde de "reescribir
  historia", y no existía ninguna detección para borrado/limpieza de ramas o worktrees.

  Se agrega el check `dangerousGit` en `asdd-proportional-router-lib.mjs`, evaluado antes de
  clasificar como `git_ops`: fuerza `depth: "MEDIUM"`, `confidence: 0.95`, excluye la vía rápida
  `LIGHT`/`TRIVIAL` y expande `DANGEROUS_GIT` para cubrir `rebase`, `squash`, `filter-repo` y las
  formas con tilde/voseo de "reescribir historia". Se agrega `DESTRUCTIVE_CLEANUP` para
  borrado/limpieza de rama(s)/branch(es)/worktree(s) y `branch -D`. `requires_confirmation` ahora
  deriva de `dangerousGit` en vez de re-testear `DANGEROUS_GIT` directamente, así que también cubre
  los casos de borrado. De paso se fusionaron dos declaraciones duplicadas de
  `getPromptInjectionProfile` en `asdd-user-prompt-submit.mjs` que un merge anterior dejó
  como `SyntaxError` — deshabilitaba en silencio el hook de enforcement en cada prompt.

### Added

- **Contador local de denegaciones del hook de operaciones** en
  `.claude/.runtime/plan-authorization/deny-metrics.json` (gitignoreado). Diagnosticar esta
  tormenta exigió barrer 46 transcripts a mano. `recordOperationDeny` corre envuelto en
  try/catch: el hook es fail-closed y la telemetría nunca puede alterar ni romper un deny.

- **El plan gate ORC-010 deja de aceptar una sola palabra.** El único punto donde se parseaba la
  respuesta del usuario era un regex de vocabulario cerrado y anclado a string completo
  (`asdd-user-prompt-submit.mjs`), que fallaba con `"ok, dale"`, `"sí, procede"`,
  `"perfecto"`, `"de acuerdo"`, `"hazlo"` o `"ok 👍"`. Peor: las skills documentaban palabras que
  el regex no contenía (`asdd-tech-lead-commit` prometía `"procede"`, ausente del regex), así
  que el usuario tipeaba lo documentado y el challenge no se consumía.

  Ahora `.claude/scripts/lib/asdd-approval-intent-lib.mjs` clasifica por **raíz
  morfológica** — una raíz cubre todas sus flexiones — y no por lista de palabras: una lista más
  larga es el mismo bug. La cola larga (`"brutal"`, `"va"`) deja el turno **elegible** para que el
  orquestador la resuelva con `plan-authorization.mjs approve --challenge-id <uuid>`, sin aflojar el
  binding: exige challenge activo, id exacto y un solo uso. Ver ADR-020.

- **Una corrección al plan ya no reinicia la ceremonia (ORC-010-E).** `"ok pero usá tabs"` dejaba
  el challenge intacto hasta expirar y la regla mandaba re-presentar el plan completo. Ahora el
  challenge queda **enmendado**: si la corrección no cambia agentes, `scope[]`, `commands[]` ni
  budget, el orquestador ejecuta el lote original con
  `plan-authorization.mjs amend --challenge-id <uuid> --confirm-unchanged` y propaga la corrección
  en el prompt del agente. Si cambia el envelope, emite un challenge nuevo y **pregunta** si mostrar
  el plan revisado o proceder. Un rechazo explícito (`"no"`, `"cancelá"`, `"mejor no"`) revoca el
  challenge, para que una afirmación posterior y descontextualizada no pueda aprobarlo.

- **Las operaciones git dejan de pagar doble confirmación (ORC-010-F).** Pedir un commit disparaba
  el plan-gate (plan + challenge + `ok`) y **después** el challenge GS-003 con su propia
  confirmación — pese a que `issueChallenge()` rechaza `git commit` dentro de `commands[]`, o sea
  que el lote ORC-010 no autorizaba nada de la operación. El router clasifica ahora las operaciones
  git como `fast_lane: "git_ops"` y emite un token que habilita **solo el lanzamiento** del agente
  (`scope: []`, `commands: []`); la confirmación la sigue pidiendo el gate específico
  (GS-003 commit, GS-008 push, GS-009 MR/PR), que muestra el comando exacto. Force push,
  `reset --hard` y reescritura de historia quedan fuera de la vía rápida y fuerzan confirmación.

- **La vía rápida LIGHT admite mover y renombrar.** El token directo exigía exactamente un archivo
  **existente**, así que `mover a/x.md b/x.md` autorizaba el origen pero no el destino y la
  operación moría en el hook de autorización. Ahora admite hasta 3 scopes e incluye rutas destino
  inexistentes cuando su carpeta padre ya existe dentro del proyecto.

- **El voseo enruta correctamente.** `WRITE`, `GIT_OPS` y `FILE_OP` usaban `\b`, que es ASCII: no
  hay boundary entre `á` y un espacio, así que `mové`, `renombrá`, `actualizá` o `corregí` nunca
  matcheaban y caían a TRIVIAL por baja confianza, perdiendo la vía rápida. Se cierra con un
  lookahead únicode-aware y se agregan las formas de voseo al léxico del router.

- **La autorización de plan abre ventana nueva de TTL al aprobar** en vez de heredar el remanente
  del challenge (`VERIFY-003` §Hueco 1, major/bloqueante): el tiempo que el humano tardaba en leer
  el plan se descontaba del tiempo de ejecución de los agentes.

- **`test-cli-runtime-distribution` verde en macOS.** La suite creaba el consumidor en
  `os.tmpdir()`, que en macOS es `/var/folders/…` — un symlink a `/private/var/folders/…`. Los
  scripts distribuidos solo ejecutan `main()` si `import.meta.url === pathToFileURL(argv[1]).href`,
  e `import.meta.url` ya viene resuelto: los procesos hijos salían con status 0 y stdout vacío, un
  falso "no hizo nada". Se resuelve el symlink con `realpathSync`.

- **Procedencia publicada de cada ruta distribuida** en `.asdd/asdd-provenance.json`:
  por cada ruta, el conjunto de hashes SHA-256 normalizados que esa ruta tuvo a lo largo de la
  historia. Hoy son **1042 rutas y 2446 materializaciones** (252,8 KB).

  Para qué sirve: el CLI decide si puede actualizar un archivo en su lugar comparando el disco
  contra un baseline, y las dos fuentes que existían preguntan «¿qué versión tenías?», que no
  tiene respuesta confiable — el lock declara una versión que su contenido no necesariamente
  tiene. Esto cambia la pregunta por «¿este contenido salió alguna vez de acá?», que sí tiene
  respuesta exacta. Si el hash del disco está en el conjunto, nadie lo editó: es contenido viejo
  del template y se actualiza. Si no está, se preserva, que es el comportamiento de siempre.

  Se genera acá porque el CLI clona con `--depth 1` y no tiene historia con qué reconstruirlo.
  El generador es `.claude/scripts/asdd-gen-provenance.mjs` (`npm run provenance:regen`),
  **no se distribuye**, y su salida es determinista: sin timestamps ni SHAs de tips, ordenada, de
  modo que el archivo solo cambia cuando cambia el contenido de una ruta distribuida.

- **Clave `moves` en el contrato**, con los 7 movimientos de rutas ya ocurridos (`dashboard/` y
  seis rutas de `docs/` hacia `.claude/`). Declara **adónde** fue una ruta que el template dejó de
  entregar, para que el consumidor reciba el destino en vez de un archivo que desaparece sin
  explicación. No es lo que dispara el borrado — de eso se encarga el CLI comparando lo que
  entregó antes contra lo que distribuye ahora.

- **Check `distribution-regression` en el validador** (error). Verifica que toda ruta que el
  template alguna vez entregó siga cubierta por `distribution`, esté reubicada por un `moves`
  declarado, o tenga una razón escrita de por qué se retiró.

  Existe porque el CLI ahora retira del proyecto del consumidor lo que salió de `distribution`:
  una entrada que se cae por accidente ya no significa «dejo de actualizar ese archivo», significa
  eliminarlo de todos los proyectos que lo tenían. El único check que podía verlo exige que otro
  artefacto distribuido nombre la ruta por su path, así que un agente, skill, regla o documento
  que nadie referencie se caía en silencio.

  La ventana son todos los tags con contrato más los tips de las ramas distribuibles, y la
  comparación es por ruta, no por entrada. Las dos decisiones están medidas: comparar contra la
  versión inmediata anterior **no** habría detectado el caso de `resolve-workspace.mjs`, porque en
  esa versión ya faltaba; y comparar entrada contra entrada reporta el árbol entero de
  `.asdd/` como caído solo porque dejó de declararse como directorio.

  Tres retiros deliberados quedan registrados con su razón dentro del check —
  `.asdd/checklist.json`, `ASDD-CHANGELOG.md` y el ADR-020 de worktree multi-repo, que se
  revirtió—. Se imprimen siempre, incluso cuando el check pasa.

- **Check `provenance-freshness` en el validador** (error), que delega en el generador vía su
  contrato de exit codes: 0 al día, 1 desactualizado, 2 imposible de determinar. El caso 2 se
  salta, porque un proyecto consumidor no recibe ni el generador ni el provenance.

- **Check `moves-coherence` en el validador** (error): la clave va en la raíz del contrato, el
  origen ya no puede seguir distribuyéndose y el destino tiene que existir. El primer control
  existe por un precedente concreto — `clean.files_to_remove` se declaró bajo `clean` mientras el
  CLI lo leía en la raíz, así que la clave estuvo inerte durante meses sin un solo error.

- **Documentación:** `.claude/docs/validation.md` §2.4 describe los tres checks de integridad de
  la distribución y por qué dos de ellos se saltan en un proyecto consumidor.
  `ASDD-VERSIONING.md` gana §5.1 (el piso de CLI se sube **después** de publicar el binario del
  canal, nunca antes) y §5.2 (el provenance se regenera una vez por release, no una por merge),
  más los dos pasos correspondientes en el checklist de release. La regla de §5.1 ya la
  referenciaba el validador, pero no estaba escrita en ningún lado.

### Changed

- **Los 21 agentes declaran su modelo por alias, no por versión concreta.**
  Convivían cinco identificadores para tres modelos —`claude-opus-4-7`, `claude-opus-4-6`,
  `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`— y pasan a `opus`,
  `sonnet` y `haiku`. Un identificador de versión se retira y deja al agente apuntando a algo
  que no existe, sin decir por qué; y con cinco formas para tres modelos, la cadena
  `skill_override > agent_pinning > phase_default > frontmatter` comparaba valores que no eran
  comparables. El mismo cambio en `.claude/settings.json` (modelo del orquestador) y en
  `.asdd/subagent-budget.json` (el mapa de modelos lógicos).

- **131 skills dejan de declarar `allowed-tools`.** Una skill no gobierna sus herramientas: las
  tiene el agente que la carga. La declaración no hacía nada y sí creaba una segunda fuente que
  podía contradecir a la primera. En la misma pasada, 8 skills pierden su `model` propio —el
  modelo se resuelve por fase y por agente, nunca por skill— y 2 pierden un `rules` que las
  reglas ya cargan por su propio mecanismo.

- **8 skills del arquitecto de soluciones tenían un `name` que no era el suyo.** Declaraban
  `asdd-architect-*` mientras el resto del framework las referenciaba como
  `asdd-solution-architect-*`. Una skill cuyo `name` no coincide no se encuentra por el
  nombre con el que se la invoca. Las ocho quedaron corregidas, y la tabla de enrutado del
  agente se reescribió para que cada situación apunte a una sola skill.

- **`asdd-tech-lead` gana `Write`.** Su checklist le exige dejar el code review, el
  quality gate y el plan de refactoring en `docs/tech/`, y no tenía permiso de escritura.

- **`asdd-solution-architect` gana las dos consultas de documentación de librerías**
  (`mcp__context7__resolve-library-id`, `mcp__context7__query-docs`).

- **`compatibility.min_cli_version` pasa de `0.9.6` a `0.9.8`**, y
  `min_cli_version_reviewed_at` a `3.6.0`. Revisión del piso del CLI exigida por el bump MINOR
  (el umbral de `min_cli_version_reviewed_at` es MINOR, no PATCH): el piso se revisó y **sí**
  había que subirlo.

  La razón está en el propio contrato: las **7 entradas de `moves[]`** declaran
  `requires_cli: "0.9.8"`. Ese es el bloque que reubica el dashboard a `.claude/dashboard/` y
  los docs de adopción, migraciones y validación a `.claude/docs/`. Un CLI por debajo de
  `0.9.8` no lee `moves`, así que no reubica nada: la instalación no falla, deja los artefactos
  en las rutas viejas mientras el resto del template ya los referencia en las nuevas. Un piso
  de `0.9.6` convertía eso en un drift silencioso en la máquina del consumidor en vez de un
  gate explícito.

  **Por qué `0.9.8` y no más alto.** `0.9.8` es exactamente la versión que introduce el soporte
  de `moves`, que es la única capacidad nueva del CLI de la que este template depende. Subir
  más pediría un piso que ninguna funcionalidad distribuida justifica. Conforme a
  `ASDD-VERSIONING.md` §5.1, este bump asume que el binario `0.9.8` del canal ya está
  publicado — el piso se sube después de publicar, nunca antes.


## [3.5.1] - 2026-08-12

Release de contrato: **no cambia ningún archivo distribuido**. Corrige
`compatibility.min_cli_version` y agrega la regla que valida ese campo.

### Fixed

- **`compatibility.min_cli_version` pasa de `2.0.0` a `0.9.6`.** El valor `2.0.0` era
  inalcanzable: no existe ni existió un CLI 2.x. Hasta ahora eso no tenía consecuencia porque
  el CLI **parseaba el campo y nunca lo validaba**. Desde el CLI `0.9.6` sí lo valida y
  bloquea la aplicación de la estructura cuando no se cumple, así que con `2.0.0` el efecto
  habría sido bloquear a **todos** los consumidores de esta rama de golpe.

  `0.9.6` es la versión del CLI que introduce las tres protecciones que este template necesita
  para instalarse sin fricción: no aplicar la estructura con un CLI que no es el vigente,
  limpiar los `.asdd-new` ya resueltos, y no quedar bloqueado por una falla del colector.

  **Por qué `0.9.6` y no `0.9.5`.** El portón solo se evalúa en binarios que lo contienen, y
  eso arranca en `0.9.6`. Cualquier CLI anterior ignora el campo, así que declarar `0.9.5`
  produciría **exactamente la misma fricción** —ninguna— con un piso más débil: `0.9.5` solo
  trae el fix de fin de línea. Elegir el número más bajo no compra nada.

### Added

- **Regla de validación de `min_cli_version`** en `.claude/scripts/validate-template.mjs`
  (dentro del check `cli-contract`). El campo era el único del contrato con efecto de bloqueo
  y sin ninguna validación. Ahora se exige: presente, SemVer estricto `X.Y.Z`, sin prefijo `v`
  ni sufijo de canal, y con major no mayor al del CLI publicado —lo que convierte el error de
  tipo `2.0.0` en un fallo del validador en vez de un bloqueo en la máquina del consumidor.

- **Validación de sincronía de la versión del template.** La versión vive en **cuatro** lugares
  y un release los bumpea a mano: `asdd.lock` (`version` y `variants.claude.version`),
  `cli-contract.json` (`template.version`) y `package.json`. Nada verificaba que coincidieran, y
  los dos lectores discrepan en silencio cuando driftean: el CLI compara el lock del consumidor
  contra el lock remoto para ofrecer el upgrade, mientras que `template.version` es lo que queda
  registrado al instalar. Un desfase permite instalar «3.5.1» y que te sigan diciendo que estás
  en «3.5.0». El lock es la fuente de verdad y los otros tres se validan contra él.

- **`compatibility.min_cli_version_reviewed_at` — marca de revisión del piso del CLI.** Declara
  en qué versión del template se revisó el piso por última vez, **haya cambiado o no**.

  Existe porque `min_cli_version` acopla dos repos versionados por separado y nadie quedaba en
  el loop: se quedó en `2.0.0` atravesando 3.4.0 y 3.5.0 porque ningún paso del release
  preguntaba por él. El validador **no puede verificar que el piso sea correcto** —no sabe qué
  soporta el CLI—, así que lo que hace es volver imposible la omisión: fuerza la pregunta cuando
  corresponde y exige que la respuesta quede escrita.

  El umbral es **MINOR, no PATCH**, y esa es la decisión de diseño. Un bump MINOR significa
  funcionalidad nueva, que es justo cuando el template puede empezar a depender de una capacidad
  del CLI que antes no existía; un PATCH no puede, por definición. Así que un bump minor o major
  exige mover la marca a la versión nueva, y un patch no paga un costo que no puede deber.

  **Re-afirmar es un resultado válido.** Si 3.6.0 no necesita nada nuevo del CLI, el piso se
  queda en `0.9.6`: se mueve la marca a `3.6.0` y se explica en el changelog por qué se mantiene.
  Lo que la regla no permite es que nadie mire.

  Es compatible hacia atrás con todo CLI ya liberado: el contrato se parsea con `json.Unmarshal`
  sin `DisallowUnknownFields`, así que un campo nuevo se ignora en vez de romper el parseo.

  **Lo que esta regla NO hace,** dicho para que nadie la confunda con más de lo que es: no puede
  saber si el piso declarado coincide con lo que el CLI soporta de verdad. Eso necesita una
  aserción cross-repo —el CLI publicado en un canal debe satisfacer el piso de la rama que lo
  alimenta— y eso requiere los dos repos en un mismo job. Hasta que exista, esta regla es la
  baranda: convierte «nadie lo miró en tres releases» en un error bloqueante.

### Ordering — leer antes de promover

El piso **nunca** debe superar la versión del CLI ya publicada en el canal al que alimenta la
rama (`dev` → dev, `qa` → qa, `main` → prod). Promover este template a una rama antes de que
el CLI `0.9.6` esté publicado en el canal correspondiente bloquea a todos los consumidores de
esa rama. El orden por canal es: **primero el CLI, después el template.**

## [3.5.0] - 2026-08-11

Addon Smart Data: `1.0.0` → `1.2.0` (`.asdd/asdd-smart-data.lock` y el bloque
`sub_locks` de `.asdd/asdd.lock`, que se mueven juntos).

> **Migración para engagements Data en curso.** MEJORA-001 renombra el naming canónico del
> subdominio a `smart-data-eng-*`. El `analyze-guard` ya solo reconoce como equivalente-brief
> un Excel `smart-data-eng-{cliente}.xlsx`, así que un engagement que venga de 3.4.0 debe
> renombrar su Excel de trabajo antes de invocar `/asdd:data-eng-discover`; si no, la
> escritura de artefactos en `docs/specs/` queda bloqueada con M1/M2/M3.

### Fixed — feat/smart-data-v1.2

Correcciones de comportamiento del flujo Smart Data detectadas en el engagement de Fincondor.
Todos los bugs resuelven fallos observados en el Procedimiento Sync y en el flujo de Discover del subdominio `data-engineering`.

#### BUG-001 — Prompt incompleto al agente de gobernanza en Procedimiento B (`aefbd51`)

El orquestador pasaba el Diccionario sin la columna `Transformación` y la pestaña `Tablas consumo` solo como lista de nombres de tabla, generando 7 falsos positivos en el assessment. Se corrigió el command `data-eng-discover.md` para exigir las **18 columnas** del Diccionario y las **8 columnas** de Tablas consumo íntegras, sin filtrar ni resumir.

#### BUG-002 — Checklist de escritura atómica en Procedimiento Sync (`2485476`)

El Procedimiento Sync se cortaba antes de terminar todas sus operaciones, dejando el artefacto de governance assessment en estado inconsistente. Se introdujo un **checklist de escritura atómica** de 6 pasos ordenados que el agente debe completar en secuencia antes de cerrar la edición:

1. Eliminar gaps cerrados de la tabla `### Gaps abiertos` y agregar los nuevos con todas sus columnas.
2. Registrar cada gap cerrado en `### Gaps cerrados`.
3. Depurar la sección `## Acciones en Excel` (eliminar filas de gaps cerrados, agregar las de gaps nuevos con `tipo_accion = excel-update`).
4. Depurar la sección `**Próximos pasos por gap**` (eliminar referencias a gaps cerrados, agregar instrucciones para los nuevos).
5. Recalcular los conteos del `## Resumen ejecutivo` contando las filas reales de la tabla — **sin hardcodear**.
6. Agregar fila al `## Historial de sincronización` — siempre la última operación.

Adicionalmente: el Sync no puede insertar callouts ni notas explicativas (`> **Sync vX.X...**`) en el encabezado del documento — todo registro de cambio va exclusivamente al historial.

#### BUG-003 — Contradicción "preguntar siempre" vs "auto-detectar" en skill Discover (`533457a`)

El skill tenía una contradicción entre "preguntar siempre" y "auto-detectar": en invocaciones por lenguaje natural mid-conversation el orquestador bypasseaba el AskUserQuestion y lanzaba el Sync directamente. Se unificó la regla: el Paso 0 (selección de procedimiento) se ejecuta al inicio de **toda invocación nueva**, sea por comando explícito o por lenguaje natural, sin auto-detectar. Se agregó además la **Opción 4** — re-extracción de verificación para posibles falsos positivos por Excel abierto durante el assessment anterior — con su propio sub-caso del Procedimiento Sync.

#### BUG-004 — Headers uniformes con YAML frontmatter en templates de Discover (`dbec53b`)

Los tres templates de Discover (`technical-discovery.md`, `governance-checklist.md`, `data-dictionary.md`) usaban formatos de cabecera distintos entre sí (prosa pipe-separated y bold key-value) sin YAML frontmatter, y ninguno tenía los campos `actualizado`, `estado` uniforme ni `generado_por`. Se reemplazaron las cabeceras por **YAML frontmatter uniforme** con los campos mínimos acordados. La regla R-G1 del SKILL.md del governance-assessment se actualizó para apuntar a `actualizado:` del frontmatter en lugar de `Fecha:` en prosa.

#### BUG-005 — Header design con YAML frontmatter y estado en español (`069f007`)

El esqueleto del `smart-data-eng-design` y el `layer-decision-matrix.md` usaban prosa pipe-separated con `Estado: draft | approved` (en inglés). Se reemplazaron por YAML frontmatter con `estado: Borrador` en español. La condición de gate del SKILL.md que habilita `/asdd:data-eng-build` se actualizó para evaluar `estado: Borrador → Aprobado`.

#### BUG-006 — Header de estado por fase y deduplicación de gaps cross-artefacto

Dos gaps del flujo Discover sin corrección hasta ahora:

- **Sin visibilidad de fase para el usuario**: después del AskUserQuestion inicial, ninguna respuesta del orquestador indicaba en qué fase, procedimiento o paso estaba parado el usuario. Se agregó la sección `## Formato de estado por respuesta` a los 5 commands `data-eng-*` (discover, design, build, validate, publish), cada uno con un header de una línea propio de su fase — ej. `[Fase: Discover · Procedimiento: {A|B|Sync} · Gaps abiertos: N (X bloqueantes design)]` — emitido al inicio de cada respuesta nueva del turno.
- **Gaps duplicados cross-artefacto**: el arquitecto y el agente de gobernanza leen en paralelo la misma pestaña `Tablas consumo` durante el Procedimiento Sync y podían detectar el mismo hallazgo con IDs independientes (`G-NN` en discovery, `GOV-NNN` en governance) sin ninguna referencia cruzada. Se agregó un **Paso 4 — Reconciliación de gaps duplicados** al Procedimiento Sync de `data-eng-discover.md`: compara los gaps nuevos de ambos artefactos por objeto y causa raíz, mantiene `GOV-NNN` como ID canónico y anota la referencia cruzada en discovery sin duplicar el texto.

#### BUG-007 — Procedimiento C: cierre formal de gaps antes de avanzar a design

Discover no tenía protocolo definido para cerrar gaps antes de pasar a `/asdd:data-eng-design`: sin estado visible por `tipo_accion`, sin criterio operacional de "validado" (SD-001 solo decía "validado" sin definirlo) y sin flujo de resolución interactiva. Se agregó:

- **Opción 5 en el Paso 0** de `data-eng-discover.md`: "Cerrar gaps antes de avanzar a design", con prerequisito de que Procedimiento B ya haya corrido.
- **Procedimiento C completo** (4 pasos): (1) leer gaps abiertos de ambos artefactos — tabla estructurada en governance-assessment, bloques inline en discovery; (2) semáforo por `tipo_accion` con conteo de bloqueantes reales (`conversation` y `excel-update` bloquean, el resto se difiere); (3) resolución interactiva uno por uno, con regla de trazabilidad obligatoria — un gap `conversation` nunca se cierra solo verbalmente, la resolución se escribe en disco antes de marcarlo cerrado; (4) criterio de salida explícito hacia design.
- **Definición operacional de "validado"** agregada a SD-001 en `asdd-data-eng-workflow.md`: cero gaps `conversation` sin resolver + cero gaps `Critical` abiertos; el resto puede quedar diferido con owner/fecha sin bloquear.
- `conversation` es un `tipo_accion` exclusivo del agente de discovery (`asdd-data-eng-discovery`) — el agente de gobernanza nunca lo genera; el semáforo y la escritura atómica del Procedimiento C respetan esa asimetría entre ambos artefactos en lugar de asumir una estructura idéntica.
- **Header de estado y "Siguiente paso del flujo" sincronizados con el cuarto procedimiento**: el header `[Fase: Discover · Procedimiento: {A|B|Sync|C} · ...]` (BUG-006) y la sección final `## Siguiente paso del flujo` no incluían la opción C al agregarla — ambos quedaron actualizados para reflejar los 4 procedimientos.

#### BUG-008 — Atribución invertida de esquemas de ID en R-D2 (Procedimiento Sync de discovery)

La regla **R-D2** de `asdd-data-eng-discovery/SKILL.md` (detectada como hallazgo preexistente durante la auditoría de BUG-007) llamaba "patrón de governance" a `G-NN`, cuando el esquema real es al revés: `G-NN` es el ID propio de discovery y `GOV-NNN` es el de governance-assessment (ver BUG-006). Además, citaba una sección "Próximos pasos" que no existe en discovery — ese nombre pertenece a `**Próximos pasos por gap**` de `governance-assessment`, mientras que discovery organiza sus gaps bajo `## Gaps y preguntas abiertas`.

Corrección: R-D2 ahora distingue explícitamente los dos casos — menciones a `GOV-NNN` se verifican contra `### Gaps cerrados` de `smart-data-eng-governance-assessment-{cliente}.md`; menciones a `G-NN` se verifican dentro de la propia sección `## Gaps y preguntas abiertas` de discovery, ancladas al marcador `[RESUELTO — Procedimiento C, YYYY-MM-DD]` (definido en el Procedimiento C de `data-eng-discover.md`, BUG-007). Ningún otro archivo del template referenciaba la redacción anterior de R-D2.

#### MEJORA-001 — Corrección de nomenclatura `smart-data-*` → `smart-data-eng-*` (`cedfbcf`)

Los artefactos del flujo se generaban con prefijo `smart-data-*` mientras los skills y commands usaban `data-eng-*`. Se auditaron ~526 archivos del template y se corrigieron 7 hallazgos en commands, skills, hooks (`smart-data-naming.mjs`), referencias, y settings. El naming canónico queda establecido como `smart-data-eng-{tipo}-{cliente}.{ext}` para todos los artefactos del subdominio de ingeniería de datos.

## [3.4.0] - 2026-08-05

Cierre de los huecos de portabilidad que quedaron fuera de los dos commits
anteriores de `fix/os-compatibility`. El runtime del template ya era cross-OS; lo
que faltaba era que la política llegara a los consumidores y que los checks
anti-reincidencia dijeran la verdad sobre lo que verifican.

Y el cierre de la contraparte del contrato: alinear lo que el template declara con lo
que el CLI hace de verdad, que es donde vivían cuatro casos de destrucción silenciosa
de contenido del consumidor.

### Fixed

- **`clean.files_to_remove` dejó de destruir contenido del consumidor**
  (`.asdd/cli-contract.json`, `contract_version` 2.4.0 → 2.5.0). El CLI aplica esa
  clave con `os.RemoveAll` **incondicional** después de copiar, sin comparar contenido ni
  hash. Tenía 12 entradas y **4 eran destructivas**:
  - `ASDD-MEMORY.md` y `.claude/docs/migrations/` **colisionaban con `distribution`**: el
    CLI los copiaba y acto seguido los borraba, anulando en silencio dos decisiones de
    distribución. Y `CLAUDE.md` declara `ASDD-MEMORY.md` como el índice de memoria del
    consumidor, así que cada upgrade se lo borraba.
  - `.asdd-run.json` es el **checkpoint operativo de corrida** del consumidor (ORC-007);
    11 artefactos distribuidos lo leen o escriben. El upgrade destruía el estado de la
    corrida activa.
  - `docs/runs/` son los **manifiestos de corrida** que escribe el hook distribuido
    `asdd-run-manifest.mjs`. El upgrade borraba el historial del consumidor.

  Quedan 8 entradas, todas rutas que ningún runtime distribuido escribe. El criterio de
  admisibilidad quedó documentado en `contract-spec.md` §3.5.3 y enforzado por un check
  nuevo. Se conservan a propósito las que solo limpian instalaciones viejas: `files_to_remove`
  hace de `remove_on_upgrade` de facto, así que vaciarla dejaría huérfanos para siempre.

- **Piso de Node a `>=22`, en los 4 sitios acoplados y en el mismo commit**:
  `compatibility.required_tools`, `checklist.json` → `pre_install[0].expect_regex`,
  `.claude/dashboard/package.json` → `engines.node`, y las 3 menciones en prosa de
  `.claude/docs/validation.md` más la de `CLAUDE.md`. El gate que el CLI **ejecuta** es el
  regex del checklist, no `required_tools`: cambiar uno solo deja el contrato mintiendo.
  Un major completo esquiva la limitación estructural del mecanismo — un regex sobre la
  cadena de versión no puede expresar un piso de minor (`^v(2[0-9])\.` aceptaría `v20.0.0`),
  y todas las minors de 22.x cumplen. Cierra el hueco 2 de VERIFY-002 en su parte accionable.

- **El regex de git ya no rechaza git 3.x**: `^git version 2\.` → `^git version [2-9]\.`.
  El piso real (`>=2.30`) es inexpresable por regex sin una alternación frágil, así que la
  verdad declarada es `required_tools` y el seguimiento es un `type: "semver_gte"` en el CLI.

### Added

- **Check `clean-files-to-remove-safety`** (nivel `error`, el validador pasa de 38 a 39
  checks). Enforza las dos formas en que la clave más destructiva del contrato driftea, y
  las dos ya habían pasado: colisión con `distribution`, y rutas que nombra el runtime
  distribuido (se barren los árboles ejecutables `.claude/hooks/` y `.claude/scripts/`;
  la prosa queda afuera a propósito, y `validate-template.mjs` se excluye porque nombrar
  cada ruta que valida es su trabajo). Test negativo: reintroducir las 4 entradas retiradas
  las reporta con el archivo exacto que escribe en cada ruta.

### Changed

- **`docs/adoption/contract-spec.md` de v1.0 a v2.5.** Estaba congelada mientras el contrato
  real llegó a 2.4.0, así que **6 de 15 claves no estaban documentadas en ninguna parte** —
  entre ellas `distribution`, donde vivía el hueco más grave de VERIFY-002. Se agregan §3.9
  a §3.13 (`distribution`, `file_merge`, `file_copy_as`, `naming_convention`,
  `conditional_install`, `model_strategy`, y la semántica de escritura no-destructiva), el
  criterio de `files_to_remove`, el historial de versiones del schema, y 4 reglas de
  validación nuevas. Cierra H-0 de VERIFY-002.

- **`distribution` queda documentada como allowlist autoritativa** — resuelve la hipótesis
  H-0.1 de VERIFY-002, que no era verificable desde este repo. Confirmado en el código del
  CLI: `resolveDistributionPaths` prefiere las rutas declaradas (`internal/app/init.go:514-517`)
  y `expandDeclaredPaths` **aborta la instalación** si una entrada no existe en disco
  (`:554-557`). El paso 6 del pseudocódigo de `cli-integration-guide.md`, que describía
  `copyTree` + recorte, era documentación desactualizada y quedó corregido.

- **Checklist de release del template** (`cli-integration-guide.md` §8): el conteo de checks
  decía `12/12` cuando el validador corre 39, y no mencionaba `distribution`, `file_merge` ni
  `file_copy_as` — un mantenedor que lo siguiera **no revisaba** la clave donde estaban los
  huecos. Se agregan esos ítems más la regla que evita la reincidencia: toda clave nueva
  entra con su sección en la spec y su ítem en el checklist, en el mismo cambio.

- **`ASDD-VERSIONING.md` §5**: el paso del tag pasa de trámite a requisito con su consecuencia
  explícita y un paso de verificación (`git ls-remote --tags`). El release process ya lo
  exigía y **no se cumplió en 4 versiones**: al 2026-08-05 el tag más nuevo publicado era
  `v3.2.0` mientras el changelog declaraba 3.3.0, 3.1.0, 2.27.1 y 2.26.0 como liberadas. Sin
  el tag el CLI no puede reconstruir el baseline de esa versión, y todo upgrade desde ella
  produce `.asdd-new` en masa — es la causa de los reportes de "cientos de archivos duplicados".

### Fixed

- **`.gitattributes` entra en `distribution`** (`.asdd/cli-contract.json`,
  `contract_version` 2.3.0 → 2.3.1). La política de EOL no llegaba a ningún proyecto
  consumidor: el template quedaba portable y los proyectos instalados no, así que la
  clase de defecto podía reproducirse ahí intacta. Cierra el blocker H-1 de VERIFY-002.
- **`fingerprintSources` normaliza antes de hashear**
  (`.claude/scripts/lib/asdd-artifact-runtime-lib.mjs`). Hasheaba bytes crudos de
  disco a través de un helper de una línea, así que el fingerprint del caché de
  discovery invalidaba por cambio de SO en lugar de por cambio de contenido. El sitio
  que sí hashea bytes crudos a propósito (`loadDiscovery`, roundtrip byte-exacto de un
  artefacto de caché) queda documentado en el código.
- **`hooks-executable` puede fallar en Windows.** Leía `fs.statSync().mode` del working
  tree y se auto-salteaba en Windows, donde ese bit no significa nada: un hook agregado
  desde ahí entraba al índice como `100644` y, sin CI en el repo, el problema aparecía
  recién en un checkout de Linux. Ahora lee el modo del **índice de git**
  (`git ls-files -s`), que es significativo en los tres SO. Remediación cross-OS en el
  mensaje: `git update-index --chmod=+x`. Si no hay git o el directorio no es un repo,
  se saltea diciendo por qué.
- **`.gitattributes` entra en su propia política** (`.gitattributes text eol=lf`). Era
  el único archivo de texto versionado con `text: unspecified`.

### Changed

- **`cli-runtime-distribution` deriva el set requerido en vez de declararlo.** Era una
  lista hardcodeada de 11 rutas, así que solo crecía si alguien se acordaba de
  editarla: se mantuvo verde mientras se agregaban 4 artefactos de runtime nuevos.
  Ahora recorre los 635 artefactos que `distribution` entrega, extrae las 110
  referencias a `.claude/scripts/**`, `.claude/hooks/**` y `.claude/tools/**` que
  existen en disco, y exige cobertura. `tools/` entra aunque hoy se distribuya como
  directorio completo: si esa entrada se estrechara, este check es lo que detecta las
  referencias colgantes. Las 11 rutas originales quedan como piso. Dos mapas de exención explícitos y **siempre visibles
  en el mensaje** del check: `DEFERRED` (3 rutas, decisión de distribución pendiente) y
  `CITED_ONLY` (1 ruta citada como procedencia de diseño, no como comando ejecutable).
  La prosa de auditoría (`docs/testing/`, `ASDD-CHANGELOG.md`) queda fuera del barrido:
  cita tooling de mantenedor como objeto de análisis, no crea dependencias.
- **`path-separator-safety` cubre el árbol completo.** Se eliminó la exención por
  prefijo de `.claude/tools/`, que dejaba 88 archivos —el runtime ATF Web, el cuerpo de
  código más grande del repo— fuera del check de un solo golpe. El barrido pasa de 105 a
  **193 fuentes** con 0 hallazgos, así que la exención no protegía nada real. Las
  exenciones ahora son solo por archivo y con razón. Severidad sigue en `warn`: ampliar
  cobertura y promover severidad son dos variables distintas.
- **`hash-eol-normalization` reconoce una tercera forma y ya no sobreestima su
  cobertura.** La forma nueva resuelve el helper local de un salto
  (`const h = (x) => createHash(...).update(x)`) trasladando la verificación a sus call
  sites — es la que escondía el defecto de `fingerprintSources`. Los sitios que el
  análisis no puede correlacionar dejan de contarse como verificados: se cuentan aparte
  y el conteo va en el mensaje. El conteo total pasó de 17 a 14 porque dejó de sumar sus
  propios comentarios como sitios de hashing.
- **Dependencia de shell POSIX declarada.** `required_tools` del contrato agrega `bash`,
  y `CLAUDE.md` y `.claude/docs/adoption/adoption-checklist.md` explican que en Windows hace
  falta el Git Bash de Git for Windows: las reglas y skills ejecutan pipelines POSIX
  (`find … | wc -l` de la detección de `codebase_size`, el bloque PRE-FLIGHT de rama,
  `tr`/`xargs`/`sort` en pre-push) y tener solo el binario `git` no alcanza.
- **Prerequisito de rutas largas en Windows** (`adoption-checklist.md`):
  `git config core.longpaths true`. El template se mantiene holgado dentro del límite de
  260 caracteres, pero los artefactos generados bajo `docs/testing/atf-web/{run_id}/…`
  sumados a una raíz profunda lo cruzan.

### Changed — contrato de distribución (`contract_version` 2.3.1 → 2.4.0)

Se aplicó un criterio único a `distribution`, que hasta ahora se había armado archivo por
archivo: **runtime + manual + semilla** se distribuyen; **artefactos del desarrollo del
ASDD** no. El payload baja ~466 KB y suma 3 documentos que el consumidor ya tenía
referenciados sin recibirlos.

- **Fuera — artefactos de desarrollo del framework** que aterrizaban en el proyecto del
  usuario: los 3 reportes `docs/testing/2026-08-03-001-VERIFY-00{1,2,3}-*.md` (200 KB de
  auditorías internas), `ASDD-CHANGELOG.md` (129 KB de historia de desarrollo), los ADRs
  `docs/adoption/ADR-002, ADR-004, ADR-006, ADR-007`,
  `docs/architecture/decisions/ADR-020-*` y `.asdd/checklist.json` (checklist de
  mantenimiento del template).
- **`docs/testing/` deja de ser una entrada de directorio** y pasa a 6 rutas explícitas: las
  semillas de configuración que ATF API y ATF Web necesitan (`appweb.yaml`,
  `appweb.example.yaml`, `config.yaml`, `appapi.yaml`, `credentials.yaml.example`,
  `atf/config/.gitignore`). Borrar la carpeta completa habría roto el setup de ATF.
- **`.asdd/` deja de ser una entrada de directorio** y pasa a lista explícita de 15
  archivos, para poder excluir `checklist.json`. `cli-contract.json` **se conserva**: el
  check `cli-contract` es de nivel `error` y falla si el archivo no existe, y `post_install`
  corre el validador con `must_pass: true` + `on_fail: rollback` — sacarlo convertía cada
  instalación nueva en un rollback.
- **Adentro — lo que el consumidor necesitaba y no recibía:**
  `.claude/scripts/asdd-regen-hashes.mjs` (sin él, personalizar una referencia de
  regla hacía fallar el validador distribuido sin remediación posible, abortando la
  instalación), `.claude/docs/migrations/` (runbooks dirigidos al consumidor, con pasos que el CLI
  no ejecuta), `ASDD-MEMORY.md` (CLAUDE.md lo declara como índice de memoria y
  `create_dirs` crea `.claude/memory/`, pero el índice no llegaba), y las guías de uso
  `.claude/docs/adoption/guia-uso-capa-ba-management.md` y `permisos-nativos-claude-code.md`.
- `ASDD-VERSIONING.md` **queda fuera** por decisión explícita: es la política de versionado
  del mantenedor, no del consumidor.
- `package.json` **queda fuera**: distribuirlo pisaría el del consumidor. Las 8
  dependencias de ATF ya están documentadas con sus comandos exactos en
  `.claude/docs/adoption/atf-web-setup-dependencies.md`, que sí se distribuye, y cada tool falla
  con un mensaje que dice qué instalar.

### Changed — el manual del framework y el dashboard salen de la raíz

Cierra el punto que quedaba abierto: `docs/` del consumidor ya no mezcla el manual del
framework con sus propios artefactos, y la raíz del proyecto no tiene carpetas sueltas
del ASDD. Ninguna de las dos reubicaciones cambia comportamiento: son ubicación de
archivos y actualización de referencias.

- **18 archivos de manual movidos a `.claude/docs/`**: los 12 de `docs/adoption/` que se
  distribuían (a `.claude/docs/adoption/`), `docs/validation.md`,
  `docs/mcps-by-domain.md`, `docs/plugins-by-role.md` (a `.claude/docs/`) y los 3 de
  `docs/migrations/` (a `.claude/docs/migrations/`). `.claude/docs/` ya era una
  ubicación establecida —tenía 4 documentos del framework— y ya estaba en
  `distribution`, así que las 15 entradas individuales del contrato se colapsan en una.
  Se actualizaron 127 líneas en 30 archivos. Ninguna de las 31 referencias era resuelta
  por código en runtime: 19 vivían en la propia lista del contrato y el resto son citas
  en prosa.
- **`dashboard/` movido a `.claude/dashboard/`**: 44 líneas en 18 archivos, más
  `DASHBOARD` en `tools/lib/paths.js` (ahora relativo a `CLAUDE_ROOT`) y la aritmética
  de `dashboard/lib/output-base.js`, que pasa de subir 2 niveles a 3. El movimiento
  invirtió cuál de las dos formas de referenciar `tools/` era la correcta: los 3
  `require('../.claude/tools/lib/cp-slug')` —válidos cuando el dashboard estaba en la
  raíz— pasaron a `require('../tools/lib/cp-slug')`. Verificado con los 3 entry points
  (`generate-report`, `generate-index`, `reprocess`), que resuelven
  `docs/testing/atf-web/` correctamente.
- **El movimiento corrige un defecto latente.** `generate-report.js:1091` resolvía el
  exportador a Excel como `path.join(__dirname, '..', 'tools', …)`, que apuntaba a
  `<raíz>/tools/` — inexistente desde que el árbol ATF se fusionó con el template y
  `tools/` pasó a vivir bajo `.claude/`. Estaba envuelto en `fs.existsSync`, así que la
  exportación de la matriz de CPs a `.xlsx` **fallaba en silencio**. Con el dashboard
  bajo `.claude/`, ese `'..'` resuelve a `.claude/tools/` y el defecto se cierra sin
  tocar el código.
- **`docs/**` en `distribution` queda reducido** a lo que le pertenece al consumidor:
  `docs/.example/`, `docs/.gitkeep`, la semilla `smart-data-cliente.xlsx` y las 6
  semillas de configuración de ATF. El consumidor recibe `docs/` con sus plantillas y
  el esqueleto de carpetas, nada más.
- **Nueva guía `.claude/docs/migrations/3.3-to-3.4.md`** con las rutas nuevas y el
  borrado manual de los 8 artefactos de desarrollo que quedaron huérfanos en proyectos
  ya instalados. Se eligió el paso manual sobre una clave `remove_on_upgrade` en el
  contrato: borrar por ruta sin verificar contenido podría eliminar trabajo propio del
  consumidor bajo `docs/testing/`, y hacerlo seguro exige el manifiesto de hashes del
  CLI — la misma pieza pendiente del fix de los `.asdd-new`.

### Fixed — instrucciones distribuidas que eran falsas

- **§7 de `asdd-system-integrity.md`** decía a los repos que instalan ASDD que
  corrieran `npm test`. Las 45 suites son tooling de mantenedor y no se distribuyen, así que
  la instrucción era inejecutable. Ahora el paso del consumidor es
  `node .claude/scripts/validate-template.mjs` y `npm test` queda acotado explícitamente al
  repositorio template.
- **`.claude/docs/migrations/2-to-3.md`** instruía correr 3 suites `test-*.mjs` *"cuando las suites
  de desarrollo estén distribuidas"* — condicional sobre un futuro que ya se decidió que no
  ocurrirá. Reemplazado por la aclaración de que el validador es lo que valida la migración.
- **Los 3 mensajes de `SHA-256 mismatch`** del validador no mencionaban ninguna
  remediación. Ahora indican el regenerador —ya distribuido— y advierten contra calcular el
  hash a mano con `sha256sum`/`certutil`/`Get-FileHash`, que no normalizan EOL ni BOM.
- **`ASDD-MEMORY.md` tenía 3 filas apuntando a archivos inexistentes** en
  `.claude/memory/`, directorio que no existe ni está versionado. Tabla vaciada con nota de
  estado vacío; el contenido útil (tipos, qué no guardar, cómo agregar) se conserva.
- **`cli-runtime-distribution` ya no excluye prosa.** La exclusión de `docs/testing/` y
  `ASDD-CHANGELOG.md` existía porque esos documentos se distribuían y citaban tooling de
  mantenedor. Al sacarlos de `distribution` quedó obsoleta y además dañina: dejaba fuera del
  barrido las 6 semillas de config de ATF que sí viven bajo `docs/testing/`. El barrido pasa
  de 636 a **640 artefactos** sin exclusiones.
- **5 citas de ADR quedaban colgando** al sacar esos ADRs de la distribución. Dos de ellas
  vivían en reglas de runtime distribuidas (`asdd-spec-guard.md`,
  `asdd-git-safety.md`) y tres en documentos recién agregados a la distribución
  (`guia-uso-capa-ba-management.md`, `smart-data-integration-plan.md`,
  `migrations/2.25-to-2.26.md`). Ninguna era una instrucción de lectura: todas eran citas de
  procedencia ("fuente del mecanismo", "ADR de respaldo"). Se les quitó la **ruta**
  conservando el identificador y aclarando que el ADR vive en el repositorio del template.
  El hash de `asdd-git-safety.md` se regeneró con `npm run hash:regen`.

## [3.3.0] - 2026-07-31

Workspace multi-repo y worktree gestionado por el orquestador. Release **MINOR**:
agrega el contrato WS-001 y su resolver, y extiende ORC-011 sin romper flujos
previos. El modo mono-repo (`root: "."`) preserva el comportamiento de 3.2.0 sin
cambios, así que no requiere guía de migración.

### Added

- **Contrato de workspace WS-001 (`.asdd/workspace.json`).** Declara dónde
  vive el código que ASDD implementa: un mapa de repos de desarrollo con `root`,
  `base_branch` y `branch_pattern` por proyecto. `root` acepta ruta relativa a la
  raíz del ASDD (`proyectos/<x>`) o absoluta, para adoptar ASDD sobre un repo ya
  clonado. `.asdd/workspace.local.json` (gitignored) permite el override
  por máquina sin versionar rutas personales. Schema en
  `.asdd/workspace.schema.json`.
- **Resolver `asdd-resolve-workspace.mjs`.** Única fuente de verdad en
  runtime sobre `project_root`, `branch`, `worktree_path`, `base_branch` y los
  comandos git exactos del handoff. Fail-closed: valida repo git, commit inicial,
  existencia de `base_branch`, validez y no-colisión de la rama, escribibilidad
  del directorio de worktrees y permisos de directorio. Regresión en
  `test-resolve-workspace.mjs` (44 casos).
- **Campo `project` en `.asdd-run.json`.** Permite que dos runs del mismo ASDD
  apunten a repos de desarrollo distintos.
- **Check `workspace-contract` en `validate-template.mjs`.** Valida el contrato
  WS-001 en el template, no solo en runtime.

### Changed

- **ORC-011 v2 — worktree gestionado por el orquestador (ADR-020).** En modo
  `nested` queda **prohibido** pasar `isolation: worktree` al Agent tool: crea el
  worktree del repo de la sesión (el ASDD), que no contiene el código de un repo
  anidado. El orquestador crea el worktree en el repo del proyecto y pasa
  `WORKTREE_DIR` absoluto al developer. Todas las operaciones del handoff
  (validación, merge, cleanup) usan `git -C {project_root}`.
- **Directorio de worktrees.** `{project_root}/../.asdd-worktrees/{rama}` —
  hermano del project root, fuera del working tree del proyecto y del ASDD.
- **Ramas de desarrollo parametrizables.** `branch_pattern` con `{ticket}`,
  `{slug}`, `{area}`, `{run_id}`, validado contra `ASDD_GITFLOW_PREFIXES`
  y `git check-ref-format`. Un patrón sin discriminador devuelve
  `parallel_safe: false` y ORC-011-A degrada a lotes secuenciales.
- **ORC-011-G prohíbe el fallback de rol.** Un fallo de resolución de workspace
  es configuración: STOP y reportar. Nunca reasignar la implementación a otro
  agente (`tech-lead`, `solution-architect`) para sortearlo.
- **Contrato de los agentes developer.** Sustituyen el modo `isolation: worktree`
  por el contrato `WORKTREE_DIR` / `BRANCH` / `PROJECT_ROOT`, con STOP explícito
  si el worktree no contiene el código del proyecto.
- **`testing-capabilities.yaml`.** Los comandos se ejecutan dentro del worktree
  del repo de desarrollo, no en la raíz del ASDD. Documentado en el encabezado.
- **`.gitignore`.** Se ignoran `proyectos/`, `.asdd-worktrees/`, `.wt-*/` y
  `.asdd/workspace.local.json`.
- **Gate de workspace en `/asdd:build`.** La fase Construir resuelve el
  workspace antes de delegar al primer agente que produce código.
- **Allow-list del orchestrator-guard.** Autoriza el resolver como comando de
  control del orquestador; rechaza chaining, sustitución de comandos y flags
  desconocidos.

### Fixed

- **Developers bloqueados en repos anidados** (reporte de campo 2026-07-28). El
  `isolation: worktree` del Agent tool creaba el worktree del repo ASDD, sin el
  código del proyecto, y el developer aterrizaba en un directorio vacío. El
  orquestador terminaba proponiendo que `tech-lead` implementara el código.
- **Worktrees contaminando el repo ASDD.** Los `.wt-<slug>/` se creaban dentro de
  la raíz del ASDD sin entrada en `.gitignore`, apareciendo como untracked y
  afectando `git status`, los diffs y los gates de Git.
- **Merge y cleanup en el repo equivocado.** ORC-011 ejecutaba `git fetch .`,
  `git merge --no-ff` y `git worktree remove` contra el repo ASDD en lugar del
  repo del proyecto.
- **Comparación de rutas no canónica en el resolver.** En Windows la misma
  carpeta se alcanza por su nombre 8.3, un junction o un symlink, mientras que
  `git rev-parse --show-toplevel` responde siempre en forma larga. La comparación
  literal rechazaba project roots válidos; ahora se comparan rutas canónicas.
- **Check `worktree-opt-in-contract`.** Verificaba el texto del contrato anterior;
  ahora valida el contrato `WORKTREE_DIR`, la invocación del resolver, la
  prohibición de `isolation: worktree` y el uso de `-C {project_root}`.


## [3.2.0] - 2026-07-30

### Added — feat/smart-data-v1.1

#### Databricks AI Dev Kit v0.2.0 — skill renames (Part 1)

Tras actualizar el plugin `databricks aitools` a v0.2.0, los tres nombres de skill
cambiaron en el registry del Dev Kit. Se actualizaron en `cli-contract.json`
(`provides_skills`) y en el agente `asdd-data-eng-databricks.md`:

| Nombre anterior | Nombre nuevo |
|---|---|
| `databricks-config` | `databricks-core` |
| `databricks-spark-declarative-pipelines` | `databricks-pipelines` |
| `databricks-bundles` | `databricks-dabs` |

Los dos baselines de roles en `docs/baselines/2026-07-25-001-ANALYZE-008-*` y
`2026-07-25-001-ANALYZE-010-*` fueron parcheados en sincronía (rutas y campos `id`
actualizados al naming nuevo), pero son snapshots históricos generados antes de este
rename (commit `5846fa7`, 2026-07-25) y llevan un campo `"warning"` que lo indica.
**No son runtime** — ningún agente, hook ni script los lee. Si se necesita un baseline
fresco y preciso, generar uno nuevo con `asdd-researcher` (skill `spike`) sobre
la rama `dev` una vez mergeado este branch, usando como nombre de artefacto
`YYYY-MM-DD-NNN-ANALYZE-*` con la fecha del día.

#### Reestructuración del dominio Smart Data — subdominio `data-engineering`

Aplicando el mismo patrón namespace/subdominio que usa ATF (`atf` → `atf-api`,
`atf-web`), se consolida `smart-data` como namespace y se formaliza
`data-engineering` como primer subdominio. La plataforma (Databricks hoy,
AWS/Fabric después) pasa a ser un parámetro dentro del flujo `data-engineering`.

**Commands** (`.claude/commands/asdd/`):

| Anterior | Nuevo |
|---|---|
| `data-discover.md` → `/asdd:data-discover` | `data-eng-discover.md` → `/asdd:data-eng-discover` |
| `data-design.md` → `/asdd:data-design` | `data-eng-design.md` → `/asdd:data-eng-design` |
| `data-build.md` → `/asdd:data-build` | `data-eng-build.md` → `/asdd:data-eng-build` |
| `data-validate.md` → `/asdd:data-validate` | `data-eng-validate.md` → `/asdd:data-eng-validate` |
| `data-publish.md` → `/asdd:data-publish` | `data-eng-publish.md` → `/asdd:data-eng-publish` |

**Reference files** (`.claude/reference/smart-data/` → `.claude/reference/data-engineering/`):

| Anterior | Nuevo |
|---|---|
| `asdd-data-workflow.md` | `asdd-data-eng-workflow.md` |
| `asdd-data-lineage.md` | `asdd-data-eng-lineage.md` |
| `asdd-data-schema-contracts.md` | `asdd-data-eng-schema-contracts.md` |
| `asdd-data-retention.md` | `asdd-data-eng-retention.md` |
| `asdd-data-inter-contracts.md` | `asdd-data-eng-inter-contracts.md` |

> Las tres rules transversales del namespace `data` (`asdd-data-boundary.md`,
> `asdd-data-events-integrity.md`, `asdd-data-routing.md`) NO se renombraron:
> aplican al namespace completo, no al subdominio `data-engineering`.

**Skills** (directorios en `.claude/skills/`):

| Anterior | Nuevo |
|---|---|
| `asdd-data-discovery/` | `asdd-data-eng-discovery/` |
| `asdd-data-architecture-design/` | `asdd-data-eng-architecture-design/` |
| `asdd-data-contract/` | `asdd-data-eng-contract/` |
| `asdd-data-governance-assessment/` | `asdd-data-eng-governance-assessment/` |

Los agentes `asdd-data-architect.md` y `asdd-data-governance.md`
actualizaron sus listas `skills:` y las rutas hardcoded a reference files.
`CLAUDE.md` y `.claude/hooks/asdd-pre-tool-use-analyze-guard.mjs` actualizados.

#### .gitignore — AI Dev Kit local state files (Part 3)

Se agregaron tras el bloque Smart Data las entradas para excluir el estado
local de instalación del AI Dev Kit (no versionable):

```
.ai-dev-kit/.installed-skills
.ai-dev-kit/.skills-profile
.ai-dev-kit/.agent-b-skills
.ai-dev-kit/version
.databricks/aitools/skills/.state.json
```

> `skills.lock` **no** se ignora — sigue siendo versionable intencionalmente.

### Fixed — commits de Nilton Rodríguez (2026-07-29)

- **Configuración JSON portable (`e15b5e0`)**: se eliminó el carácter BOM
  UTF-8 al inicio de `.claude/settings.json` y se normalizó su formato sin
  alterar la configuración efectiva de permisos, modelo, hooks, worktrees ni
  plugins. Esto evita fallos en lectores JSON que no toleran BOM.
- **Integridad de carga condicional (`19fe357`)**: se actualizó en
  `.asdd/rule-loading.json` el `reference_sha256` de
  `asdd-routing-heuristics` a
  `3ed2bcaa06880242ec6116d43deb5a32a6410a99509c530408d17746fd62a46c`,
  correspondiente al contenido vigente de la regla, eliminando el hash
  obsoleto y restaurando la verificación de integridad.

## [3.1.0] - 2026-07-27

### Added — Capa BA refactor (ADR-010)

- **5 agentes BA nuevos** (consolidan los 9 anteriores):
  `asdd-ba-functional-architect`, `asdd-ba-specification-lead`,
  `asdd-ba-specification-auditor`, `asdd-ba-functional-sme`,
  `asdd-ba-scope-manager`.
- **17 skills BA nuevos o renombrados**: `asdd-ba-brief`,
  `asdd-ba-change-log`, `asdd-ba-client-validation`,
  `asdd-ba-early-scope`, `asdd-ba-functional-sme-dominio`,
  `asdd-ba-functional-sme-sector`, `asdd-ba-log-lessons-learned`,
  `asdd-ba-requirements`, `asdd-ba-scope-control`,
  `asdd-ba-specification-auditor-coherencia`,
  `asdd-ba-specification-auditor-gaps`,
  `asdd-ba-specification-auditor-mece`,
  `asdd-ba-specification-lead-contexto`,
  `asdd-ba-specification-lead-extraccion`,
  `asdd-ba-specification-lead-gherkin`,
  `asdd-ba-uat-classifier`, `asdd-ba-user-story`.
- **Protocolo epistémico SME** — 5 marcadores canónicos (`[CERTEZA]`,
  `[INFERENCIA]`, `[ESPECÍFICO_CLIENTE]`, `[NO_SÉ]`, `[RIESGO_REGULATORIO]`)
  con reglas de anclaje regulatorio y calibración de práctica estándar.
- **Layout A (ART-001)** — artefactos BA ahora usan naming plano en `docs/specs/`;
  código de nodo EDT embebido en el slug. Ver
  `.claude/reference/ba/asdd-ba-specs-layout.md`.
- **`asdd-ba-layer-routing.md`** — regla de routing actualizada con 5
  agentes y Layout A; reemplaza la versión antigua.
- **3 nuevas referencias BA**: `asdd-ba-change-log-contract.md`,
  `asdd-ba-specification-lead-iteracion.md`,
  `asdd-ba-specs-layout.md` en `.claude/reference/ba/`.
- **ADR-010** — formaliza el refactor consolidador de la capa BA.

### Changed

- `asdd-ba-layer-routing.md` — actualizado con nuevos nombres de agentes
  y Layout A.
- `asdd-spec-guard.md` — agentes CR y skill de change-log actualizados
  (`asdd-ba-scope-manager`, `asdd-ba-specification-lead`,
  `asdd-ba-change-log`).
- `coordinator-loading.json` — entrada `asdd-ba-descomponedor` →
  `asdd-ba-functional-architect` con SHA-256 recomputados.
- ADR-006 — estado actualizado a "Aceptada (parcialmente supersedida por ADR-010)".

### Deprecated

- 4 agentes BA antiguos: `asdd-ba-descomponedor`, `asdd-ba-constructor`,
  `asdd-ba-evaluador`, `asdd-ba-bitacora` — eliminados de `.claude/agents/`.
- 7 skills BA con nombres antiguos: `asdd-ba-bitacora-log`,
  `asdd-ba-constructor-{contexto,extraccion,gherkin}`,
  `asdd-ba-evaluador-{coherencia,gaps,mece}` — reemplazados por los
  nuevos; directorios pendientes de borrado manual.

## [3.0.1] - 2026-07-27

Corrección PATCH de compatibilidad para el descubrimiento de agentes en Linux.
No cambia contratos, nombres ni comportamiento esperado del template 3.0.0.

### Fixed

- **Descubrimiento portable de agentes en Linux:** las descripciones YAML que
  contienen `: ` ahora están entre comillas en agentes, comandos y skills.
  El parser de frontmatter rechaza escalares no portables sin comillas y una
  prueba de regresión evita que Claude Code descarte silenciosamente agentes y
  fuerce al orquestador a degradarse a un agente genérico.

## [3.0.0] - 2026-07-21

Runtime Efficiency v2 y el hardening validado en el consumidor real
`aid-bancolombia`. Es un release **MAJOR** porque cambia contratos observables
de adopción: registro de hooks, ubicación/carga de rules, autorización de
operaciones y nombres de artefactos nuevos. Ver
`.claude/docs/migrations/2-to-3.md` antes de actualizar un consumidor 2.x.

### Breaking Changes

- **Dispatchers en lugar de cadenas de hooks:** `PreToolUse` para
  `Bash|Write|Edit` se registra mediante
  `asdd-pre-tool-dispatcher.mjs`, y `SessionStart` mediante
  `asdd-session-start-dispatcher.mjs`. Se retira el entrypoint
  `asdd-session-start.mjs` y los hooks de contexto reemplazados quedan
  únicamente como fixtures legacy de benchmark.
- **Rules especializadas bajo demanda:** diez rules dejan de ser always-on en
  `.claude/rules/` y pasan a `.claude/references/rules/`. Los agentes deben
  resolverlas explícitamente con `asdd-resolve-rule.mjs`; rutas directas
  antiguas dejan de ser válidas.
- **Autorización vinculada a la ejecución:** un plan aprobado ya no autoriza
  genéricamente al agente. El launch y cada `Write`, `Edit` o Bash sensible
  deben coincidir con agente, runtime identity, modelo, budget, capability,
  scope y comando canónicos. Replay, expiración, symlinks y ampliaciones de
  alcance fallan cerrado.
- **Naming universal de artefactos nuevos:** todo archivo nuevo generado por
  agentes bajo `docs/**` usa
  `{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`. Los artefactos 2.x existentes siguen
  siendo legibles, pero no se usa su convención para archivos nuevos.
- **Routing y modelo por defecto:** el orquestador cambia de Opus fijo a Sonnet
  por defecto y clasifica mecánicamente `TRIVIAL|LIGHT|MEDIUM|FULL`, con modelo,
  fan-out, turnos y retries bloqueantes por ruta.
- **Worktrees opt-in:** los developers ya no fuerzan aislamiento worktree por
  default. El proyecto consumidor debe solicitarlo explícitamente cuando su
  estrategia de cambios lo requiera.

### Added

- Router proporcional determinista, diagnóstico `route-request --file` y
  detección de señales sensibles, auditorías read-only, queries triviales y
  cambios atómicos acotados.
- Autorización estructurada de planes y commits, challenge canónico de 15
  minutos, binding por operación, protección contra replay y separación de
  `git commit` del lote de implementación.
- Autorización LIGHT atómica de cinco minutos, un archivo y un uso, que
  conserva la delegación sin presentar plan/challenge ni solicitar `ok`.
- Presupuestos versionados de subagentes y routing de modelos: Sonnet default,
  Explorer/Haiku y alto riesgo/Opus, con límites de concurrencia, turnos y un
  retry máximo.
- Carga condicional verificable mediante catálogos
  `rule-loading.json`, `capability-loading.json` y
  `coordinator-loading.json`, más resolvers/loaders que fallan cerrado.
- Librerías y CLIs de runtime para reconciliación de runs, nombres universales,
  bootstrap de Specify, materialización de artefactos, métricas de contexto y
  telemetría local sin contenido sensible.
- Contratos y pasos distribuidos para coordinadores BA y ATF Web delgados, con
  snapshots de rollback explícitos.
- Benchmarks reproducibles, fixtures diferenciales de seguridad y suite E2E de
  consumidor independiente con paths POSIX/Windows, espacios, symlinks y
  repositorios Git anidados.
- ADR-010 a ADR-019 para worktrees opt-in, plan gate, routing KISS, lazy
  capabilities, materialización sin retry, autorización operacional, contexto,
  dispatcher y presupuestos de modelos.

### Changed

- Contexto always-on reducido de `16.973` a `5.863` palabras; el prompt normal
  deja de repetir 145 palabras ORC y carga rules/capabilities/phase specs solo
  cuando existe evidencia de uso.
- Los coordinadores ATF Web y BA Descomponedor pasan de prompts monolíticos a
  shells delgados con pasos explícitos y handoff por artefactos.
- Los agentes Developer, Product, Architect, UX/UI, DevOps y Tech Lead eliminan
  eager skills y declaran capabilities primarias/dependencias bajo demanda.
- `UserPromptSubmit` inyecta el routing canónico antes de tools, consume la
  aprobación del plan una sola vez y evita llamadas redundantes a
  `approve/status/help`.
- Reconciliación de `.asdd-run.json` guiada por fase y YAML frontmatter real;
  Specify/Analyze temprano ya no exigen artefactos INDEX de fases futuras.
- Bootstrap de Specify abre/reutiliza el run y reserva el primer artefacto antes
  del plan, eliminando el deadlock entre creación del run y naming.
- Contrato CLI `2.2.0 → 2.3.0`: distribución aditiva de `ba-steps`, referencias,
  librerías, autorización, routing, loaders, bootstrap y guía de adopción.
- La documentación elimina supuestos de CI específicos de proveedor; la
  validación local `validate-template.mjs` es la fuente verificable.

### Fixed

- Challenge emitido antes del plan, payload JSON multilínea sin pipes y
  challenge nuevo sin destruir el binding del lote vigente.
- Capability aliases se canonizan; el loader relativo y su equivalente absoluto
  dentro del proyecto representan el mismo comando autorizado.
- Denegaciones distinguen `command-mismatch`, `launch-budget-mismatch`,
  `authorization-expired` y `authorization-replay` en vez de reportar toda falla
  como una posible expiración.
- Domain Expert opera como overlay sin capability inventada y no presenta
  conocimiento regulatorio externo como hecho cuando el paquete curado es la
  fuente única.
- Auditorías explícitamente read-only no escalan a FULL por mencionar ADR/specs;
  wrappers con `Prompt para copiar` se enrutan por el bloque copiable y paths
  como `ux-ui.md` no fuerzan un dominio falso.
- La allow-list local acepta lecturas cerradas, `git -C … status` y diagnóstico
  del router, pero conserva fail-closed ante shell compuesto o ambiguo.
- Guards de operaciones conservan precedencia deny en el dispatcher y no
  interfieren con collectors externos ni Smart Data.
- Naming universal reconoce Smart Data y contratos con semver sin confundir los
  puntos del slug con la extensión.

### Security

- Planes aprobados se enlazan criptográficamente a autorizaciones de uso único;
  una aprobación nativa posterior no puede ampliar el lote.
- Scope exacto impide escapes fuera del proyecto, traversal y symlinks; runtime
  identity evita que otro agente herede permisos consumidos.
- Capabilities Developer deben cargarse antes de `Write`, `Edit` o Bash sensible
  y solo pueden usar la capability primaria/dependencias aprobadas.
- `git commit` requiere challenge explícito independiente (GS-003), y comandos
  destructivos, cambios de autorización y dominios sensibles conservan
  escalamiento/fail-closed.
- Telemetría de runtime registra budgets y resultados sin prompts, código,
  secretos ni contenido de artefactos.

### Performance and Validation

- Dispatcher ASDD reduce procesos PreToolUse de `7/8 → 1`; benchmark integral
  en Linux WSL2 midió mejoras p95 de `36,69 %` en Bash y `39,52 %` en Edit
  frente a la cadena legacy.
- Suite consumidora final: `16/16`; validator del template: `32 OK`, `0 errores`;
  evaluaciones reales Opus/Sonnet: `4/4` cada modelo.
- Persisten dos deudas visibles, no ocultas: `CLAUDE.md` supera el target de 200
  líneas y nueve agentes conservan eager skills por encima del target staged.
- Rendimiento nativo macOS/Windows queda pendiente; fixtures Windows validan
  semántica de paths, no latencia del proveedor o del sistema operativo.

### Migration

- Guía obligatoria para consumidores 2.x:
  `.claude/docs/migrations/2-to-3.md`.
- No se renombran artefactos legacy. La migración sustituye registro/config del
  runtime y aplica el naming universal únicamente a archivos nuevos.

### Notes

- El tag `v2.27.4` permanece inmutable. `v3.0.0` se crea únicamente después de
  aprobar/mergear el MR y completar los gates de release acordados.

## [2.27.4] - 2026-07-08

### Added

- **Guía de dependencias runtime de ATF Web**: `.claude/docs/adoption/atf-web-setup-dependencies.md` documenta las dependencias de Node.js que requiere el pipeline ATF Web (`@playwright/mcp`, `glob`, `mssql`, `@playwright/test`, `axe-core`, `mammoth`, `pdf-parse`, `pptx2json`, `xlsx`) y su comando de instalación — no formaban parte del core del template y no se instalaban automáticamente al adoptar el template. Se agrega puntero descubrible desde `asdd-atf-web-qa-engineer` y `/asdd:qa-web-setup-app`, y se distribuye el nuevo doc vía `.asdd/cli-contract.json`.

### Fixed

- **Bug B — guards de git resuelven el repo efectivo del comando (soporte de repos anidados, arregla falso positivo que bloqueaba commits legítimos)**: los 3 guards de git (`asdd-guard-branch.mjs`, `asdd-pre-push-gate.mjs`, `asdd-pre-pr-gate.mjs`) ya no asumen que git corre siempre sobre `CLAUDE_PROJECT_DIR` — resuelven el repo EFECTIVO del comando (`cd X &&`, `git -C X`, `input.cwd`) antes de evaluar rama, diff o el marcador GS-008, vía el helper compartido `.claude/hooks/_lib/git-command-cwd.mjs`. Iteraciones R3→R3d cerraron 4 clases de bypass encontradas en auditorías adversariales sucesivas (correlación incorrecta de `-C` multi-git, separadores newline/subshell, construcciones no parseables como eval/pipe, comillas y `pushd`/`popd`), siempre fail-closed ante ambigüedad. Reencuadre de doctrina en `asdd-git-safety.md` (GS-001): los guards son **safety-net contra el error accidental**, no barrera contra evasión deliberada — esa barrera real es **branch protection server-side** (GitLab/GitHub rechaza pushes directos a ramas protegidas) + el escape hatch auditable existente para releases. Residuales (`--git-dir`/`--work-tree`, variables de shell sin resolver, symlinks) quedan documentados y aceptados by-design — ver ADR-007 (`docs/adoption/ADR-007-git-guards-threat-model-reenfoque.md`) para el análisis completo y la Opción D (git hooks nativos) como follow-up futuro opcional.

## [2.27.3] - 2026-07-08

Versión PATCH: distribución del CLI corregida — `guide init`/`guide update` dejaban de instalar directorios y ADRs que el propio template referencia desde reglas y agentes, generando referencias colgantes en cada proyecto consumidor. Causa raíz: drift del array `distribution[]` en `.asdd/cli-contract.json` respecto al contenido real del repositorio.

### Fixed

- **Directorios faltantes en `distribution[]`**: se agregan `.claude/reference/`, `.claude/tools/`, `.claude/atf-web-steps/` y `.claude/dashboard/`, que ya eran consumidos por agentes/skills del template pero no se copiaban al instalar o actualizar.
- **ADRs consumer-facing sin distribuir**: se agregan `docs/adoption/ADR-002-smart-data-flow-isolation.md`, `docs/adoption/ADR-004-spec-per-area-model.md` y `docs/adoption/ADR-006-integracion-capa-ba-analista-funcional.md`, más `.claude/docs/adoption/smart-data-integration-plan.md`, referenciados por reglas y agentes pero ausentes del contrato de distribución.
- **ADR-004 reubicado a `docs/adoption/`**: vivía en `docs/architecture/decisions/`, directorio que pertenece al proyecto consumidor y que el CLI no distribuye — la ruta citada por reglas quedaba colgante en cada instalación. Se reubica junto a los demás ADRs consumer-facing y se actualizan las referencias internas.
- **`.claude/memory/` en `create_dirs`**: el proyecto consumidor recibe el directorio vacío listo para su propia memoria de equipo, en lugar de tener que crearlo manualmente.

## [2.27.2] - 2026-07-08

Versión PATCH: Bug C — el hook `coauthorship-guard` cubre vectores de escape adicionales a la atribución de IA en artefactos de entrega (MRs/PRs), detectados en un MR real de un proyecto consumidor.

### Fixed

- **`coauthorship-guard` cubre vectores de escape (C1-C5)**: la cobertura previa del hook `asdd-pre-tool-use-coauthorship-guard.mjs` solo interceptaba `git commit`, `glab mr create` y `gh pr create`. Se amplía la allowlist para cubrir también `glab mr update`/`glab mr edit`/`gh pr edit` (un MR limpio no se puede "enriquecer" después con atribución de IA), `glab api .../merge_requests` y `gh api .../pulls` con métodos de escritura (`POST`/`PUT`/`PATCH`), variantes de prosa sin el trailer canónico (`"Generated with Claude Code"`, `"Generated by Anthropic"`, `"Assisted by Claude"`, `"Written by Claude"`) y archivos escritos con `Write`/`Edit` destinados a ser cuerpo de MR/PR (`--description-file`/`--body-file`/`-F`).
- **Fix R2b — candidatura del matcher `Write`**: la ampliación C1-C5 del matcher `Write` bloqueaba de forma colateral documentación legítima del template (paths como `docs/tech/*.md`). Se introduce una allowlist positiva de paths candidatos a "cuerpo de MR/PR" (basename o ruta con `description`/`body`/`mr-`/`pr-`), de modo que el matcher solo se activa sobre archivos que realmente son candidatos a ser el cuerpo de un MR/PR — trade-off documentado en el bug report `BUILD-007`.
- **Skill `asdd-tech-lead-create-mr` actualizada**: documenta el patrón obligatorio de heredoc (`--description "$(cat <<'EOF' ... EOF)"`) para descripciones largas de MR, evitando el patrón `--description-file`/`--body-file`/`-F` sobre archivos pre-escritos con `Write`.
- **Suite de tests extendida**: la suite `coauthorship-guard` crece de 18 a 25 casos cubriendo los vectores C1-C5 y la allowlist positiva del fix R2b.

Trazabilidad: bug report `docs/tech/2026-07-07-001-BUILD-007-*`, plan maestro `BUILD-001`.

## [2.27.1] - 2026-07-08

Versión PATCH (retroactiva): Bug A — naming de `artifact-name-guard` y de runs ASDD (A1-A8) + renombrado de `hooks/lib` a `hooks/_lib` (E2). El código de este fix ya está en `dev` desde el merge de R1 (MR #212); esta entrada de changelog formaliza el bump que no se aplicó en ese momento.

### Fixed

- **`current_phase` con enum + fallback compartido**: se centraliza la resolución de la fase actual del run con un enum y un fallback compartido, eliminando divergencias entre hooks que interpretaban la fase de forma distinta.
- **`--dry-run` no consume `artifact_seq`**: las corridas en modo dry-run ya no incrementan el contador de secuencia de artefactos, evitando huecos de numeración en runs reales.
- **`run complete` degrada a aviso**: un run marcado `complete` deja de bloquear duro y degrada a aviso, permitiendo continuidad operativa sin perder la señal de estado.
- **`docs/tech` exento del `artifact-name-guard`**: los artefactos producidos por `asdd-tech-lead` en `docs/tech/` quedan exentos del naming estricto de artefactos de run, alineado con su naturaleza de reporte transversal.
- **`analyze-guard` exime `bug-*.md`**: los reportes de bug (`docs/specs/bug-*.md`) quedan exentos del gate de `analyze-guard`, ya que no son artefactos del flujo Analizar.
- **Renombrado `hooks/lib` → `hooks/_lib` (E2)**: el directorio interno de utilidades compartidas de hooks se renombra con prefijo `_` para señalizar explícitamente que no es un hook ejecutable propio.
- **Nuevo check `asdd-run-json-schema`**: se agrega verificación de schema para `.asdd-run.json` en el validador del template.

## [2.27.0] - 2026-07-07

Versión MINOR: **carga condicional de rules de dominio** (ADR-005). Las 5 rules del pipeline ATF Web se retiran del auto-load heredado por los sub-agentes y pasan a `.claude/reference/atf-web/`, donde el pipeline las carga por lectura explícita. Reduce el piso de contexto de los sub-agentes (≈ −17k tokens) y mitiga el thrashing de auto-compactación en `sonnet`, sin forzar `opus`. Las 6 rules Smart Data se intentaron mover pero se **revirtieron al auto-load**: son transversales "siempre activas" sin lector explícito y quedaban huérfanas. Backward-compatible: ningún contenido cambia, solo su ubicación y su modo de carga.

### Changed

- **Rules ATF Web fuera del auto-load (ADR-005)**: 5 rules del pipeline ATF Web se mueven de `.claude/rules/` a `.claude/reference/atf-web/` (commit `1d4c421`); el pipeline las carga por path desde `asdd-atf-web-qa-engineer` y sus phase-specs. `.claude/rules/` queda reservado para rules **universales** (git-safety, anti-loops, data-boundary, system-integrity, memory-*, etc.) y de **orquestación** (orchestration*, workflow*, routing*), que sí aplican a cualquier agente y conservan el auto-load.
- **6 rules Smart Data revertidas al auto-load**: se movieron a `.claude/reference/smart-data/` (commit `62978b6`) y se revirtieron porque son transversales "siempre activas" **sin punto de lectura explícito** — moverlas dejaba a los agentes Data sin gobernanza en runtime (`asdd-data-{routing,workflow,schema-contracts,lineage,retention,inter-contracts}.md`). Vía futura para recuperar su ≈ −14k: darles un `Read` explícito en su agente/command dueño antes de retirarlas (ver ADR-005 §Vía futura). `asdd-data-boundary.md` y `asdd-data-events-integrity.md` nunca se movieron: pese al prefijo `data-`, son universales (seguridad anti prompt-injection e integridad de persistencia/eventos) que aplican a todo agente.

### Added

- **Convención `.claude/reference/{domain}/` (ADR-005)**: nuevo directorio **no auto-cargado**, hogar canónico de las rules de dominio. Los agentes de dominio las referencian y leen por path explícito (ej. `reference/atf-web/…` citado por `asdd-atf-web-qa-engineer`). Documentado en `.claude/docs/adoption/naming-convention.md` §3.5.
- **ADR-005 — Carga condicional de rules**: `docs/adoption/ADR-005-conditional-rule-loading.md` (Propuesta) — root-cause del thrashing, clasificación universal/orquestación/dominio, lección de la reversión Smart Data (solo es seguro mover rules con lector explícito) + vía futura para recuperar el −14k, evidencia empírica WU-T0 (`/context` 117.2k → 108.2k al mover 1 rule) y follow-up para endurecer el check `broken-skill-references` (hoy no valida rutas de 2 niveles `reference/{domain}/X.md`).

### Notes

- **`asdd-counts`**: el conteo `rules` del lock es **29** — las 5 rules ATF Web salieron a `.claude/reference/atf-web/` (el check `walk('.claude/rules')` no recurre a `.claude/reference/`, directorio hermano) y las 6 Smart Data volvieron al auto-load. Coincide con `.claude/rules/`.
- **Follow-up conocido**: `broken-skill-references` en `validate-template.mjs` solo resuelve referencias de un nivel (`reference/X.md`); las rutas anidadas `reference/{domain}/X.md` no se validan. Endurecimiento recomendado como trabajo separado (ver ADR-005 §Limitación conocida).

### Migración Smart-Data (ADR-005 Enmienda 1 — 2026-07-07, misma fecha, ciclo posterior)

Ejecución de la §"Vía futura" del ADR-005 base: 5 de las 6 rules Smart-Data se retiran del auto-load y pasan a `.claude/reference/smart-data/` con lector `Read` explícito en su agente o command dueño. Rama de trabajo: `feature/smart-data-context-diet`. Commits WU-0..WU-4 + WU-6a de cierre.

- **Rules Smart-Data fuera del auto-load** (WU-1..WU-4): `asdd-data-schema-contracts.md` (WU-1 `0020653` — lectores: `data-eng-databricks`, `data-architect`), `asdd-data-retention.md` + `asdd-data-inter-contracts.md` (WU-2 `9c19925` — lectores: `data-governance`, `data-architect`), `asdd-data-lineage.md` (WU-3 `bbff6e4` — lectores: `data-governance`, `data-eng-databricks`, commands `data-build` y `data-validate`; este último absorbe LIN-003 del orquestador como criterio de entrada), `asdd-data-workflow.md` (WU-4 `cbd3357` — lectores: los 5 commands `data-*`, cada uno cita su sección `SD-00x` respectiva). Lock `manifest.rules` pasa de **29 → 24**. Reducción del piso heredado por sub-agente: **≈ −11k tokens** (555 líneas movidas × ~20 tokens/línea, calibrado con el −14k proyectado del ADR). Combinado con las 5 rules ATF-web (≈ −17k) el piso baja ≈ −28k respecto al estado pre-ADR.
- **`asdd-data-routing.md` DIFERIDO**: queda en `.claude/rules/` (auto-load). Es routing crítico del orquestador consultado ANTES de que corra cualquier agente/command → no tiene punto de lectura de agente en el instante del routing. El ahorro adicional (≈ −2k) no justifica el riesgo residual de que el orquestador pierda la tabla D0-D7 inline. Documentado como mejora futura opcional en ADR-005 Enmienda 1 §E1.3.
- **Nuevo check `reference-path-integrity`** (error) en `.claude/scripts/validate-template.mjs`: red de seguridad anti-orfandad. Escanea `.claude/agents/*.md` + `.claude/commands/**/*.md` y matchea `.claude/reference/{domain}/*.{md,json,yaml,yml,txt}`. Si un agente o command referencia un archivo bajo `reference/` que no existe → error. Verificado empíricamente: al eliminar temporalmente `reference/smart-data/asdd-data-lineage.md`, el check reporta ERR listando los 4 lectores exactos. Cierra el follow-up del ADR original (§Limitación) para rutas de 2 niveles y lo aplica también a agentes (no solo skills). Cubre tanto Smart-Data como ATF-web (10 paths distintos verificados hoy).
- **Principio de seguridad aplicado en cada WU**: el `Read` del lector se agregó en el MISMO commit que el `git mv` de la regla — nunca mover primero y agregar lector después (lección de `bcdab3f`). Ninguna rule quedó huérfana en runtime en ningún punto intermedio del ciclo.
- **Hallazgo confirmado empíricamente en las 4 WU**: ninguno de los agentes/commands lectores declara el key `rules:` en su frontmatter. El único mecanismo real de carga de una rule bajo `reference/` es la instrucción `Read` explícita en el cuerpo del agente/command (patrón ATF-web `asdd-atf-web-qa-engineer.md`). La hipótesis E1.1 del ADR queda validada por la migración.

### Refuerzo WU-7 — lector command para las 3 reglas "soft" (ADR-005 §E1.9)

Hallazgo runtime del test WU-6b en consumidor real: los **agentes** Data corrieron con 0 tool uses cuando el orquestador los invocó via Task con contexto pre-cargado (no dispararon su `Read` de Paso 0). El **command** `/asdd:data-discover` sí disparó `Read` de `reference/smart-data/asdd-data-workflow.md` en el turno del orquestador. Conclusión: lectores command = confiables; lectores agente = best-effort. WU-7 robustece el flujo normal dándole lector command a las 3 reglas que en la Enmienda 1 original solo tenían lector agente.

- **Ampliación de Paso 0 en 4 commands** (ninguna regla se mueve — ya viven en `reference/smart-data/`):
  - `data-discover` sumó lectura de `data-retention.md` (governance-assessment de discover define retención de campo PII — RET-005).
  - `data-design` sumó lectura de `data-schema-contracts.md` + `data-retention.md` + `data-inter-contracts.md` (design produce contrato Silver, retención por capa y formaliza contratos inter-equipo).
  - `data-build` sumó lectura de `data-schema-contracts.md` (build implementa Silver estrictamente contra el contrato, `schemaHints` obligatorios donde el tipo diverja).
  - `data-validate` sumó lectura de `data-inter-contracts.md` (validate chequea cumplimiento de contratos inter-equipo formalizados en design).
- **Mapa consolidado post-WU-7** — cada regla queda leída por al menos un command en su fase:

  | Command | workflow | lineage | schema-contracts | retention | inter-contracts |
  |---|---|---|---|---|---|
  | `data-discover` | ✓ SD-001 | — | — | ✓ (WU-7) | — |
  | `data-design` | ✓ SD-002 | — | ✓ (WU-7) | ✓ (WU-7) | ✓ (WU-7) |
  | `data-build` | ✓ SD-003 | ✓ | ✓ (WU-7) | — | — |
  | `data-validate` | ✓ SD-004 | ✓ (absorbe LIN-003) | — | — | ✓ (WU-7) |
  | `data-publish` | ✓ SD-005 | — | — | — | — |

- **El lector agente se mantiene como best-effort** — no se toca: si el sub-agente sí abre tools, tiene el `Read` disponible (patrón `asdd-data-{architect,eng-databricks,governance}.md`). Si no, el command ya cargó la regla por él. La migración a `reference/` sigue bajando el piso ≈ −11k tokens; WU-7 solo cambia el punto de lectura confiable, no la ubicación.
- **Sin cambios al lock**: `manifest.rules = 24` sigue igual (ninguna regla se mueve entre `.claude/rules/` y `.claude/reference/`).
- **Validador**: `reference-path-integrity` sigue OK con 10 paths distintos verificados (los mismos 5 Smart-Data + 5 ATF-web; WU-7 solo aumenta la cantidad de citas por regla, no las rutas totales).

## [2.26.0] - 2026-07-07

Versión MINOR: nuevo modelo de especificación **spec-per-área** (ADR-004). La fase Analizar deja de producir una spec monolítica por funcionalidad y pasa a generar un set de artefactos por área de dominio, con un INDEX como orquestador de progreso y una construcción dirigida por dependencias.

### Added

- **Modelo spec-per-área (ADR-004)**: WF-002 (Analizar) ahora cierra con exactamente **1 INDEX + 1 spec-funcional + N `spec-{area}`**, donde N = cantidad de áreas con `Aplica = Sí` en el Mapa de dominios (§0 del super-spec). Áreas ∈ {backend, frontend, diseno, devops, seguridad, data, qa}. El INDEX (`{run_id}-ANALYZE-{SEQ}-{feature}-index.md`) es la SSoT del progreso por área; el spec-funcional es la SSoT del contenido cross-área; cada `spec-{area}` es el slice canónico de su dominio.
- **Fase Analizar multi-dominio (WF-002)**: `asdd-producto` (skill `funcional`) coordina y cada dominio con `Aplica = Sí` autora su propio slice en paralelo (ORC-011-A: archivos disjuntos → intersección 0). Orquestación en 4 pasos: análisis del brief → autoría multi-dominio → consolidación e INDEX → Gate DOR.
- **Gate DOR (WF-002-DOR)**: criterio de cierre de Analizar — el dominio Funcional debe estar `APROBADA`, cada dominio `Aplica = Sí` en `COMPLETO`, y el opt-out de Seguridad requiere sign-off explícito de `asdd-security`. Enforcement soft (revisado por el orquestador).
- **Construir dirigido por `index_ref` (WF-004)**: la fase Construir se ejecuta como loop determinista dirigido por el INDEX, con grafo de olas (Ola 1: seguridad, diseno, backend, data → Ola 2: frontend, devops → Ola 3: qa). Solo el orquestador escribe el INDEX (R-INDEX-5).
- **`ui_required` en el spec-funcional (§0)**: campo derivado del Mapa de dominios (UX/UI `Aplica = Sí` → `true`), consumido por el hook `design-guard` (gate WF-003).
- **Reconciliación Tier C**: los escenarios Gherkin (§10 del super-spec) reciben IDs sintéticos `SCN-NNN` derivados del orden de aparición para trazabilidad.

### Changed

- **Vocabulario del super-spec corporativo (ADR-004 §6)**: se retiran los identificadores `CU-\d+`, `HU-\d+` y `AC-\d+`. El modelo usa Reglas de Negocio `RN-\d+` tipadas `[CORE]`/`[EDGE]`, Flujo de Negocio numerado sin ID, una User Story libre única, y escenarios Gherkin sin ID. Gaps se numeran `GAP-\d+`; cambios post-aprobación `CR-\d+`.
- **spec-template reemplazado por super-spec corporativo** (WU-2) y agregados `spec-slice-rules` + `spec-funcional-template` (WU-3).
- **`index_ref` agregado al schema de `.asdd-run.json`** (WU-1): `phases.build.index_ref` apunta al INDEX del feature para el loop de Construir.

### Removed

- **spec-size-guard retirado** (WU-1): el hook `asdd-pre-tool-use-spec-size-guard.mjs` y sus umbrales cuantitativos (300 líneas / ≤5 CU / ≤1 aggregate) se retiran. La partición pasa a ser **estructural por área** (WF-002-STRUCT), no cuantitativa — reemplaza la sub-regla de tamaño #3650.

### Notes

- **Backward-compat de naming legacy**: los artefactos con naming anterior siguen siendo reconocidos por la cadena de guards. Ver la guía de migración `.claude/docs/migrations/2.25-to-2.26.md`.
- **`artifact-name-guard` sin cambios**: durante la implementación se verificó que este guard nunca validó operaciones `Edit` (solo `Write`), por lo que los `Edit` de artefactos vivos (INDEX, spec-{area}) ya estaban libres — no requirió exención (ADR-004 §5 revisado en WU-7).

## [2.25.4] - 2026-07-03

Versión PATCH: reconocimiento de artefactos Smart Data centralizado en un único módulo (SSOT) y remoción de un candado mecánico redundante en los agentes Data.

### Fixed

- **Reconocimiento de artefactos Smart Data — Single Source of Truth**: la regex que identifica artefactos del flujo Data (`smart-data-*-{cliente}.md`) estaba triplicada de forma independiente en `asdd-pre-tool-use-analyze-guard.mjs`, `asdd-pre-tool-use-artifact-name-guard.mjs` y `asdd-pre-tool-use-spec-size-guard.mjs`. Se centraliza en `.claude/hooks/lib/smart-data-naming.mjs`, consumido por los tres guards, eliminando el riesgo de que una futura actualización de la regex se aplique en un solo hook y desincronice la cadena.
- **Soporte de contratos versionados DC-004**: el reconocimiento de artefactos ahora acepta el patrón `smart-data-contract-{capa}-{cliente}-{semver}.md`, cubriendo el naming de contratos versionados del flujo Data que antes no matcheaba ninguno de los tres guards.
- **Candado mecánico redundante en agentes Data**: se remueve `permissionMode: plan` del frontmatter de `asdd-data-architect` y `asdd-data-governance`. La restricción era redundante con la aprobación explícita ya exigida por `ORC-010-A` (inyección de aprobación del orquestador) y generaba fricción operativa sin aportar una salvaguarda adicional real.
- **Nuevo check del validador — `agent-permission-mode`**: `validate-template.mjs` incorpora un check `error` que detecta configuraciones de `permissionMode` inconsistentes con la política vigente de agentes.
- **Harness de cadena ampliado**: `.claude/scripts/test-guards-chain-data.mjs` pasa de 12 a 16 casos, cubriendo el nuevo helper centralizado y el patrón de contratos versionados DC-004.
- **ADR-003 Amendment 2**: se documenta en `docs/adoption/ADR-003-domain-aware-analyze-guard.md` el racional completo de las exenciones de dominio Data y la migración al SSOT.

## [2.25.3] - 2026-07-02

Versión PATCH: fix del deadlock de la cadena de guards PreToolUse para el flujo Smart Data.

### Fixed

- **Deadlock de cadena de guards para el flujo Smart Data**: aunque el `analyze-guard` domain-aware (ADR-003, publicado en 2.25.1) permite escribir los artefactos del flujo Data, dos guards posteriores de la cadena PreToolUse seguían bloqueando en consumidor real:
  - `asdd-pre-tool-use-artifact-name-guard.mjs` exigía naming `{run_id}-{PHASE}-{SEQ}-` sobre todo `docs/**` con 3+ segmentos.
  - `asdd-pre-tool-use-spec-size-guard.mjs` aplicaba umbrales 300 líneas / ≤5 CU / ≤1 aggregate del dominio software.

  Ambos hooks ahora eximen los artefactos `smart-data-*-{cliente}.md` por regex idéntica a `isDataArtifactFile` del analyze-guard (`/^smart-data-.+-[a-z0-9][a-z0-9_-]*\.md$/i` sobre basename) + log auditable a stderr no-bloqueante. El `analyze-guard` domain-aware sigue siendo el único gate del dominio Data (ADR-003), corre PRIMERO en la cadena y valida M1/M2/M3 contra el registry de clientes en filesystem — no se duplica la validación del Excel.

  Se agregó el harness de cadena `.claude/scripts/test-guards-chain-data.mjs` (12 casos) que ejecuta los tres hooks en secuencia para prevenir regresiones: 6 tipos de artefactos Data × cliente CON Excel → cadena verde, discovery > 300 líneas → exención Data verde, y regresiones software (sin brief / spec > 300 líneas / docs con 3+ segmentos sin naming) → los guards siguen bloqueando cuando corresponde.

  Amendment 2026-07-02 agregado a `docs/adoption/ADR-003-domain-aware-analyze-guard.md`.

## [2.25.2] - 2026-07-02

Versión PATCH: fix de distribución de la plantilla Excel del flujo Data hacia los proyectos consumidores.

### Fixed

- **Distribución de la plantilla Smart Data**: la plantilla `docs/smart-data/data/smart-data-cliente.xlsx` — publicada en 2.25.1 — no llegaba a los proyectos consumidores porque `distribution[]` en `.asdd/cli-contract.json` es una allowlist explícita y el CLI copia solo las rutas listadas (semántica "files or directories copied verbatim", soporta archivos individuales). El directorio `docs/smart-data/data/` estaba únicamente en `create_dirs` (gitkeep), lo que creaba el directorio vacío en el consumidor pero omitía la plantilla. Se agrega la ruta explícita `docs/smart-data/data/smart-data-cliente.xlsx` a `distribution[]`; el otro xlsx del template (`.claude/skills/asdd-data-governance-assessment/templates/data-dictionary-template.xlsx`) ya viajaba porque `.claude/skills/` está en la allowlist como directorio.

## [2.25.1] - 2026-07-02

Versión PATCH: fix del `analyze-guard` para el flujo Smart Data (ADR-003) y publicación de la plantilla Excel sanitizada del ciclo Data en el template.

### Fixed

- **`analyze-guard` domain-aware (ADR-003)**: el hook `asdd-pre-tool-use-analyze-guard.mjs` bloqueaba la persistencia de los artefactos del flujo Smart Data en `docs/specs/` porque exigía `brief-*.md` para toda la carpeta. Ahora es domain-aware: la ruta software sigue exigiendo `brief-*.md` (intacta), y la ruta Data acepta como equivalente-brief el Excel del cliente `docs/smart-data/data/smart-data-{cliente}.xlsx`. El matching se hace por sufijo literal `-{cliente}.md` contra los xlsx detectados en filesystem, con soporte correcto para clientes multi-palabra (`smart-data-{tipo}-acme-retail.md` matchea `smart-data-acme-retail.xlsx`). Mensajes de bloqueo M1/M2/M3 accionables con la acción exacta a ejecutar. Gap descubierto en las pruebas E2E del Caso C y confirmado con el autor de Smart Data.

### Added

- **Plantilla Excel del flujo Data** (`docs/smart-data/data/smart-data-cliente.xlsx`, 26 KB, sanitizada): 8 pestañas (Guía, Stakeholders, Propuesta, Restricciones, Fuentes, Plataforma, Diccionario, Tablas consumo) con dropdowns e instrucciones inline. Sirve como equivalente-brief del ciclo Data que copian los engagements como `smart-data-{cliente}.xlsx`.
- **Harness de tests del guard** (`.claude/scripts/test-analyze-guard-domain-aware.mjs`): 15 casos con fixtures temporales cubriendo M1/M2/M3, ruta software original, cliente multi-palabra y verificación de que la plantilla sola NO habilita la ruta Data.
- **ADR-003** (`docs/adoption/ADR-003-domain-aware-analyze-guard.md`, Aceptada): decisión formal del guard domain-aware con matriz de casos, riesgos y algoritmo de sufijo-match literal.
- **Nota SD-001** en `.claude/rules/asdd-data-workflow.md` declarando el contrato equivalente-brief del ciclo Data.

### Changed

- **`.gitignore`**: excluye `docs/smart-data/data/*.xlsx` (Excel reales de cliente contienen datos sensibles) con negación explícita `!docs/smart-data/data/smart-data-cliente.xlsx` para versionar solo la plantilla sanitizada.
- **`.asdd/asdd-smart-data.lock`**: descripción actualizada — el skeleton ya está portado al template base y las referencias en `cli-contract.json` + `sub_locks` del lock principal ya existen (validado durante el ciclo).

## [2.25.0] - 2026-07-02

Versión MINOR: integración del dominio **Smart Data ASDD** como addon opcional (`data_platform`) y refuerzo de la aislación entre routing Data y routing de arquitectura de software (ADR-002).

### Added

- **Dominio Smart Data ASDD (addon `data_platform`)**: 3 agentes (`asdd-data-architect`, `asdd-data-governance`, `asdd-data-eng-databricks`), 4 skills, 6 reglas y 5 comandos `/asdd:data-*`. Se activa por opt-in en `conditional_install` del `cli-contract.json`; deja intacto el default del template. Conteos del lock: agents 17 → 20, rules 28 → 34, skills 142 → 146, commands 35 → 40.
- **Whitelist data-driven del validador**: `.claude/scripts/validate-template.mjs` reconoce las skills y MCP servers externos del Databricks AI Dev Kit como referencias legítimas — se elimina el ruido de "referencias colgantes" en runs que activen Smart Data.
- **Docs de adopción**: `docs/adoption/ADR-002-smart-data-flow-isolation.md` (Aceptada), `docs/adoption/smart-data-integration-analysis.md` y `.claude/docs/adoption/smart-data-integration-plan.md` documentan el análisis, el plan por PRs y las decisiones de aislación del flujo Smart Data respecto del flujo de arquitectura de software.

### Changed

- **Mitigación anti-interferencia de routing (ADR-002)**: descripciones mutuamente excluyentes en los 3 pares de agentes que comparten señales — `solution-architect ↔ data-architect`, `cloud-architect ↔ data-eng-databricks`, `security ↔ data-governance` —, cada uno con triggers negativos y cross-pointer al par correspondiente.
- **Hook `asdd-user-prompt-submit.mjs`**: split del regex único en `DATA_DOMAIN_RE` y `SOFTWARE_ARCH_RE` con rama de desambiguación cuando ambos dominios matchean en el mismo prompt.
- **Reglas de routing**: `asdd-routing-heuristics.md`, `asdd-data-routing.md` y `asdd-phases-reference.md` incorporan scope-check recíproco entre los dos dominios y arbitraje explícito entre `ORC-001` (fase/complejidad ASDD) y `D0-D7` (routing Data).
- **Test de no-interferencia**: nuevo `test-smart-data-hook-no-interference.mjs` con 7 casos que verifican que el hook enruta correctamente los prompts ambiguos entre ambos dominios (7/7 PASS). Aserción T08 de `test-orc-enforcement-hooks.mjs` actualizada al comportamiento correcto tras el split de regex.

## [2.24.0] - 2026-06-26

### Removed
- **Agente `asdd-developer` genérico (#3644)**: eliminado en favor de los especializados `asdd-developer-frontend` y `asdd-developer-backend`. Lock `variants.claude.agents` 18 → 17.

### Added
- **3 docs normativos on-demand (#3644)** en `.claude/docs/`: `developer-test-protocol.md`, `clean-code-solid.md`, `stabilization-bug-rules.md` — recuperan el contenido normativo (Test Protocol PE/AVF, Clean Code & SOLID, Bug Fix Rules SBR-001..004) que vivía embebido en el agente borrado. Referenciados por path desde las skills; no se cargan always-loaded (criterio #3671).
- **Ecosistema ATF-web QA (#3673)**: port completo del stack de automatización web QA — 28 skills `asdd-atf-web-*`, 11 comandos `qa-web-*`, 5 reglas `atf-web-*`, más phase-specs y tooling asociados. Desbloquea el gate `validate-template` (skill-references) requerido para la promoción.

### Changed
- **Barrido de 135 referencias colgantes (#3644)** al developer genérico: skills normativas re-apuntadas a los nuevos docs on-demand; refs de delegación/routing re-apuntadas a `developer-frontend`/`-backend`; eval prompts + YAML, tablas de agentes y docs actualizados; fixtures de los 3 tests de hooks actualizados al nombre de agente válido.
- **Footprint always-loaded minimizado (#3671)**: contenido normativo movido fuera de agentes y rules siempre cargados, hacia docs on-demand bajo `.claude/docs/`. Los agentes ahora referencian los docs por path explícito en lugar de embeber el contenido.
- **Modelo por defecto del orquestador → opus**: `.claude/settings.json` cambia el modelo del orquestador de `claude-sonnet-4-6` a `claude-opus-4-8`, alineándolo con la estrategia de modelos del `CLAUDE.md`.

## [2.23.1] - 2026-06-23

Versión PATCH: `asdd-producto` recibe `Write` y `Edit` en su frontmatter (#3656). El agente tenía ownership del discovery funcional (#3577) pero no las write-tools — el orquestador hacía bypass manual para persistir sus specs. Fix quirúrgico elimina ese workaround.

### Fixed

- **`asdd-producto` sin write-tools (#3656):** se agregan `Write` y `Edit` al frontmatter `tools:` del agente (antes: `[Read, Grep, Glob]`; ahora: `[Read, Write, Edit, Glob, Grep]`). Producto puede escribir sus specs en `docs/specs/` directamente, sin que el orquestador use `ASDD_ORCHESTRATOR_GUARD_DISABLE`. Se agrega eval de capacidad de escritura en `agent-producto.yaml`.

## [2.23.0] - 2026-06-23

### Added
- **Hook `design-guard`** (#3648): bloquea WF-003 (diseño) sin spec aprobado de WF-002.
- **Hook `coauthorship-guard`** (#3649): rechaza `Co-Authored-By` Claude/Anthropic en commits/MRs.
- **Regla de tamaño de spec en WF-002** (#3650): >5 CU / >1 aggregate / >300 líneas → partir spec.
- **Agente `asdd-producto`** (#3577): ownership exclusivo del discovery/Analizar (RN/CU/HU); el orquestador no enruta discovery al developer.

## [2.22.0] - 2026-06-19

Versión MINOR: batch de 4 sesiones paralelas (seguridad de hooks + reglas core + roster de agentes + distribución). Counts reconciliados: agents 15→17, rules 31→35, hooks 16→17 (corrige drift pre-existente). **NOTA:** gates pendientes antes de promover a qa/main — AC4 de #3633 (`guide init` real + refinar whole-dirs), smoke de #3642 (context7 3.x), revisión de contenido de reglas y de la coexistencia developer/front/back.

### Added
- **Reglas core (#3601-#3604):** exception handling en `clean-code` + `developer-test-protocol`; nuevas reglas universales `asdd-ddd-universal`, `asdd-data-events-integrity`, `asdd-ux-universal`.
- **`asdd-data-boundary` (#3641):** contenido externo = DATA no confiable + delimitadores en skills que leen contenido externo.
- **ORC-000-C (#3647):** tras 2 fallos consecutivos del mismo agente, el orquestador re-lanza una instancia NUEVA con approach distinto + diagnóstico inyectado (preserva ORC-000/orchestrator-guard).
- **Agentes `developer-frontend` / `developer-backend` (#3644):** segmentación por capa (convenciones Guide, no tutoriales de framework).
- **Distribución por allowlist (#3633):** campo `distribution` en `cli-contract.json` reemplaza la denylist (default seguro: lo no-listado no se distribuye).
- **Progreso granular (#3645):** `.asdd-run.json` + `run-manifest` registran avance por fase para recuperación sin re-escaneo.
- **Cap de worktrees (#3643):** enforcement en `dangerous-bash` (maxTurns y spawn-depth de Task = follow-up manual/harness).

### Fixed
- **Command injection en `pre-pr-gate` (#3638, CRÍTICO):** `--target-branch` validado + migrado a `execFileSync` (sin `/bin/sh -c`).
- **Fail-closed ante JSON malformado (#3639):** los 3 hooks de seguridad (dangerous-bash, analyze-guard, pre-pr-gate) fallan cerrado (exit 2) ante stdin no-JSON; se preserva el caso de stdin vacío legítimo.
- **Fail-open en `dangerous-bash` y `analyze-guard` (#3639, CRÍTICO):** migrados de `{decision:"block"}` (no reconocido en PreToolUse) a `exit 2`.
- **Path traversal en `run-manifest` (#3640):** `run_id` validado (sin `..` ni separadores).
- **Pin de `context7` (#3642):** `@^1`/`@latest` → `@3.2.1`.
- **least-privilege de agentes (#3619):** ajustes en `researcher`, `cloud-architect`, `atf-api-qa-engineer`.
- **Guardia NaN en cap de worktrees (#3643):** `ASDD_MAX_WORKTREES` mal formado cae al default 3 en vez de desactivar el cap.
- **`unit-test-design` (#3614):** movido al `developer` + renombrado `asdd-unit-test-design`.
- **istqb scope (#3646):** nota de separación de capas vs skills ATF.
- **code-review standards (#3620/#3621):** `docs/tech` + citar reglas core.

### Changed
- **Model de `asdd-atf-reporting-qa-engineer` (#3618):** haiku → sonnet (el agente evalúa Quality Gate Score).
- Lock reconciliado por el integrador tras mergear las 17 MRs de las 4 sesiones: agents 15→17, rules 31→35, hooks 16→17.

## [2.21.1] - 2026-06-19

Versión PATCH: el payload de `guide init`/`upgrade` ya no distribuye documentación de desarrollo/soporte del propio template al repo del consumidor (#3633, reporte de Pipe). Quick-fix por denylist; la solución estructural (allowlist `distribution`) queda en #3633.

### Fixed

- **Fuga de artefactos de desarrollo del template al repo del usuario (#3633):** se agregan a `clean.files_to_remove` del `cli-contract.json` ocho rutas internas del mantenedor que no deben llegar al proyecto consumidor: `docs/architecture/decisions/ADR-001-orc-enforcement-3-tiers.md`, `docs/runs/`, `.asdd-run.json`, `.claude/evals/`, `ASDD-MEMORY.md`, `ASDD-VERSIONING.md`, `docs/adoption/cli-integration-guide.md`, `docs/adoption/contract-spec.md`.

## [2.21.0] - 2026-06-18

Versión MINOR: enforcement de reglas ORC en 3 tiers mecánicos (#3607) y endurecimiento del ORC-000 a deny incondicional (#3606).

### Added

- **Enforcement ORC 3 tiers (#3607):**
  - **Tier A — gate mecánico:** hook `asdd-orchestrator-guard` pasa a deny incondicional en Edit/Write del hilo orquestador + ask en Bash; nuevo hook `asdd-plan-gate` implementa ORC-010 como gate ask sobre la tool Agent (marcador + TTL, consumo único por invocación). Escape hatch auditable: `ASDD_GUARD_PUSH_DISABLE=1` / `ASDD_PLAN_GATE_DISABLE=1`.
  - **Tier B — reminders conductuales:** `asdd-session-start` re-inyecta al inicio de sesión el checklist completo de las 24 reglas ORC + política de compactación proactiva; `asdd-user-prompt-submit` refuerza el núcleo conductual (ORC-000, ORC-001, ORC-007, ORC-008, ORC-010) por prompt.
  - **Tier C — estado computado:** 4 hooks SessionStart dedicados: `asdd-codebase-size` (ORC-001-D), `asdd-model-strategy` (ORC-002-B), `asdd-tdd-state` (ORC-009), `asdd-state-freshness` (ORC-007).
- **Regla `asdd-orchestration-index.md`**: índice canónico de las 24 reglas ORC (tabla tier A/B/C, archivos fuente, mapa de hooks de enforcement). Inyectado por `session-start` como referencia única.
- **`ADR-001-orc-enforcement-3-tiers.md`**: decisión arquitectónica documentando la estrategia de 3 tiers y sus trade-offs.
- **`.claude/docs/adoption/statusline.md`**: guía para leer el statusline de contexto de Claude Code (umbrales de compactación, acciones por tier de uso).

### Changed

- **`worktree.baseRef=head`** en `settings.json`: los worktrees de agentes arrancan desde HEAD en vez del commit base, garantizando que el developer arranque con los cambios más recientes del ciclo.
- **ORC-000 deny incondicional (#3606):** `asdd-orchestrator-guard` cambia de deny-condicional a deny absoluto sobre Edit/Write del orquestador principal; el ask sobre Bash se mantiene para comandos de estado (git, gh). Enforcement demostrado en vivo con evidencia de comportamiento.

### Fixed

- **Conflict marker huérfano en `CLAUDE.md`** eliminado: un marcador de conflicto residual en el cuerpo del archivo fue detectado y removido sin afectar contenido semántico.

## [2.20.0] - 2026-06-18

Versión MINOR: absorción del batch Humana #3536 (20 skills universales adaptadas a ASDD-native) más el polish del batch de reglas #3535. Validador del template verde para los cambios (counts, naming-convention, artifact-naming-convention).

### Added

- **20 skills universales (#3536)** adaptadas desde el repo fuente Humana a versiones ASDD-native (sin referencias Humana, parametrizadas, ancladas en reglas reales GS/SBR/ORC/WF/CORE/AL/DEF y registradas en el frontmatter de su agente dueño + tabla del CLAUDE.md):
  - **tech-lead (9)**: new-bug, artifact-audit, commit, delivery-report, pre-push, impl-quality-gate, sdd-traceability, gitflow, integration-validator
  - **developer (5)**: bug-fix, merge-conflicts, safe-refactor, build-validator, continuous-improver
  - **producto (2)**: new-hu, story-planner
  - **solution-architect (3)**: diagrams, cross-impact, resilience-auditor
  - **atf-api-qa-engineer (1)**: unit-test-design

### Changed

- **`build-validator` (#3583)**: detección de stack mínima y agnóstica — solo presencia de config (`package.json`/`pom.xml`/`build.gradle`/`go.mod`/`*.csproj`/`Cargo.toml`/`pyproject`); el comando proviene siempre de `.asdd/testing-capabilities.yaml`, sin lógica per-stack en el core.
- **Umbral de complejidad ciclomática unificado en CC ≤ 10** (polish #3535): `asdd-clean-code.md` se alinea al quality-gate del tech-lead (antes declaraba ≤15) y a su espejo de eval.
- **Conteo de skills en el lock**: 94 → 114.

### Fixed

- **`hooks-executable`**: restaurado el bit ejecutable (`100644 → 100755`) de `asdd-user-prompt-submit.mjs`.

### Removed

- **`checkpoint-resume` (#3564) descartado**: la función la cubre el comando `/asdd:resume` y su regla `asdd-checkpoint-resume.md`.

## [2.19.0] - 2026-06-16

Versión MINOR del rework ampliado de #3577 (+ #3524/#3598) que cierra bugs de Javier #3 (delegación genérica), #4 (arquitecto no se activa), #8 (orquestador consulta Figma directo), #12 y #13 (plan-gate / tono imperativo), más el fix #2 (alias de agente desactualizados en comandos de fase): hook SessionStart (ORC-000 enforcement), señales expandidas en WF-001 (#3598), validación de contenido del plan en ORC-010 y delegación pura forzada en ORC-000.

Estado de los evals (Claude Code provider, `--no-cache`):
- **Delegación + plan-gate (8/8)**: `orc-000-figma-delegation.yaml` 6/6 y `orc-010-plan-gate.yaml` 2/2. En la corrida combinada, bug#2 (orc-000) y bug#13 (orc-010) salieron rojos de forma intermitente — bug#2 por variabilidad del LLM (el orquestador pidió contexto sin anunciar la delegación) y bug#13 por un fallo de extracción de JSON del grader, no de contenido; ambos PASS al reaislarse. Sistema de routing verificado correcto en `system-orchestrator.txt` (líneas 69-70).
- **No-regresión `wf-001-specify.yaml`: 5/6** (umbral ≥5/6 cumplido). El único FAIL es matiz de rúbrica en el caso multi-plataforma: el arquitecto SÍ se activa (objetivo de #3598 cumplido), pero lo clasifica como "obligatorio" en paso final en vez de "soporte condicional" temprano. No es regresión.

### Added

- **Hook `asdd-session-start`** (#3524): hook SessionStart que inyecta estado git (rama, GS-004 naming, working tree) y recordatorio de routing ORC-000 como `<system-reminder>` al inicio de cada sesión. Escape hatch: `ASDD_SESSION_START_DISABLE=1`.

- **Hook `asdd-user-prompt-submit.mjs`** (#3577): hook UserPromptSubmit que refuerza el routing ORC-000 / plan-gate ORC-010 al enviar cada prompt.

- **Smoke test `test-session-start-hook.mjs`** (#3524): 7 escenarios — exit 0, ORC-000 ACTIVO en stdout, naming GS-004, rama protegida, working tree sucio, DISABLE var, detached HEAD. 16 aserciones, sin dependencias externas.

- **Eval `orc-000-figma-delegation.yaml`** (#3577): 6 casos de prueba — URL Figma delegada a asdd-ui (#8/#4), plan con orquestador consultando Figma directamente (inválido, #8/#12), plan con paso sin agente (gate rechaza, #12), integración Redshift activa arquitecto (#4), tarea de dominio NO-Figma (endpoint) delega a asdd-developer (#3), y decisión arquitectónica/ADR delega a asdd-solution-architect (#2). 6/6 PASS (bug#2 intermitente en corrida combinada).

- **Eval `orc-010-plan-gate.yaml`** (#3577): 2 casos de prueba — feature nueva exige plan + aprobación antes de ejecutar (#12) y tono imperativo ("hazlo ya") NO desactiva el gate (#13). 2/2 PASS (bug#13 intermitente por glitch del grader en corrida combinada).

### Changed

- **Comandos de fase: alias de agente corregidos** (fix #2 / #3577): `design.md` y `document.md` usaban alias cortos desactualizados (`architect`, `ux-ui`, `tech-lead`) que no resolvían al agente real. Corregidos a `@asdd-solution-architect`, `@asdd-ui` y `@asdd-tech-lead`. **Fix #2 (alias arquitecto): corregido.**

- **WF-001 señales del arquitecto expandidas** (#3598): `asdd-solution-architect` ahora se activa también con "nueva API / diseño de API", "decisión de stack o tecnología", "multi-plataforma (mobile + web / multi-canal)", "microservicios", "nuevo servicio backend", "arquitectura del sistema". Cubre bug #4 de Javier.

- **WF-003 señal Figma para asdd-ui** (#3577): URL de Figma agregada como primera señal explícita de activación de asdd-ui. Cubre bug #8.

- **ORC-000 enforcement obligatorio** (#3577): "Aplica en TODO momento — incluida la fase de planeación". Protocolo de excepción etiquetada `EXCEPCIÓN ORC-000 (orquestador)`. ORC-000-B renombrado a "SIN FALLBACK SILENCIOSO" con logging en `.asdd-run.json`. Cubre bugs #3 y #8.

- **ORC-010 validación de contenido del plan** (#3577): checklist V1-V5 que el orquestador aplica ANTES de presentar el plan al usuario. Gate rechaza planes con pasos sin agente responsable (AC6) y exige aprobación antes de ejecutar incluso ante tono imperativo. Cubre bugs #12 y #13.

## [2.18.0] - 2026-06-16

Versión MINOR que absorbe 4 reglas de calidad de código de Humana al core del template ASDD:
clean-code, system-integrity, claude-md-maintenance y spanish-orthography.
Parte del gulpito 3 de US #3535 (batch B).

### Added

- **Regla `asdd-clean-code`** (#3546): estándares SOLID + Clean Code obligatorios — DIP, SRP, OCP, LSP, ISP; naming, CC ≤ 15, nesting ≤ 2, no magic numbers, Boy Scout Rule.
  Generalizado desde Humana: eliminados refs a sonar-quality-rules.md y quality-rules.md internos; coverage thresholds delegados al CLAUDE.md del proyecto consumidor; `@continuous-improver` → `asdd-tech-lead`.

- **Regla `asdd-system-integrity`** (#3547): zero regresiones — compilación limpia, tests de módulos afectados y consumers (Dependent Module Testing), no tolerar tests fallidos como "preexistentes", investigar flakiness.
  Generalizado desde Humana: comandos de build/test genéricos (via testing-capabilities.yaml); scripts de detección con `rg` agnóstico en lugar de paths hardcoded de Humana; `@architect`/`@tech-lead` → `asdd-solution-architect`/`asdd-tech-lead`.

- **Regla `asdd-claude-md-maintenance`** (#3548): gobernanza de CLAUDE.md — qué va, límite de líneas (~150), triggers obligatorios por tipo de cambio, auditoría de drift.
  Generalizado desde Humana: eliminada arquitectura canónica monorepo (claude-context/back/, pointer files, generate-claude-pointers.sh); agentes Humana → `asdd-developer` / `asdd-tech-lead`; triggers generalizados por tipo de artefacto.

- **Regla `asdd-spanish-orthography`** (#3549): zero tolerancia en ortografía española de textos visibles al usuario — tildes obligatorias, signos dobles (¿? ¡!), actualización de tests junto con el texto.
  Generalizado desde Humana: `humanatech-guideai-back/front` → backend/frontend genérico; anotaciones y schemas de validación con ejemplos agnósticos; eliminados refs a docs internas de Humana.

- **Evals** (×4): 3 tests por regla con `llm-rubric` y system prompt dedicado. 12 tests total — 3/3 PASS por regla.

## [2.17.0] - 2026-06-16

Versión MINOR que absorbe 4 reglas universales de Humana al core del template ASDD:
skill-preflight, ephemeral-artifacts, istqb-quality-culture y developer-test-protocol.
Parte del gulpito 3 de US #3535.

### Added

- **Regla `asdd-skill-preflight`** (#3542): bloque PRE-FLIGHT estándar para skills
  que crean o modifican archivos — verifica rama protegida, baseline verde y duplicados.
  Generalizado desde Humana: ramas configurables via `ASDD_PROTECTED_BRANCHES`.
- **Regla `asdd-ephemeral-artifacts`** (#3543): protocolo de manejo de scripts
  temporales — zona `.tmp/`, salvaguardas de no-borrado y verificación pre-push.
  Generalizado desde Humana: paths específicos del proyecto reemplazados por genéricos.
- **Regla `asdd-istqb-quality-culture`** (#3544): 7 principios ISTQB v4.0 y gestión
  de defectos (severidad/prioridad/reporte mínimo). Generalizado desde Humana: refs al
  SDD Pipeline reemplazadas por ASDD, agentes Humana por ASDD.
- **Regla `asdd-developer-test-protocol`** (#3545): Test Coverage Declaration
  obligatoria antes de codear, CASO A (con spec) y CASO B (self-derived), tabla de mínimos
  por componente. Generalizado desde Humana: agentes específicos → `asdd-developer`,
  thresholds de coverage → parámetros del proyecto consumidor.
- **Evals 6-rules/skill-preflight** (#3542): 3 tests — rama protegida bloqueante, baseline
  roto bloqueante, scope declaration para skills read-only.
- **Evals 6-rules/ephemeral-artifacts** (#3543): 3 tests — crear en .tmp/, no borrar
  trackeados, verificación pre-push con archivos mixtos.
- **Evals 6-rules/istqb-quality-culture** (#3544): 3 tests — corregir "no hay bugs",
  clasificar defecto de seguridad, shift-left en workflow ASDD.
- **Evals 6-rules/developer-test-protocol** (#3545): 3 tests — bloquear sin Test Coverage
  Declaration, CASO B self-derived con PE+AVF, GAP bloqueante al final.

## [2.16.0] - 2026-06-12

Versión MINOR que hace determinística la generación de gaps y specs en la fase Analizar:
umbral cuantificable de gaps, guard de prerrequisitos mecánico y criterio de granularidad
por bounded context.

### Added

- **Hook `asdd-pre-tool-use-analyze-guard`** (#3575): guard mecánico (PreToolUse)
  que bloquea escrituras en `docs/specs/**` si no existe `brief-*.md` con
  `Estado: aprobado` en ese directorio. Habilitado por defecto. Escape hatch:
  `ASDD_ANALYZE_GUARD_ENABLED=false`.
- **Evals `analyze-determinism`** (#3575): 4 tests que cubren umbral de gaps (con y sin
  gaps), guard de prerrequisito bloqueante y granularidad de artefactos por bounded
  context.

### Changed

- **Comando `asdd:analyze`** (#3575): prerrequisito actualizado a BLOQUEANTE con
  instrucción explícita de STOP y referencia al hook. Sección "Cierre de fase" reemplazada
  por umbral binario (≥ 2 preguntas abiertas → `gaps-{feature}.md`; < 2 → sección
  `## Observaciones de análisis` en el spec). Nueva regla de granularidad: un spec por
  funcionalidad acotada, cardinalidad decidida por el sistema. Artefactos actualizados:
  `gaps-{feature}.md` solo si umbral se supera.
- **Regla `asdd-workflow`** (#3575): WF-002 incluye prerrequisito bloqueante, umbral
  de gaps y criterio de granularidad; artefactos y criterio de completitud actualizados
  para reflejar la condicionalidad del gaps file.

## [2.15.0] - 2026-06-12

Versión MINOR que implementa el protocolo completo de handoff de worktrees para
`asdd-developer`, habilitando paralelismo real entre implementaciones independientes.

### Added

- **Regla `asdd-orchestration-worktree`** (#3578): protocolo ORC-011 de handoff
  de resultados de `asdd-developer` cuando corre con `isolation: worktree`.
  Incluye: detección de campos `WORKTREE COMMIT`/`Files`/`Branch` en el output del
  agente, validación de tests pre-merge (ORC-011-C), merge secuencial con `--no-ff`
  (ORC-011-D), STOP ante conflictos, task partitioning pre-check para N developers
  en paralelo (ORC-011-A), limpieza post-merge (ORC-011-E) y tabla de recuperación
  ante errores (ORC-011-F).

### Changed

- **Agente `asdd-developer`** (#3578): nueva sección "Cierre obligatorio en
  worktree" — el agente DEBE hacer `git add -A && git commit` antes de retornar e
  incluir en su output los tres campos `WORKTREE COMMIT: {sha7}`, `Files:` y
  `Branch:`. Sin estos campos el orquestador detecta que el worktree fue destruido
  automáticamente (cambios perdidos) y reinvoca al developer.
- **Regla `asdd-orchestration-ops`** (#3578): ORC-005 refiere a ORC-011 para
  el handoff de results de developers con worktree.
- **Regla `asdd-anti-loops`** (#3578): sección Worktrees documenta la ruta de
  éxito vía ORC-011, diferenciando el caso de commit exitoso del caso de worktree
  destruido automáticamente.
- **Regla `asdd-workflow-build`** (#3578): WF-004 incluye guidance de
  paralelismo de developers con requisito de task partitioning pre-check (ORC-011-A).

## [2.14.2] - 2026-06-12

Versión PATCH que limpia el payload distribuido del template: elimina artefactos
internos del mantenedor que no deben llegar a proyectos consumidores, y hace el
contrato CLI explícito con una whitelist en `files_to_remove`.

### Fixed

- **Payload distribuido** (#3576): eliminados del template los artefactos que no
  deben distribuirse a proyectos consumidores:
  - `.claude/memory/git-rebase-perdida-codigo.md` y
    `.claude/memory/git-una-rama-por-ciclo.md` — memorias internas del mantenedor
    sin nomenclatura `asdd-*`.
  - `docs/architecture/decisions/ADR-001-codebase-size-autodetection.md` — ADR
    interno de implementación que causaba colisión de numeración en proyectos que
    ya tenían su propio `ADR-001` (como Javier).
  - `.claude/docs/migrations/` — guías de migración MAJOR relevantes solo para el
    mantenedor del template.

### Changed

- **`cli-contract.json`** (#3576): `files_to_remove` ahora lista explícitamente
  los 4 artefactos eliminados. Esto permite que `guide update` limpie
  instalaciones existentes automáticamente. Eliminada entrada `remove-migration-guides`
  de `optional_remove` (la carpeta ya no existe en el template).

### Cleanup para instalaciones existentes

Si ya tenías el template instalado antes de v2.14.2, ejecutar:

```bash
# Desde la raíz del proyecto consumidor
git rm -f .claude/memory/git-rebase-perdida-codigo.md \
          .claude/memory/git-una-rama-por-ciclo.md 2>/dev/null || true
git rm -f docs/architecture/decisions/ADR-001-codebase-size-autodetection.md 2>/dev/null || true
git rm -rf .claude/docs/migrations/ 2>/dev/null || true
git commit -m "chore: eliminar artefactos internos del template (v2.14.2)"
```

Si usás `guide update`, el CLI aplica `files_to_remove` automáticamente.

## [2.14.1] - 2026-06-12

Versión PATCH que corrige el hook `pre-pr-gate`: ahora permite crear MRs de
promoción entre ramas protegidas (dev→qa, qa→main) sin requerir el workaround
`glab api`. Cierra el bloqueo documentado en GS-009.

### Fixed

- **Hook `asdd-pre-pr-gate`** (#3567): fast-track para MRs de promoción
  entre ramas protegidas. Cuando fuente y destino son ambas ramas protegidas y
  distintas (ej. dev→qa, qa→main, dev→main), el gate omite las validaciones
  1 (fuente no protegida) y 2 (naming GitFlow) — que no aplican a ramas de
  promoción — y solo verifica que haya commits nuevos que mergear. Los MRs
  desde feature branches hacia ramas protegidas mantienen el comportamiento
  original sin cambios.

## [2.14.0] - 2026-06-12

Versión MINOR que incorpora dos reglas de higiene de memoria del programa de absorción
Humana→ASDD, más una aclaración de ownership de la política de token budget.

### Added

- **Regla `asdd-memory-hygiene`** (US #3535, Task #3540): sistema de dos
  capas de memoria (equipo git-committed + personal local), protocolo de promoción
  de lecciones con criterios de ≥2 sesiones y ausencia de datos sensibles, política
  de archivado por tipo, formato de session handoff y declaración de contexto por
  agente. Generalizada desde Humana; paths y referencias de dominio reemplazados
  por equivalentes ASDD.
- **Regla `asdd-memory-privacy`** (US #3535, Task #3541): convención
  `<private>` para datos en sesión que no deben persistir, tabla de categorías
  prohibidas en `memory/` (credenciales, hosts de producción, tokens JWT, PII,
  datos de clientes) y punto de extensión para categorías sensibles específicas
  del dominio del proyecto consumidor. Absorbida tal cual desde Humana con
  generalización de ejemplos de dominio.

### Changed

- **Regla `asdd-anti-loops`**: declarado `asdd-meta` como dueño
  autoritativo de la política de token budget. Los umbrales de compactación
  proactiva ahora referencian explícitamente a `asdd-meta` como árbitro ante
  divergencias con otras reglas (ej. `asdd-orchestration-ops.md`).

## [2.13.0] - 2026-06-11

Versión MINOR que incorpora dos reglas universales del programa de absorción
Humana→ASDD: estabilización de bugs y control de bucles de agentes.

### Added

- **Regla `asdd-stabilization-bug-rules`** (US #3535, Task #3538):
  cuatro principios para la fase de estabilización — Think Before Coding
  (SBR-001), Simplicity First (SBR-002), Surgical Changes (SBR-003) y
  Goal-Driven Execution (SBR-004). Incluye protocolo de test reproducible
  obligatorio, diagnóstico read-only, impact map, scope declaration, coverage
  gate agnóstico de stack y checklist de bugs que los agentes introducen.
  Generalizada desde Humana; refs a agentes y stacks específicos reemplazados
  por equivalentes ASDD.
- **Regla `asdd-anti-loops`** (US #3535, Task #3539): circuit-breaker
  de dos intentos con cambio de estrategia obligatorio, presupuesto de turnos
  por agente ASDD (AL-001..AL-008), supervisión de worktrees, patrón de token
  management de 3 capas (Grep→Glob→Read) y umbrales de compactación proactiva.
  Generalizada desde Humana; tabla de agentes y referencias a reglas
  actualizadas al roster ASDD.

## [2.12.1] - 2026-06-11

Versión PATCH que amplía la defensa en profundidad del template: deny-list más abarcadora y guardia de validación para settings.local.json.

### Added
- **Check 18 `settings-local-not-tracked`** (#3517): el validador `validate-template.mjs` falla con `error` si `.claude/settings.local.json` está trackeado en git — previene que configuración local del developer (permisos, paths de ambiente) se distribuya en un release. Inspirado en el incidente del commit `7cd7db6`.

### Changed
- **Deny-list ampliada** (#3517): `.claude/settings.json` pasa de 7 a 18 patrones de denegación automática:
  - `rm -rf:*` y `rm -fr:*` — cubre variantes de orden de flags
  - `git push --force:*` y `git push -f:*` — deniega el shorthand `-f`
  - `git reset --hard:*` — patrón genérico (reemplaza las dos entradas específicas previas)
  - `npm publish:*` — bloquea publicaciones no autorizadas a npm
  - `Write(.env*)` / `Edit(.env*)` y sus variantes `**/.env*` — protege archivos de credenciales
  - `Write(azure-pipelines*)` / `Edit(azure-pipelines*)` y sus variantes — protege pipelines de CI/CD
  - `Write(.claude/settings.json)` / `Edit(.claude/settings.json)` — auto-protección del archivo de permisos

## [2.12.0] - 2026-06-11

Versión MINOR que incorpora reglas de seguridad Git como ciudadanas de primera clase del template ASDD.

### Added

- **Regla `asdd-git-safety`** (#3515): normas GS-001..GS-007 que formalizan el contrato git del template — protección de ramas protegidas (GS-001), historia inmutable sin force push ni reset --hard (GS-002), commits solo con autorización explícita (GS-003), naming GitFlow (GS-004), conventional commits (GS-005), una rama por ciclo de cambio (GS-006) y sincronización con merge --no-ff, nunca rebase (GS-007).
- **Hook `asdd-guard-branch`** (#3515): hook `PreToolUse` (matcher: Bash) que bloquea mecánicamente `git commit` en ramas protegidas (exit 2). Ramas configurables vía `ASDD_PROTECTED_BRANCHES` (default: `main,master,qa,dev,develop`). Escape hatch auditable: `ASDD_GUARD_BRANCH_DISABLE=1`.
- **Memorias de equipo** (#3515): `.claude/memory/git-rebase-perdida-codigo.md` y `.claude/memory/git-una-rama-por-ciclo.md` — dos anti-patrones documentados con contexto real de incidentes. Registradas en `ASDD-MEMORY.md`.

## [2.11.0] - 2026-06-09

Versión MINOR que consolida la línea de producción tras extraer el SPDD (Canvas integration) a una rama independiente, e incorpora utilidades de gestión del template y de arquitectura.

### Added

- **Comandos de gestión del template** (#3491): `/asdd:add-agent` y `/asdd:add-skill` — creación controlada de agentes y skills ASDD respetando convención de nomenclatura y contadores del lock.
- **Skill `asdd-tech-lead-create-mr`** (#3492): creación de MRs/PRs estilo Guide, sin atribución de IA, con conventional commits.
- **Hook + skill `dep-audit`** (#3493): `asdd-pre-tool-use-dep-check.mjs` + `asdd-solution-architect-dep-audit` — el arquitecto valida dependencias antes de agregarlas.

### Changed

- **Rename `asdd-architect` → `asdd-solution-architect`** (agente y sus 9 skills). Los proyectos consumidores que referencien el nombre viejo deben actualizar a `solution-architect`. El skill ADR conserva su comportamiento; solo cambia el prefijo del agente y sus skills.

### Removed

- **SPDD (Canvas integration) extraído de la línea de producción.** El SPDD nunca formó parte de una versión documentada (≤2.9.0 no lo incluían); se preserva en la rama `feat/spdd` para iteración independiente y no se distribuye vía `guide update`/`upgrade`.

## [2.10.0] - 2026-05-29

Versión MINOR que incorpora los agentes UX y UI como ciudadanos de primera clase del ciclo ASDD.

### Added

- **`asdd-ux`** — agente UX transversal (UX Research, Information Architecture, Storytelling ejecutivo). Participa en Analizar, Diseñar, Construir, Verificar y Documentar. Skills: `ux-context-core`, `ux-gap-auditor`, `ux-desk-researcher`, `ux-research-instruments`, `ux-qualitative-synthesizer`, `ux-flows-builder`, `ux-executive-storytelling`.
- **`asdd-ui`** — agente UI hi-fi (componentes finalizados, design tokens, integración Figma, auditoría de diseño). Reemplaza al legacy `asdd-ux-ui`. Skills: `ui-hifi-builder`, `ui-figma-impl`, `ui-design-tokens`, `ui-ux-content`, `ui-motion`, `ui-accessibility`, `ui-responsive`, `ui-design-audit`.
- **WF-003 a WF-006** actualizados con la participación formal de UX y UI por fase.

## [2.9.0] - 2026-05-27

Versión MINOR que incorpora el framework ATF API (Agentic Testing Framework for APIs) como ciudadano de primera clase del ciclo ASDD.

### Added

- **`asdd-atf-api-qa-engineer`** — nuevo agente primario de QA API Pipeline Lead. Reemplaza `asdd-qa-engineer`. Participa en Diseñar (primario — plan de pruebas ISTQB, análisis de contrato OpenAPI), Construir (primario — automatización Playwright/Newman), Verificar (primario — ejecución de suite, clasificación de defectos) y Documentar (soporte).
- **`asdd-atf-reporting-qa-engineer`** — nuevo agente primario de QA Report Lead. Participa en Verificar (primario — evaluación QGS, sign-off formal) y Documentar (primario — reporte HTML/MD, backlog Jira/ADO).
- **32 skills ATF API** bajo `.claude/skills/asdd-atf-api-*/`:
  - Shared: `shared-config-loader`, `shared-checkpoint-manager`, `shared-rate-limit-protocol`, `shared-evidence-collector`, `shared-knowledge-base-writer`
  - Bootstrap: `orchestrator-run-bootstrap`, `work-item-partitioner`, `dependency-mapper`, `manifest-writer`
  - Analyze: `step-1-hu-parser`, `acceptance-criteria-normalizer`, `gap-detector`, `step-2-openapi-parser`, `contract-hasher`, `contract-delta-detector`
  - Design: `step-3-istqb-test-techniques`, `risk-scorer-api`, `step-4-test-case-designer`, `test-data-generator-api`, `gherkin-writer-api`
  - Automate: `step-5-bun-runner-setup`, `playwright-api-scaffolder`, `newman-bridge`, `security-owasp-api-checks`, `zap-runner`, `performance-k6-script-generator`, `perf-threshold-evaluator`
  - Execute: `step-6-execution-runner`, `failure-classifier`
  - Reporting: `reporting-qgs-evaluator`, `reporting-report-renderer`, `reporting-backlog-sync`
- **5 reglas ATF API** bajo `.claude/rules/asdd-atf-api-*.md`:
  - `asdd-atf-api-qa-orchestration` — ORC-000 a ORC-030, ciclo completo ATF
  - `asdd-atf-api-qa-checkpoint-resume` — CHKPT-001 a CHKPT-007, resiliencia de corridas
  - `asdd-atf-api-qa-rate-limit-protocol` — RL-001 a RL-005, pausa ordenada ante rate limit
  - `asdd-atf-api-qa-routing-light-vs-full` — taxonomía LIGHT/FULL para corridas ATF
  - `asdd-atf-api-qa-defect-classification` — DEF-001 a DEF-007, taxonomía de defectos
- **11 comandos QA** bajo `.claude/commands/asdd/qa-*.md`: `qa-bootstrap`, `qa-analyze`, `qa-design`, `qa-automate`, `qa-execute`, `qa-report`, `qa-resume`, `qa-regression`, `qa-fast-track`, `qa-retest`, `qa-do`.
- **`.asdd/asdd-atf.lock`** — lock file específico de QA: estrategia de modelos por fase ATF, configuración de checkpoint, taxonomía de defectos y routing. Complementa `asdd.lock` sin duplicar sus campos.
- **Rutas de artefactos ATF unificadas** bajo estructura ASDD: `docs/testing/atf/{run_id}/` (automation, execution, knowledge) y `docs/qa/atf/{run_id}/` (reporte final, QGS, backlog).
- **ORC-009** actualizado para forward del estado TDD a `asdd-atf-api-qa-engineer` (reemplaza `asdd-qa-engineer`).
- **WF-003, WF-004, WF-005, WF-006** actualizados con participación formal de los nuevos agentes ATF.
- **CORE-008** actualizado: sign-off formal = veredicto PASS de `asdd-atf-reporting-qa-engineer` en `docs/qa/atf/{run_id}/qgs-evaluation.json`.

### Removed

- **`asdd-qa-engineer`** — agente reemplazado por `asdd-atf-api-qa-engineer` y `asdd-atf-reporting-qa-engineer`. Skills eliminados: `asdd-qa-engineer-test-strategy`, `asdd-qa-engineer-e2e-test`, `asdd-qa-engineer-coverage`, `asdd-qa-engineer-regression`.

### Changed

- **`asdd.lock`**: `agents` 13→14, `skills` 51→79, `rules` 11→16, `commands` 10→21.
- **`CLAUDE.md`**: tabla de agentes, tabla de skills y estructura `docs/` actualizados para reflejar los nuevos agentes y rutas ATF.
- **`asdd-phases-reference.md`**: tabla de fases actualizada con participación de los nuevos agentes ATF en Diseñar, Construir, Verificar y Documentar.

## [2.8.0] - 2026-05-23

Versión MINOR que agrega visibilidad completa del orquestador y pre-execution plan gate.

### Added

- **ORC-008 — Visibilidad de agentes e identidad del orquestador**: cada acción
  visible en la conversación debe identificar quién la ejecuta. Formato de anuncio
  estandarizado para agentes (`→ **@asdd-{nombre}**`) y para el orquestador
  (`→ **Orquestador ASDD**`). Prohibición explícita del agente built-in `Explore`
  en favor de `asdd-explorer`.
- **ORC-010 — Pre-execution plan gate**: el orquestador presenta un plan explícito
  antes de ejecutar comandos CLI potencialmente destructivos o de alto impacto,
  requiriendo confirmación del usuario antes de proceder.

### Fixed

- **Validador `no-hardcoded-paths`**: excluye directorios de memoria (`.claude/agent-memory/`,
  `.engram/`) y auto-referencias del propio script para evitar falsos positivos.

## [2.7.1] - 2026-05-14

Versión PATCH que corrige rutas de hooks que fallaban por CWD drift.

### Fixed

- **Rutas de hooks en `settings.json`** — los tres comandos de hook ahora usan
  `node $CLAUDE_PROJECT_DIR/.claude/hooks/...` en lugar de rutas relativas. Las
  rutas relativas se rompían cuando el CWD de Claude Code derivaba tras un `cd`
  en el Bash tool, produciendo el error `PreToolUse:Bash hook error — .claude/hooks/...: not found`.
- **`logPath` en `asdd-post-subagent-stop.mjs`** — resuelto con
  `process.env.CLAUDE_PROJECT_DIR || process.cwd()` para garantizar que
  `audit-log.jsonl` siempre se escriba en la raíz del proyecto correcto.

## [2.7.0] - 2026-05-14

Versión MINOR que agrega salida estructurada JSON al validador de template,
permitiendo que herramientas externas (como `guide init`) consuman los
hallazgos de forma programática.

### Added

- **Flag `--json` en `validate-template.mjs`** — cuando se pasa `--json`,
  el script emite un array JSON a stdout con los hallazgos del validador;
  cada ítem incluye `path`, `issue` y `required` (boolean). El texto
  legible por humanos va a stderr para no contaminar la salida JSON.
- **Backward compatibility** — sin el flag `--json`, el comportamiento es
  idéntico al anterior (texto a stdout). No es un breaking change.
- **Función `extractPath`** — parsea el patrón `"rel/path — descripción"`
  de cada hallazgo para extraer el path limpio que se incluye en el JSON.

### Changed

- **`guide init` consume `--json`** — el CLI inyecta el flag al invocar
  el validador post-instalación, parsea el JSON y presenta los hallazgos
  en secciones `[REQUIRED]` / `[OPTIONAL]` con cabeceras "Must fix" /
  "Can fix later" y un bloque "Next steps". Fallback a texto plano si el
  output no es JSON válido.

## [2.6.1] - 2026-05-13

Versión PATCH que resuelve la colisión de responsabilidades de diagramación
entre `asdd-architect` y `asdd-cloud-architect`, define el
ownership exclusivo del C4 Deployment Diagram en el cloud-architect e
incorpora soporte para iconografía oficial de proveedores cloud.

### Added

- **Iconografía oficial por proveedor** en `cloud-architect-design` — links a
  AWS Architecture Icons, Google Cloud Icons y Azure Architecture Icons con
  convenciones de uso en Excalidraw (colores de marca, etiquetado, regla de
  no mezclar proveedores).
- **Protocolo de selección de tipo de diagrama** en `cloud-architect-design` —
  cuando se solicita un diagrama de infraestructura, el agente pregunta si se
  quiere: (1) C4 Deployment Diagram, (2) diagrama cloud tradicional con
  iconografía oficial, o (3) ambos.
- **Naming convention para Excalidraw** — `cloud-{provider}-{feature}-{YYYYMMDD-HHmmss}.excalidraw`
  con timestamp para diferenciar versiones; también se exporta `.png`.
- **C4 Deployment Diagram con ejemplo Mermaid** en `cloud-architect-design` —
  ownership explícito declarado en el skill; incluye ejemplo completo con
  `C4Deployment`, `Deployment_Node`, `Container` y `ContainerDb`.
- **Tabla de routing de diagramas en WF-003** (`asdd-workflow.md`) —
  separación clara de responsabilidades: C4 L1/L2/L3 de aplicación →
  `architect-component-diagram`; C4 Deployment + diagramas cloud →
  `cloud-architect-design`.
- **Regla de routing de diagramas** en `asdd-routing-heuristics.md` —
  tabla con keywords que disparan `cloud-architect` como primario (VPC, EKS/AKS/GKE,
  RDS, regiones, "deployment diagram", iconografía oficial) y protocolo de
  pregunta para requests ambiguos con "diagrama C4".
- **Triggers explícitos para diagramas** en el agente `asdd-cloud-architect` —
  "diagrama de infraestructura cloud", "C4 Deployment Diagram" e "iconografía
  oficial" como señales de activación; naming convention y checklist actualizado.

### Changed

- **`cloud-architect-design/SKILL.md`** — proceso de diseño actualizado: C4 L1
  Context → C4 Deployment Diagram → diagrama cloud tradicional (si se solicitó)
  → ADR → estimación de costo. Outputs ampliados para incluir `.excalidraw` y `.png`.
- **`architect-component-diagram/SKILL.md`** — vista "Despliegue" acotada a
  topología lógica de aplicación sin servicios cloud reales; se agregan dos
  nuevas reglas en "Cuándo NO invocar" con delegación explícita al
  `cloud-architect-design` para diagramas de infra y C4 Deployment Diagram.

### Fixed

- Colisión de routing: requests con "diagrama de infraestructura" activaban
  al `asdd-architect` en vez del `asdd-cloud-architect`.
- Ambigüedad en C4 Deployment Diagram: ambos agentes lo reclamaban sin
  ownership definido.

## [2.6.0] - 2026-05-13

Versión MINOR que introduce auto-detección de tamaño de codebase para modular
el comportamiento de los agentes en proyectos maduros, y completa la cobertura
de "Cuándo NO invocar" en los skills restantes del template.

### Added

- **ORC-001-D** en `.claude/rules/asdd-orchestration.md` — nueva regla
  de auto-detección de `codebase_size` al primer request LIGHT de la sesión.
  Usa regla 2-de-3 (archivos fuente, commits, docs) con umbrales configurables
  en `detection_thresholds` del lock. El resultado se cachea en `.asdd-run.json`
  bajo `auto_detected` y se reutiliza durante toda la sesión.
- **Scope injection** en ORC-001-B — cuando `codebase_size: large` + ruta LIGHT,
  el orquestador inyecta restricción de scope en el prompt del agente delegado
  (máx. 2 niveles de dependencias transitivas) y antepone `asdd-explorer`
  para Tipo 2/3. Ruta FULL no se ve afectada.
- **`detection_thresholds`** y **`project_context`** en `.asdd/asdd.lock`
  — bloque configurable con umbrales por señal y campo `maturity` para override
  manual de la auto-detección.
- **`auto_detected`** en `.asdd/asdd-run.schema.json` — nuevo campo
  opcional que persiste el resultado de la detección (codebase_size, señales
  observadas, override del lock).
- **ADR-001** en `docs/architecture/decisions/ADR-001-codebase-size-autodetection.md`
  — decisión arquitectónica documentada con alternativas evaluadas y criterios
  de aceptación.
- **Secciones "Cuándo NO invocar" y "Anti-patterns"** en 13 skills que las
  faltaban: `architect-api-contract`, `architect-component-diagram`,
  `architect-bounded-context`, `architect-guide-docs`, `cloud-architect-finops`,
  `cloud-architect-design`, `cloud-architect-security`, `devops-cloud-ops`,
  `devops-engineer-iac`, `devops-engineer-containers`,
  `devops-engineer-observability`, `devops-engineer-pipeline`,
  `producto-templates`. Todos los 51 skills del template cuentan ahora con
  estas secciones.

### Changed

- **ORC-001-B** extendido con subsección "Modulación por codebase_size" —
  tabla de efectos por tipo de request y bloque literal de scope restriction.
- **ORC-008** extendido — el anuncio del agente incluye `(scope: {módulo})`
  cuando ORC-001-B inyecta scope restriction.
- **`.asdd/asdd.lock`** — `version`: `2.5.0` → `2.6.0`;
  counts actualizados (`rules: 5`, `commands: 10`); nota de `repository`
  simplificada.

### Fixed

- **`do.md`** — frontmatter YAML faltante que hacía fallar el check
  `yaml-frontmatter` del validador.

### Removed

- **`docs/audit/`** — carpeta de artefactos de auditoría externa (propuestas
  P2-1 a P2-5) eliminada. Todas las propuestas fueron aplicadas o confirmadas
  como ya resueltas en versiones anteriores.

## [2.5.1] - 2026-05-12

Versión PATCH de bump técnico para validar clonado por canal `dev` en el CLI.

### Changed

- **`.asdd/asdd.lock`** — `version`: `2.5.0` → `2.5.1`.

## [2.5.0] - 2026-05-12

Versión MINOR con tres features mayores: routing adaptativo LIGHT/FULL,
asignación de modelo LLM parametrizable por fase, y división del agente
`platform-engineer` en `cloud-architect` + `devops-engineer`.

### Added

- **Routing adaptativo** (`ORC-001-B`, `ORC-001-C`) en
  `.claude/rules/asdd-orchestration.md` — clasifica cada request como
  ruta LIGHT (delegación directa a un agente) o FULL (workflow de 6 fases)
  usando taxonomía de 6 tipos. Incluye protocolo de escalamiento universal
  `ORC-001-C` con motivos trazables (`scope_mayor`, `requiere_adr`,
  `falta_artefacto`, `codigo_critico`, `rompe_contrato`).
- **`asdd-routing-heuristics.md`** — nueva rule con taxonomía completa
  de tipos de request, señales de clasificación y agente por defecto en LIGHT.
- **`/asdd:do`** — nuevo command para override explícito de ruta LIGHT.
- **`escalations[]`** en `.asdd/asdd-run.schema.json` — array para
  trazabilidad de escalamientos LIGHT→FULL ocurridos en el run.
- **Bloque `routing`** en `.asdd/asdd.lock` — `mode`, `always_full`
  y `hard_exclusions` (auth, pagos, PII, pipelines, contratos-publicos, compliance).
- **Model strategy** (`ORC-002-B`) en `.claude/rules/asdd-orchestration.md`
  — el orquestador resuelve el modelo de cada agente antes de invocarlo con
  cadena de precedencia: `skill_override > agent_pinning > phase_default > frontmatter`.
- **`model_strategy`** en `.asdd/asdd.lock` — defaults por fase
  (`specify/analyze: sonnet`, `design/verify: opus`, `build: sonnet`,
  `document: haiku`) con soporte para `agent_pinning` y `skill_override`.
- **`models_used`** en `.asdd/asdd-run.schema.json` — objeto por fase
  que registra el modelo resuelto por ORC-002-B para cada agente invocado.
- **Check #15 `model-strategy`** en el validador — bloquea `haiku` en fases
  Diseñar y Verificar donde se requiere capacidad de razonamiento alta.
- **Check #16 `routing-config`** en el validador — valida estructura del
  bloque `routing` en el lock.
- **`.claude/docs/adoption/model-strategy.md`** — guía de configuración con cadena
  de precedencia, ejemplos de `agent_pinning` y `skill_override`.
- **`asdd-cloud-architect`** — nuevo agente primario en fase Diseñar.
  Responsable de arquitecturas cloud multi-cloud (AWS/Azure/GCP), ADRs de
  infraestructura, FinOps y diagramas C4. Skills: `cloud-architect-design`,
  `cloud-architect-finops`, `cloud-architect-security`.
- **`asdd-devops-engineer`** — nuevo agente primario en fases Construir
  y Verificar. Responsable de CI/CD, containers, IaC, observabilidad y
  operaciones cloud CLI. Skills: `devops-engineer-pipeline`,
  `devops-engineer-containers`, `devops-engineer-iac`,
  `devops-engineer-observability`, `devops-cloud-ops`.

### Removed

- **`asdd-platform-engineer`** — reemplazado por `cloud-architect` +
  `devops-engineer`. Responsabilidades de diseño e implementación de infra
  quedan en agentes distintos, eliminando la ambigüedad de cuándo invocar cada rol.
- **`.gitlab-ci.yml`** — pipeline eliminado, no requerido para el template.

### Changed

- **`.asdd/asdd.lock`** — `version`: `2.4.0` → `2.5.0`;
  `agents`: `12` → `13` (net +1: se agregan 2, se elimina 1); agregados
  bloques `model_strategy` y `routing`.
- **`CLAUDE.md`** — secciones "Routing Adaptativo" y "Asignación de modelo
  por fase" documentadas.
- Reglas de orquestación y workflow actualizadas para los dos agentes nuevos
  y para las nuevas reglas ORC-001-B, ORC-001-C y ORC-002-B.

## [2.4.0] - 2026-05-11

Versión MINOR que integra **Strict TDD Mode** al ciclo ASDD y normaliza el
identificador del template para que coincida con el catálogo del CLI.

### Added

- **Strict TDD Mode** en `asdd-developer` (skill `feature`) y
  `asdd-qa-engineer` (skill `test-strategy`):
  - `.claude/skills/asdd-developer-feature/strict-tdd.md` — protocolo
    Red-Green-Refactor para implementación TDD-first.
  - `.claude/skills/asdd-qa-engineer-test-strategy/strict-tdd-verify.md` —
    contrapartida del QA para validar cobertura del ciclo TDD.
  - `.asdd/testing-capabilities.yaml` — declaración de capacidades de
    testing del template, consumida por `sdd-init` para activar Strict TDD.

### Changed

- **`cli-contract.json`** — `template.id`: `"project-structure"` → `"claude"`.
  Alinea el identificador con el ID que el catálogo del CLI usa para esta
  estructura. Sin impacto en la copia de archivos al consumidor; el CLI
  registra el `structure_id` correcto en `~/.guide/projects.json` y
  `guide update`/`upgrade` puede resolver la URL del repo remoto.
- **`asdd.lock.version`**: `2.3.0` → `2.4.0`.
- **`asdd.lock.variants.claude.version`**: `2.3.0` → `2.4.0`.
- Reglas de orquestación (`.claude/rules/asdd-orchestration.md`,
  `asdd-workflow.md`, `asdd-phases-reference.md`) ajustadas
  para integrar Strict TDD en las fases Construir y Verificar.

### Fixed

- Rutas absolutas hardcodeadas reemplazadas por placeholders relativos en
  `docs/audit/agentic/` (proposals, reports y plans).

### Migration notes for existing consumers

Consumidores en `2.3.0` que actualicen vía `guide upgrade --structures-only`
recibirán los nuevos artefactos de Strict TDD y el `template.id` actualizado.
La entry de registro en `~/.guide/projects.json` mantendrá el viejo
`structure_id: "project-structure"` hasta que el CLI re-registre el
proyecto (ver fix correspondiente en el CLI v0.2.x).

## [2.3.0] - 2026-05-08

Versión MINOR que extiende el contrato de personalización con los dos campos
jerárquicamente superiores que la capa de observabilidad necesita para
agrupar telemetría por cliente y producto. Sin cambios en agentes, skills,
rules ni hooks.

### Added

- **`cli-contract.json`** — `personalize` agrega dos entries nuevos pedidos
  por observabilidad:
  - `account-name` → `project.account` en el lockfile (cuenta/cliente, kebab-case, requerido)
  - `solution-name` → `project.solution` en el lockfile (solución dentro de la cuenta, kebab-case, requerido)

### Changed

- **`cli-contract.json`** — el entry `project-name` se mantiene en el contract
  (mapeo a `project.name` y validación) pero el CLI ≥ v0.2.0 ya **no se lo
  pregunta al usuario**: lo deriva del nombre del directorio donde corre
  `guide init`, sanitizado a kebab-case automáticamente. CLIs anteriores
  siguen pidiendo `project-name` por prompt sin saber que es derivable; los
  usuarios deben actualizar el CLI a v0.2.0+ para el flujo completo.
- **`contract_version`**: `2.0.0 → 2.1.0` (MINOR — entries nuevas en `personalize`).

### Migration notes for existing consumers

Proyectos en 2.2.1 que actualicen vía `guide upgrade --structures-only`
recibirán el contract nuevo pero sus lockfiles seguirán **sin**
`project.account` ni `project.solution` (el upgrade no re-evalúa prompts).
Para completar esos campos será necesario un comando `guide backfill`
(issue separado) o editar el lockfile manualmente.

## [2.2.1] - 2026-04-27

Versión PATCH con limpieza menor en non-architect skills, derivada de la
auditoría completa documentada en
`docs/audit/agentic/proposals/v2.3-non-architect-trim/`.

La auditoría inicial (52 archivos) reveló que la mayoría de los skills
no-architect (40/52 = 77%) ya estaban alineados con el principio "skills =
procedimiento, no enciclopedia" y la guía oficial Anthropic. Sólo 3 cambios
menores se aplicaron.

### Changed

- **`developer-feature/SKILL.md`** — stub HTML-comentado de `Gotchas` reducido
  de ~25 líneas a placeholder mínimo (~3 líneas). El stub original contenía
  meta-instrucciones extensas para el equipo que no se materializaron en 6
  meses.
- **`security-code-scan/SKILL.md`**, **`security-compliance/SKILL.md`**,
  **`security-dependency-audit/SKILL.md`**, **`security-secrets-scan/SKILL.md`** —
  mismo cambio: stub `Gotchas` reducido a placeholder mínimo (4 archivos).
- **`ux-ui-design-tokens/SKILL.md`** — los 9 valores hexadecimales de ejemplo
  (eran de paletas Tailwind/Radix didácticas, no brand Guide real) reemplazados
  por placeholders genéricos `#XXXXXX (categoría)` para evitar implicar que
  son la paleta oficial Guide.
- **`platform-engineer-pipeline/SKILL.md`** — actualizado para no referenciar
  `reference/deploy-strategies-detail.md` (ahora borrado). Mantiene la tabla
  resumen de Rolling/Blue-Green/Canary inline.
- **`asdd.lock.version`:** `2.2.0` → `2.2.1`
- **`asdd.lock.variants.claude.version`:** `2.2.0` → `2.2.1`

### Removed

- **`platform-engineer-pipeline/reference/deploy-strategies-detail.md`** —
  contenido canónico (Rolling/Blue-Green/Canary descritos en libros y docs
  públicos de cada cloud provider). El SKILL.md ya tiene tabla resumen
  suficiente para que el agente decida y delegue el detalle a Claude desde
  training data.

### Decisions (audit findings)

- **Domain-expert skills (6) NO se refactorizaron.** La hipótesis inicial era
  que tenían "glosarios canónicos a borrar" (~50% de líneas). Tras 3 iteraciones
  del lens de auditoría, se concluyó que **glosarios y flujos sirven como
  anchor terminológico y de proceso** — no son enciclopedia: garantizan que
  Claude use consistentemente la misma terminología y secuencia que el cliente
  Guide espera. Borrarlos generaría drift terminológico sesión a sesión sin
  ganancia real (10-20 líneas borrables por archivo, ROI negativo).
- **Lens framework refinado** (incorporado en futuras auditorías):
  - Procedimiento Guide (cómo hacer X) → KEEP
  - Anchor de terminología (glosario) → KEEP
  - Anchor de proceso (flujos, ciclo de vida, secuencias) → KEEP
  - Anchor de estados (`creado → pendiente → ...`) → KEEP
  - Catálogos curados Guide (selección de N de M) → KEEP
  - Templates rellenables → KEEP
  - Regulación EN PROSA larga → DELETE
  - Conceptos genéricos en prosa → DELETE
  - Stubs/instrucciones meta sin valor → DELETE
- **Otros candidatos descartados:**
  - `platform-engineer-iac/reference/pulumi-template.md` — Guide usa Pulumi y
    Terraform, mantener ambos.
  - `security-compliance` checklist ASVS L1/L2/L3 — anchor para mapear
    hallazgos, mantener.
  - `ux-ui-accessibility` selección de 11 criterios WCAG — selección Guide
    curada (no exhaustiva), mantener.

### Reference

- Guía oficial: ["The Complete Guide to Building Skills for Claude"](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf) (Anthropic).
- Auditoría completa (3 iteraciones del lens): `docs/audit/agentic/proposals/v2.3-non-architect-trim/`.

## [2.2.0] - 2026-04-27

Versión MINOR que aplica trim sustancial a los 9 skills `asdd-architect-*`
alineando con la guía oficial Anthropic ("The Complete Guide to Building
Skills for Claude") y el principio **"skills = procedimiento, no enciclopedia"**.

Reduce 93 → 47 archivos en architect skills (-49%) eliminando duplicación de
conocimiento canónico (C4, ISO 25010, EIP, ATAM, Team Topologies, MADR/Nygard,
DDD glossary, cloud mappings AWS/Azure/GCP, etc.) que Claude reconstruye desde
training data. Preserva y consolida el conocimiento procedural Guide-específico
en los SKILL.md correspondientes.

### Removed

- **45 archivos de architect skills** (canon público duplicado):
  - Bloque A — DDD canónico, C4/PlantUML/Mermaid/Structurizr canónico, cloud
    mappings AWS/Azure/GCP, deployment topology, compliance docs (PCI-DSS,
    HIPAA, ISO 27001, SOX), evolution patterns (strangler fig, branch by
    abstraction, migration patterns), Team Topologies + Conway, ATAM/risk
    taxonomy, ISO 25010 + fitness functions canónico + nfr-catalog, estilos
    arquitectónicos canon, data/security/auth patterns canon, antipatterns,
    interview-script genérico (41 archivos).
  - Bloque B — fallback MADR/Nygard eliminado: el estándar Guide DA_ADE34 es
    ahora el único formato válido para ADRs en proyectos COE
    (`templates/madr-template.md`, `templates/nygard-template.md`,
    `examples/adr-001-database-choice.md`, `examples/adr-002-auth-provider.md`
    — 4 archivos).

### Added

- **Sección "Reglas operativas Guide"** en `.claude/agents/asdd-architect.md`
  con el credo del COE de 5 reglas: empezar simple, cada decisión = ADR, cada
  NFR = SLO, cada SLO = fitness function, cada microservicio nuevo = costo
  operativo justificable.

### Changed

- **Refactor de los 9 SKILL.md `asdd-architect-*`** para absorber el
  contenido procedural Guide que vivía en los `reference/*.md` borrados:
  - `architect-adr` — Guide DA_ADE34 como único formato; lifecycle ADR inline.
  - `architect-api-contract` — convenciones COE de OpenAPI 3.1 y AsyncAPI.
  - `architect-bounded-context` — heurísticas Guide de DDD.
  - `architect-component-diagram` — Excalidraw default COE, convenciones de
    sequence flows, data modeling, Structurizr DSL.
  - `architect-discovery` — RACI Guide, taxonomía LATAM de constraints,
    coordinación SOX con cliente.
  - `architect-patterns` — decision tree Guide (thresholds 15/16-50/>50 devs,
    default Monolito Modular, anti-flowchart), convenciones EIP, sync vs async.
  - `architect-quality` — workflow CORE de traducción NFR vago → medible.
  - `architect-tradeoff-analysis` — heurísticas COE de sensitivity analysis y
    decision matrix.
  - `architect-review` — sin cambios estructurales (review checklist Guide
    ya estaba en templates).
- **`asdd.lock.version`:** `2.1.1` → `2.2.0`
- **`asdd.lock.variants.claude.version`:** `2.1.1` → `2.2.0`
- **`asdd.lock.updated_at`:** `2026-04-24` → `2026-04-27`
- `variants.claude.skills`: sin cambio (sigue en 46 — no se removieron skills,
  sólo archivos `reference/` dentro de skills).

### Decisions

- **Eliminado fallback MADR/Nygard** — el estándar Guide DA_ADE34 es default
  oficial v2.1.1; mantener fallback duplicaba responsabilidad. Quien necesite
  MADR/Nygard puede pedírselo a Claude sin skill (formatos públicos).
- **Conocimiento canónico (libros/estándares públicos) NO se documenta en
  skills.** Claude lo reconstruye desde training. Skills sólo contienen
  procedimiento Guide-específico (decisión tomada con base en la guía oficial
  Anthropic: "skills provide the recipes, not the encyclopedia").
- **Diferida la convención estructural Anthropic** (`reference/`→`references/`,
  `templates/`+`examples/`→`assets/`) hasta v2.3.0. El cambio estructural es
  ortogonal al trim de contenido y arriesga ruptura del check `skills-structure`
  del validador.
- **Credo Guide migrado al agent file**, no a un SKILL.md específico — son
  reglas operativas del rol arquitecto, transversales a todos los sub-skills.

### Reference

- Guía oficial: ["The Complete Guide to Building Skills for Claude"](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf) (Anthropic).
- Auditoría completa: `docs/audit/agentic/proposals/v2.2-architect-trim/`
  (AUDIT.md, MIGRATION-MAP.md, DELETE-LIST.md, SKILL-REFACTOR-PLAN.md).

## [2.1.1] - 2026-04-24

Versión PATCH que adopta el estándar interno Guide **DA_ADE34 — Drivers
de Arquitectura** como formato default para ADRs, en sustitución del
formato MADR genérico.

### Added

- `reference/guide-da_ade34-spec.md` en `asdd-architect-adr` —
  spec operativo del estándar Guide: 8 ítems obligatorios (Id, Título,
  Estado, Fecha, Contexto y Problema, Factores Impulsores, Opciones
  Consideradas, Resultado de la Decisión, Consecuencias, Más Información),
  conceptos Guide (Drivers de Arquitectura, Architecture Concern,
  AS-IS/TO-BE, Trazabilidad, Trade-off, Deuda Arquitectónica), reglas de
  redacción y antipatrones específicos.
- `templates/guide-da_ade34-template.md` — plantilla rellenable con la
  estructura de 8 ítems del estándar, patrón de título
  `[Verbo] [Objeto] usando [Tecnología/Patrón]` y guías inline.
- `examples/adr-guide-cache-aside-redis.md` — ejemplo canónico tomado del
  documento fuente Guide (Cache-Aside + Redis Cluster), demuestra tono,
  trazabilidad QA → decisión y profundidad esperada.

### Changed

- `asdd-architect-adr/SKILL.md` — Guide DA_ADE34 pasa a ser formato
  default. Description actualizada para reflejarlo. Body ampliado con
  tabla de conceptos Guide, los 8 ítems obligatorios y selección de
  formato (Guide default → MADR alternativa → Nygard interno).
- `asdd-architect-adr/reference/madr-spec.md` — pasa de "default
  del COE" a "alternativa para proyectos open-source o equipos externos".
- **`asdd.lock.version`:** `2.1.0` → `2.1.1`
- **`asdd.lock.variants.claude.version`:** `2.1.0` → `2.1.1`

### Decisions

- **Mantenidos** MADR (`madr-spec.md`, `madr-template.md`) y Nygard
  (`nygard-spec.md`, `nygard-template.md`) como formatos alternativos
  válidos para proyectos open-source o decisiones internas pequeñas.
- **Mantenidos** los ejemplos `examples/adr-001-database-choice.md` y
  `examples/adr-002-auth-provider.md` en formato MADR — siguen siendo
  referencia válida del formato alternativo.
- **No se renombró el skill** (`asdd-architect-adr` → preservado).
  La adopción de Guide DA_ADE34 es un cambio de contenido, no de
  interfaz: validador 14/14 sigue pasando sin renames.

### Source

- Documento fuente: **DA_ADE34 — Drivers de Arquitectura** v0.1
  (2025-10-27), uso interno Guide, gobernado por el Líder de la Práctica
  de Arquitectura (Head of Architecture Practice).

## [2.1.0] - 2026-04-24

Versión MINOR que expande las capacidades del agente Arquitecto. Adopta y
reconcilia el spec externo `guide-skills-arch-*` (21 skills + router) con la
convención de nomenclatura v2.0, consolidando a 9 skills bajo
`asdd-architect-*` mediante progressive disclosure.

### Added

- **5 skills nuevos para `asdd-architect`:**
  - `asdd-architect-discovery` — captura de contexto, stakeholders,
    restricciones (consolida context-discovery, stakeholder-mapping,
    constraint-elicitation del spec original).
  - `asdd-architect-tradeoff-analysis` — ATAM-lite, matrices de decisión,
    risk register (consolida tradeoff-analysis + risk-assessment).
  - `asdd-architect-quality` — ISO/IEC 25010, SLOs/SLIs, fitness
    functions (consolida quality-attributes + nfr-elicitation +
    fitness-functions).
  - `asdd-architect-patterns` — catálogo de estilos, integration
    patterns (EIP), data patterns (CQRS, ES, sagas), security patterns
    (consolida style-selection + integration + data + security).
  - `asdd-architect-review` — review checklist, evolution roadmap
    (strangler fig, branch-by-abstraction), team topology (consolida
    review-checklist + evolution-roadmap + team-topology).
- **Progressive disclosure** (`reference/`, `templates/`, `examples/`) en los 4
  skills existentes del Arquitecto (adr, api-contract, bounded-context,
  component-diagram). 33 archivos nuevos siguiendo la convención oficial
  Anthropic, sin renombrar los SKILL.md.
- Frontmatter del agente `asdd-architect` ampliado: array `skills:` pasa
  de 4 a 9 entradas, tabla "Sub-roles disponibles" extendida con 5 filas y
  "Selección de skill" con 5 reglas adicionales.
- Spec original archivado en `docs/audit/agentic/architect-skills-v1-input.md`
  con header de trazabilidad para preservar la entrada del owner del COE.

### Removed

- `docs/audit/` (histórico de usuario) del template tracked. El histórico de
  auditorías del COE queda en git history y en un backup externo
  (`asdd-coe-history-pre-v2.0.tar.gz`). La carpeta se regenera
  automáticamente cuando un proyecto consumidor ejecute
  `@qgt-audit-agentic-config` por primera vez. La subcarpeta
  `docs/audit/agentic/` queda como artefacto de desarrollo del template
  (proposals + spec inputs archivados con trazabilidad).

### Changed

- **`asdd.lock.version`:** `2.0.0` → `2.1.0`
- **`asdd.lock.variants.claude.version`:** `2.0.0` → `2.1.0`
- **`asdd.lock.variants.claude.skills`:** `41` → `46` (5 nuevos)
- **`asdd.lock.updated_at`:** `2026-04-23` → `2026-04-24`
- `.asdd/cli-contract.json.clean.optional_remove`: el id
  `remove-audit-proposals` pasa a `remove-audit-history` y apunta a
  `docs/audit/` completo (antes solo removía `proposals/`).

### Decisions (ADR-style trazabilidad)

- **Eliminado** el `guide-skills-arch-engagement-router` propuesto en spec
  externo. Justificación: anti-patrón en Claude Code (routing nativo por
  description elimina la necesidad de skill intermediario; agregaría latencia
  sin valor).
- **Consolidado** 21 skills del spec externo a 9 mediante progressive
  disclosure (subdirectorios oficiales `reference/`, `templates/`, `examples/`).
  Ahorro estimado: ~1920 tokens base (-73% vs spec original).
- **Diferido** `skills-evals/` hasta tener CI runner para evals de Claude.
- **Preservado** los 4 skills existentes sin renombrar (mantiene compatibilidad
  con consumidores v2.0).
- **No `when_to_use` en YAML** — campo no oficial; el "cuándo invocar" va al
  body del SKILL.md como sección estándar.

## [2.0.0] - 2026-04-24

Primera versión MAJOR del template. Introduce la **Convención de Nomenclatura
Universal asdd-*** para separar claramente los artefactos del template
de los del proyecto consumidor y de los plugins externos. Rompe compatibilidad
con consumidores v1.x; ver `.claude/docs/migrations/1-to-2.md` para el procedimiento.

### BREAKING CHANGES

- **Prefijo `asdd-` en todos los artefactos del template:**
  - 11 agentes renombrados (`architect` → `asdd-architect`, etc.)
  - 41 skills renombrados (`architect-adr` → `asdd-architect-adr`, etc.)
  - 2 rules renombradas (`asdd-orchestration.md` → `asdd-orchestration.md`)
  - 2 hooks renombrados (`pre-tool-use-dangerous-bash.mjs` → `asdd-pre-tool-use-dangerous-bash.mjs`)
- **Agente `asdd-expert` renombrado a `asdd-meta`** (cambio doble: prefijo
  y rol base). El skill `asdd-expert-platform` rebasa a `asdd-meta-platform`.
- **Commands movidos al namespace `/asdd:`:**
  `/project:specify` → `/asdd:specify` (y las 5 fases restantes).
  La carpeta `.claude/commands/project/` se convierte en `.claude/commands/asdd/`.
- **Contrato CLI bumpeado a `2.0.0`:** requiere `guide-ai >= 2.0.0`. Se agregó
  el bloque `naming_convention` que declara la convención para el CLI.
- **Commands del proyecto consumidor deben usar namespace `{project.name}:`**
  (ej. `/checkout-backend:deploy`). Enforzado por check 14 del validador.

### Added

- **Convención formal de nomenclatura** con 3 namespaces:
  `asdd-*` (template), `{project.name}-*` (proyecto),
  plugins (namespace propio). Formalizada en
  `.claude/docs/adoption/naming-convention.md` (tabla de decisión, FAQ, tutorial paso a paso).
- **Check 14 `naming-convention` (strict)** en validador. El validador pasa
  de 13/13 a 14/14.
- **Bloque `naming_convention`** en `.asdd/cli-contract.json` para que
  el CLI valide consistencia durante la adopción.
- **Sección "Convención de nomenclatura"** en `ASDD-VERSIONING.md`.
- **Guía de migración** `.claude/docs/migrations/1-to-2.md`.

### Changed

- **`asdd.lock.version`**: `1.0.1` → `2.0.0`
- **`cli-contract.json.contract_version`**: `1.0.0` → `2.0.0`
- **`cli-contract.json.compatibility.min_cli_version`**: `1.0.0` → `2.0.0`
- **`checklist.json.checklist_version`**: `1.0.0` → `2.0.0`

### Deprecation policy

Política ligera. Los nombres v1.x dejan de existir en v2.0.0. Si el proyecto
consumidor no puede migrar aún, debe pinnear a `v1.0.1` y actualizar cuando esté listo.

## [1.0.1] - 2026-04-23

Primera versión estable del template después de auditoría agéntica
completa. Consolida lo producido entre la introducción inicial de la
metodología ASDD y el cierre de las fases 1–4.4 del plan de auditoría.
No hay tags anteriores: todo lo previo se documenta aquí
retrospectivamente como línea base.

### Added

- 11 agentes especializados en `.claude/agents/`: `producto`,
  `architect`, `tech-lead`, `ux-ui`, `developer`, `security`,
  `qa-engineer`, `domain-expert`, `platform-engineer`, `researcher`,
  `asdd-expert`. Cada uno con modelo, tools y metodología declarados.
- 41 skills en formato oficial Claude Code (`.claude/skills/{name}/SKILL.md`).
- 6 commands de fase ASDD en `.claude/commands/project/`:
  `/project:specify`, `/project:analyze`, `/project:design`,
  `/project:build`, `/project:verify`, `/project:document`.
- 2 rules comprimidas en `.claude/rules/`: `asdd-orchestration.md`
  (66 líneas, define ORC-000..006) y `asdd-workflow.md` (97 líneas,
  define WF-001..006 y las 6 fases ASDD).
- 2 hooks activos en `.claude/hooks/`:
  `pre-tool-use-dangerous-bash.mjs` (bloquea comandos destructivos)
  y `pre-tool-use-spec-check.mjs` (OFF por default vía
  `ASDD_SPEC_GUARD_ENABLED=false`).
- `.mcp.json` en la raíz con Context7 activo por default.
- `mcpServers: [context7]` precargado en los agentes `architect`,
  `developer`, `researcher` y `tech-lead`.
- Guía completa de MCPs recomendados en `.claude/docs/mcps-by-domain.md`
  (10 MCPs: Context7, Figma, Azure, Playwright, SonarQube, Excalidraw,
  GitHub, Atlassian, Sentry, Slack). Ninguno activado por default
  salvo Context7.
- Guía de plugins recomendados en `.claude/docs/plugins-by-role.md`
  (security-guidance, claude-md-management, commit-commands, hookify).
  Ninguno activado por default.
- Validador CI cross-OS en `.claude/scripts/validate-template.mjs`
  con 13 checks: YAML frontmatter, estructura de skills, coherencia
  del manifiesto, referencias cruzadas a skills y MCPs, JSON válido,
  hooks ejecutables, tamaño de rules y CLAUDE.md, rutas hardcodeadas,
  contrato CLI v1.0, markers integrity, y consistencia CHANGELOG.
- Pipeline GitLab CI en `.gitlab-ci.yml` que corre el validador en
  cada push y merge request.
- Documentación de validación en `.claude/docs/validation.md` con guía de
  adopción, activar/deshabilitar y pre-commit hook opcional.
- Carpeta `.asdd/` con tres artefactos:
  - `asdd.lock` — manifiesto versionado del template.
  - `cli-contract.json` — contrato declarativo v1.0 para adopción
    automatizada por el CLI `guide-ai`.
  - `checklist.json` — checklist ejecutable pre/post adopción.
- Markers HTML `<!-- asdd:template-disclaimer:start/end -->`
  en `CLAUDE.md` para parsing estable por el CLI durante la
  personalización del template.
- Documentación de adopción en `docs/adoption/`:
  `contract-spec.md` (schema v1.0 formal), `cli-integration-guide.md`
  (guía con pseudocódigo para implementadores del CLI) y
  `adoption-checklist.md` (checklist humano).
- Definition of Done personalizada en cada uno de los 11 agentes.
- Progressive disclosure en 5 skills grandes (`asdd-expert-platform`
  y los 4 `platform-engineer-*`), separando SKILL.md breve de
  archivos de soporte en `reference/`.
- Placeholder "Gotchas" estructurado en 11 skills sensibles, con
  formato consistente para capturar aprendizajes operativos reales
  durante adopción.
- Ejemplos ASDD end-to-end en `docs/.example/` (caso "Checkout 1-clic"
  con brief, spec, ADR y sign-off), sin exponerse como skills.
- `ASDD-MEMORY.md` en la raíz y documentación de uso en `CLAUDE.md`.
- `.gitignore` con `CLAUDE.local.md`, `settings.local.json` y
  `agent-memory/` para evitar que configuración local se versione.

### Changed

- `.asdd` migrado de archivo único a carpeta con tres JSON
  adentro (`asdd.lock`, `cli-contract.json`, `checklist.json`).
- Agentes `developer` y `tech-lead` cambian de Sonnet a
  `claude-opus-4-7` para razonamiento más profundo en su dominio.
- Rules comprimidas sin pérdida de lógica:
  `asdd-orchestration.md` de 178 a 66 líneas,
  `asdd-workflow.md` de 145 a 97 líneas. Impacto: ~1.640 tokens
  menos cargados por sesión.
- Agente `architect` pierde `WebFetch` y `WebSearch` (principio de
  least-privilege — la investigación web es responsabilidad del
  agente `researcher`).
- Frontmatter completo aplicado a los 11 agentes: `maxTurns`,
  `memory`, `effort`, `skills` precargados, `isolation` donde aplica.
- Skill `developer-refactoring` renombrado a
  `developer-refactoring-execute` para desambiguar ejecución.
- Skill `tech-lead-refactoring` renombrado a
  `tech-lead-refactoring-plan` para desambiguar planificación.
- `.claude/settings.json` poblado con 17 permisos en `allow` y 7 en
  `deny`, reduciendo aprobaciones manuales en el flujo diario.
- 6 commands de fase ASDD con `allowed-tools` restrictivo (cada
  command declara explícitamente qué tools puede usar).
- `README.md` y `.asdd` alineados con la realidad del
  filesystem (contadores, estructura, agentes, skills).

### Removed

- Hook inválido `.claude/hooks/hooks.json` que declaraba eventos
  `PreCommit` y `PostCommit` inexistentes en el lifecycle de
  Claude Code. Los hooks válidos viven en `.claude/settings.json`
  bajo la key `hooks` y apuntan a archivos `.mjs` en
  `.claude/hooks/`.
- Referencias en README a las subcarpetas `Claude/` y `Copilot/`,
  que nunca existieron en el filesystem. La arquitectura real usa
  un solo `.claude/` en la raíz.
- Referencias a agentes meta inexistentes
  (`asdd-structure-validator`, `asdd-auditor`, `asdd-repo-docs`)
  en documentación y rules.

### Fixed

- 41 skills migrados al formato oficial Claude Code
  (`.claude/skills/{name}/SKILL.md`). Antes estaban en un formato
  no soportado por el descubrimiento automático de Claude Code.
- `.mcp.json` movido de `.claude/mcp/` (ubicación no estándar) a la
  raíz del proyecto (ubicación estándar donde Claude Code lo lee).
- Normalización de capitalización de directorios: `Docs/` → `docs/`
  en todas las referencias internas.

### Documentation

- Guía completa de auditoría agéntica en `docs/audit/agentic/`
  con catálogo de anti-patrones, hallazgos por fase y plan de
  corrección aplicable.
- `CLAUDE.md` con disclaimer explícito template vs proyecto real
  (delimitado por markers `asdd:template-disclaimer`).
- `CORE-008` operacionalizado en `CLAUDE.md` con ejemplos
  concretos de uso.
- Este `ASDD-CHANGELOG.md` retrospectivo, alineado con `asdd.lock.version`.
- `ASDD-VERSIONING.md` con política SemVer, compatibility matrix,
  release process, política de soporte y FAQ.
- `.claude/docs/migrations/README.md` explica el catálogo y formato de guías de
  migración entre versiones.

[Unreleased]: <gitlab-repo-url>/compare/v3.5.0...HEAD
[3.5.0]: <gitlab-repo-url>/compare/v3.4.0...v3.5.0
[3.2.0]: <gitlab-repo-url>/compare/v3.1.0...v3.2.0
[3.0.0]: <gitlab-repo-url>/-/releases/v3.0.0
[1.0.1]: <gitlab-repo-url>/-/releases/v1.0.1
