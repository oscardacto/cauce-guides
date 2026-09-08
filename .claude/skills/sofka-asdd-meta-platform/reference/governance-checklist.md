# Governance del framework ASDD — Checklist extendido

Checklist completo de verificación para health-check del framework. Usado por
el skill `meta-platform` cuando el orquestador dispara un
`/sofka-asdd:healthcheck` o detecta incoherencias estructurales.

## CLAUDE.md

- [ ] Presente en la raíz del proyecto.
- [ ] No vacío (> 20 líneas útiles).
- [ ] No duplica el catálogo de agentes/skills — el runtime ya lo inyecta;
      CLAUDE.md solo apunta a `capability-loading.json` y a las descripciones.
- [ ] Fases ASDD documentadas (Especificar → Analizar → Diseñar → Construir →
      Verificar → Documentar).
- [ ] Reglas no negociables presentes (CORE-001..CORE-008).
- [ ] Sin duplicación con skill de `asdd-orchestration`.

## Hooks

- [ ] `.claude/hooks/` existe y tiene al menos el hook de comandos peligrosos.
- [ ] `settings.json` registra los hooks con matcher correcto.
- [ ] Si `ASDD_SPEC_GUARD_ENABLED=true`, existe `docs/specs/` con al menos
      una spec aprobada.
- [ ] Archivos `.mjs` tienen shebang y son ejecutables (si aplica en el SO).

## Lockfile `.sofka-asdd`

- [ ] Presente en raíz.
- [ ] Conteo de `agents` coincide con `ls .claude/agents/*.md | wc -l`.
- [ ] Conteo de `skills` coincide con `find .claude/skills -name SKILL.md | wc -l`.
- [ ] Conteo de `rules` coincide con `ls .claude/rules/*.md | wc -l`.
- [ ] Conteo de `commands` coincide.

## Skills y referencias

- [ ] Cada skill referenciado en `skills:` de un agente existe.
- [ ] No hay skills huérfanos (existen en `.claude/skills/` pero ningún
      agente los referencia).
- [ ] Descriptions de skills no duplicadas semánticamente.
- [ ] Skills con `allowed-tools` coherentes con su responsabilidad.

## MCPs y plugins

- [ ] `.mcp.json` existe (aunque vacío).
- [ ] Plugins habilitados en `settings.json` están instalados.
- [ ] Plugins instalados pero no usados → considerar desinstalar.

## Permisos

- [ ] `settings.json` tiene allow-list de comandos seguros (mínimo 10-20 entradas).
- [ ] `settings.json` tiene deny-list de comandos destructivos.
- [ ] No hay comandos en allow-list con wildcard peligroso (`Bash(*)`).

## Documentación ASDD

- [ ] `docs/specs/`, `docs/architecture/`, `docs/tech/`, `docs/qa/`,
      `docs/security/` existen (o están creadas bajo demanda del workflow).
- [ ] ADRs siguen naming `ADR-{NNN}-{titulo}.md`.
- [ ] Quality gate reports presentes si hubo merges recientes.

## Respuesta tipo del agente

```
[GOVERNANCE] Health-check — 3 issues detectados:
1. ADR-021-cache-invalidation.md no sigue naming ADR-{NNN}-{titulo}.
2. Skill 'tech-lead-refactoring' referenciado en tech-lead.md pero carpeta
   fue renombrada a 'tech-lead-refactoring-plan'.
3. .sofka-asdd dice skills:38 pero existen 41 — ejecutar asdd-repo-docs.
```
