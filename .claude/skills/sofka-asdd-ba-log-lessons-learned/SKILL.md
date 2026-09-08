---
name: sofka-asdd-ba-log-lessons-learned
description: Registra lecciones de cierre de ciclo, sin datos de cliente. La consulta NO es este skill — leer docs/lecciones/ directo.
---

> Rutas en **Layout B** (carpeta por nodo) — ver `.claude/reference/ba/sofka-asdd-ba-specs-layout.md`.

## Rol

Extractor y estructurador de lecciones. Lee los artefactos de cierre y convierte patrones de error, decisiones difíciles y hallazgos recurrentes en lecciones accionables y generalizadas para proyectos futuros.

## Ubicación del consolidado (transversal)

Las lecciones se acumulan en un **documento consolidado transversal** (cross-proyecto, ya generalizado y sin datos de cliente) — no uno por proyecto aislado. Si su ubicación no está definida en la configuración de la capa BA, **preguntarla al AF la primera vez** (proponiendo el default `docs/lecciones/lecciones-consolidado.md`), **persistirla** y reutilizarla en adelante sin volver a preguntar. Los artefactos de cierre por proyecto (evaluaciones, hallazgos UAT, bitácora) son la **fuente** de extracción; el consolidado es el **destino** único.

## Cuándo activar

- Después de que `sofka-asdd-ba-scope-manager` clasifica los hallazgos finales de UAT.
- Después de una decisión de `sofka-asdd-ba-scope-manager` que cierra el scope.
- Al final de un ciclo cuando todas las specs tienen estado APROBADA o RECHAZADA.

## Fuentes de lecciones

| Artefacto | Qué enseña |
|-----------|-----------|
| `docs/specs/_proyecto/evaluacion-{feature}.md` | Filtros FAIL recurrentes, gaps de calidad |
| `docs/specs/_proyecto/hallazgos-uat-{feature}.md` | Reglas mal especificadas, gaps no anticipados |
| `docs/specs/{codigo}-{slug}/dvf-{codigo}.md` | Qué no entendió el negocio en validación |
| `docs/specs/_proyecto/cambio-alcance-*.md` | Scope creep recurrente, alcance mal definido al inicio |
| `docs/bitacora/{proyecto}.md` | Elementos que cambiaron con más frecuencia |

## Proceso

1. Listar y leer los artefactos de cierre en `docs/specs/`.
2. Leer `docs/bitacora/{proyecto}.md` si existe → qué elementos cambiaron más.
3. Identificar patrones recurrentes. **Correlación causal:** cruzar hallazgos UAT (`H-NNN` con su `Tipo UAT origen`) con entradas de bitácora (`BC-NNN` con su `Hallazgo origen`) para detectar qué tipo de hallazgo genera qué tipo de cambio — lecciones causales, no solo de frecuencia.
4. Consolidar: si el mismo error aparece en 3 specs → una sola lección.
5. **Generalizar (privacidad):** redactar sin identificadores de cliente, personas, datos sensibles ni PII. Si no puede generalizarse sin exponer al cliente → no persistir en el repo cross-proyecto.
6. Leer `docs/lecciones/{proyecto}.md` si existe → continuar numeración; revisar si alguna lección previa queda **superada** por lo aprendido y marcarla.
7. Construir las entradas con el formato canónico.
8. Presentar al BA humano para revisión antes de persistir.

## Formato de entrada de lección

```markdown
## {proyecto}-L-{NNN} — {título breve del patrón}

| Campo | Valor |
|-------|-------|
| Estado | vigente |
| Contexto | {qué se construía — generalizado, sin cliente} |
| Qué pasó | {hecho observable generalizado — sin interpretación ni datos de cliente} |
| Lección | {patrón general — empieza con "Cuando..." o "Si..."} |
| Recomendación | {acción concreta ejecutable en el próximo proyecto} |
| Fuente | {artefacto y elemento — ej. evaluacion-login.md, filtro F07} |
| Tags | {dominio, tipo-error, artefacto-afectado} |
| Hallazgo origen | {H-NNN o N/A} |
| CR asociado | {CR-NNN o N/A} |
| Supersede | {ID de lección que reemplaza, o N/A} |
```

## Criterio de calidad de una lección

- "Qué pasó" es observable, verificable y **generalizado** (sin datos de cliente).
- "Lección" empieza con "Cuando..." o "Si..." y describe el patrón general.
- "Recomendación" es accionable en el próximo proyecto.
- Los tags (`artefacto-afectado` por nombre, no por número de sección) permiten encontrarla por búsqueda.

## Ciclo de vida de la lección

- `Estado: vigente` por defecto. Cuando una lección nueva contradice o reemplaza una anterior → marcar la anterior `Estado: superada` y enlazar con `Supersede`. CONSULTAR ignora las `superada`. Evita que el repositorio acumule consejo obsoleto.

## Inputs

- Artefactos de cierre en `docs/specs/`.
- `docs/bitacora/{proyecto}.md` — cambios recurrentes.
- `docs/lecciones/{proyecto}.md` existente — numeración y supersede.

## Outputs

- Entradas `{proyecto}-L-{NNN}` (generalizadas, con Estado) para `docs/lecciones/{proyecto}.md`.

## Cuándo NO invocar

- Se está iniciando un ciclo (sin artefactos de cierre) → este skill no aplica; la **consulta** de lecciones la hace `sofka-asdd-ba-functional-architect` leyendo `docs/lecciones/` directamente al abrir el proyecto.

## Anti-patterns

- **Lecciones de responsabilidad** — "el cliente no sabía lo que quería" no es accionable ni generalizable. La lección es "cuando el brief no tiene restricciones de alcance explícitas, validar alcance con `sofka-asdd-ba-scope-manager` antes de la EDT".
- **Lecciones obvias** — "documentar bien es importante" no ayuda. Ser específico al patrón: qué elemento, qué tipo de regla, qué condición lo disparó.
- **Una lección por hallazgo** — si el patrón aparece en 5 specs, es una lección consolidada.
- **Registrar sin revisar** — presentar siempre al BA humano antes de persistir.
- **Persistir datos de cliente** — nunca guardar specifics identificables en el repo cross-proyecto.
