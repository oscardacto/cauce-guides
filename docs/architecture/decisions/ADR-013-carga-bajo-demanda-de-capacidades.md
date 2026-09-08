# ADR-013 — Adoptar carga bajo demanda de capacidades agénticas

Fecha: 2026-07-17 | Estado: Aceptada  
Deciders: Maintainers ASDD  
Relacionado con: ADR-005; spec runtime-hardening

## Contexto

El template contiene 24 agentes, 153 skills y 26 rules. Agentes como ATF Web arrancan con decenas de miles de palabras de prompt+skills antes del contexto de trabajo. ADR-005 demostró que mover contenido reduce el piso, pero también que todo elemento on-demand necesita lector verificable.

## Decisión

Seleccionar skills, agentes de dominio y referencias por fase/configuración. Mantener auto-loaded solo controles universales mínimos. Pasar artefactos entre actores por ruta, no copiando su cuerpo; reutilizar artefactos existentes en vez de re-derivarlos. Para exploración costosa, permitir una caché persistida con fuente, hash/commit, scope y política explícita de invalidación. Toda migración exige lector explícito, budget y eval anti-orfandad.

## Justificación

Reduce el footprint sin compensarlo con modelos más costosos y extiende de forma segura el patrón probado por ADR-005. `fix/spdd-optimization` validó en el subflujo Canvas que el handoff por path, progressive disclosure y una única exploración reutilizada evitan relecturas y reexploraciones.

## Alternativas consideradas

- **Forzar Opus:** rechazada por costo y porque no corrige el piso.
- **Mover todo a reference:** rechazada por riesgo de gobernanza huérfana.

## Consecuencias

**Habilita:** agentes más pequeños y menos compactación.  
**Cierra:** disponibilidad eager de toda capacidad en cada spawn.  
**Deuda asumida:** catálogo/resolver de capacidades y latencia pequeña en primer uso.

La caché nunca es autoridad ni autorización: una entrada sin procedencia válida o cuyo commit/scope ya no coincide se descarta y se regenera.

## Historial de estados

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-17 | — | Aceptada | Extensión controlada de ADR-005 |
| 2026-07-17 | Aplicación parcial (ATF) | Aplicada a developers | `developer-backend` y `developer-frontend` dejan de precargar sus 11 skills y usan el resolver por capacidad. |
