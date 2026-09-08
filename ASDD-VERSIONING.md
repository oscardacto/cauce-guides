# Versionado — project-structure (ASDD)

Política formal de versionado para el template ASDD de Sofka. Sigue
[Semantic Versioning 2.0](https://semver.org/lang/es/) y se complementa
con [Keep a Changelog 1.1.0](https://keepachangelog.com/es/1.1.0/) en
`ASDD-CHANGELOG.md`.

## 1. Introducción

Este template es un conjunto vivo de configuración agéntica (agentes,
skills, rules, hooks, commands, contrato CLI). Evoluciona por adopción
real, feedback del COE y mejoras de Claude Code. Versionarlo con
disciplina permite a los equipos consumidores actualizar sin sorpresas.

Se versionan **tres artefactos** con ciclos independientes:

1. **Template** — `.sofka-asdd/sofka-asdd.lock` → `version`. Es la unidad
   versionable principal. Agentes, skills, rules y hooks no llevan
   versión individual: bumpean conjuntamente cuando bumpea el template.
2. **Contrato CLI** — `.sofka-asdd/cli-contract.json` → `contract_version`.
   Protocolo entre el template y el CLI `sofka-ai`. Evoluciona
   independiente del template: un template 2.x puede seguir usando
   contrato 1.x mientras los cambios sean aditivos.
3. **CLI externa `sofka-ai`** — versionada en su propio repo. Fuera del
   alcance de este archivo, pero la compatibility matrix (§3) la
   referencia.

## 2. Esquema SemVer por artefacto

Los tres artefactos usan `MAJOR.MINOR.PATCH`. Las tablas siguientes dan
ejemplos concretos con archivos y agentes reales del template actual.

### 2.1 Template (`sofka-asdd.lock.version`)

| Tipo | Qué dispara el bump | Ejemplo real / hipotético |
|---|---|---|
| MAJOR | Remover un agente, renombrar carpetas raíz, cambiar una rule vigente de forma que rompa flujos existentes | Eliminar `.claude/agents/security.md` · renombrar `.claude/` a `.agents/` · reescribir `ORC-000` en `asdd-orchestration.md` |
| MINOR | Agregar un agente nuevo, agregar MCP default, extender rules con reglas nuevas sin romper las previas | Agregar `data-engineer.md` · instalar Supabase MCP por default · agregar `ORC-007` nuevo |
| PATCH | Corrección de prompts, typos, ajustes de `allowed-tools` permissive, mejoras de skills sin romper interfaz | Arreglar typo en `developer.md` · relajar regex en hook spec-check · aclarar texto en `asdd-expert-platform/SKILL.md` |

### 2.2 Contrato CLI (`cli-contract.json.contract_version`)

| Tipo | Qué dispara el bump | Ejemplo real / hipotético |
|---|---|---|
| MAJOR | Remover campo requerido, cambiar tipo de un campo, renombrar bloque del contrato | Remover `personalize[*].required` · cambiar `compatibility.platforms` de array a objeto · renombrar `clean` a `cleanup` |
| MINOR | Agregar nuevo `type` en `personalize`, agregar bloque o campo opcional nuevo | Agregar `type: "enum"` en personalize · agregar bloque `hooks` opcional · agregar `compatibility.min_node` |
| PATCH | Mejorar mensaje de `prompt`, relajar regex de validación permissive, correcciones de textos | Aclarar prompt de `project_name` · permitir guiones bajos en `team_slug` · fix de typo en `description` |

### 2.3 CLI externa `sofka-ai`

La CLI vive en su propio repo. Sigue SemVer con la misma semántica:
MAJOR si rompe el protocolo de lectura del contrato, MINOR si agrega
soporte para nuevas features del contrato, PATCH si corrige bugs o
mejora UX. La compatibilidad con este template se declara en §3.

## 3. Compatibility Matrix

Esta matriz relaciona versiones del template, la versión de contrato que implementan y el piso
de CLI que declaran. El CLI es **`sofka`** (repositorio `sofka-ia/cli`), que está en la serie
**0.x** — todavía no llegó a 1.0.

Los valores salen de leer `compatibility.min_cli_version` y `contract_version` en el contrato
de cada tag, no de reconstruirlos:

| Template | Contrato | Piso de CLI declarado | ¿El piso se aplicaba? |
|---|---|---|:-:|
| v2.1.0 – v2.2.x | 2.0.0 | `2.0.0` | no |
| v2.3.0 – v2.12.0 | 2.1.0 | `2.0.0` | no |
| v2.12.1 – v2.27.x | 2.2.0 | `2.0.0` | no |
| v3.0.0 – v3.3.x | 2.3.0 | `2.0.0` | no |
| v3.4.0 – v3.5.0 | 2.5.0 | `2.0.0` | no |
| **v3.5.1 en adelante** | **2.5.0** | **`0.9.6`** | **sí** |

> **La columna de la derecha no es un detalle.** El piso estuvo declarado en `2.0.0` durante
> toda la historia del template: una versión que **ningún CLI publicado podía satisfacer**,
> porque el CLI nunca pasó de 0.x. No bloqueó a nadie por una única razón — hasta el CLI 0.9.6
> nadie leía el campo. El día que el gate se implementó, ese valor habría bloqueado de golpe a
> todos los consumidores de la rama; se corrigió a `0.9.6` en v3.5.1, en el mismo cambio.
>
> Las versiones `>= 2.0` que esta tabla declaraba antes eran ese valor a la deriva, transcrito.
> Las reglas de §5.1 y los controles del check `cli-contract` existen para que no se repita.

### Política de extensión

- La matriz se **expande con filas nuevas** cuando existan templates
  alternativos (`copilot-structure`, `gemini-structure`, etc). Cada
  template declara su rango y su contrato.
- El **contrato es el punto de adopción**: cualquier template que implemente el contrato 2.x es
  consumible por el CLI que soporte esa serie. No es necesario publicar un CLI distinto por
  cada template.
- Un bump MAJOR del contrato requiere que el CLI lo soporte antes de que ninguna rama lo
  declare — es el mismo orden entre repositorios de §5.1. El CLI puede mantener compatibilidad
  hacia atrás con la serie anterior por un ciclo (política de soporte en §7).

## 4. Política de deprecation

**Flujo estándar:** anunciar en `ASDD-CHANGELOG.md` → mantener por 1 MINOR
como deprecated → remover en siguiente MAJOR.

Ejemplo: si en `1.3.0` se marca deprecated el agente `asdd-expert`, el
agente sigue funcionando en todas las 1.x posteriores. En `2.0.0`
puede ser removido.

**Política ligera (actual):** solo CHANGELOG. No se introducen aliases
transicionales ni flags de compatibilidad. Cuando el ecosistema tenga
consumidores reales que justifiquen la complejidad, se revisa.

**Qué NO se considera breaking:**

- Correcciones de typos, textos, mensajes.
- Bugfixes donde el comportamiento "correcto" difiere del documentado.
- Ajustes permissive de validación (relajar regex, aceptar más casos).
- Mejoras de prompts que no cambian interfaz observable.

Estos cambios van en PATCH o MINOR según alcance, sin pasar por el
flujo de deprecation.

## 5. Release Process

Checklist ejecutable por el release manager:

```
- [ ] Determinar bump (MAJOR/MINOR/PATCH) según cambios en [Unreleased]
- [ ] Actualizar `.sofka-asdd/sofka-asdd.lock` → `version`
- [ ] Revisar el piso de CLI (`compatibility.min_cli_version`) — ver §5.1
- [ ] Regenerar el provenance: `npm run provenance:regen` y commitear — ver §5.2
- [ ] En ASDD-CHANGELOG.md: mover [Unreleased] a [X.Y.Z] - YYYY-MM-DD
- [ ] Dejar sección [Unreleased] vacía debajo
- [ ] Correr `node .claude/scripts/validate-template.mjs` → 0 errores
- [ ] Commit `chore(release): vX.Y.Z`
- [ ] Tag `git tag vX.Y.Z`
- [ ] Push `git push && git push --tags`
- [ ] VERIFICAR que el tag llegó: `git ls-remote --tags origin | grep vX.Y.Z`
- [ ] Crear release notes en GitLab apuntando al bloque [X.Y.Z] del CHANGELOG
- [ ] Si MAJOR: crear `.claude/docs/migrations/{N-1}-to-{N}.md` con guía
```

> **El paso del tag no es ceremonial: es el que decide si el upgrade de los consumidores
> tiene fricción o no.** El CLI reconstruye el baseline de una versión legacy clonando el
> template **en su tag** (`reconstructLegacyBaseline`, clone-at-tag). Sin el tag no hay
> baseline, y el CLI no puede distinguir "el consumidor no tocó este archivo, solo está en una
> versión vieja" de "el consumidor lo editó": todo lo que difiera se preserva como
> `.asdd-new`.
>
> **Ya pasó, y es la causa de los reportes de "cientos de archivos duplicados".** Al 2026-08-05
> el tag más nuevo publicado era `v3.2.0`, mientras el changelog declaraba **3.3.0, 3.1.0,
> 2.27.1 y 2.26.0** como liberadas. Ningún proyecto instalado en esas cuatro versiones puede
> reconstruir su baseline.
>
> De ahí el paso de verificación con `git ls-remote`: un `git push --tags` que falla en silencio
> (o un push del commit sin los tags) es indistinguible de un release correcto hasta que un
> consumidor actualiza semanas después.

### 5.1 El piso de CLI se sube DESPUÉS de publicar el binario, nunca antes

`compatibility.min_cli_version` es un gate duro: desde el CLI 0.9.6, un consumidor por debajo
del piso **no recibe la estructura**. No es una degradación, es un bloqueo, y alcanza a todos
los consumidores de la rama a la vez.

**La regla de orden entre los dos repositorios:**

> El piso declarado en una rama **nunca puede exceder la versión de CLI ya publicada en el
> canal que esa rama alimenta** — `dev` → canal dev, `qa` → canal qa, `main` → canal prod.

Subirlo antes de publicar el binario bloquea a todo el mundo con un mensaje que les pide una
versión que no existe. En la práctica eso significa, por canal: **primero se publica el CLI,
después se promueve el template con el piso nuevo.**

El validador **no puede verificar esto**: la afirmación cruza dos repositorios y necesita los
dos en la misma corrida. Lo que sí verifica es la forma del valor (`X.Y.Z` estricto, sin
sufijo de canal, major no mayor al que existe) y que el piso se haya **revisado** en cada
bump MINOR o MAJOR, vía la marca `min_cli_version_reviewed_at`. Reafirmar el valor actual es
una revisión válida y hay que registrarla igual.

El accidente que motiva las dos reglas: el piso quedó en `2.0.0` —una versión que ningún CLI
publicado podía satisfacer— durante los releases 3.4.0 y 3.5.0, porque ningún paso del
proceso preguntaba por él.

### 5.2 El provenance se regenera una vez por release, no una vez por merge

`.sofka-asdd/sofka-asdd-provenance.json` es lo que le permite al CLI reconocer que un archivo
del consumidor es contenido del template —viejo, pero no editado— y actualizarlo en su lugar
en vez de preservarlo y dejar un `.asdd-new` al lado. Se genera acá porque el CLI clona con
`--depth 1` y no tiene historia con qué reconstruirlo.

**Cuándo hay que regenerarlo:** cuando un merge a una rama distribuible introdujo **contenido
nuevo** en rutas distribuidas. En la práctica, una vez por release, justo antes de promover.

**Por qué no hace falta en cada merge, ni en cada promoción:**

- La ventana del generador es la **unión** de `dev`, `qa` y `main`. Promover `dev` → `qa` →
  `main` solo hace que `qa` y `main` alcancen blobs que `dev` ya alcanzaba: no hay hashes
  nuevos que agregar, así que **la promoción no lo desactualiza**.
- Un provenance atrasado **no daña el upgrade en curso**: lo que le falta son los hashes más
  nuevos, que son justo los que el consumidor todavía no tiene en disco. Lo que el consumidor
  sí tiene es contenido histórico, y eso ya está registrado. El daño aparece en el upgrade
  **siguiente**, cuando el consumidor tenga en disco contenido que nunca se registró y vuelva
  como `.asdd-new`.

**Por qué el paso no se persigue la cola.** El generador excluye el prefijo `.sofka-asdd/` de
su propia ventana, así que el commit del regen —que solo toca ese archivo— no introduce
contenido que el provenance deba cubrir. Cierra en un paso.

**La excepción que sí obliga a regenerar fuera del release:** un merge que **resuelve
conflictos generando contenido que no existía en ninguno de los dos lados**. Eso es un blob
nuevo, y el check `provenance-freshness` lo va a marcar. Es la misma clase de accidente que
una vez dejó 25 rutas fuera de `distribution` al resolver un merge.

Como `dev` es una rama protegida, el regen viaja en su propio MR chico. No hay forma de
evitarlo y no hace falta: es un MR por release, no uno por merge.

## 6. Tags y branches

- **`main`** = última MAJOR (siempre avanza hacia adelante).
- **Tags** = `vMAJOR.MINOR.PATCH`. Sin prefijo de template porque el
  tag pertenece al repo. Ejemplo: `v1.0.1`, `v1.2.0`, `v2.0.0`.
- **Branches de mantenimiento** = `release/N.x` (ejemplo: `release/1.x`).
  Solo se crean si es necesario mantener fixes críticos en una MAJOR
  antigua mientras `main` ya está en la siguiente. No se crean por
  default: si no hay demanda, `main` es suficiente.

## 7. Soporte

Política ligera, revisable cuando el template tenga adopción amplia:

- **MAJOR actual (N):** soporte completo. Se aceptan fixes, mejoras y
  nuevos features.
- **MAJOR anterior (N-1):** solo fixes críticos (seguridad, bloqueo)
  durante 6 meses tras el release de N. Se publican como parches en
  `release/(N-1).x`.
- **MAJOR ≤ N-2:** fin de soporte oficial. El template sigue en git
  (ningún tag se borra), pero el equipo no se compromete con parches.

"Crítico" = pérdida de datos, falla de seguridad, bloqueo total del
flujo ASDD. No cubre mejoras ni quality-of-life.

## 8. Guías de migración

Para bumps MAJOR se crea un archivo en `.claude/docs/migrations/` con la
convención `{N}-to-{N+1}.md`. Ejemplo: `1-to-2.md`.

Cada guía incluye, como mínimo:

- **Breaking changes** — lista explícita de qué se rompió y por qué.
- **Pasos de migración** — qué debe hacer el proyecto consumidor,
  orden sugerido, cuánto tiempo tarda.
- **Script automatizado** — si aplica, un `migrate.mjs` o snippet bash
  que automatiza lo automatizable.
- **Validación final** — cómo verificar que la migración quedó limpia
  (ej. "`node .claude/scripts/validate-template.mjs` debe pasar").

Al momento del primer release (v1.0.1 retrospectivo), no existe
ninguna guía porque no hay MAJOR previa. La carpeta `.claude/docs/migrations/`
contiene solo un `README.md` explicando el formato.

## 9. FAQ

**¿Cómo actualizo mi proyecto al último template?**
Usá `sofka-ai update` si el CLI lo soporta, o compará tu
`.sofka-asdd/sofka-asdd.lock.version` contra la versión del repo
fuente. Si el bump es PATCH o MINOR, copiar los archivos modificados
es seguro. Si es MAJOR, seguí `.claude/docs/migrations/{N-1}-to-{N}.md`.

**¿Puedo saltar de 1.0 a 3.0?**
Sí, pero deberías seguir las guías `1-to-2.md` y `2-to-3.md`
secuencialmente. No hay garantía de que los cambios sean
conmutativos. El esfuerzo suele ser menor si aplicás cada migración
por separado y validás en cada paso.

**¿Qué pasa si el CLI no soporta mi template?**
Mirá la compatibility matrix (§3). Si tu template requiere un CLI
más nuevo, actualizá la CLI primero. Si la CLI es más nueva que tu
template, debería seguir funcionando hacia atrás dentro del mismo
MAJOR del contrato.

**¿Qué hago si un agente se removió en el template nuevo?**
Aparecerá en el CHANGELOG como `Removed`. Tu proyecto sigue teniendo
el agente (son archivos locales). Podés mantenerlo como fork local
si seguís usándolo, o seguir la guía de migración para reemplazarlo
por la alternativa recomendada.

**¿Puedo downgradear?**
Técnicamente sí (revertí los commits o copiá archivos desde un tag
anterior), pero no hay soporte oficial. Si encontraste un regresión,
reportala: es mejor que un PATCH la arregle que mantener versiones
divergentes.

**¿El contrato CLI puede adelantarse al template?**
Sí. El contrato puede estar en `1.2.0` mientras el template está en
`1.0.1`. La matrix declara rangos, no versiones exactas. Mientras el
contrato sea retrocompatible en su MAJOR, todo funciona.

**¿Qué versión es la "primera versión oficial"?**
`1.0.1` (retrospectiva) agrupa todo lo producido hasta la auditoría
completa. El equipo puede decidir renombrarla a `1.0.0` antes del
primer tag público si prefiere que el primer release sea exactamente
`v1.0.0`. Esa decisión se toma en el momento del tag, no ahora.

**¿Los agentes y skills tienen versión individual?**
No. El template es la unidad versionable. Cambios en agentes/skills
suben el `lock.version` conjuntamente. Esto simplifica la mental
model y evita drift entre componentes.

## 10. Convención de nomenclatura

A partir de la v2.0.0 el template adopta una convención universal de
nomenclatura con tres namespaces disjuntos. Es enforzada por el check 14
`naming-convention` del validador (`.claude/scripts/validate-template.mjs`).

| Namespace | Prefijo | Origen |
|---|---|---|
| Template ASDD | `sofka-asdd-` | COE Sofka |
| Proyecto consumidor | `{project.name}-` | Dev del proyecto |
| Plugins externos | propio del plugin | Marketplace Claude Code |

Aplica a: agentes, skills, commands, hooks y rules. No aplica a memory
files ni a archivos estándar de Claude Code (`CLAUDE.md`, `settings.json`,
`.mcp.json`).

### Relación con SemVer

- **Agregar un artefacto del template** con prefijo `sofka-asdd-*` → MINOR.
- **Renombrar o remover** un artefacto del template → MAJOR.
- **Cambiar la convención** (p.ej. cambiar `sofka-asdd-` por otro prefijo)
  → MAJOR, requiere `.claude/docs/migrations/{N}-to-{N+1}.md`.
- **Artefactos del proyecto consumidor** — fuera del alcance del versionado
  del template. El equipo del proyecto gestiona sus propios cambios.

### Documentación

La guía completa vive en `.claude/docs/adoption/naming-convention.md`. Incluye:

- Patrones por tipo de artefacto (con ejemplos buenos/malos).
- Cuándo crear agente propio vs extender agente del template.
- Tutorial paso a paso para crear un agente personalizado.
- FAQ de preguntas frecuentes sobre monorepos, override, memory files.

### Cumplimiento automatizado opcional

Este repositorio no incluye ni presupone una integración de CI. Un consumidor
puede ejecutar `node .claude/scripts/validate-template.mjs` desde su
automatización elegida. El check 14 es `strict`: artefactos sin prefijo válido
hacen que el proceso termine con exit code 1.

El CLI `sofka-ai >= 2.0.0` lee el bloque `naming_convention` de
`.sofka-asdd/cli-contract.json` y valida consistencia durante la adopción.
