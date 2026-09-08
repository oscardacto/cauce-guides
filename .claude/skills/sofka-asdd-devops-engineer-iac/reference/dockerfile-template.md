# Dockerfile — Template multi-stage

Template base para servicio Node.js. Adaptar a otros stacks manteniendo los
mismos principios: multi-stage, usuario no-root, HEALTHCHECK, `.dockerignore`.

```dockerfile
# Multi-stage build para minimizar imagen final
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runtime
# Usuario no-root por seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=appuser:appgroup . .
USER appuser

# Health check integrado
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["node", "src/index.js"]
```

## `.dockerignore` mínimo

```
node_modules
npm-debug.log
.env
.env.*
.git
.gitignore
.github
.vscode
.idea
dist
build
coverage
.DS_Store
*.md
```

## Equivalencias por stack

| Stack | FROM base | Usuario | Build cmd |
|---|---|---|---|
| Node 20 | `node:20-alpine` | `appuser` | `npm ci --only=production` |
| Python 3.12 | `python:3.12-slim` | `appuser` | `pip install --no-cache-dir -r requirements.txt` |
| Go 1.22 | multi-stage: `golang:1.22-alpine` → `alpine:3.20` | `nobody` | `go build -trimpath -ldflags "-s -w"` |
| JVM 21 | `eclipse-temurin:21-jre-alpine` | `appuser` | Copy `app.jar` |
| .NET 8 | `mcr.microsoft.com/dotnet/aspnet:8.0-alpine` | `appuser` | `dotnet publish -c Release` |

## Build con tag por SHA

```bash
docker build -t $REGISTRY/$SERVICE:$(git rev-parse --short HEAD) .
docker push $REGISTRY/$SERVICE:$(git rev-parse --short HEAD)
```
