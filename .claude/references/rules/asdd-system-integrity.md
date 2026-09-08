# System Integrity — Zero Regresiones

Toda implementación DEBE garantizar la integridad del sistema existente.
No se acepta código que deteriore funcionalidades actuales.

## Antes de declarar trabajo completo

1. **Compilación limpia**: ejecutar el comando de build/compile del proyecto (declarado en `.asdd/testing-capabilities.yaml` o en el CLAUDE.md del proyecto consumidor). Sin errores.
2. **Tests de módulos afectados**: ejecutar la suite del módulo modificado con el test runner del proyecto.
3. **Tests de módulos CONSUMIDORES (Dependent Module Testing — OBLIGATORIO):**
   - Cuando cambia una interfaz / puerto de dominio → testear TODOS los adaptadores que la implementan.
   - Cuando cambia un modelo o servicio de dominio → testear todos los consumers de la capa de aplicación.
   - Cuando cambia un componente o hook compartido → testear todos los módulos importadores.
   - Detectar consumers:
     ```bash
     # Encontrar archivos que usan el símbolo modificado (adaptar extensión al stack)
     rg "SymbolName" src/ -l
     # Encontrar implementaciones de una interfaz
     rg "implements InterfaceName|extends AbstractName" src/ -l
     ```
4. **Verificar interfaces / contratos modificados** no rompen consumers.
5. **Verificar migraciones de DB** compatibles con datos existentes.
6. **Verificar endpoints nuevos** no colisionan con existentes.
7. **Configuración del ASDD instalado** (todo repo que adopta el template):
   `node .claude/scripts/validate-template.mjs`. Valida agentes, skills, hooks, naming, conteos e
   integridad de hashes de **este** proyecto. Debe dar `0 errores`.
   · **Solo en el repositorio template del framework**, además: `npm test` — las 45 suites de
   comportamiento, secuenciales, con baseline de fallos conocidos; exit 0 solo si los fallos observados
   coinciden **exactamente** con el baseline y en el modo declarado. Esas suites son tooling de
   mantenedor y **no se distribuyen**: en un proyecto consumidor no existen y `npm test` no aplica.
   Ver `.claude/docs/validation.md` §3.1.

## Reglas de ejecución

- Compilar DESPUÉS de cada edición individual, no en batch al final.
- No modificar código que no necesita cambio (cambio quirúrgico).
- Si un fix puede causar regresión, documentar el riesgo y mitigarlo.
- Cuando no sepas cómo resolver algo: consultar `asdd-solution-architect` o `asdd-tech-lead` — NUNCA adivinar.
- Cada cambio debe ser trazable al hallazgo que resuelve.

## Contrato cross-OS — EOL, encoding y rutas

Estas convenciones ya se cumplen en el repo. Se escriben porque **driftearon tres
veces** (separador de ruta, EOL, BOM) y el drift es silencioso: pasa en la máquina
del autor y falla en otro SO o en otro checkout.

| Superficie | Regla |
|---|---|
| Archivos que se escriben | `\n` siempre, nunca `\r\n` |
| Salida a consola | `os.EOL` |
| Lectores de líneas | `/\r?\n/`, nunca `/\n/` |
| Hashing de contenido de disco | Normalizar vía `.claude/scripts/lib/asdd-hash-normalize-lib.mjs` (CRLF→LF + strip de BOM). Nunca hashear bytes crudos de disco |
| Comparación de rutas | `relative()` + `sep` nativo cuando **ambos** lados son nativos; normalizar a posix cuando el otro lado es un string de manifiesto, config, env var, output de git, regex de shell o URL |
| Comandos externos | `execFileSync` / `spawnSync` con argv separado. **Nunca** sintaxis POSIX (`2>/dev/null`, `\|\| true`) dentro de un string de shell: en Windows corre bajo `cmd.exe`, no se interpreta y falla en silencio |

Tres checks del validador enforzan la clase (`hash-eol-normalization`,
`hook-command-shape`, `path-separator-safety`). Sus pragmas de escape existen para
los casos legítimos, no para silenciar un hallazgo: ver `.claude/docs/validation.md` §2.2.

## Tests fallando — NO aceptar como "preexistente"

**Regla absoluta:** Si uno o varios tests fallan durante pre-push, gate, o cualquier validación — y podemos arreglarlos — **SE ARREGLAN**. La estabilidad del sistema y mantener la deuda técnica baja están por encima del alcance del ticket actual.

- **NUNCA** reportar tests fallidos como "preexistentes" y pushear. El criterio "ya fallaba en la rama base" NO es excusa válida.
- **NUNCA** omitir tests fallidos con la excusa de que no fueron introducidos por el cambio en curso.
- Si el fix excede el alcance del ticket: aplicarlo igual y anotarlo en el commit/PR como "also fixes pre-existing failures in X".
- Si el fix es técnicamente complejo o arriesgado: escalar con `asdd-tech-lead` o `asdd-solution-architect` antes de decidir no arreglarlo. La decisión de no arreglar debe ser EXPLÍCITA del usuario, nunca implícita.
- Excepción única: tests flaky confirmados (fallan 1 de N ejecuciones por timing) pueden quedar documentados para estabilizar después, pero el reporte debe ser transparente.

## Flakiness — NO aceptar sin investigar

- Worker exits inesperados, timeouts intermitentes, o fallos que aparecen/desaparecen entre corridas requieren investigación, no tolerancia.
- Un test flaky no es "ruido de CI" — es síntoma de una condición de carrera, leak de memoria, o mock mal configurado.
