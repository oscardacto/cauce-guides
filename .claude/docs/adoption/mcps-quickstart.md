# MCPs Quickstart — Activación Rápida por Dominio

Esta guía complementa el archivo `.mcp.recommended.json` y el catálogo
extendido en `.claude/docs/mcps-by-domain.md`.

## Decisión por dominio del proyecto

| Si tu equipo usa… | Activar MCP | Skills/agentes que se desbloquean |
|---|---|---|
| **Cualquier stack** (default) | `context7` | Toda la suite (documentación de librerías) |
| **Jira / Confluence (Atlassian)** | `atlassian` | `asdd-producto-po`, `producto-pm`, tickets enlazados a specs |
| **GitHub** (PRs, issues, CI) | `github` | `asdd-tech-lead-code-review`, comentarios en PR, automatización de issues |
| **Sentry / observabilidad** | `sentry` | `asdd-platform-engineer-observability`, SLOs reales con datos vivos |
| **Figma** (diseño UI) | `figma` (catálogo) | `asdd-ux-ui-component-spec`, `ux-ui-design-tokens` |
| **GitLab** (en lugar de GitHub) | `gitlab` (catálogo) | `tech-lead-code-review` sobre MRs |
| **Datadog / Grafana** | `datadog` o `grafana` (catálogo) | Métricas y alertas reales en `platform-engineer-observability` |

## Activación del baseline recomendado

```bash
# 1. Copiar el perfil baseline sobre el .mcp.json actual
cp .mcp.recommended.json .mcp.json

# 2. Configurar variables de entorno requeridas
export ATLASSIAN_HOST="https://miorg.atlassian.net"
export ATLASSIAN_EMAIL="usuario@miorg.com"
export ATLASSIAN_API_TOKEN="..."

export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_..."

export SENTRY_AUTH_TOKEN="..."
export SENTRY_ORG="miorg"

# 3. Reiniciar Claude Code para que tome los nuevos servers
```

## Activación selectiva (no full-baseline)

Si solo necesitás 1-2 MCPs adicionales sobre context7, editar `.mcp.json`
manualmente y agregar únicamente las entradas relevantes desde
`.mcp.recommended.json`. Mantener context7 como mínimo.

## Variables de entorno por MCP

| MCP | Variables requeridas | Cómo obtenerlas |
|---|---|---|
| `atlassian` | `ATLASSIAN_HOST`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` | `id.atlassian.com/manage-profile/security/api-tokens` |
| `github` | `GITHUB_PERSONAL_ACCESS_TOKEN` | `github.com/settings/tokens` (scope: `repo`, `read:org`) |
| `sentry` | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` | `sentry.io/settings/account/api/auth-tokens/` |

## Buenas prácticas

1. **Pinear versiones.** Reemplazar `@latest` por versión major estable en `.mcp.json` antes de pasar a producción. `@latest` es aceptable durante adopción, problemático en operación.
2. **Variables de entorno fuera del repo.** Usar `.env` local + secret manager en CI/CD. Nunca commitear tokens.
3. **Auditar el supply chain.** Antes de instalar un MCP de la comunidad, verificar repositorio oficial, número de descargas, y última actualización.
4. **MCPs solo si se usan.** Cada MCP activo carga ~50-100 tokens de description al inicio de sesión. No instalar lo que el equipo no consume.

## Trazabilidad con el catálogo extendido

`.claude/docs/mcps-by-domain.md` mantiene el catálogo completo (9+ MCPs por dominio).
Esta guía es el atajo: el baseline mínimo viable + los 3 add-ons más
demandados en proyectos enterprise Guide.
