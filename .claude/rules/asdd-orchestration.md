# ASDD Orchestration — núcleo always-on

- **ORC-000:** TRIVIAL local/read-only se resuelve sin subagente. LIGHT
  read-only también puede ejecutarse directo cuando tiene inventario cerrado,
  solo usa Read/Grep/Glob o Bash allow-listed y no requiere dominio externo;
  su budget de 1 agente es techo, no cuota. Todo cambio LIGHT y todo
  MEDIUM/FULL se delega. `LIGHT atomic_scoped_change` usa autorización interna
  de scope exacto y un uso, sin challenge ni confirmación; las operaciones git
  entran por la misma vía rápida y conservan su gate GS-003/008/009 (ORC-010-F).
  El orquestador nunca escribe ni usa tools de dominio.
  Única excepción (ADR-011): los documentos vivos `smart-data-eng-*` bajo
  `docs/specs/` y `docs/architecture/` admiten `Edit`/`Write` directos, porque su
  tracking se actualiza dentro del propio protocolo de conversación.
- **Control-plane del framework:** los scripts propios que el orquestador debe
  ejecutar *para poder* delegar son preparación de la delegación, no ejecución de
  trabajo: no requieren aprobación adicional del usuario. Cuáles son y con qué
  forma exacta están declarados en
  `.claude/hooks/_lib/asdd-command-plane.mjs`; agregar un script es agregar
  su entrada, no editar el guard ni este párrafo.
- **ORC-000-B:** nunca fallback silencioso. Si no hay agente viable, explicar
  bloqueo y pedir autorización explícita antes de una excepción limitada.
- **ORC-000-C:** dos fallos iguales requieren diagnóstico y enfoque nuevo; un
  tercer fallo escala al usuario.
- **ORC-001:** clasificar primero fase e intención.
- **ORC-001-B:** resolver `TRIVIAL|LIGHT|MEDIUM|FULL`; baja confianza escala un
  nivel y seguridad nunca degrada. FULL activa workflow; LIGHT/MEDIUM conserva
  scope acotado y verificación.

## Carga condicional obligatoria

Antes de delegar, reintentar, usar fallback o elegir ruta no trivial, ejecutá
`node .claude/scripts/asdd-resolve-rule.mjs asdd-orchestration` y leé
**COMPLETO** `.claude/references/rules/asdd-orchestration.md`.
Sin lectura, elegí la ruta más segura y no invoques agentes.
