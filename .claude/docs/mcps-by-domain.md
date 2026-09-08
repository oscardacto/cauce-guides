# Catálogo de MCPs por Dominio — ASDD

> Catálogo de Model Context Protocol (MCP) servers para proyectos ASDD.
> Clasificación por dominio, casos de uso por agente, comandos de instalación,
> perfiles listos para `.mcp.json`. **Última verificación:** 2026-04-23.

---

## 1. Introducción

Un **MCP** es un servidor que expone herramientas y recursos externos a
Claude Code sobre un protocolo estándar. Los agentes ASDD los aprovechan
para consultar documentación en vivo (Context7), operar issues (Jira,
GitHub), generar artefactos (Figma, Excalidraw), operar infraestructura
(Azure) o ejecutar tests (Playwright).

**Trade-off:** cada MCP activo consume tokens base por sesión; algunos
requieren credenciales. Activar solo los que el equipo usa ≥ 2 veces/semana.

**Activación:** los MCPs se declaran en `.mcp.json` en la raíz del
proyecto. En este template solo `Context7` viene instalado por default;
el resto está catalogado pero no instalado — el equipo decide cuáles
agregar según su stack.

---

## 2. Clasificación

| Categoría | MCPs | Default |
|---|---|---|
| Documentación y conocimiento | Context7 | Instalado |
| Diseño y UX | Figma, Excalidraw | Opcional |
| Testing y calidad | Playwright, SonarQube | Opcional |
| Infraestructura cloud | Azure | Opcional |
| Gestión de código | GitHub | Opcional |
| Gestión de producto | Atlassian (Jira + Confluence) | Opcional |
| Observabilidad y errores | Sentry | Opcional |
| Comunicación del equipo | Slack | Opcional |

---

## 3. Fichas por MCP

### 3.1 Context7

**Categoría:** Documentación y conocimiento · **Default:** Instalado · **Costo token:** Bajo (< 300)

**Qué expone:** `resolve-library-id` (busca librería), `get-library-docs` (obtiene doc actualizada con snippets y API).

**Casos de uso:** (1) consultar API actual de React Server Components antes de implementar; (2) validar config de Next.js, Prisma o Spring Boot en su versión actual; (3) resolver dudas de migración entre versiones mayores.

**Agentes ASDD:** `sofka-asdd-developer-backend` (verificar API, anti-alucinación) · `sofka-asdd-solution-architect` (docs de frameworks al redactar ADRs) · `sofka-asdd-researcher` (capabilities reales durante spikes).

**Instalación:**
```json
{"mcpServers": {"context7": {"command": "npx", "args": ["-y", "@upstash/context7-mcp@latest"]}}}
```

**Agente:** `mcpServers: [context7]` en frontmatter.

**Requisitos:** Node.js ≥ 18. Sin credenciales — Context7 es público.

**Notas:** primera invocación descarga ~40 MB (cachea en `~/.npm`). La description le dice a Claude que lo use para cualquier librería conocida, incluso si cree saber la respuesta — ideal anti-alucinación.

---

### 3.2 Figma

**Categoría:** Diseño y UX · **Default:** Opcional recomendado · **Costo token:** Medio (300–800)

**Qué expone:** tools para leer archivos Figma por ID, extraer componentes/tokens/estilos, obtener assets (imágenes, iconos) de un nodo.

**Casos de uso:** (1) traducir componente Figma a código React/Vue/Angular; (2) extraer design tokens para el design system; (3) verificar que la implementación respeta la especificación del diseñador.

**Agentes ASDD:** `sofka-asdd-ux-ui` (leer component specs desde Figma) · `sofka-asdd-developer-frontend` (consultar layout y tokens al implementar pantallas).

**Instalación** (variante comunitaria más usada):
```json
{"mcpServers": {"figma": {
  "command": "npx",
  "args": ["-y", "figma-developer-mcp", "--stdio"],
  "env": {"FIGMA_API_KEY": "${FIGMA_API_KEY}"}
}}}
```
Variante oficial (remote OAuth, enterprise):
```json
{"mcpServers": {"figma": {"command": "npx", "args": ["-y", "mcp-remote", "https://mcp.figma.com/mcp"]}}}
```

**Agente:** `mcpServers: [figma]`.

**Requisitos:** cuenta Figma con acceso al archivo · Personal Access Token (Figma → Settings → Personal Access Tokens) · variable `FIGMA_API_KEY` en `.env.local`.

**Notas:** el MCP oficial (`mcp.figma.com`) es remote OAuth, requiere `mcp-remote` como proxy. `figma-developer-mcp` es de terceros (Framelink) — auditar antes de adoptar a nivel empresa. Diseños grandes consumen muchos tokens — preferir consultar nodos específicos, no archivos completos.

---

### 3.3 Excalidraw

**Categoría:** Diseño y UX · **Default:** Opcional · **Costo token:** Bajo (< 300)

**Qué expone:** tools para crear diagramas Excalidraw programáticamente y exportar a `.excalidraw` o `.png`.

**Casos de uso:** (1) generar diagramas C4 como acompañamiento de ADRs; (2) bocetar flujos de usuario en fase Analizar; (3) documentar arquitectura ligera sin PlantUML/Mermaid.

**Agentes ASDD:** `sofka-asdd-solution-architect` (diagramas componente/secuencia para ADRs) · `sofka-asdd-producto` (user flows durante refinamiento).

**Instalación:**
```json
{"mcpServers": {"excalidraw": {"command": "npx", "args": ["-y", "excalidraw-mcp"]}}}
```

> Existen múltiples paquetes `excalidraw-mcp` en npm mantenidos por distintos autores. Ver documentación oficial del proyecto seleccionado antes de adoptar. Fijar versión específica en producción.

**Agente:** `mcpServers: [excalidraw]`.

**Requisitos:** Node.js ≥ 18. Sin credenciales.

**Notas:** Mermaid (nativo de Claude Code) cubre muchos casos sin necesidad de MCP — usar Excalidraw solo si se necesitan artefactos editables posteriormente.

---

### 3.4 Playwright

**Categoría:** Testing y calidad · **Default:** Opcional recomendado · **Costo token:** Medio (300–800)

**Qué expone:** tools para navegar, hacer clic, llenar formularios, screenshots, assertions, obtener DOM, capturar traces y videos.

**Casos de uso:** (1) generar tests E2E navegando la app en vivo; (2) verificar manualmente un bug antes de proponer fix; (3) auditar accesibilidad (axe-core) o performance (Lighthouse) real.

**Agentes ASDD:** `sofka-asdd-qa-engineer` (generar E2E desde criterios de aceptación) · `sofka-asdd-ux-ui` (validar responsive con screenshots en viewports) · `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend` (reproducir bugs reportados).

**Instalación** (oficial Microsoft):
```json
{"mcpServers": {"playwright": {"command": "npx", "args": ["-y", "@playwright/mcp@latest"]}}}
```

**Agente:** `mcpServers: [playwright]`.

**Requisitos:** Node.js ≥ 18. Primera ejecución descarga Chromium (~150 MB) — `npx playwright install` si falla. Permisos de red para que el navegador acceda a la app.

**Notas:** abre navegador real, consume RAM significativa. Para CI/CD preferir Playwright directo (sin MCP) en workflows GitHub Actions.

---

### 3.5 SonarQube

**Categoría:** Testing y calidad · **Default:** Opcional · **Costo token:** Medio (300–800)

**Qué expone:** tools para consultar issues del proyecto, obtener métricas (coverage, technical debt, duplications), revisar reglas de quality gate aplicadas.

**Casos de uso:** (1) revisar issues abiertos antes de crear un PR; (2) verificar que nuevo código no baja coverage global; (3) priorizar refactoring desde hotspots de technical debt.

**Agentes ASDD:** `sofka-asdd-tech-lead` (quality gate antes de merge) · `sofka-asdd-security` (security hotspots y vulnerabilities) · `sofka-asdd-qa-engineer` (analizar coverage antes de test strategy).

**Instalación:**
```json
{"mcpServers": {"sonarqube": {
  "command": "<validar comando oficial>",
  "args": ["<validar args oficiales>"],
  "env": {"SONAR_URL": "${SONAR_URL}", "SONAR_TOKEN": "${SONAR_TOKEN}"}
}}}
```

> SonarSource mantiene un servidor oficial. Validar paquete exacto y método de instalación en la documentación oficial antes de adoptar — los paquetes npm de terceros encontrados estaban marcados como DEPRECATED.

**Agente:** `mcpServers: [sonarqube]`.

**Requisitos:** instancia SonarQube (cloud o self-hosted) · token con permisos de lectura · variables `SONAR_URL`, `SONAR_TOKEN` en `.env.local`.

**Notas:** conexión síncrona — instancias lentas degradan la experiencia.

---

### 3.6 Azure

**Categoría:** Infraestructura cloud · **Default:** Opcional · **Costo token:** Alto (> 800 — catálogo grande)

**Qué expone:** tools para listar/operar recursos Azure (RGs, VMs, App Services, Storage), consultar logs de Application Insights, ejecutar comandos `az` controlados.

**Casos de uso:** (1) diagnosticar incidencias en App Services consultando logs; (2) listar recursos al redactar documentación de infraestructura; (3) validar que una IaC pipeline creó los recursos esperados.

**Agentes ASDD:** `sofka-asdd-platform-engineer` (estado de recursos y pipelines durante IaC) · `sofka-asdd-solution-architect` (validar que la arquitectura es realizable en Azure).

**Instalación** (oficial Microsoft, en beta):
```json
{"mcpServers": {"azure": {"command": "npx", "args": ["-y", "@azure/mcp@latest", "server", "start"]}}}
```

> `@azure/mcp` estaba en versión beta (3.0.0-beta.5) al verificar. Fijar versión en producción y validar flags actuales en la documentación oficial.

**Agente:** `mcpServers: [azure]`.

**Requisitos:** Azure CLI (`az`) instalado y autenticado (`az login`) · cuenta con permisos de lectura sobre la suscripción.

**Notas:** consumo de tokens alto — activar solo en sesiones donde se trabaja sobre Azure.

---

### 3.7 GitHub

**Categoría:** Gestión de código · **Default:** Opcional recomendado · **Costo token:** Medio (300–800)

**Qué expone:** tools para listar/crear issues, PRs, comments, reviews; leer archivos del repo (incluso privado); listar workflows de Actions y su status.

**Casos de uso:** (1) crear PR desde Claude Code al terminar un feature; (2) consultar issues relacionados antes de implementar; (3) revisar status de GitHub Actions sin salir del terminal.

**Agentes ASDD:** `sofka-asdd-developer-backend` (abrir PR con descripción estándar) · `sofka-asdd-tech-lead` (revisar PRs y dejar comentarios en línea) · `sofka-asdd-solution-architect` (consultar cambios previos para ADRs) · `sofka-asdd-platform-engineer` (status de workflows CI/CD).

**Instalación** (oficial de GitHub, imagen Docker en Go):
```json
{"mcpServers": {"github": {
  "command": "docker",
  "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
  "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"}
}}}
```
Alternativa remote OAuth (sin Docker):
```json
{"mcpServers": {"github": {"command": "npx", "args": ["-y", "mcp-remote", "https://api.githubcopilot.com/mcp/"]}}}
```

**Agente:** `mcpServers: [github]`.

**Requisitos:** Personal Access Token con scopes `repo`, `workflow`, `read:org` (ajustar al uso) · variable `GITHUB_PERSONAL_ACCESS_TOKEN` en `.env.local` · Docker instalado (opción recomendada).

**Notas:** `@modelcontextprotocol/server-github` en npm estaba DEPRECATED al verificar — preferir la imagen oficial (`ghcr.io/github/github-mcp-server`) o el endpoint remoto. No commitear el PAT.

---

### 3.8 Atlassian (Jira + Confluence)

**Categoría:** Gestión de producto · **Default:** Opcional recomendado · **Costo token:** Medio (300–800)

**Qué expone:** Jira (listar/crear/actualizar issues, transicionar estados, búsqueda JQL) · Confluence (leer páginas, crear documentación, buscar espacios).

**Casos de uso:** (1) sincronizar historias de usuario de Jira al refinar specs; (2) leer glosarios de dominio en Confluence; (3) transicionar issue a "In Review" al abrir PR.

**Agentes ASDD:** `sofka-asdd-producto` (leer historias, actualizar estados) · `sofka-asdd-domain-expert` (glosarios y reglas de negocio en Confluence) · `sofka-asdd-tech-lead` (enlazar PRs a issues Jira).

**Instalación** (oficial Atlassian, remote OAuth):
```json
{"mcpServers": {"atlassian": {"command": "npx", "args": ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/sse"]}}}
```
Alternativa local `mcp-atlassian` (API token):
```json
{"mcpServers": {"atlassian": {
  "command": "npx",
  "args": ["-y", "mcp-atlassian"],
  "env": {
    "CONFLUENCE_URL": "${CONFLUENCE_URL}",
    "CONFLUENCE_USERNAME": "${ATLASSIAN_EMAIL}",
    "CONFLUENCE_API_TOKEN": "${ATLASSIAN_API_TOKEN}",
    "JIRA_URL": "${JIRA_URL}",
    "JIRA_USERNAME": "${ATLASSIAN_EMAIL}",
    "JIRA_API_TOKEN": "${ATLASSIAN_API_TOKEN}"
  }
}}}
```

**Agente:** `mcpServers: [atlassian]`.

**Requisitos:** cuenta Atlassian (Cloud o Server) · API token (Account Settings → Security → API tokens) · variables `JIRA_URL`, `CONFLUENCE_URL`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` en `.env.local`.

**Notas:** la variante oficial vía `mcp-remote` requiere autorización OAuth al primer uso; cachea tokens en `~/.mcp-auth/`. Para on-prem (Server/Data Center) elegir variante local.

---

### 3.9 Sentry

**Categoría:** Observabilidad y errores · **Default:** Opcional · **Costo token:** Medio (300–800)

**Qué expone:** tool para listar issues recientes por proyecto, obtener detalles y stacktrace de un error, consultar releases asociadas a deploys.

**Casos de uso:** (1) diagnosticar por qué una release dispara errores en producción; (2) verificar que un fix desplegado redujo la tasa de errores; (3) priorizar bugs del backlog por frecuencia real.

**Agentes ASDD:** `sofka-asdd-security` (errores con patrones de exploit o fuga de información) · `sofka-asdd-developer-backend` (reproducir bugs desde stacktraces reales) · `sofka-asdd-platform-engineer` (correlacionar errores con deploys y SLOs).

**Instalación** (oficial Sentry):
```json
{"mcpServers": {"sentry": {
  "command": "npx",
  "args": ["-y", "@sentry/mcp-server@latest"],
  "env": {"SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}", "SENTRY_HOST": "${SENTRY_HOST}"}
}}}
```

**Agente:** `mcpServers: [sentry]`.

**Requisitos:** cuenta Sentry (SaaS o self-hosted) · auth token con scope `project:read`, `event:read` · variables `SENTRY_AUTH_TOKEN`, `SENTRY_HOST` en `.env.local`.

**Notas:** respeta rate limiting de Sentry — consultas frecuentes pueden disparar throttling. Para self-hosted, setear `SENTRY_HOST` a la URL interna.

---

### 3.10 Slack

**Categoría:** Comunicación del equipo · **Default:** Opcional · **Costo token:** Medio (300–800)

**Qué expone:** tools para leer mensajes de canales (si el bot tiene acceso), publicar mensajes, buscar mensajes históricos.

**Casos de uso:** (1) notificar al canal `#releases` cuando termina un deploy; (2) buscar decisiones de hilos Slack para incluir como contexto en un ADR; (3) publicar reporte de QA sign-off en el canal del feature.

**Agentes ASDD:** `sofka-asdd-producto` (notificar stakeholders al aceptar una spec) · `sofka-asdd-platform-engineer` (status de deploys al canal operativo).

**Instalación:**
```json
{"mcpServers": {"slack": {
  "command": "<validar comando oficial>",
  "args": ["<validar args oficiales>"],
  "env": {"SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}", "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"}
}}}
```

> `@modelcontextprotocol/server-slack` en npm estaba DEPRECATED al verificar. Ver documentación oficial del Slack MCP Server antes de activar — alternativas incluyen servidores self-hosted de la comunidad o `mcp-remote` apuntando a implementaciones mantenidas.

**Agente:** `mcpServers: [slack]`.

**Requisitos:** App Slack creada en api.slack.com/apps con scopes apropiados · Bot token (`xoxb-...`) · variables `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` en `.env.local`.

**Notas:** evitar configurar el MCP con permisos de escritura global; limitar a canales específicos. Verificar políticas internas antes de permitir que un agente escriba en Slack en nombre del equipo.

---

## 4. Mapeo agente ASDD → MCPs recomendados

| Agente | MCPs recomendados |
|---|---|
| `sofka-asdd-producto` | Atlassian, Slack |
| `sofka-asdd-solution-architect` | Excalidraw, GitHub, Context7 |
| `sofka-asdd-tech-lead` | GitHub, SonarQube |
| `sofka-asdd-ux-ui` | Figma |
| `sofka-asdd-developer-frontend` / `sofka-asdd-developer-backend` | Context7, GitHub |
| `sofka-asdd-security` | SonarQube, Sentry |
| `sofka-asdd-qa-engineer` | Playwright, SonarQube |
| `sofka-asdd-domain-expert` | Atlassian (Confluence para glosarios) |
| `sofka-asdd-platform-engineer` | Azure, GitHub |
| `sofka-asdd-researcher` | Context7 |
| `sofka-asdd-meta` | — (ninguno) |

---

## 5. Perfiles de `.mcp.json`

### 5.1 Mínimo (default del template)

```json
{"mcpServers": {"context7": {"command": "npx", "args": ["-y", "@upstash/context7-mcp@latest"]}}}
```
- **ENV:** ninguna · **Costo/sesión:** < 300 · **Cuándo:** siempre (default del template).

### 5.2 Estándar (la mayoría de proyectos Sofka)

```json
{"mcpServers": {
  "context7": {"command": "npx", "args": ["-y", "@upstash/context7-mcp@latest"]},
  "github": {
    "command": "docker",
    "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
    "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"}
  },
  "atlassian": {"command": "npx", "args": ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/sse"]},
  "slack": {
    "command": "<validar comando oficial>",
    "args": ["<validar args oficiales>"],
    "env": {"SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}", "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"}
  }
}}
```
- **ENV:** `GITHUB_PERSONAL_ACCESS_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`.
- **Costo/sesión:** 1.200–2.000.
- **Cuándo:** stack Sofka con GitHub + Jira/Confluence + Slack.

### 5.3 Completo (los 10 MCPs — proyectos grandes multi-stack)

```json
{"mcpServers": {
  "context7": {"command": "npx", "args": ["-y", "@upstash/context7-mcp@latest"]},
  "github": {
    "command": "docker",
    "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
    "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"}
  },
  "atlassian": {"command": "npx", "args": ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/sse"]},
  "slack": {
    "command": "<validar comando oficial>",
    "args": ["<validar args oficiales>"],
    "env": {"SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}", "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"}
  },
  "figma": {
    "command": "npx",
    "args": ["-y", "figma-developer-mcp", "--stdio"],
    "env": {"FIGMA_API_KEY": "${FIGMA_API_KEY}"}
  },
  "excalidraw": {"command": "npx", "args": ["-y", "excalidraw-mcp"]},
  "playwright": {"command": "npx", "args": ["-y", "@playwright/mcp@latest"]},
  "sonarqube": {
    "command": "<validar comando oficial>",
    "args": ["<validar args oficiales>"],
    "env": {"SONAR_URL": "${SONAR_URL}", "SONAR_TOKEN": "${SONAR_TOKEN}"}
  },
  "azure": {"command": "npx", "args": ["-y", "@azure/mcp@latest", "server", "start"]},
  "sentry": {
    "command": "npx",
    "args": ["-y", "@sentry/mcp-server@latest"],
    "env": {"SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}", "SENTRY_HOST": "${SENTRY_HOST}"}
  }
}}
```
- **ENV:** todas las listadas en las fichas.
- **Costo/sesión:** 3.500–6.000.
- **Cuándo:** proyectos grandes multi-stack. Validar consumo real con `/cost` antes de fijarlo como default.

---

## 6. Cómo adoptar un MCP

1. **Identificar necesidad** — qué agente lo usa y caso concreto.
2. **Agregar bloque en `.mcp.json`** — copiar desde la ficha. Usar `${VAR_ENV}` para credenciales.
3. **Definir variables en `.env.local`** — este archivo está en `.gitignore`, nunca commitearlo.
4. **Registrar el MCP en el frontmatter del agente** — `mcpServers: [nombre-mcp]`.
5. **Verificar** — `claude mcp list` en el proyecto confirma que el servidor arranca. Si falla, usar `claude --mcp-debug`.

---

## 7. Seguridad y secretos

MCPs que requieren credenciales:

| MCP | Credencial | Variable de entorno |
|---|---|---|
| Figma | Personal Access Token | `FIGMA_API_KEY` |
| GitHub | Personal Access Token | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| Atlassian (local) | API token | `ATLASSIAN_API_TOKEN` |
| Slack | Bot token (`xoxb-...`) | `SLACK_BOT_TOKEN` |
| Sentry | Auth token | `SENTRY_AUTH_TOKEN` |
| SonarQube | User token | `SONAR_TOKEN` |

**Reglas obligatorias:**
- Nunca hardcodear secretos en `.mcp.json`. Usar `${VAR_ENV}`.
- `.env.local` está en `.gitignore` del template — verificar que siga así.
- Rotar tokens según política del equipo de seguridad.
- Para producción compartida, preferir secret managers (Vault, Azure Key Vault, GitHub Secrets) y exportar a env antes de iniciar Claude Code.
- Context7, Excalidraw, Playwright y Azure (con `az login`) no requieren tokens en `.mcp.json` — candidatos más seguros para activación por default.

---

## 8. Trade-offs y cuándo NO usar un MCP

- **Cada MCP activo consume tokens base** — description + listado de tools cargan por sesión; si expone 30+ tools, el costo sube rápido.
- **Alternativas sin MCP existen** — copiar un snippet manual vs Context7; leer un archivo del repo vs GitHub MCP.
- **Criterio de uso:** si un MCP se invoca < 2 veces/semana, considerar removerlo y activarlo on-demand.
- **No activar lo que el equipo no usa** — un MCP inactivo es puro overhead.
- **Validar el proyecto upstream** — MCPs de terceros pueden quedar sin mantenimiento (ver paquetes DEPRECATED listados). Fijar versión y auditar antes de escalar en producción.

---

## 9. Referencias oficiales

- Especificación MCP: https://modelcontextprotocol.io
- Claude Code — MCP: https://code.claude.com/docs/en/mcp
- Context7: repo `upstash/context7` en GitHub
- Playwright MCP: repo `microsoft/playwright-mcp` en GitHub
- GitHub MCP Server: `github/github-mcp-server` en GitHub (oficial, Go)
- Azure MCP: repo `microsoft/mcp` en GitHub (`servers/Azure.Mcp.Server`)
- Sentry MCP: repo `getsentry/sentry-mcp` en GitHub
- Atlassian MCP: developer.atlassian.com
- Figma MCP: developers.figma.com (oficial); framelink.ai (terceros `figma-developer-mcp`)
- SonarQube MCP: documentación oficial SonarSource antes de adoptar
- Excalidraw MCP: documentación del proyecto específico elegido (múltiples implementaciones)
- Slack MCP: documentación oficial (el paquete npm oficial quedó deprecated al verificar)

---

> **Mantenimiento:** revisar este catálogo trimestralmente o cuando un agente
> reporte una necesidad no cubierta. Nuevos MCPs se agregan con el formato de
> la sección 3.
