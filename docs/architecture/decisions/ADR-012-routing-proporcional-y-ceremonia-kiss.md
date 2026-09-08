# ADR-012 — Adoptar routing proporcional y ceremonia KISS

Fecha: 2026-07-17 | Estado: Aceptada  
Deciders: Maintainers ASDD  
Relacionado con: diagnóstico de fricción 2026-07-14; spec runtime-hardening

## Contexto

La clasificación binaria LIGHT/FULL y el fail-safe `duda → FULL` empujan tareas sencillas a spec-per-área y delegación costosa. Una tarea trivial de probar una URL consumió aproximadamente 15 minutos por ceremonia.

## Decisión

Clasificar por `TRIVIAL/LIGHT/MEDIUM/FULL`, dominio y radio de cambio antes de cargar capacidades. Las tareas explícitas de bajo riesgo usan ceremonia mínima; la ambigüedad escala un nivel, no directamente a FULL. La revisión humana/factual se acota por radio, pero los gates deterministas y de seguridad siempre se ejecutan completos. ORC-001-C mantiene escalamiento dinámico.

## Justificación

La profundidad gradual reduce falsos FULL sin impedir que complejidad oculta eleve el flujo. La rama `fix/spdd-optimization` aporta evidencia implementada del mismo patrón mediante clasificación temprana y review por radio; se adopta el principio, no su implementación Canvas específica.

## Alternativas consideradas

- **Conservar binario:** rechazada por evidencia de sobre-clasificación.
- **Toda duda a TRIVIAL:** rechazada por riesgo de sub-clasificación.

## Consecuencias

**Habilita:** menor tiempo de primera acción.  
**Cierra:** FULL como fallback universal inmediato.  
**Deuda asumida:** calibración y evals de routing antes de activar por defecto.

## Historial de estados

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-17 | — | Aceptada | Evidencia de sesiones reales y auditoría de performance |
