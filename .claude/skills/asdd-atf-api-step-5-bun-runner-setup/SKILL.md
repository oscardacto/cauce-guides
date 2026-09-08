---
name: asdd-atf-api-step-5-bun-runner-setup
description: Scaffolding del proyecto de automatización API con Bun y Playwright TS. Primer paso de la fase Automate.
used_by:
  - asdd-atf-api-step-5-automation
---

## Propósito

Crear la base ejecutable del paquete de automatización: cuando termine la Fase 4 (Automate), el equipo debe poder correr `bun test` en la carpeta `automation/` y los specs deben ejecutarse sin configuración adicional.

## Cuándo invocar

Una sola vez al inicio de Step 5, antes de generar specs por CP. Si la carpeta `automation/` ya existe (regression sobre el mismo `contract_hash`), invocar en modo `--check` (validar sin regenerar).

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `run_id` | string | Para resolver path |
| `session_config` | object | Para `app.url`, `auth`, `environment` |
| `testing_capabilities` | object | Stack declarado en `testing-capabilities.yaml` |
| `mode` | enum | `create` (default) \| `check` \| `force` (sobreescribe) |

## Estructura generada

```text
docs/testing/atf/{run_id}/automation/
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── bunfig.toml
├── .env.example                ← template de env vars (sin secretos)
├── README.md                   ← cómo correr la suite
├── helpers/
│   ├── api-client.ts           ← cliente HTTP envuelto con retries y logging
│   ├── env-loader.ts           ← carga env vars y valida los requeridos
│   ├── fixtures-loader.ts      ← lee fixtures-{wi}.json y resuelve {runtime:*}
│   ├── credentials-loader.ts   ← lee credentials.yaml en runtime (NO copia a disco)
│   ├── schema-validator.ts     ← ajv configurado con los schemas de api-context
│   └── evidence-helper.ts      ← invoca shared-evidence-collector
├── schemas/
│   └── {wi}-schemas.ts         ← schemas TypeScript derivados del openapi
├── fixtures/
│   └── {wi}-fixtures.ts        ← fixtures convertidos a constantes TS
├── specs/                      ← se llena con scaffolder en el siguiente paso
└── postman/                    ← se llena con newman-bridge
```

## Contenido clave de cada archivo

### `package.json`

```json
{
  "name": "atf-api-automation-{run_id}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:smoke": "playwright test --grep @smoke",
    "test:regression": "playwright test --grep @regression",
    "test:report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "ajv": "^8.17.0",
    "ajv-formats": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

### `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: '../reports/playwright-html', open: 'never' }],
    ['json', { outputFile: '../reports/playwright-results.json' }],
  ],
  use: {
    baseURL: process.env.ATF_API_BASE_URL ?? '{app.url-snapshot}',
    extraHTTPHeaders: {
      'X-Client-Id': 'atf-api-v3',
      'Accept': 'application/json',
    },
    trace: 'on-first-retry',
  },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
});
```

### `helpers/env-loader.ts`

Valida que todas las env vars requeridas existan antes de correr. Si falta una, falla con mensaje claro en lugar de un test mysterious failure.

### `helpers/credentials-loader.ts`

Lee `docs/testing/atf/config/credentials.yaml` en runtime, **nunca lo copia al output**. Devuelve credenciales por rol bajo demanda.

### `.env.example`

```bash
# ATF API — Test Environment Variables
# Copy to .env y completar con valores reales (gitignored)

ATF_API_BASE_URL=https://api-qa.example.com/v1
ATF_API_TIMEOUT_MS=30000

# Credenciales (si requires_auth: true)
# Estos NO se hardcodean — se leen de credentials.yaml via credentials-loader.ts
# Pero los SECRETS-AT-RUNTIME (tokens dinámicos) sí pasan por env:
# ATF_BEARER_TOKEN=
```

## Proceso

1. Validar inputs. Si `mode: check` y la carpeta ya existe → comparar contra estructura esperada, no escribir.
2. Crear estructura de carpetas.
3. Renderizar cada archivo desde templates en este skill, sustituyendo placeholders:
   - `{app.url-snapshot}` — desde session_config (no lee env en build time)
   - `{run_id}` — para identificar el paquete
   - `{wi-list}` — para schemas/fixtures
4. Ejecutar (opcional) `bun install` si el ambiente lo soporta — sino, dejar instrucción en README.
5. Validar que el scaffolding compila: `bunx tsc --noEmit` debería pasar.
6. Devolver `setup_result`.

## Output

```json
{
  "run_id": "{run_id}",
  "automation_path": "docs/testing/atf/{run_id}/automation/",
  "files_created": [
    "package.json",
    "tsconfig.json",
    "playwright.config.ts",
    "helpers/api-client.ts",
    "..."
  ],
  "mode": "create | check | force",
  "validation": {
    "structure_ok": true,
    "tsc_check": "pass | fail | skipped",
    "bun_install_executed": false
  },
  "next_step": "asdd-atf-api-step-5-playwright-api-scaffolder",
  "completed_at": "{ISO 8601}"
}
```

## Reglas duras

1. **Cero secretos en el output.** `credentials.yaml` se lee en runtime, jamás se copia a `automation/`.
2. **Reproducibilidad.** Dado el mismo `session_config` + `testing_capabilities`, el output es bit-for-bit idéntico (ignorando timestamps).
3. **No `npm install` ni `yarn`.** El stack es Bun. Las dependencies se manejan con `bun install`.
4. **Compatible con CI.** El scaffolding debe correr en GitHub Actions / GitLab CI sin cambios.

## Cuándo NO invocar

- En `fast-track` cuando la `automation/` del baseline es idéntica y se reutilizará — copiar del baseline en su lugar
- En `retest` — no se regenera scaffolding, solo se localiza el spec a re-ejecutar

## Anti-patterns

- **Hardcodear `baseURL`** en el config. Siempre via env var con fallback al snapshot de session_config.
- **Generar specs aquí.** Este skill es solo scaffolding — los specs los hace `playwright-api-scaffolder`.
- **Olvidar `.gitignore`** del paquete (excluir `node_modules/`, `.env`, `test-results/`).
- **Mezclar Playwright config con Newman**. Newman tiene su propio paquete en `postman/`.

## Referencias

- Templates: `templates/package.json.template`, `templates/playwright.config.ts.template`, `templates/helpers/api-client.ts.template`
- Ejemplo: `examples/example-setup-result.json`
