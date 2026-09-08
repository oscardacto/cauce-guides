# ASDD Phases — Quick Reference

Tabla de referencia rápida con todos los agentes por fase del workflow ASDD.
Detalle completo de cada fase (artefactos, criterios de completitud, soportes
condicionales) en `asdd-workflow.md`.

`*` = agente primario. El resto son soportes que se invocan según las señales
documentadas en cada `WF-xxx`.

```
Especificar → producto* · domain-expert* · researcher
Analizar    → producto* · researcher* · tech-lead · security · domain-expert · ux
Diseñar     → architect* · ux* · ui* · cloud-architect* · atf-api-qa-engineer* · researcher · domain-expert · tech-lead · security
Construir   → developer* · ui* · atf-api-qa-engineer* · ux · tech-lead · devops-engineer · domain-expert
Verificar   → atf-api-qa-engineer* · atf-reporting-qa-engineer* · security* · ui · ux · producto · tech-lead · devops-engineer
Documentar  → ux* · ui* · atf-reporting-qa-engineer* · tech-lead* · architect* · developer
Meta        → meta (governance · token budget · contexto)
```

`cloud-architect*` en Diseñar: primario solo cuando hay diseño de infraestructura cloud, decisión de proveedor, DR, FinOps o compliance de infra.

`ux*` en Diseñar: primario cuando hay investigación UX, flujos de usuario, wireframes mid-fi o arquitectura de información en scope.

`ui*` en Diseñar: primario cuando hay setup de design system, definición de tokens o prototipo hi-fi en scope.

`ux` en Analizar: soporte — activa `ux-gap-auditor` para problem statement y `ux-desk-researcher` para análisis competitivo cuando el brief involucra experiencia de usuario.

`ui*` en Construir: primario para construcción de componentes hi-fi, design tokens y prototipo visual.

`ux` en Construir: soporte — flujos visuales mid-fi o arquitectura de información que quedaron pendientes de Diseñar.

`ui` en Verificar: soporte — audita WCAG, responsive, principios de diseño y contenido sobre los componentes construidos.

`ux` en Verificar: soporte — revisa brechas y valida que el flujo implementado resuelve el problem statement.

`ux*` en Documentar: primario para narrativa ejecutiva de hallazgos UX (executive-storytelling) y plan de monitoreo post-launch si es proyecto discovery.

`ui*` en Documentar: primario para documentación consolidada del design system — reporte final de tokens, componentes, auditorías y handoff definitivo a developer.

`atf-api-qa-engineer*` en Diseñar: primario cuando el scope involucra pruebas de API REST (plan de pruebas ISTQB, diseño de casos, análisis de contrato OpenAPI).

`atf-api-qa-engineer*` en Construir: primario para generación de specs Playwright/Newman y automatización de pruebas API.

`atf-api-qa-engineer*` en Verificar: primario para ejecución de suite, clasificación de defectos y preparación del handoff al agente de Reporting.

`atf-reporting-qa-engineer*` en Verificar: primario para evaluación del Quality Gate Score (QGS) y emisión del sign-off formal.

`atf-reporting-qa-engineer*` en Documentar: primario para renderización del reporte final HTML/MD y generación del backlog Jira/ADO.

> **Nota**: las fases aplican solo en ruta **FULL**. En ruta LIGHT el orquestador
> delega directamente a un agente sin activar el workflow de fases. Ver `ORC-001-B`
> y `asdd-routing-heuristics.md`.

> **Nota — Smart Data (ADR-002)**: los agentes del dominio Smart Data
> (`asdd-data-architect`, `asdd-data-eng-databricks`,
> `asdd-data-governance`) **no aparecen** en las tablas WF-xxx de arriba
> por diseño (reduce superficie de auto-selección). Su routing propio
> `asdd-data-routing.md` (D0-D7) se compone con ORC-001 según la tabla
> de correspondencia D → fase ORC descrita en `asdd-routing-heuristics.md`
> sección "Arbitraje ORC-001 ↔ D0-D7 (Smart Data — ADR-002)". Cuando el request
> es de dominio de datos analíticos, el orquestador fija la fase ORC primero y
> el sub-flujo Data después.
