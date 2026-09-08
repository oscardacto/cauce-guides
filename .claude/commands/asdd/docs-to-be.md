---
description: Documentación de arquitectura TO-BE en el estándar Guide, para propuestas de diseño o modernización.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---

Generar documentación de arquitectura TO-BE para la solución propuesta.

## Documentos a generar

1. **DA_ADE36 Business Drivers** — si no existe ya del AS-IS, generarlo primero
2. **DA_ADE35 Architecture Drivers** — QAs, restricciones, riesgos, concerns que guían el diseño
3. **DA_ADE44 Architecture TO-BE** — propuesta: C1, C2, C3, roadmap
4. **DA_ADE34 ADR(s)** — decisiones que justifican el diseño TO-BE
5. **DA_ADE43 Architectural Dependencies** — dependencias del diseño futuro

## Proceso

1. Verificar si existe DA_ADE36 en `docs/architecture/`. Si existe, cargarlo como contexto. Si no, generarlo primero.
2. Verificar si existe DA_ADE45 (AS-IS). Si existe, usarlo para informar los gaps que TO-BE debe resolver.
3. Leer brief y spec si existen en `docs/specs/`.
4. Si falta información crítica (objetivos estratégicos, QAs target, restricciones), solicitarla al usuario.
5. Invocar `asdd-solution-architect` con skill `asdd-solution-architect-guide-docs` para generar: DA_ADE36 (si no existe) → DA_ADE35 → DA_ADE44 → DA_ADE34 → DA_ADE43.
6. Guardar en `docs/architecture/` con naming `DA_ADE{NN}_{slug-solucion}.md`.

## Output esperado
- `docs/architecture/DA_ADE36_{slug}.md` (si no existía)
- `docs/architecture/DA_ADE35_{slug}.md`
- `docs/architecture/DA_ADE44_{slug}.md`
- `docs/architecture/DA_ADE34_{slug}.md` (uno por decisión significativa)
- `docs/architecture/DA_ADE43_{slug}.md`
