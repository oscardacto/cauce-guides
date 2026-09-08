# Plugins por Rol — Guía para Proyectos ASDD

Catálogo de plugins de Claude Code recomendados para el workflow ASDD.
Complementa la guía de MCPs (`.claude/docs/mcps-by-domain.md`): los MCPs exponen
conectividad con sistemas externos; los plugins empaquetan agentes, skills,
commands y hooks reutilizables.

---

## 1. Introducción

Un **plugin** en Claude Code es un paquete distribuible (típicamente vía
marketplace oficial) que agrupa uno o varios artefactos agénticos: agentes,
skills, commands y/o hooks. Se activa a nivel de proyecto mediante
`marketplace.enabledPlugins` en `.claude/settings.json`.

### Diferencia con un MCP

| Aspecto | Plugin | MCP |
|---|---|---|
| Qué aporta | Artefactos agénticos (agentes, skills, commands, hooks) | Conectividad con sistemas externos (API, DB, servicios) |
| Cómo se activa | `marketplace.enabledPlugins` en `.claude/settings.json` | `mcpServers` en `.mcp.json` |
| Impacto en tokens | Carga skills/agents al context base | Registra tools disponibles (poca carga base) |

### Trade-off de tokens

Los plugins activos consumen tokens de contexto desde el arranque de cada
sesión: hooks registrados, descripciones de skills y metadatos de agentes se
cargan al inicio. Un plugin bien diseñado con progressive disclosure cuesta
bajo (< 300 tokens base); uno sobredimensionado puede sumar varios miles.

### Política del template

El template **no activa ningún plugin por default**
(`marketplace.enabledPlugins: []`). Este documento es un catálogo curado.
Cada proyecto consumidor decide cuáles activar según su stack, equipo y
perfil de riesgo.

---

## 2. Política de adopción

### Criterios antes de instalar

- **Origen auditable.** Preferir plugins con distintivo "Anthropic verified"
  o mantenedor ampliamente conocido.
- **Revisar hooks registrados.** Los hooks ejecutan código en cada sesión y
  pueden leer/escribir el codebase. Listar y entender cada hook antes de
  activar.
- **Revisar skills/agentes agregados.** Riesgo de cadena de suministro:
  un skill malicioso puede exfiltrar información.
- **Fijar versión/commit SHA.** Evitar `@latest` en producción — pin a una
  versión revisada por el equipo.
- **Medir tokens que agrega.** Estimar incremento de carga base antes y
  después de activar el plugin.

### Proceso recomendado

1. Evaluar el plugin en **un proyecto piloto durante un sprint**.
2. Medir overhead de tokens e impacto real en productividad.
3. Si el resultado justifica la adopción, **agregar al template** como
   recomendación documentada (no como activación por default).

### Contexto de riesgo del ecosistema

La comunidad de Claude Code ha documentado incidentes de supply chain:
se identificaron **655 skills maliciosos** y múltiples CVEs vinculados a
hooks/MCP de terceros. Tratar cada plugin como dependencia de producción:
auditar el código, revisar el historial de mantenimiento y fijar versión.

### Si un plugin del catálogo ya no existe

1. Buscar alternativa verificada con funcionalidad equivalente.
2. Si no hay reemplazo, usar la alternativa sin plugin documentada en la §8.
3. Reportar la deprecación como hallazgo en la próxima auditoría agéntica.

---

## 3. Tabla maestra

| Plugin | Categoría | Agente ASDD beneficiario principal | Costo token estimado |
|---|---|---|---|
| `security-guidance` | Seguridad | `asdd-security` | Medio |
| `claude-md-management` | Governance | (transversal, validación del template) | Bajo |
| `commit-commands` | Git workflow | `asdd-developer-frontend` / `asdd-developer-backend` + `asdd-tech-lead` | Bajo |
| `hookify` | Hooks library | (transversal, protección) | Bajo |

---

## 4. Fichas detalladas

### security-guidance

**Categoría:** Seguridad
**Estado por default:** No activado (requiere decisión del proyecto)
**Estimación de tokens base:** Medio
**Mantenedor:** Comunidad con distintivo "Anthropic verified" (según catálogo oficial)

#### Descripción

Plugin orientado a **detección temprana de patrones inseguros** en el código
mientras se escribe. Aporta reglas alineadas con OWASP, SAST básico y
guidance contextual para lenguajes comunes (JS/TS, Python, Java, Go).

Típicamente registra **hooks de validación** (PreToolUse / PostToolUse) que
revisan cambios en archivos y marcan usos de APIs inseguras (`md5`, `eval`,
strings de conexión hardcodeados, URLs `http://`, tokens en logs). Puede
incluir **skills de referencia** con patrones de remediación y casos OWASP
Top 10.

Licencia y estado: consultar el marketplace oficial al momento de instalar.

#### Casos de uso

1. **Fase Construir** — Al escribir un endpoint de autenticación, detecta
   `md5()` sobre contraseñas y sugiere `bcrypt`/`argon2`. El agente
   `asdd-developer-frontend` / `asdd-developer-backend` recibe la guía sin necesidad de invocar a `asdd-security`.
2. **Fase Verificar** — Al recibir un PR con cambios de auth, complementa
   al agente `asdd-security` detectando automáticamente usos de `http://`,
   tokens en logs y secretos en commits.
3. **Revisión de dependencias** — Combinado con el skill
   `security/dependency-audit`, filtra patrones que las librerías nuevas
   introducen y que no están en el radar del agente.
4. **Onboarding de devs junior** — El hook actúa como "par de seguridad"
   inmediato, reduciendo la dependencia del agente `asdd-security` para issues
   triviales.
5. **Proyectos fintech/health** — Donde compliance es crítico, el plugin
   refuerza el flujo de agente `asdd-security` + skill `compliance` con
   detecciones tempranas.

#### Instalación

1. Verificar disponibilidad: `<validar comando en doc oficial de plugins>`
2. Agregar a `.claude/settings.json`:
   ```json
   "marketplace": {
     "enabledPlugins": ["security-guidance@<pin-version>"]
   }
   ```
3. Comando exacto: `<validar comando en doc oficial del plugin>`
4. Variables de entorno/secretos: normalmente ninguno (funciona offline
   con reglas estáticas).
5. Verificación: listar plugins activos tras reiniciar Claude Code.

#### Cómo usarlo

- **Activación:** pasiva — los hooks corren automáticamente al editar archivos.
- **Integración con agente `asdd-security`:** el plugin no reemplaza al agente,
  lo complementa. El agente sigue siendo responsable de la revisión
  estratégica; el plugin captura issues tácticas.
- **Ejemplo end-to-end:** en fase Verificar de un feature de login,
  `security-guidance` marca `db.query("SELECT ... WHERE id=" + id)` como
  inyección SQL. El agente `asdd-security` lo recoge en su reporte y lo
  escala a hallazgo 🔴 en `docs/security/review-login.md`.
- **Gotchas de tokens:** los skills de referencia del plugin pueden cargar
  catálogos OWASP extensos. Verificar que usen progressive disclosure.

#### Requisitos previos

- Claude Code versión reciente con soporte de plugin marketplace.
- Sin dependencias externas si el plugin usa solo reglas estáticas.

#### Notas y gotchas

- Puede generar ruido en proyectos legacy con muchos patrones pre-existentes.
  Configurar exclusiones por ruta si aplica.
- No reemplaza un SAST profesional (Semgrep, SonarQube). Es una capa de
  guidance en tiempo de edición.
- Verificar que el plugin no ejecute comandos externos sin declararlos
  en sus hooks.

---

### claude-md-management

**Categoría:** Governance
**Estado por default:** No activado (requiere decisión del proyecto)
**Estimación de tokens base:** Bajo
**Mantenedor:** Comunidad con distintivo "Anthropic verified" (según catálogo oficial)

#### Descripción

Plugin enfocado en **mantener `CLAUDE.md` dentro de límites saludables** y
alineado con mejores prácticas. Actúa como linter/validador del archivo
raíz del proyecto y, opcionalmente, sobre archivos hijos en monorepos.

Típicamente aporta **commands** para auditar tamaño, detectar duplicación
con agentes/skills, sugerir extracción a skills cuando hay contenido pesado,
y verificar que no haya reglas de negación (anti-patrón documentado).
Puede incluir **skills de referencia** con el catálogo de límites
(< 200 líneas, < 5k tokens) y plantillas de CLAUDE.md por tipo de proyecto.

#### Casos de uso

1. **Auditoría periódica** — Ejecutar al inicio de cada sprint para
   detectar drift: CLAUDE.md creciendo descontroladamente, reglas
   duplicadas, instrucciones obsoletas.
2. **Onboarding de nuevos proyectos ASDD** — Validar que el CLAUDE.md
   copiado del template esté correctamente personalizado (nota del banner
   eliminada, agentes del template presentes, stack documentado).
3. **Complemento de `@qgt-audit-agentic-config`** — El plugin resuelve
   issues tácticas (líneas de más, duplicación); el agente auditor
   resuelve issues estratégicas (estructura, cobertura).
4. **Monorepos** — Detectar contradicciones entre CLAUDE.md raíz y
   CLAUDE.md de subproyecto (anti-patrón documentado en
   `rules/anti-patterns.md`).
5. **Antes de release del template** — Validar que CLAUDE.md del
   repositorio template cumple con los límites recomendados.

#### Instalación

1. Verificar disponibilidad: `<validar comando en doc oficial de plugins>`
2. Agregar a `.claude/settings.json`:
   ```json
   "marketplace": {
     "enabledPlugins": ["claude-md-management@<pin-version>"]
   }
   ```
3. Comando exacto: `<validar comando en doc oficial del plugin>`
4. Variables de entorno/secretos: ninguno.
5. Verificación: el plugin debería exponer al menos un command nuevo
   (ej. `/claude-md:audit`); verificar con `/` en el prompt.

#### Cómo usarlo

- **Activación:** típicamente vía command (`/claude-md:audit` o similar).
- **Integración con agentes ASDD:** `asdd-meta` lo usa como herramienta
  de governance transversal. `asdd-solution-architect` lo invoca al consolidar
  documentación al final de la fase Diseñar.
- **Ejemplo end-to-end:** `asdd-tech-lead` ejecuta el command antes de un
  release, recibe reporte con recomendaciones ("extraer sección X a skill",
  "eliminar regla duplicada"), y decide qué aplicar.
- **Gotchas de tokens:** generalmente bajo. El plugin opera sobre el archivo
  bajo demanda, no carga reglas al contexto base.

#### Requisitos previos

- Claude Code con soporte de commands de plugin.

#### Notas y gotchas

- Si el proyecto intencionalmente excede 200 líneas (caso justificado),
  documentar la excepción en `docs/audit/.exceptions.md` para que el
  plugin no reporte ruido en cada auditoría.
- Evaluar si se solapa con el agente `@qgt-audit-agentic-config` del
  Quality Gate Toolkit — elegir uno para no duplicar auditorías.

---

### commit-commands

**Categoría:** Git workflow
**Estado por default:** No activado (requiere decisión del proyecto)
**Estimación de tokens base:** Bajo
**Mantenedor:** Comunidad con distintivo "Anthropic verified" (según catálogo oficial)

#### Descripción

Plugin de productividad para el flujo Git. Aporta **commands** como
`/commit`, `/pr` y `/release` (nombres exactos pueden variar) con plantillas
alineadas a convenciones tipo Conventional Commits y generación asistida
de mensajes, descripciones de PR y changelogs.

Típicamente no agrega skills pesados — el valor está en los commands y,
a veces, un agente ligero especializado en escribir mensajes descriptivos.

#### Casos de uso

1. **Fase Construir → cierre de tarea** — El agente `asdd-developer-frontend` / `asdd-developer-backend` ejecuta
   `/commit` y recibe un mensaje en formato `feat(auth): ...` con el
   cuerpo generado a partir del diff y la spec vinculada.
2. **Apertura de PR** — `/pr` genera título + descripción con referencia
   a la spec, lista de cambios y test plan. El agente `asdd-tech-lead` revisa
   antes de publicar.
3. **Release** — `/release` genera changelog agregando commits desde la
   última tag siguiendo convenciones.
4. **Cumplimiento de convención de proyecto** — Si el equipo usa
   Conventional Commits, el plugin reduce la fricción de memorizar
   prefijos y estructura.
5. **Onboarding** — Nuevos devs producen commits bien formados desde el
   primer día.

#### Instalación

1. Verificar disponibilidad: `<validar comando en doc oficial de plugins>`
2. Agregar a `.claude/settings.json`:
   ```json
   "marketplace": {
     "enabledPlugins": ["commit-commands@<pin-version>"]
   }
   ```
3. Comando exacto: `<validar comando en doc oficial del plugin>`
4. Variables de entorno/secretos: GitHub token si `/pr` usa API de GitHub.
5. Verificación: los commands deben aparecer al tipear `/` en el prompt.

#### Cómo usarlo

- **Activación:** vía commands de usuario.
- **Integración con agentes ASDD:** `asdd-developer-frontend` / `asdd-developer-backend` es el consumidor principal
  durante la fase Construir. `asdd-tech-lead` lo usa al revisar/aprobar PRs.
  `asdd-platform-engineer` lo usa durante releases y en pipelines.
- **Ejemplo end-to-end:** al cerrar la implementación del feature `login`,
  `asdd-developer-backend` ejecuta `/commit` → mensaje generado →
  `/pr` → descripción con link a `docs/specs/login.md` → review.
- **Gotchas de tokens:** bajo. Los commands se ejecutan bajo demanda; la
  carga base es solo la metadata del command.

#### Requisitos previos

- Git configurado en el proyecto.
- Si usa `/pr` con GitHub, token con permisos `repo` (o plugin GitHub MCP).

#### Notas y gotchas

- Evaluar solapamiento si el proyecto ya tiene commands propios en
  `.claude/commands/` para commit/PR — elegir uno.
- Si el proyecto usa convenciones no estándar (gitmoji, etc.), verificar
  que el plugin las soporte o prefiera commands custom.

---

### hookify

**Categoría:** Hooks library
**Estado por default:** No activado (requiere decisión del proyecto)
**Estimación de tokens base:** Bajo
**Mantenedor:** Comunidad con distintivo "Anthropic verified" (según catálogo oficial)

#### Descripción

Plugin que ofrece un **catálogo de hooks pre-construidos** listos para
activar por configuración, sin necesidad de escribir `.mjs` propios.
Cubre casos comunes: bloqueo de comandos destructivos, validación de
formato de commits, linting automático post-edit, protección de archivos
sensibles (`.env`, secretos), notificaciones externas.

Típicamente expone **configuración declarativa** (YAML o JSON) y registra
los hooks correspondientes en los eventos del lifecycle (`PreToolUse`,
`PostToolUse`, `Stop`, etc.).

#### Casos de uso

1. **Proyecto sin hooks propios** — Activar hooks de protección básica
   (bloqueo de `rm -rf`, `git push --force` a main) sin escribir código.
2. **Estandarización en monorepo** — Mismos hooks en todos los
   subproyectos vía un único `enabledPlugins`.
3. **Fase Verificar** — Hook que ejecuta lint/tests tras cada Edit, para
   que el agente `asdd-qa-engineer` reciba feedback continuo.
4. **Agente `asdd-platform-engineer`** — Activar hooks de notificación a
   Slack/Teams tras eventos clave (despliegue, fallo en build).
5. **Guardia de secretos** — Hook pre-commit que escanea `.env`,
   complemento al agente `asdd-security`.

#### Instalación

1. Verificar disponibilidad: `<validar comando en doc oficial de plugins>`
2. Agregar a `.claude/settings.json`:
   ```json
   "marketplace": {
     "enabledPlugins": ["hookify@<pin-version>"]
   }
   ```
3. Comando exacto: `<validar comando en doc oficial del plugin>`
4. Configuración adicional: archivo de configuración del plugin (formato
   según documentación oficial) listando los hooks a activar.
5. Verificación: inspeccionar la sección `hooks` de `.claude/settings.json`
   tras activar para ver los hooks registrados.

#### Cómo usarlo

- **Activación:** declarativa vía archivo de configuración del plugin.
- **Integración con agentes ASDD:** transversal. `asdd-security` usa hooks de
  bloqueo de secretos; `asdd-qa-engineer` usa hooks de lint/test automáticos;
  `asdd-platform-engineer` usa hooks de notificación.
- **Ejemplo end-to-end:** `asdd-platform-engineer` activa un hook `dangerous-bash`
  de `hookify` que bloquea comandos destructivos. Si el equipo quisiera
  customizar, reemplaza ese hook por uno propio en `.claude/hooks/`.
- **Gotchas de tokens:** bajo — los hooks no cargan contenido al contexto,
  solo se ejecutan en eventos.

#### Requisitos previos

- Claude Code con soporte de plugin hooks.
- Node.js si el plugin ejecuta scripts `.mjs` internamente.

#### Notas y gotchas

- **Doble cobertura con hooks propios:** este template ya trae
  `pre-tool-use-dangerous-bash.mjs` y `pre-tool-use-spec-check.mjs`. Si
  `hookify` registra hooks similares, pueden duplicarse o entrar en
  conflicto — revisar antes de activar.
- Verificar qué comandos ejecuta cada hook del catálogo antes de activarlo
  (supply chain).

---

## 5. Mapeo agente ASDD → plugins candidatos

| Agente | Plugins recomendados |
|---|---|
| `asdd-producto` | — |
| `asdd-solution-architect` | `claude-md-management` |
| `asdd-tech-lead` | `claude-md-management` · `commit-commands` · `hookify` |
| `asdd-ux-ui` | — |
| `asdd-developer-frontend` / `asdd-developer-backend` | `commit-commands` |
| `asdd-security` | `security-guidance` · `hookify` |
| `asdd-qa-engineer` | `hookify` |
| `asdd-domain-expert` | — |
| `asdd-platform-engineer` | `commit-commands` · `hookify` |
| `asdd-researcher` | — |
| `asdd-meta` | `claude-md-management` |

---

## 6. Cómo adoptar un plugin (6 pasos)

1. **Identificar necesidad** — ¿qué agente o workflow se beneficia?
   Si no hay consumidor claro, **no adoptar**.
2. **Evaluar en proyecto piloto** — Activar durante 1 sprint, medir
   overhead de tokens y productividad real.
3. **Fijar versión/commit SHA** — Nunca `@latest` en producción. Pin a
   la versión revisada.
4. **Agregar a `marketplace.enabledPlugins`** — En `.claude/settings.json`
   del proyecto (no en el template, salvo decisión explícita).
5. **Documentar decisión** — En `docs/architecture/decisions/ADR-xxx.md`
   si el plugin cambia el workflow o en `ASDD-MEMORY.md` si es decisión
   operativa menor.
6. **Validar con `@qgt-audit-agentic-config`** — Auditoría agéntica para
   detectar regresiones o anti-patrones introducidos por el plugin.

---

## 7. Riesgos y cuándo NO instalar

- **Plugin no verificado** — Riesgo de supply chain (ecosistema con 655
  skills maliciosos documentados). Si no es "Anthropic verified" ni de
  mantenedor conocido, no instalar.
- **Plugin sin actualizar > 12 meses** — Posibles incompatibilidades con
  versiones recientes de Claude Code.
- **Plugins solapados** — Dos plugins de code-review generan reviews
  duplicados y confusión entre agentes. Elegir uno y desinstalar el otro.
- **Plugin que consume > 2k tokens base sin beneficio claro** —
  Desproporcionado frente al budget de contexto.
- **Plugin que activa hooks que reescriben archivos sin consentimiento** —
  Riesgo de corrupción silenciosa. Revisar qué hace cada hook antes de
  activar.

---

## 8. Alternativas sin plugins

| Plugin | Alternativa sin plugin |
|---|---|
| `security-guidance` | Usar agente `asdd-security` del template + skill `security/code-scan` + hook propio de escaneo de secretos en `.claude/hooks/`. |
| `claude-md-management` | Linter manual + agente `@qgt-audit-agentic-config` del Quality Gate Toolkit. Puede correrse en CI con GitHub Actions custom. |
| `commit-commands` | Crear commands propios en `.claude/commands/` del proyecto (`commit.md`, `pr.md`, `release.md`) con plantillas alineadas a la convención del equipo. |
| `hookify` | Escribir hooks propios en `.claude/hooks/` siguiendo el patrón de `pre-tool-use-dangerous-bash.mjs` y `pre-tool-use-spec-check.mjs` ya presentes en el template. |

Para proyectos ASDD con necesidades específicas de compliance o stack
atípico, las alternativas custom suelen ser preferibles a plugins
genéricos.

---

## 9. Referencias oficiales

- Marketplace oficial de plugins: ver catálogo oficial de Claude Code.
- Documentación de plugins: `code.claude.com/docs/en/plugins`
  (verificar versión al consultar).
- Anti-patrones de plugins: `rules/anti-patterns.md` (sección
  "Plugins y Skills de Terceros") del Quality Gate Toolkit.
- Catálogo de MCPs complementario: `.claude/docs/mcps-by-domain.md`.
- Cada plugin específico: buscar ficha en marketplace oficial.
