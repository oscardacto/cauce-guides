# Naming de artefactos — núcleo always-on

- **ART-001:** todo archivo nuevo bajo `docs/**` usa
  `{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`, sin excepción por tipo ni carpeta. Solo
  queda afuera el código y la configuración fuera de `docs/**`; lo histórico no
  se renombra. Única excepción de dominio (ADR-003): los artefactos
  `smart-data-eng-*` tienen contrato de nombres propio, descrito en el reference.
- **ART-002:** el orquestador reserva cada ruta con los helpers canónicos **antes
  del plan**; el plan las declara en `scope[]` y el prompt del agente las repite
  literalmente. Nunca placeholders ni `run_id`, `PHASE` o `SEQ` recalculados. Un
  artefacto no previsto se devuelve como `PLAN UPDATE REQUERIDO`.
- **ART-003:** la capability aprobada se carga como primera operación; sin carga
  no hay `Write`, `Edit` ni Bash sensible.
- **ART-004:** con paquete curado como fuente única, el conocimiento externo se
  etiqueta `HIPÓTESIS EXTERNA — REQUIERE VALIDACIÓN`; un GAP nunca se cierra con
  conocimiento paramétrico del modelo.

## Carga condicional obligatoria

Antes de reservar rutas de artefactos o invocar los helpers de bootstrap y naming, ejecutá
`node .claude/scripts/sofka-asdd-resolve-rule.mjs sofka-asdd-artifact-naming` y leé **COMPLETO**
`.claude/references/rules/sofka-asdd-artifact-naming.md`. Si el resolver o la lectura fallan: STOP, sin reservar rutas.
