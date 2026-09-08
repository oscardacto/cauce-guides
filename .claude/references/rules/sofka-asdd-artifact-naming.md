# ASDD — Naming universal de artefactos

## ART-001 — Contrato único

Todo archivo nuevo generado por un agente bajo `docs/**` es un artefacto de
run y usa obligatoriamente:

`{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`

Aplica sin excepciones por tipo o carpeta: briefs, specs, ADRs, diagramas,
contratos, planes, spikes, reportes, auditorías, evidencia, ATF y
manifests. Solo se excluye código/configuración de implementación fuera de
`docs/**`. Los archivos históricos no se renombran retroactivamente.

**Excepción de dominio — Smart Data (ADR-003).** Los artefactos del flujo Data
(`smart-data-eng-*`) no se trazan por run ASDD: su equivalente-brief es el Excel de
trabajo del cliente y su contrato de nombres vive en
`.claude/hooks/_lib/smart-data-naming.mjs`. El `artifact-name-guard` los valida
contra ese contrato —en `getArtifactNameDecision()`, antes de leer `.asdd-run.json`—
y no contra este patrón. El contrato Data filtra por prefijo y forma general; no
valida que el nombre esté completo.

## ART-002 — Resolver antes del plan

- El orquestador abre/reanuda el run y reserva cada ruta con los helpers
  canónicos **antes** de emitir ORC-010-A.
- El plan declara rutas exactas en `scope[]`; nunca placeholders como
  `brief-{proyecto}.md`, `ADR-{NNN}.md` ni nombres convencionales inferidos.
- El prompt del agente repite la ruta exacta. El agente la usa literalmente y
  no recalcula `run_id`, `PHASE` o `SEQ`.
- Si aparece un artefacto no previsto, el agente retorna `PLAN UPDATE
  REQUERIDO`; no inventa un nombre ni amplía el scope.

Bootstrap de Specify y reserva inicial:

```bash
node .claude/scripts/sofka-asdd-run-bootstrap.mjs \
  --feature {slug-proyecto} --phase specify \
  --artifact-dir docs/specs --artifact-slug brief-{slug-proyecto}
```

Para artefactos posteriores, el orquestador usa
`.claude/scripts/sofka-asdd-artifact-name.mjs`; el `SEQ` nunca se escribe a
mano.

## ART-003 — Capabilities antes de operaciones protegidas

Un agente con capability aprobada la carga como primera operación mediante
`sofka-asdd-load-capability.mjs`. Aprobar una capability no equivale a
cargarla. No puede ejecutar `Write`, `Edit` ni Bash sensible antes de la carga.

## ART-004 — Fuentes y afirmaciones de dominio

Cuando el request define un paquete curado como fuente única, ningún agente
convierte conocimiento externo en hecho. Debe etiquetarlo `HIPÓTESIS EXTERNA —
REQUIERE VALIDACIÓN` o pedir un spike/research explícitamente autorizado y
citado. Un GAP abierto nunca se cierra por conocimiento paramétrico del modelo.
