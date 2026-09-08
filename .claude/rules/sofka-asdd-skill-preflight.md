# Skill PRE-FLIGHT — núcleo always-on

Todo skill que cree o modifique archivos ejecuta un **PRE-FLIGHT** como Paso 0.

- **Rama dedicada, siempre.** Nunca `main|master|qa|dev|develop` (configurable
  con `SOFKA_ASDD_PROTECTED_BRANCHES`). Rama protegida → STOP (GS-001).
- **Crea archivos:** directorio destino existente y verificación de que no haya
  un equivalente. Duplicado detectado → confirmación explícita del usuario.
- **Modifica código:** tests del módulo en verde y baseline capturado. Baseline
  roto → STOP: sin él no se sabe si el cambio introdujo el fallo.
- **Verificación:** son READ-ONLY y publican su Scope Declaration antes de empezar.
- El mismo PRE-FLIGHT fallando dos veces por la misma causa escala al usuario.

## Carga condicional obligatoria

Antes del Paso 0 de un skill que cree o modifique archivos, ejecutá
`node .claude/scripts/sofka-asdd-resolve-rule.mjs sofka-asdd-skill-preflight` y leé **COMPLETO**
`.claude/references/rules/sofka-asdd-skill-preflight.md`. Si el resolver o la lectura fallan: STOP, sin crear ni modificar archivos.
