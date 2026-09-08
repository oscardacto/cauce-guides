# meta vs toolkit COE — Complementariedad

El template ASDD incluye el agente `sofka-asdd-meta`. El COE Sofka también
distribuye el **Quality Gate Toolkit** (`coe-quality-gate-toolkit`) con los
agentes `@qgt-audit-agentic-config` y `@qgt-build-agentic-config`.

Este documento aclara cuándo usar cada uno para evitar confusión de routing.

## División de responsabilidades

| Pregunta | Usar |
|---|---|
| ¿Debo compactar ahora o tengo contexto para seguir? | `sofka-asdd-meta` |
| ¿Cómo está mi token budget en esta sesión? | `sofka-asdd-meta` |
| ¿Qué agente debo invocar para esta tarea? | `sofka-asdd-meta` |
| El agente X no responde bien, ¿qué está pasando? | `sofka-asdd-meta` |
| ¿Mi configuración agéntica sigue las mejores prácticas? | `@qgt-audit-agentic-config` |
| Encontré hallazgos de auditoría, ¿cómo los corrijo? | `@qgt-build-agentic-config` |
| Quiero optimizar tokens de mis agentes/skills | `@qgt-build-agentic-config` |

## Regla simple

- **`sofka-asdd-meta`** → decisiones reactivas *en sesión* (micro-governance, runtime)
- **`@qgt-audit-agentic-config`** → auditoría puntual y profunda (produce reporte)
- **`@qgt-build-agentic-config`** → corrección y construcción de configuración (produce propuestas)

## Si el proyecto NO usa el toolkit COE

`sofka-asdd-meta` cubre lo esencial: token budget, contexto, routing y diagnóstico
básico. Es autónomo y no requiere el toolkit.

## Si el proyecto SÍ usa el toolkit COE

`sofka-asdd-meta` sigue siendo útil para microdecisiones de runtime.
El toolkit se usa para auditorías periódicas y correcciones profundas.
No hay conflicto — son capas complementarias.

## Señal de routing

Si la pregunta tiene respuesta en < 2 turnos → `sofka-asdd-meta`.
Si la pregunta requiere leer ≥ 5 archivos y producir un reporte → toolkit.
