---
description: Recepción de handoff QA — detecta el handoff pendiente, lo aplica y continúa el pipeline con el run_id existente.
mode: 'agent'
---

## Propósito

Manual operativo para el QA que **recibe** un handoff de otro miembro del equipo. Complementa `/asdd:qa-web-handoff` (auto-detecta modo). Si solo necesitas la auto-detección, invoca `/asdd:qa-web-handoff` directamente — este command es la guía paso a paso cuando ya sabes que vas a recibir.

**Cuándo usar:** otro QA dejó un commit en la rama del proyecto (mensaje típico `HANDOFF: {nombre} — post-FASE {X} — {razón}`) y tomas su trabajo desde ahí.

---

## Prerequisitos

1. Repo del proyecto clonado localmente. Si es tu primer setup, leer [`README.md`](../../README.md) raíz (quickstart 5 min).
2. Git con identidad propia configurada:
   ```bash
   git config user.name "Tu Nombre"
   git config user.email "tu@empresa.com"
   ```
   La auto-detección de modo aborta si `user.name` está vacío.
3. Node.js ≥ 20 (`node --version`).
4. Misma rama donde el remitente hizo push (coordinar con QA-A).
5. Tus credenciales locales — TODAS las variantes están gitignored y NO viajan en el handoff:
   - `docs/testing/atf-web/config/credentials.yaml` (canónico)
   - `docs/testing/atf-web/config/credentials_<app>.yaml` (per-app, ej: `credentials_fogafin.yaml`)
   - `docs/testing/atf-web/config/credentials.<app>.yaml` (variante, ej: `credentials.saucedemo.yaml`)
   - `docs/testing/atf-web/config/session_state_<env>.json` (storageState MFA)

   Template público disponible: `docs/testing/atf-web/config/credentials.example.yaml` (sí está versionado).

---

## PASO 1 — Traer el commit del remitente

```bash
git pull
```

Cambios esperados en `docs/testing/atf-web/`, `docs/testing/atf-web/knowledge/`, `.claude/agent-memory/`, `docs/testing/atf-web/requirements/` y un nuevo `handoff_manifest.json` en la raíz del repo.

---

## PASO 2 — Detectar modo

```bash
node .claude/tools/handoff.js --mode=detect
```

Output esperado:
```
📥 MODO: RECIBIR (manifest.from_qa = "alejandro.carmona" ≠ "tu.nombre")
   run_id: MiApp-v1.0-20260101-0900
```
Exit code: `3`.

| Exit | Modo | Acción |
|---|---|---|
| 2 | ENVIAR | No hay manifest local — vuelve al PASO 1 o verifica la rama |
| 3 | RECIBIR | Continúa al PASO 3 |
| 4 | ACTUALIZAR | Git piensa que tú eres el remitente — revisa `git config user.name` |

---

## PASO 3 — Leer el handoff

```bash
node .claude/tools/handoff.js --mode=receive
```

Output esperado:
```
📥 HANDOFF RECIBIDO
   De:              alejandro.carmona (alejandro@empresa.com)
   Fecha:T16:00:00Z
   Razón:           Vacaciones
   Run ID:          MiApp-v1.0-20260101-0900
   Archivos:        142 presentes, 0 faltantes

📝 Notas del remitente:
   Falta resolver preguntas del cliente sobre HU-1186.

🚦 Estado del pipeline:
   Completadas:     0, 1, 1C
   Pendientes:      1D, 2C
   Siguiente:       Configurar run_id existente y ejecutar fase 1D
```

El comando **no falla** si hay archivos faltantes — los lista para tu revisión. Ver "Errores comunes" más abajo.

`handoff_manifest.json` queda actualizado con `to_qa` (tú) y `received_date`.

---

## PASO 4 — Configurar `appweb.yaml`

Editar `docs/testing/atf-web/config/appweb.yaml` (si no existe, copiar de `docs/testing/atf-web/config/appweb.example.yaml` y completar):

1. `run_id: "{run_id que mostró el comando}"` — el orquestador detecta automáticamente que es un run existente y reanuda en él.
2. En `pipeline:` — habilitar las fases pendientes en `true`, dejar las completadas en `false`.
3. Verificar `test_run.mode` y `custom_tags` si aplican (los valores de `appweb.yaml` actuales prevalecen sobre `session_context.json` previo).
4. **Verificar campos del schema actual** (introducidos post-2026-05):
   - `enrichment.cross_cutting_mode`: `literal` (default app interna) | `expanded` (app cara al usuario) | `shift_left` (app crítica). Controla cuántos riesgos cross-cutting (XSS/SQLi/timing) infiere el strategist.
   - `security.compliance`: array opcional con marcos regulatorios (ej: `["OWASP-Top10"]`, `["PCI-DSS"]`, `["HIPAA"]`). Riesgos de estos marcos se emiten como `compliance_mandatory` (sin tag `@requiere-validacion`).
   - `visual_ux_a11y.enabled`: `true` para activar `/asdd:qa-web-visual-ux-a11y` (auditoría 3 aristas). Independiente del pipeline CP-by-CP.

   Si el remitente trabajó con un set de valores específico en su `appweb.yaml`, esos valores **NO viajan** (el archivo `appweb.yaml` del repo es el canónico — coordinar con remitente si hay duda sobre el modo activo).

---

## PASO 5 — Verificar tus credenciales y sesión MFA

### 5.1 Credenciales user/password (canónico)

Crear `docs/testing/atf-web/config/credentials.yaml` (gitignored, NUNCA viaja en handoff). Si no existe:
```bash
cp docs/testing/atf-web/config/credentials.example.yaml docs/testing/atf-web/config/credentials.yaml
# Editar y completar
```

Shape requerido:
```yaml
environments:
  qa:
    roles:
      admin:
        username: "..."
        password: "..."
```

Sin esto, el executor escribirá `execution_blocked.json` por credenciales ausentes.

### 5.2 Variantes per-app (si el remitente las usaba)

Si el manifest del handoff indica que el run usa `credentials_<app>.yaml` o `credentials.<app>.yaml`, debes crear esa variante por separado (gitignored). Pregunta al remitente por la estructura de roles esperada.

### 5.3 Sesión MFA (si la app la requiere)

Si `appweb.yaml → auth.mfa_type` no está vacío, el run reutiliza un `session_state_<env>.json` capturado por save-session. Ese archivo NO viaja en el handoff (gitignored). Recrearlo localmente:
```bash
node .claude/tools/save-session.js --env qa
```
Login + MFA manual UNA vez → captura `storageState` para los siguientes runs.

### 5.4 Conexión a BD (si aplica)

Si el run usa validación BD (`db_validator`), agregar bloque `database.<env>` a `credentials.yaml` con credenciales SOLO LECTURA (el framework rechaza queries no-SELECT). Ver [`db_tables_registry.<app>.yaml`](../config/) para conocer las tablas configuradas.

---

## PASO 6 — Continuar el pipeline

Tres opciones según lo que el remitente dejó pendiente:

### Opción A — pipeline canónico
```
/asdd:qa-web-run
```
El orquestador detecta `run_id` existente (modo CONTINUACIÓN), valida que `docs/testing/atf-web/{run_id}/session_context.json` existe, y reanuda desde la primera fase pendiente sin crear un run nuevo.

### Opción B — fast-path: re-ejecutar CPs puntuales
Útil si el remitente dejó CPs en FAIL/BLOCKED y quieres re-ejecutarlos tras fix:
```
/asdd:qa-web-exec
```
con `appweb.yaml → test_run.custom_tags: ["@cp:CP-..."]` apuntando a los CPs de interés.

### Opción C — fase Visual + UX + Accesibilidad
Independiente del pipeline CP-by-CP. Útil si el remitente terminó FASE 2C y queda pendiente la auditoría de calidad UX:
```
/asdd:qa-web-visual-ux-a11y --run-id={run_id}
```
Requiere `appweb.yaml → visual_ux_a11y.enabled: true`. Para revisión LLM cross-pantallas de copy/UX writing: agregar `--deep-llm`.

---

## PASO 7 — Cleanup al terminar

Cuando completes el run y commitees los nuevos artefactos:

```bash
node .claude/tools/handoff.js --mode=cleanup
```

Output esperado:
```
🗑️  Des-trackeado: output
🗑️  Eliminado: handoff_manifest.json

✅ CLEANUP COMPLETO
```

Luego:
```bash
git commit -m "HANDOFF-CLEANUP: des-trackea artefactos post-handoff"
git push
```

`docs/testing/atf-web/` vuelve a estar gitignored. `docs/testing/atf-web/knowledge/`, `.claude/agent-memory/` y `docs/testing/atf-web/requirements/` permanecen tracked (estado permanente del proyecto).

---

## Errores comunes

| Síntoma | Causa | Resolución |
|---|---|---|
| `No existe handoff_manifest.json` | No hiciste `git pull` o estás en rama incorrecta | `git fetch`, cambia a la rama del handoff, `git pull` |
| `handoff_manifest.json no es JSON válido` | Archivo corrupto (edición manual / merge roto) | Pedir al remitente re-ejecutar `--mode=send` y volver a pushear |
| `git config user.name no configurado` | Git sin identidad local | `git config user.name "..." && git config user.email "..."` |
| `--mode=receive` reporta archivos faltantes | Push parcial o `.gitignore` excluyó rutas necesarias | Revisar lista; si incluye `session_context.json` o `cp_modulo_*.json` → pedir re-send |
| Pipeline falla con `run_id no encontrado` | La carpeta del run no llegó | `ls docs/testing/atf-web/{run_id}/` → si no existe, re-pedir handoff |
| Executor reporta credenciales vacías | `credentials.yaml` o `credentials_<app>.yaml` no existe local (NO viaja en handoff) | Crear con shape canónico (PASO 5.1/5.2) |
| Executor reporta `mfa_session_invalid` o `session_state_file_not_found` | `session_state_<env>.json` no existe local (NO viaja en handoff) | `node .claude/tools/save-session.js --env qa` (PASO 5.3) |
| `db_validator` reporta `connection refused` o credenciales BD ausentes | Bloque `database.<env>` faltante en `credentials.yaml` (NO viaja en handoff) | Agregar bloque BD con usuario SOLO LECTURA (PASO 5.4) |
| Strategist reporta riesgos sin `source` ni `tags` (schema legacy) | El run del remitente fue producido antes del schema v2 risks | Re-ejecutar `/asdd:qa-web-strategize --run-id={X}` para regenerar `risk_matrix.json` con clasificación de origen |
| Dashboard tab Visual+UX+A11y vacío al recibir | El remitente no había ejecutado `/asdd:qa-web-visual-ux-a11y` | Ejecutar `/asdd:qa-web-visual-ux-a11y --run-id={X}` después de `/asdd:qa-web-run` o `/asdd:qa-web-exec` (Opción C del PASO 6) |

---

## Casos especiales

### Handoff parcial (archivos faltantes)

`--mode=receive` reporta la lista pero no aborta. Evalúa qué falta:

- `session_context.json` o `cp_modulo_*.json` ausentes → no se puede continuar; pedir re-send.
- Screenshots históricos ausentes → no bloquea (a menos que `evidence_mode: all` requiera evidencia retrospectiva).

### Receptor con artefactos locales previos

Si ya tenías `docs/testing/atf-web/{run_id}/` local (por ejemplo, mismo run en otra máquina), `git pull` sobreescribe tus archivos con los del remitente — los del remitente son la fuente de verdad. Si dudas, abortar el pull y coordinar antes.

### Múltiples handoffs sobre el mismo run

Después de commitear trabajo tuyo, `--mode=detect` puede seguir viendo `from_qa = {remitente original}` (el manifest no cambia salvo que re-ejecutes `--mode=send`).

- **Re-transferir a un tercer QA:** `--mode=cleanup` → `--mode=send` con tu identidad. El tercer QA entra en modo RECIBIR.
- **Devolver al remitente original:** mismo flujo — el remitente al hacer detect verá `RECIBIR`.
- **Solo actualizar notas (sin cambio de responsable):** `--mode=send` con notas nuevas (modo ACTUALIZAR del `/asdd:qa-web-handoff`).

---

## Verificación

1. **Detect funciona:** `node .claude/tools/handoff.js --mode=detect` → exit 3 con `MODO: RECIBIR`.
2. **Receive muestra estado correcto:** lista remitente, `run_id`, fases, archivos presentes/faltantes; `handoff_manifest.json` queda con `to_qa` = tu identidad git.
3. **Pipeline reanuda:** al correr `/asdd:qa-web-run`, el orquestador loguea `🔄 CONTINUACIÓN de run existente: {run_id}` y NO crea un run nuevo.
4. **Cleanup final:** tras `--mode=cleanup`, `git status` muestra los archivos de `docs/testing/atf-web/` como eliminados del índice y el manifest borrado.

---

## Conflictos conocidos

| Situación | Riesgo | Mitigación |
|---|---|---|
| Identidad git compartida entre QAs | `detect` confunde ENVIAR/RECIBIR | Cada QA con `git config user.name` único |
| Merge entre dos handoffs concurrentes | Alto — no soportado | Un handoff activo a la vez por rama |
| Cambios al `.gitignore` del remitente excluyen rutas | Medio | Coordinar cambios al `.gitignore`; el cleanup post-handoff los re-restaura |
