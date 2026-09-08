# ASDD Orchestration — TDD Forwarding

Regla ORC-009: forward del estado TDD a Developer y QA-Engineer. Complementa `sofka-asdd-orchestration-ops.md`.

## ORC-009: TDD Forwarding (Strict TDD Mode)

Antes de delegar a `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend` en **Construir** o a `sofka-asdd-atf-api-qa-engineer` en **Verificar**:

1. Leer `.sofka-asdd/testing-capabilities.yaml` (una vez por sesión, cachear el resultado)
2. **Si `strict_tdd: true`**:
   - Inyectar en el prompt del sub-agente:
     ```
     STRICT TDD MODE ACTIVO.
     Test runner: {testing.runner.command}
     Seguir el módulo strict-tdd.md (para sofka-asdd-developer-frontend / sofka-asdd-developer-backend) o
     .claude/skills/sofka-asdd-developer-feature/strict-tdd-verify.md (para sofka-asdd-atf-api-qa-engineer).
     No caer en flujo estándar.
     ```
3. **Si el archivo no existe o `strict_tdd: false`** → modo estándar, no inyectar instrucción TDD

**Reglas:**
- Cachear el estado TDD al inicio de la sesión — no releer el archivo en cada delegación
- Si el archivo fue modificado durante la sesión (ej. el QA-Engineer lo actualizó), refrescar el caché
- Este forwarding aplica a TODAS las invocaciones de Developer (frontend/backend) y del QA-Engineer en la sesión

**Nota ATF API:** `sofka-asdd-atf-api-qa-engineer` gestiona su propio stack de testing (Bun + Playwright TS, definido en `.sofka-asdd/sofka-asdd-atf.lock`). ORC-009 le aplica solo para el strict_tdd mode de verificación de cobertura; el ciclo ATF (bootstrap → execute) sigue las reglas de `sofka-asdd-atf-api-orchestration.md`.
