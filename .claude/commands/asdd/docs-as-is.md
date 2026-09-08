---
description: Documentación de arquitectura AS-IS en el estándar Guide, para proyectos que ya existen.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---

Generar documentación de arquitectura AS-IS para el proyecto actual.

## Documentos a generar

1. **DA_ADE36 Business Drivers** — contexto estratégico y objetivos de negocio
2. **DA_ADE35 Architecture Drivers** — QAs, restricciones, riesgos, concerns
3. **DA_ADE45 Architecture AS-IS** — estado actual: C1, C2, capability map, gaps
4. **DA_ADE34 ADR(s)** — decisiones de arquitectura relevantes del estado actual
5. **DA_ADE43 Architectural Dependencies** — dependencias del sistema

## Proceso

1. Leer el brief en `docs/specs/brief-{feature}.md` y la spec en `docs/specs/{feature}.md` si existen.
2. Explorar el proyecto para entender el estado actual: estructura, tecnologías, integraciones.
3. Si falta información crítica (nombre del cliente, objetivos estratégicos, tecnologías del sistema), solicitarla al usuario antes de continuar.
4. Invocar `asdd-solution-architect` con skill `asdd-solution-architect-guide-docs` para generar cada documento en orden: DA_ADE36 → DA_ADE35 → DA_ADE45 → DA_ADE34 → DA_ADE43.
5. Guardar en `docs/architecture/` con naming `DA_ADE{NN}_{slug-solucion}.md`.

## Output esperado
- `docs/architecture/DA_ADE36_{slug}.md`
- `docs/architecture/DA_ADE35_{slug}.md`
- `docs/architecture/DA_ADE45_{slug}.md`
- `docs/architecture/DA_ADE34_{slug}.md` (uno por decisión significativa)
- `docs/architecture/DA_ADE43_{slug}.md`
