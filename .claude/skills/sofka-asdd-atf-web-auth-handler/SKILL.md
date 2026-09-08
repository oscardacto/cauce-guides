---
name: sofka-asdd-atf-web-auth-handler
description: Login web via Playwright MCP con credenciales YAML, switch de roles y storageState para apps con MFA.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `credentials_path` | string | Ruta a `credentials.yaml` (default: `docs/testing/atf-web/config/credentials.yaml`) |
| `role` | string | Rol a autenticar: `default` o nombre de rol específico |
| `app_url` | string | URL base de la aplicación |
| `auth_required` | boolean | Si `false`, retorna sesión anónima sin ejecutar login |
| `mfa_type` | string | Opcional. `""` \| `microsoft_authenticator` \| `google_auth` \| `totp` \| `manual_confirm` (emulación). Si `!= ""`, el handler intenta restaurar `storageState` en PASO 1.5a antes del login clásico. El valor es informativo — el flujo es idéntico para todos los tipos (restaurar storageState pre-capturado). `manual_confirm` se usa en apps sin 2FA real (ej. SauceDemo) para ejercitar el flujo MFA end-to-end. |
| `session_state_file` | string | Opcional. Ruta al archivo de `storageState` generado por `save-session.js`. Requerido si `mfa_type != ""`. |
| `session_health_check_selector` | string | Opcional. Selector CSS visible solo cuando el usuario está autenticado (usado por PASO 1.5a health-check). |

**Estructura de `credentials.yaml`:**
```yaml
# Formato canónico — alineado con CLAUDE.md
environments:
  production:                        # debe coincidir con appweb.yaml → app.environment
    roles:
      standard_user:                 # nombre del rol (referenciado en appweb.yaml → auth.default_role)
        username: "standard_user"
        password: "secret_sauce"
      locked_out_user:
        username: "locked_out_user"
        password: "secret_sauce"

# Configuración de login (usada por el auth-handler para localizar elementos)
login_url: "/"                       # path relativo al app_url
login_fields:
  username_selector: "#user-name"    # selector CSS del campo de usuario
  password_selector: "#password"      # selector CSS del campo de contraseña
  submit_selector: "#login-button"   # selector CSS del botón de login
session_indicator: ".inventory_list"  # elemento visible solo cuando autenticado
```

**Resolución de credenciales:**
1. Leer `environments.{app_environment}.roles.{role}`
2. Si no existe el environment → buscar `environments.*.roles.{role}` (único match)
3. Si no existe el rol → buscar `environments.{env}.roles.default`
4. Si nada resuelve → error `credentials_not_resolved`

---

## PASO 1 — Verificar si auth es requerida

`auth_required: false` → retornar `{authenticated: false, session: "anonymous"}`
`auth_required: true` → continuar

## PASO 1.5a — Restaurar storageState (MFA)

**Condición de activación:** `mfa_type != ""` AND `session_state_file != ""`.
Si cualquiera de las dos condiciones es falsa → saltar a PASO 2 (login clásico).

**Protocolo canónico:** ejecutar el **Protocolo MFA definido en REGLA 8** de
[`reference/atf-web/sofka-asdd-atf-web-executor-invariants.md`](../../reference/atf-web/sofka-asdd-atf-web-executor-invariants.md) — Fases 1
(verificar archivo) → 2 (cargar storageState, Camino A nativo o Camino B fallback) →
3 (health check vía `session_health_check_selector` o heurística) → 4 (retorno).

**Mapeo de retornos de la REGLA 8 al contrato de este skill:**

| Resultado REGLA 8 | Retorno de auth-handler |
|---|---|
| Sesión válida | `{ authenticated: true, session: "restored_mfa", role, auth_method: "mfa_storage_state", session_state_used: true, errors: [] }` — saltar PASO 2..6 |
| `mfa_session_file_not_found` / `mfa_session_file_corrupt` / `mfa_session_expired` | `{ authenticated: false, session: null, role, error: "{reason}", action_required: "{cmd}", errors: [...] }` — el executor escribe `execution_blocked.json` con el `action_required` |
| Selector ausente pero sin indicador de login | warning en log, **continuar a PASO 2** (fallback a credenciales clásicas) |

**No duplicar las Fases 1-4 aquí:** REGLA 8 es la SSoT. Si el protocolo cambia (ej:
el MCP Playwright expone nuevas capacidades), se actualiza en `sofka-asdd-atf-web-executor-invariants.md`
una sola vez — este skill lo hereda por referencia.

## PASO 2 — Cargar credenciales

1. Leer `credentials.yaml` en la ruta especificada
2. Extraer credenciales para el `role` solicitado
3. Rol no existe → usar `default`
4. Archivo no existe → retornar error `credentials_file_not_found`
5. **NUNCA** registrar valores de credenciales en outputs, logs o reports

## PASO 3 — Verificar sesión existente

1. Navegar a `app_url`
2. Buscar `session_indicator` en el snapshot
3. Presente → `{authenticated: true, session: "reused"}`
4. No presente → proceder con login

## PASO 4 — Ejecutar login

1. Navegar a `app_url + login_url`
2. Localizar `username_selector` → fill con username del rol
3. Localizar `password_selector` → fill con password del rol
4. Localizar `submit_selector` → click
5. Esperar navegación post-submit (máx 15s)
6. Tomar snapshot de estado resultante

## PASO 5 — Validar login

- `session_indicator` presente → `{authenticated: true, session: "new", role: "rol_solicitado"}`
- No presente + error visible → `{authenticated: false, error: "credenciales_incorrectas"}`
- No presente + sin error → reintentar PASO 4 ×1; si falla → `{authenticated: false, error: "login_timeout"}`

## PASO 6 — Switch de rol

1. Buscar opción de logout en la UI (botón, menú de perfil)
2. Ejecutar logout
3. Esperar que `session_indicator` desaparezca
4. Ejecutar PASO 4 con credenciales del rol destino
5. Validar nueva sesión (PASO 5)

---

## Output

```json
{ "authenticated": true, "session": "new", "role": "default",
  "auth_method": "form_login", "login_url_used": "/login",
  "session_indicator_found": true, "errors": [] }
```

**Error:**
```json
{ "authenticated": false, "session": null, "role": "default",
  "error": "credenciales_incorrectas",
  "errors": ["Login form submitted but session_indicator not found after 2 attempts"] }
```

---

## Reglas críticas

- **NUNCA** incluir valores de username o password en ningún output o log
- **NUNCA** hardcodear credenciales en el código del agente
- `credentials.yaml` no existe + `auth_required: true` → bloquear ejecución y notificar al Orchestrator
- Las credenciales son referencias: el agente solo sabe que usó el rol `default`, no el valor real
