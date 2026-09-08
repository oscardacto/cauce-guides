# KNOWLEDGE ACCESS CONTRACT — doctrina compartida

> **Propósito:** Single Source of Truth para el contrato de acceso a archivos
> que respetan los agentes del ATF. Este archivo define **qué significa**
> declarar un acceso `Read` o `Write` en la tabla de cada agente y qué
> garantías comporta. Cada agente lista SOLO sus archivos específicos en su
> propia tabla — la semántica del contrato vive aquí.

---

## ¿Qué es el KNOWLEDGE ACCESS CONTRACT?

Es la declaración explícita y **exhaustiva** de los archivos que cada agente
puede leer o escribir durante su ejecución. Funciona como contrato de I/O:

- **Read** — el agente está autorizado a leer este archivo. Si la lista
  enumera un archivo con prefijo `(opcional)`, el agente debe degradar
  ordenadamente cuando no exista, no fallar.
- **Read/Write** — el agente puede leer Y escribir el mismo archivo (típico
  para registros transaccionales con merge incremental).
- **Write** — el agente solo escribe; jamás lee este archivo durante su
  ejecución (excepto para verificar existencia).
- **(condicional)** — el acceso depende de un flag de configuración o un
  estado runtime; documentar la condición en línea.
- **(excerpt)** — el agente lee un extracto truncado, no el archivo completo
  (típicamente vía `knowledge-excerpt.js` o lectura de las primeras N líneas).

---

## Reglas que aplican a TODOS los agentes

1. **Anti-exploración:** un agente NUNCA hace `ls`, `find`, `glob` ni `grep`
   sobre carpetas que no estén explícitamente en su KNOWLEDGE ACCESS CONTRACT.
   Las rutas vienen de `appweb.yaml`, `session_context.json`, `exec_context.json`
   o son parámetros recibidos desde el caller.
2. **Anti-traversal:** un agente NUNCA lee fuera de `docs/testing/atf-web/requirements/`,
   `docs/testing/atf-web/{run_id}/`, `.claude/{config,knowledge,agent-memory,rules}/`,
   ni de los paths declarados en su contrato. Acceder a `docs/testing/atf-web/` de
   runs ajenos viola el aislamiento del run actual.
3. **Aislamiento per-app:** los archivos bajo `agent-memory/` y `knowledge/`
   tienen sufijo `.{app_name}.md` o subcarpeta `{app_name}/`. Un agente que
   lea/escriba estos archivos resuelve el `{app_name}` desde
   `appweb.yaml → app.name`, jamás hardcoded.
4. **Cadena de degradación (Input Resolution Ladder):** si el archivo primario
   no existe, el agente intenta el fallback documentado. Si todos los
   fallbacks fallan, el agente reporta `BLOCKED` con la razón — nunca
   "inventa" datos para suplir la falta.
5. **Contexto pre-extraído tiene prioridad:** si el caller (orchestrator,
   `/asdd:qa-web-exec`) pre-resolvió contenido en `exec_context.json` o
   `session_context.json`, el agente DEBE usar esa proyección — no leer
   el archivo origen otra vez (re-lectura redundante = overhead de tokens).
6. **Listas exhaustivas, no enunciativas:** la tabla de cada agente lista
   TODOS los archivos accedidos. Si el agente lee un archivo no declarado
   en su contrato, eso es un bug — actualizar el contrato o el agente, no
   ignorar.

---

## Patrón de tabla (estándar)

Cada agente expone su contrato así:

```markdown
## KNOWLEDGE ACCESS CONTRACT

> Sigue la doctrina de [`reference/atf-web/asdd-atf-web-knowledge-access-contract.md`](../reference/atf-web/asdd-atf-web-knowledge-access-contract.md). La tabla lista los archivos específicos de este agente.

| Modo | Archivo |
|---|---|
| Read | `<path>` |
| Read/Write | `<path>` |
| Write | `<path>` |
```

El header `Modo / Archivo` y los modos posibles están normalizados aquí
(no repetir definición en cada agente).

---

## Cómo agregar un nuevo agente al contrato

1. Crear el archivo `agents/<nuevo-agente>.md`.
2. Incluir la sección `## KNOWLEDGE ACCESS CONTRACT` con el patrón anterior.
3. Listar exclusivamente los archivos que el agente accede.
4. NO copiar las reglas de este documento — referenciar.
5. Si el agente introduce un nuevo modo de acceso (ej. `Append-only`),
   documentarlo aquí primero.

---

## Auditoría

Para verificar drift entre agentes:

```bash
grep -rn "## KNOWLEDGE ACCESS CONTRACT" .claude/agents/
# Esperado: 6 hits con header idéntico, sin variaciones de capitalización.

grep -rn "Modo | Archivo" .claude/agents/
# Esperado: 6 hits (uno por agente).
```

Si algún agente lista un modo no documentado aquí o un archivo fuera del
ámbito declarado por las Reglas anteriores → actualizar este documento o
el agente.
