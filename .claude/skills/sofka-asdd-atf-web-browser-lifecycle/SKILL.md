---
name: sofka-asdd-atf-web-browser-lifecycle
description: Verifica disponibilidad del browser MCP antes de navegar y hace cleanup al cerrar cada fase.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

# sofka-asdd-atf-web-browser-lifecycle

## Modo VERIFY — Verificación previa del browser MCP

Invocar como `[SKILL: sofka-asdd-atf-web-browser-lifecycle | mode: verify]`.

### Protocolo de reintentos (3 intentos)

El MCP server puede tardar segundos en inicializarse tras el startup de Claude Code.
Por eso se intenta hasta **3 veces** antes de declarar fallo.

```
Para intento = 1, 2, 3:
  Ejecutar: mcp__playwright__browser_navigate con URL "about:blank"
  Si responde OK → éxito, salir del loop
  Si falla y intento < 3 → esperar 5 segundos, reintentar
  Si falla y intento == 3 → declarar fallo
```

**Espera entre intentos:** 5 segundos. Implementar con:
```bash
node -e "setTimeout(() => process.exit(0), 5000)"
```
(NO usar `sleep` ni `Start-Sleep` — usar node para compatibilidad cross-platform.)

**Si responde correctamente (en cualquier intento):**
```
✅ Browser MCP activo — pipeline puede ejecutarse completo
   Motor: mcp__playwright (Chromium)
   Las FASES 1E, 2A, 2B, 2C se ejecutarán con navegación real sobre la app
   (intento {N}/3)
```
Retorno: `{ status: "available" }`.

**Si los 3 intentos fallan:**

Antes de declarar fallo, ejecutar diagnóstico:
```bash
tasklist 2>$null | findstr /i "chromium playwright node"
```
Si NO hay procesos chromium/playwright → incluir en el mensaje:
`"Proceso Chromium no encontrado — el MCP server no spawneó."`

```
🚫 BROWSER MCP NO DISPONIBLE — pipeline bloqueado (3/3 intentos fallidos)

   Las fases 1E (Visual+A11y), 2A (Exploración), 2B (Performance) y 2C (Ejecución)
   requieren browser real y NO pueden ejecutarse con conocimiento previo.

   DIAGNÓSTICO:
   - Procesos chromium/playwright: {resultado del tasklist}
   - Verificar .claude/settings.json → enabledMcpjsonServers incluye "playwright"

   ACCIÓN REQUERIDA:
   1. En VSCode → Ctrl+Shift+P → "Claude: Restart MCP Server" → seleccionar "playwright"
   2. Verificar que @playwright/mcp esté instalado: npm install -g @playwright/mcp
   3. Cerrar este chat y abrir uno nuevo
   4. Reinvocar el pipeline con @.claude/commands/sofka-asdd/qa-web-run.md

   Fases NO bloqueadas (no requieren browser):
   - FASE 0 (Diagnóstico), FASE 1 (Estrategia), FASE 1C (Diseño), FASE 1D (Cobertura)
   Para ejecutar solo estas fases: apagar `pipeline.fase_2c_ejecucion: false` en appweb.yaml
   y relanzar el pipeline.
```

Retorno: `{ status: "unavailable" }`.

**Reglas asociadas (inviolables):**
- NO continuar con fases de browser si el MCP no está disponible.
- NUNCA generar resultados sintéticos basados en conocimiento previo para reemplazar navegación real.

---

## Modo VERIFY-NOTEBOOKLM — Verificación opcional del MCP de NotebookLM

Invocar como `[SKILL: sofka-asdd-atf-web-browser-lifecycle | mode: verify-notebooklm | enabled: {bool} | notebook_id: {id?}]`.

### Si `enabled: false` (default)

Saltar silenciosamente. Retorno: `{ status: "disabled" }`.

### Si `enabled: true`

Intentar:
```
mcp__notebooklm__notebook_list con max_results: 1
```

**Si responde correctamente:**
```
✅ NotebookLM MCP activo
   Verificar que notebook_id configurado existe en la lista.
   Si no existe → listar notebooks disponibles y pedir corrección.
```
Retorno: `{ status: "available", notebooks: [...] }`.

**Si falla:**
```
⚠️  NOTEBOOKLM MCP NO DISPONIBLE — pipeline NO bloqueado
   Instrucciones de recuperación: /mcp → Reconnect, nlm login --check, nlm login --clear
```
Retorno: `{ status: "unavailable" }`. A diferencia del browser MCP, este no bloquea el pipeline: NotebookLM es opcional.

---

## Modo CLEANUP — Cierre del browser tras fases con navegación

Invocar como `[SKILL: sofka-asdd-atf-web-browser-lifecycle | mode: cleanup | browser_phases_ran: {bool}]`.

Donde `browser_phases_ran` es `true` si alguna de estas fases se ejecutó en el run actual:
- FASE 1E (Visual+A11y)
- FASE 2A (Exploración)
- FASE 2B (Performance)
- FASE 2C (Ejecución)

### Si `browser_phases_ran: true`

Cerrar browser:
```
browser_close()
```
Log: `🧹 Browser cerrado`.

### Si `browser_phases_ran: false`

No-op silencioso. Retorno: `{ status: "noop" }`.

**Cuándo invocar este modo:**
- Al final de CONSOLIDACIÓN FINAL
- Al cerrar Fase 3
- Al cerrar el pipeline si la última fase activa fue posterior a 1E
