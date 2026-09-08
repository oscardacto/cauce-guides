---
description: Alista una app nueva en el ATF Web por cuestionario interactivo, en 5 a 15 minutos.
---

# /sofka-asdd:qa-web-setup-app — Alistamiento de nueva app

Comando para configurar una app nueva en el ATF desde cero. Recoge 5 datos clave del usuario via cuestionario y delega la escritura de archivos al script atómico `tools/setup-app.js`.

> **Prerrequisito**: instalá las dependencias runtime de ATF Web antes de tu primer alistamiento — ver `.claude/docs/adoption/atf-web-setup-dependencies.md`.

## Filosofía

Doctrina prosa-vs-código aplicada:
- **Prosa (este comando)**: conduce el cuestionario interactivo. Decisión contextual del LLM (interpretar respuestas naturales, sugerir defaults, validar coherencia entre respuestas).
- **Script atómico (`tools/setup-app.js`)**: escribe los archivos. Validador determinístico, sin escapes Windows frágiles.

## Argumento

`{app_name}` — nombre canónico de la app (alfanumérico, sin espacios). Ej: `OrangeHRM`, `FogafinSIO`, `GNP-Vital`.

Si el QA no lo provee, preguntar primero antes del cuestionario.

## Reglas inviolables

1. **NO leer archivos del proyecto antes del cuestionario** — el comando es self-contained.
2. **NO `Bash node -e` inline** — toda la escritura va por el script atómico.
3. **NO crear archivos manualmente con Write tool** — el script garantiza atomicidad e idempotencia.
4. **Si el script retorna exit 1** → mostrar el error de stderr al usuario, NO continuar.

## Flujo

### 1. Validar argumento

- Si `{app_name}` vacío → preguntar al usuario "¿Cuál es el nombre canónico de la app?".
- Validar formato: `[A-Za-z0-9_-]+`. Si tiene espacios → pedir versión sin espacios.

### 2. Verificar que templates existen

```bash
ls docs/testing/atf-web/config/templates/*.template 2>/dev/null | wc -l
```

Esperado: 4 (appweb.yaml, credentials.yaml, db_tables_registry, knowledge_skeleton). Si <4, abortar con instrucción de restaurar `docs/testing/atf-web/config/templates/`.

### 3. Cuestionario consolidado (1 mensaje, 5 preguntas con defaults)

> ⚡ **Patrón consolidado:** emitir las 5 preguntas EN UN SOLO MENSAJE con defaults sugeridos. El usuario responde libre (lista, prosa, "default todas excepto X"). Solo pedir aclaración del/los campo(s) faltantes si la respuesta es incompleta. **NO secuencializar** las 5 preguntas — son round-trips desperdiciados (~750-1500 tokens vs ~250-500 con tabla consolidada).

Mensaje literal a emitir (en español, formato tabla):

```
Voy a alistar la app `{app_name}`. Necesito 5 datos — responde como prefieras
(lista, prosa, o "default todas excepto X"):

1. URL base de la app
   Ej: https://app.cliente.com/login

2. Ambiente de pruebas (etiqueta para reportes — el QA opera en uno solo)
   Default: qa  |  Otros: dev, demo, staging, prod

3. Rol por defecto para ejecutar los CPs
   Ej: admin, standard_user, qa_user
   (Las credenciales reales se editan manualmente en credentials.yaml después)

4. MFA / 2FA
   Default: no  |  Otros: manual_confirm, microsoft_authenticator, google_auth, totp

5. Base de datos para validación SELECT
   Default: no  |  Otros: mssql, postgres, mock
   (Si sí, usar credenciales SOLO LECTURA — el framework rechaza no-SELECT)

Espero tu respuesta para invocar setup-app.js.
```

**Procesamiento de la respuesta del usuario:**

Aceptar formatos flexibles:
- Lista numerada: `1. https://...  2. demo  3. admin  4. no  5. no`
- Prosa: `URL https://app.cliente.com login, ambiente demo, rol admin, sin MFA, sin BD`
- Defaults parciales: `URL https://app.cliente.com, default todo lo demás, rol admin`

Si algún campo crítico falta o es ambiguo (URL vacía, rol vacío) → preguntar SOLO ese campo, no repetir toda la tabla.

Si MFA ≠ `no` → recordar al final del paso 4: *"Tras `/sofka-asdd:qa-web-setup-app` ejecutar `node .claude/tools/save-session.js --env {ambiente}` UNA vez."*
Si BD ≠ `no` → recordar al final del paso 4: *"Usar credenciales SOLO LECTURA en credentials.yaml → database."*

### 4. Resumen y confirmación

Mostrar al usuario:

```
📋 Resumen del setup:
   App:         {app_name}
   URL:         {url}
   Ambiente:    {environment}
   Rol:         {default_role}
   MFA:         {mfa_type or "no"}
   BD:          {db_driver or "no"}
   Matrix:      generic (ajustable después si hay xlsx)

¿Confirmas? [S/N]
```

Si N → preguntar qué quiere ajustar y volver a la pregunta correspondiente.
Si S → invocar el script.

### 5. Invocar el script atómico

UN solo bash call con todos los args:

```bash
node .claude/tools/setup-app.js \
  --app-name "{app_name}" \
  --app-url "{url}" \
  --environment "{environment}" \
  --default-role "{default_role}" \
  --mfa-type "{mfa_type_or_empty}" \
  --db-driver "{db_driver_or_empty}" \
  --description "App alistada por /sofka-asdd:qa-web-setup-app {app_name}" \
  --notebooklm-id "" \
  --matrix-format "generic"
```

### 6. Mostrar resultado

El script imprime JSON consolidado a stdout con:
- `files_created[]` — listado de archivos generados
- `next_steps[]` — pasos siguientes que el QA debe ejecutar

Renderizar al usuario el JSON parseado en formato legible:

```
✅ {app_name} alistado correctamente.

Archivos creados:
   • {file_1}
   • {file_2}
   ...

Siguientes pasos:
   1. {step_1}
   2. {step_2}
   ...

Backup del appweb.yaml previo (si había): {backup_path or "n/a"}
```

### 7. Guidance de cierre

Después del listado de next_steps, sugerir:

> *"Cuando termines de editar `credentials.yaml` con datos reales, ejecuta `/sofka-asdd:qa-web-run` para tu primer ciclo. Para validar la configuración antes del run, puedes invocar `/sofka-asdd:qa-web-setup-app --validate` (próximamente disponible)."*

## Errores comunes

| Error del script | Causa probable | Acción |
|---|---|---|
| `Template ausente` | Carpeta `docs/testing/atf-web/config/templates/` borrada | Restaurar via `git checkout` |
| `--app-name debe ser alfanumérico` | Usuario escribió "Mi App" con espacios | Pedir versión sin espacios |
| `--mfa-type inválido` | Usuario escribió libre en vez del enum | Volver a la pregunta 4 con opciones válidas |
| `--db-driver inválido` | Idem para BD | Volver a la pregunta 5 |
