---
name: sofka-asdd-atf-web-db-validator
description: Valida persistencia en base de datos con SELECT construidos desde db_tables_registry. Solo lectura.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

## Propósito

Complementar la evidencia visual de la UI con validación directa en BD, sin
que el diseñador del CP tenga que declarar queries: el skill los construye
automáticamente basándose en:

1. Las tablas del módulo activo (de `db_tables_registry.{app}.yaml`).
2. El ID del registro identificado en la UI (URL o elemento visible).
3. El tipo de paso (`write` → verificar persistencia; `read` → verificar
   conteos/filtros).

Invocado por el executor en PASO 3.5 del bucle `FOR i` (ver
[`.claude/atf-web-steps/execute.md`](../../atf-web-steps/execute.md) y REGLA 7 de
[`sofka-asdd-atf-web-executor-invariants.md`](../../reference/atf-web/sofka-asdd-atf-web-executor-invariants.md)).

---

## Prerrequisitos

- `exec_context.db_config !== null` — el caller ya resolvió que hay credenciales
  de BD válidas + registry presente (gate app-level).
- **El CP invocante tiene el tag `@bd` en `cp.tags[]`** (gate CP-level,.
  El executor es responsable de verificar este gate antes de invocar el skill —
  sin el tag, la invocación viola REGLA 7. Este skill NO re-verifica el tag
  (recibe ya el `cp_id` + `module_id` y asume que el caller cumplió el contrato).
- `credentials.yaml` tiene sección `database.{env}` con campos completos.
- `db_tables_registry.{app_name}.yaml` existe y tiene el módulo con `enabled: true`.
- `.claude/tools/db-query.js` y el adapter del driver correspondiente en
  `.claude/tools/db-adapters/` están disponibles.

> **Nota:** Este skill solo ejecuta la validación y reporta. La decisión de
> bloquear o no el CP según `DB_FAIL` es responsabilidad del executor en
> función de `{db_required}`, que se resuelve **exclusivamente** desde el
> registry (`modules[{module_id}].required`, con fallback a `registry.required`
> global). No hay override por appweb.yaml (REGLA 7 — SSoT en el registry).

---

## Inputs

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `module_id` | string | Sí | Módulo activo (ej: `M_3`). |
| `cp_id` | string | Sí | CP en ejecución (ej: `CP-M3-006`). |
| `step_num` | number | Sí | Número del paso que se acaba de ejecutar (1-based). |
| `step_type` | string | Sí | `write` o `read` — inferido por el executor. |
| `cp_assertion` | string | No | Texto literal del paso Gherkin — usado para razonar el `expected`. |
| `record_id` | string | No | ID del registro. Si se omite, el skill lo extrae de la URL via `pk_pattern`. |
| `table_name` | string | No | Tabla específica (default: primera `write_tables[]` del módulo). |
| `env` | string | Sí | Ambiente de BD (`qa`, `staging`...). |
| `output_dir` | string | Sí | Directorio del CP (donde escribir `db_evidence_{N}.json`). |
| `db_config` | object | Sí | Objeto completo: `{host, port, name, username, password, driver, options, registry_path}`. Propagado desde `exec_context.db_config`. |

---

## Proceso

### PASO 1 — Verificar disponibilidad

1. Si `db_config.registry_path` no existe en disco → retornar
   `{ skipped: true, reason: "registry_not_found" }`. **NO bloquea ejecución.**
2. Leer el registry. Si `enabled !== true` o si `modules[{module_id}]` ausente
   o con `enabled !== true` → `{ skipped: true, reason: "module_not_in_registry" }`.
3. Si `credentials.yaml` no existe o `database.{env}` ausente →
   `{ skipped: true, reason: "db_credentials_not_configured" }`.

### PASO 2 — Seleccionar tabla y columnas

- Modo `write`: usar `modules[{module_id}].write_tables[]`.
- Modo `read`:  usar `modules[{module_id}].read_tables[]`.

Extraer `columns_under_test[]` de la tabla seleccionada (para `write`) o
`filter_columns[]` / columna de agrupación (para `read`).

### PASO 2.1 — Disambiguación de tabla (cuando hay múltiples candidatas)

Cuando el módulo declara más de una tabla en el array del modo activo, el skill
DEBE elegir la correcta basándose en el texto del step (no tomar ciegamente la
primera — produce DB_FAILs falsos). Aplicar la siguiente cascada:

**1. Keyword explícito `db_table:` en `cp_assertion`** (máxima prioridad):
```
"Verificar en BD (db_table: SIO_Bitacora_Gestiones) que se creó ..."
→ table = SIO_Bitacora_Gestiones
```

**2. Caller pasó `table_name`** → usar esa.

**3. Match semántico por `description` o `name`:**
- Tokenizar `cp_assertion` (lowercase, quitar acentos/stopwords).
- Tokenizar cada `table.description` y `table.name` del mismo modo.
- Elegir la tabla con más tokens compartidos. Desempate: nombre de tabla
  aparece literal en el step > descripción con match > orden del registry.

Ejemplos (M_3 con 2 write_tables: `SIO_Bitacora_Incidentes`, `SIO_Bitacora_Gestiones`):
| Step del CP | Tabla elegida | Razón |
|---|---|---|
| "Cerrar el incidente y verificar Estado='Cerrado'" | `SIO_Bitacora_Incidentes` | "incidente" matchea description |
| "Agregar gestión al incidente — verificar persistencia" | `SIO_Bitacora_Gestiones` | "gestión" matchea nombre + description |
| "Verificar que se guardó el hallazgo" | `SIO_Bitacora_Gestiones` | "hallazgo" ≈ gestión (sinónimo en el contexto HU44) |

**4. Fallback: primera tabla del array** (comportamiento legacy — emitir warning en el log).

**Empate (match score = 0 en todas):** retornar
`{ skipped: true, reason: "table_disambiguation_failed", message: "N tablas candidatas sin match claro — sugerir agregar db_table: al step" }`.
La entrada DB_SKIPPED queda trazable y el QA puede desambiguar manualmente.

### PASO 3 — Obtener record_id (modo write)

Si el caller no pasó `record_id`:

1. Leer `pk_source` de la tabla (ej: `url_param`).
2. Obtener la URL actual del browser vía `browser_snapshot` o memoria local.
3. Aplicar `pk_pattern` (regex) sobre la URL:
   ```
   URL     : https://sioqa.fogafin.gov.co/incidentes/detalle?id=1234
   Pattern : (?:id|ID_Incidente)=([0-9]+)
   Resultado: record_id = "1234"
   ```
4. Si el regex no matchea → buscar un elemento visible con `alt_key_column`
   (ej: "Numero_de_Incidente = INC-2026-034") y usarlo como filtro alternativo.
5. Si no se puede obtener → `{ skipped: true, reason: "record_id_not_found" }`.

### PASO 4 — Construir query

La tabla seleccionada determina el patrón. Hay **3 patrones soportados**; el skill
elige según los campos que tiene la tabla en el registry (en orden de prioridad):

#### 4a — Write por PK directa (patrón por defecto)

Aplica cuando la tabla tiene `pk_column` + `pk_source` y el step refiere al
registro identificado en la URL/UI actual.

```sql
SELECT {columns_under_test_csv}
FROM {table_name}
WHERE {pk_column} = {record_id}
```

Ejemplo — cerrar incidente #1234:
```sql
SELECT Fecha_Cierre, Dias_Solucion, Estado, Updated_At
FROM SIO_Bitacora_Incidentes
WHERE ID_Incidente = 1234
```

#### 4b — Write por FK al padre (tabla hija 1:N)

Aplica cuando la tabla tiene `fk_column` + `fk_source: "parent"`. En este caso
el `record_id` no viene de la URL (no hay URL para una gestión específica
cuando acabas de crearla); viene del **incidente padre** cuya URL está
activa. Resolución:

1. Localizar la tabla padre dentro del mismo módulo (la que tiene
   `pk_column` + `pk_source: "url_param"` y cuyo `pk_column` coincide con el
   `fk_column` de la tabla hija).
2. Extraer `parent_id` aplicando el `pk_pattern` del padre sobre la URL
   actual (igual que PASO 3).
3. Construir:

```sql
SELECT {columns_under_test_csv}
FROM {child_table}
WHERE {fk_column} = {parent_id}
ORDER BY {pk_column} DESC
```

Ejemplo — agregar gestión al incidente #1234 (HU44):
```sql
SELECT ID_Incidente, Descripcion, Fecha_Gestion
FROM SIO_Bitacora_Gestiones
WHERE ID_Incidente = 1234
ORDER BY ID_Gestion DESC
```

**Assessment multi-fila:** el resultado puede tener N filas (todas las gestiones
del incidente). El skill busca la fila **más reciente** (primera por `ORDER BY pk DESC`)
y compara sus columnas contra lo esperado en el `cp_assertion` ("se creó una
gestión con descripción X"). Las demás filas se reportan como contexto, no como
hallazgos individuales. Si `row_count === 0` tras un step write → DB_FAIL
("la gestión no persistió").

#### 4c — Read con filtro/prefijo (lookups)

Aplica a tablas con `validation_type: "read"`. Según qué campos declare:

**c.1 — Tabla con `filter_column` + `filter_prefix`** (ej. `SIO_Maestro` con `BIT_%`):
```sql
SELECT {all_cols_or_sample}
FROM {table_name}
WHERE {filter_column} LIKE '{filter_prefix}%'
```
Se usa cuando el step valida el universo de un dominio (ej. "el dropdown de
tipo de hallazgo muestra todos los maestros BIT_*").

**c.2 — Tabla con `filter_columns[]` (sin prefijo):** el skill detecta qué
valores literales del step matchean estas columnas y construye WHERE:
```sql
SELECT {filter_columns_csv}
FROM {table_name}
WHERE {col1} = '{val1}' [AND {col2} = '{val2}']
```
Ejemplo: step "verificar que el usuario 'locked_out_user' está bloqueado" →
```sql
SELECT username, locked, role
FROM users
WHERE username = 'locked_out_user'
```

**c.3 — Conteo/agrupación** (cuando `cp_assertion` menciona totales o conteos):
```sql
SELECT COUNT(*) AS total, {group_col}
FROM {table_name}
WHERE {filter_col} = '{filter_val}'
GROUP BY {group_col}
```

El skill adapta al contexto: si el step dice "hay 6 productos en stock" → conteo;
si dice "existe el producto X" → lookup por `filter_columns`; si dice "todos los
maestros BIT_*" → LIKE con `filter_prefix`.

#### Sanitización (aplica a 4a/4b/4c)

Cualquier valor dinámico que vaya al WHERE debe ser escapado (reemplazar `'` por
`''`) para prevenir inyección en el propio framework. El SELECT guard ya protege
de DDL/DML, pero sintaxis malformada produce `DB_ERROR` innecesarios.

### PASO 5 — Ejecutar via db-query.js

```bash
node .claude/tools/db-query.js \
  --query "{query_construido}" \
  --env {env} \
  --output "{output_dir}/db_evidence_{step_num:02d}.json" \
  --timeout 10000
```

Exit codes esperados:
- `0` → query ejecutado (incluye row_count=0)
- `1` → error de query/conexión → status `DB_ERROR`
- `2` → error de config → skip
- `3` → query no-SELECT → bug del skill (reportar)

### PASO 6 — Interpretar el resultado

Leer el `db_evidence_{N}.json` generado.

**Si `error != null` (conexión, timeout, SQL error):**
- Status `DB_ERROR`. NO bloquea el CP (REGLA 7).
- `db_connection_failed: true` si es error de conexión.

**Si `row_count === 0`:**
- Modo write: `DB_FAIL` — "Registro no encontrado en {table} con {pk_column}={record_id}".
- Modo read: puede ser válido (filtro sin matches) — razonar según `cp_assertion`.

**Si `row_count > 0`:**
Comparar columnas con lo esperado según `cp_assertion`. El skill razona por
columna, sin reglas hardcodeadas. Ejemplo:

| Columna | Valor en BD | Esperado (razonado del Gherkin) | Assessment |
|---|---|---|---|
| `Fecha_Cierre` | `null` | CP dice "el sistema asigna fecha actual" → no debe ser null | ❌ FAIL |
| `Estado` | `"Cerrado"` | CP dice "usuario selecciona estado Cerrado" | ✅ PASS |
| `Updated_At` | `2026-04-23T17:00:00` | CP implica actualización reciente | ✅ PASS |

### PASO 7 — Construir retorno

Ver **Output**.

---

## Output

**DB_PASS:**
```json
{
  "skipped": false,
  "validation_id": "DB-CP-M3-006-02",
  "status": "DB_PASS",
  "table": "SIO_Bitacora_Incidentes",
  "record_id": "1234",
  "query": "SELECT ...",
  "row_count": 1,
  "caused_cp_fail": false,
  "db_connection_failed": false,
  "findings": [
    { "column": "Estado", "value_in_db": "Cerrado", "expected": "Cerrado", "assessment": "PASS" }
  ],
  "evidence_file": "db_evidence_02.json"
}
```

**DB_FAIL:**
```json
{
  "skipped": false,
  "validation_id": "DB-CP-M3-006-02",
  "status": "DB_FAIL",
  "table": "SIO_Bitacora_Incidentes",
  "record_id": "1234",
  "caused_cp_fail": false,
  "db_connection_failed": false,
  "findings": [
    { "column": "Afecta_Informacion_Previa", "value_in_db": 0, "expected": 1, "assessment": "FAIL — el flag de reproceso no persiste" }
  ],
  "evidence_file": "db_evidence_02.json"
}
```

> `caused_cp_fail` lo fija el **executor** tras leer el retorno — no el skill. Es `true` solo si `db_required=true`.

**DB_ERROR:**
```json
{
  "skipped": false,
  "status": "DB_ERROR",
  "caused_cp_fail": false,
  "db_connection_failed": true,
  "findings": [],
  "error_detail": "Connection timeout — ECONNREFUSED sqlserver:1433",
  "evidence_file": null
}
```

**Skipped (NO bloquea CP, pero SÍ genera entry trazable en `db_validations[]` con status `DB_SKIPPED`):**
```json
{
  "skipped": true,
  "reason": "module_not_in_registry",
  "message": "El módulo {module_id} no está listado en db_tables_registry.{app}.yaml"
}
```

**Reasons válidas de skip (FIX #9 — el executor las convierte en `DB_SKIPPED` entries):**

| `reason` | Causa | Acción sugerida al QA |
|---|---|---|
| `registry_not_found` | `db_tables_registry.{app}.yaml` no existe | Crear el archivo con `enabled: true` + módulos |
| `registry_disabled` | Registry existe pero `enabled: false` | Cambiar a `enabled: true` |
| `module_not_in_registry` | Módulo del CP no declarado | Agregar el módulo a `modules` en el registry |
| `module_disabled` | Módulo declarado pero `enabled: false` | Cambiar `enabled: true` del módulo |
| `db_credentials_not_configured` | `credentials.yaml → database.{env}` ausente | Agregar sección database |
| `record_id_not_found` | `pk_pattern` no matchea URL ni UI | Revisar `pk_pattern` / `alt_key_column` en el registry |
| `no_tables_for_step_type` | Step `write` pero `write_tables: []` (o `read` sin `read_tables`) | Agregar tablas al registry o esperar matches en el otro modo |
| `table_disambiguation_failed` | Múltiples tablas candidatas y ningún match por `db_table:` / keyword / descripción | Añadir `db_table: {nombre}` al step, o enriquecer `description:` de la tabla en el registry |
| `parent_table_not_found` | Tabla hija con `fk_source: "parent"` pero ningún `write_tables[]` del módulo tiene `pk_column` = `fk_column` | Revisar coherencia del registry — el padre debe declararse con `pk_source: url_param` |
| `query_unsupported_by_adapter` | El adapter (ej. mock) no entiende el SQL generado | Simplificar patrón o extender parser del adapter |

---

## Reglas críticas

- **NUNCA ejecuta escrituras** — `db-query.js` rechaza cualquier cosa que no sea SELECT/WITH.
- **NUNCA loguea credenciales** — solo el host/env en mensajes de error.
- **`DB_ERROR` NUNCA bloquea el CP** — un fallo de conexión es infra, no un defecto. Se marca `db_connection_failed: true` en el `result.json` del CP y el reporte lo muestra con ⚠️ diferenciado.
- **`DB_FAIL` puede o no bloquear** según `{db_required}` (REGLA 7):
  - `db_required === true` → executor cambia CP a FAIL.
  - `db_required === false` → CP mantiene status visual; DB_FAIL es evidencia adicional.
  - Un CP PASS en UI con DB_FAIL es un bug silencioso de persistencia — el reporte muestra ambos.
- Si el registry no tiene el módulo o está deshabilitado → skip silencioso (no ruido en logs).
- Sanitizar el valor de `record_id` (escape de `'`) antes de construir el WHERE — el SELECT-guard no previene sintaxis malformada.

---

## Cómo el executor incorpora el resultado

El executor lee el retorno del skill y lo agrega a `result.json.db_validations[]`
del CP. La entrada se referencia con `step_num` (paralelo a `steps[]`, no reemplaza
— REGLA 1 sigue intacta):

```json
{
  "cp_id": "CP-M3-006",
  "status": "FAIL",
  "steps": [...],
  "db_connection_failed": false,
  "db_validations": [
    {
      "step_num": 2,
      "status": "DB_FAIL",
      "table": "SIO_Bitacora_Incidentes",
      "findings": [...]
    }
  ]
}
```

El reporte (`.claude/dashboard/generate-report.js`) renderiza cada validación **inline**
bajo la evidencia de su paso correspondiente en `evidence.html` (bloque
colapsado por default; abierto si `DB_FAIL` o `DB_ERROR`). La sección final
"Validaciones de Base de Datos" solo aparece cuando: (a) la feature está activa
y no hubo matches, o (b) hay validaciones huérfanas sin `step_num` asociado.
