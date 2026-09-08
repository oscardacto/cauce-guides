---
description: Handoff de QA — transfiere o recibe trabajo en progreso. Auto-detecta si enviás, recibís o actualizás.
mode: 'agent'
---

Inicia el flujo de Handoff de QA.

**PASO 1 — Auto-detección de modo:**

Ejecutar:
```bash
node .claude/tools/handoff.js --mode=detect
```

Leer el exit code y seguir el flujo correspondiente:

---

**Exit 2 — MODO ENVIAR**

El QA actual va a transferir su trabajo a otro miembro del equipo.

1. Preguntar al usuario:
   - **Razón** del handoff (vacaciones, incapacidad, rotación, etc.)
   - **Notas** para el receptor (contexto relevante, preguntas pendientes del cliente, decisiones abiertas)

2. Ejecutar:
   ```bash
   node .claude/tools/handoff.js --mode=send --reason="{razón}" --notes="{notas}"
   ```

3. Mostrar el resumen del handoff:
   - Archivos staged + run_id + estado del pipeline + fases pendientes
   - **Listado de archivos sensibles excluidos automáticamente** (sección `🔒` del output): el script declara qué credentials/session_state/cookies/MFA scripts NO se subieron — el receptor debe recrearlos localmente. El manifest persiste esta lista en `sensitive_excluded.files` para auditoría.

4. Sugerir el commit:
   ```
   git commit -m "HANDOFF: {nombre} — post-FASE {fase} — {razón}"
   ```
   Esperar confirmación del usuario antes de hacer commit.
   Recordar que el `git push` lo hace el QA manualmente.

---

**Exit 3 — MODO RECIBIR**

Otro QA transfirió trabajo y este usuario lo está recibiendo.

1. Ejecutar:
   ```bash
   node .claude/tools/handoff.js --mode=receive
   ```

2. Mostrar al usuario:
   - Quién envió el handoff y cuándo
   - Notas del remitente
   - Estado del pipeline (fases completadas / pendientes)
   - Archivos presentes vs faltantes

3. Sugerir configuración en `appweb.yaml`:
   - `run_id: "{run_id del manifest}"` (detección automática de continuación)
   - Habilitar las fases pendientes en `pipeline:`

4. Recordar:
   - Verificar `credentials.yaml` (cada QA tiene las suyas)
   - Ejecutar `@.claude/commands/asdd/qa-web-run.md` cuando esté listo
   - Al terminar: `node .claude/tools/handoff.js --mode=cleanup`

---

**Exit 4 — MODO ACTUALIZAR**

El mismo QA que envió el handoff quiere actualizar las notas o re-generar el manifest.

1. Preguntar al usuario:
   - **Notas adicionales** o correcciones

2. Re-ejecutar:
   ```bash
   node .claude/tools/handoff.js --mode=send --reason="{razón_original_o_nueva}" --notes="{notas_actualizadas}"
   ```

3. Sugerir commit con mensaje actualizado.
