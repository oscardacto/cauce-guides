# System Integrity — núcleo always-on

**Zero Regresiones:** ninguna implementación DEBE deteriorar funcionalidad existente. Sin excepciones.

- **Antes de declarar completo:** build limpio, tests del módulo tocado y
  **Dependent Module Testing** de sus consumers — interfaz o puerto a sus
  adaptadores, dominio a la capa de aplicación, componente compartido a sus
  importadores. Cerrar con `node .claude/scripts/validate-template.mjs` en 0 errores.
- **Cambio quirúrgico:** compilar tras cada edición, no en batch; no tocar lo que
  no lo necesita; cada cambio trazable al hallazgo que resuelve.
- **Tests fallando NO se aceptan como "preexistente".** Si se pueden arreglar, se
  arreglan aunque exceda el ticket; no arreglar es decisión explícita del usuario.
  Flaky confirmado se documenta, no se tolera.
- **Contrato cross-OS:** escribir `\n`, leer con `/\r?\n/`, hashear solo contenido
  normalizado y usar argv separado, nunca sintaxis POSIX dentro de un string de shell.

## Carga condicional obligatoria

Antes de declarar trabajo completo, correr un gate, escribir código que hashee, arme rutas cross-OS o invoque comandos externos, o **al trabarse en vez de adivinar**, ejecutá
`node .claude/scripts/sofka-asdd-resolve-rule.mjs sofka-asdd-system-integrity` y leé **COMPLETO**
`.claude/references/rules/sofka-asdd-system-integrity.md`. Si el resolver o la lectura fallan: STOP, sin declarar completo.
