# Estabilización — Bug Fix Rules

> Doc normativo on-demand (#3644). Referenciado por las skills que lo requieren; no se carga always-loaded (criterio #3671).

Aplica a todo agente durante la fase de estabilización (features completas,
solo fixes y ajustes). Complementa `asdd-git-safety.md`.

## SBR-001: Think Before Coding

El agente debe declarar hipótesis con evidencia **archivo:línea** ANTES de
modificar cualquier cosa. Afirmaciones sobre comportamiento del código sin
citar la fuente son señal de alucinación → STOP.

```
✅ "La causa raíz está en PaymentService:87 — el handler no cubre el caso vacío"
❌ "Probablemente el problema está en el servicio de pagos"
```

## SBR-002: Simplicity First

Escribe el **mínimo código** que resuelve el problema declarado.

- Cero abstracciones no pedidas
- Cero refactoring de código no relacionado con el fix
- Cero "mejoras de paso" — si algo merece mejora, abrir un ticket separado

## SBR-003: Surgical Changes (CRÍTICA en estabilización)

**Cada línea modificada debe trazarse directamente al bug reportado.**

Prohibido tocar:

- Código que funciona correctamente y no está en el path del bug
- Comentarios, formatting, o nombres de variables en secciones no relacionadas
- Imports de archivos que no cambiaron su lógica
- Cualquier archivo fuera de la **Scope Declaration** aprobada

Si durante el fix se descubre deuda técnica en código adyacente → documentar
en el BUG report, NO corregir en el mismo PR.

## SBR-004: Goal-Driven Execution

Convertir instrucciones imperativas en criterios verificables:

```
"arregla el bug"  →
  1. Escribir test que falla reproduciendo exactamente el bug
  2. Hacer pasar el test con el mínimo fix
  3. Verificar que NINGÚN test existente rompe
  4. Confirmar fix con el test reproducible
```

---

## Test Reproducible ANTES del Fix (BLOQUEANTE)

**El primer artefacto de todo bugfix es un test que falla.**

Este test es la evidencia de que el diagnóstico fue correcto. Sin él, el
agente puede "arreglar" un síntoma diferente al bug real.

```
Orden obligatorio:
1. asdd-explorer o asdd-tech-lead → diagnóstico con evidencia archivo:línea
2. Test que FALLA reproduciendo el bug (escrito por asdd-developer-frontend /
   asdd-developer-backend, skill unit-test o integration-test)
3. Aprobación del plan por el usuario
4. asdd-developer-frontend / asdd-developer-backend → fix mínimo que hace pasar el test
5. Verificar que tests pre-existentes no rompen
```

Excepciones únicas donde se omite el test previo:

- Bug de un typo/literal en 1 archivo sin lógica de negocio
- Error de configuración (variable de entorno, URL, valor de config)

En estos casos: documentar por qué se omite y agregar el test después del fix.

---

## Diagnóstico Read-Only (NO NEGOCIABLE)

El agente de diagnóstico (`asdd-explorer`) es **estrictamente de
lectura**. Su output es un reporte, nunca código modificado.

Señales de que el diagnóstico está siendo corrompido:

- El agente sugiere editar el archivo "para verificar" → NEGAR
- El agente agrega logs de debugging al código de producción → NEGAR
- El agente "limpia" imports mientras investiga → NEGAR

**Si no se puede confirmar la causa raíz con evidencia de lectura → reportar
incertidumbre, NO proponer fix especulativo.**

---

## Impact Map (OBLIGATORIO — antes de Scope Declaration)

Antes de declarar el scope, el agente ejecuta un Impact Map: búsqueda de
todos los consumidores del símbolo o módulo a tocar.

```bash
# ¿Quién usa el símbolo a modificar? (adaptar extensión al stack del proyecto)
rg "ClassName|methodName" src/ -l

# ¿Quién implementa la interfaz o tipo a cambiar?
rg "implements InterfaceName|extends AbstractName" src/ -l
```

**Reglas del Impact Map:**

1. Consumers en módulos DISTINTOS al del bug → el fix NO es de un solo módulo
   → escalar a ruta FULL (ASDD workflow).
2. Consumers en el MISMO módulo → ampliar Scope Declaration para incluirlos
   en la verificación.
3. 0 results → verificar que la búsqueda usó el nombre exacto del símbolo.

Publicar en el chat antes del Scope Declaration:

```
Impact Map — [SímboloAfectado]:
- Consumers encontrados: N archivos
- Módulos afectados: [lista]
- Decisión: [/asdd:build continúa | escalar a FULL]
```

---

## Scope Declaration (antes de implementar)

Antes de escribir la primera línea de código, el implementador publica en chat:

```
Scope Declaration:
- src/path/FileA.ext — [razón directa al bug]
- src/path/FileA_test.ext — test reproducible + fix
- [ningún otro archivo]
```

Cualquier edición fuera de la Scope Declaration requiere justificación
explícita y aprobación del usuario.

**Scope Verification (post-implementación):** al terminar el fix, ejecutar:

```bash
git diff --name-only HEAD
```

Si aparecen archivos fuera del Scope Declaration → justificar cada uno en
el chat. Si no hay justificación → `git checkout <archivo>` y reportar al
usuario.

---

## Cuándo usar fix directo vs ASDD workflow completo

| Condición | Usar |
|---|---|
| Bug en un solo módulo, sin nueva API ni migración | fix directo (ruta LIGHT) |
| Bug con causa raíz en lógica interna existente | fix directo (ruta LIGHT) |
| Bug que requiere nuevo endpoint, migración o cambio cross-módulo | ASDD FULL desde Diseñar |
| Bug cuya causa raíz requiere cambio arquitectónico | ASDD FULL desde Analizar → `asdd-solution-architect` primero |

---

## Coverage Gate (BLOQUEANTE — ningún agente puede declarar done sin superar esto)

Ningún agente puede declarar implementación completa sin verificar que el
código modificado tiene cobertura de tests. Los umbrales exactos dependen
del stack del proyecto y se declaran en el CLAUDE.md del proyecto consumidor.

**Proceso obligatorio para `asdd-developer-frontend` / `asdd-developer-backend` (skill unit-test):**

1. Escribir tests
2. Ejecutar coverage del módulo completo (no del archivo individual)
3. Reportar números reales con veredicto PASS/FAIL
4. Si bajo threshold → identificar gaps → escribir tests → re-verificar
5. Solo declarar done cuando todos los thresholds se cumplen

**Si el código de producción NO tiene cobertura suficiente:** el trabajo
no está completo. Regresar a implementación con los gaps identificados.

---

## Contrato QA Antes de Implementar (OBLIGATORIO en bugfix)

Antes de que el implementador escriba código, `asdd-atf-api-qa-engineer`
produce el contrato mínimo:

- **Boundary values** de los campos/condiciones afectados por el fix
- **Error states** que el fix debe manejar (4xx, 5xx, timeouts)
- **Áreas de regresión** en riesgo

Este contrato es la especificación de tests que `asdd-developer-frontend` /
`asdd-developer-backend` (skill integration-test) implementa. Cualquier
escenario del contrato sin test = gap de cobertura = BLOQUEANTE.

---

## Bugs que los Agentes Introducen — Checklist del Reviewer

`asdd-tech-lead` (skill code-review) verifica activamente estos patrones:

| Bug | Cómo el agente lo introduce | Verificación |
|---|---|---|
| Silent data corruption | Confía en input sin validar contra dominio | ¿Se valida contra contratos de dominio? |
| Race condition | Toggle sin locking / sin idempotencia | ¿Operaciones concurrentes son thread-safe? |
| Retry storm | Retry sin backoff exponencial | ¿Existe backoff con jitter? |
| Auth context leak | Usa datos del request en lugar de token verificado | ¿Toda auth viene del contexto de seguridad? |
| Hallucinated API | Usa método deprecated o que no existe | ¿Se verificó contra versión actual del SDK? |
| Type coercion | Cast forzado en lugar de validación real | ¿Hay casts inseguros (`as`, type assertions)? |
| Memory leak | Recursos sin cleanup (listeners, handles, goroutines) | ¿Todo recurso tiene cierre explícito? |
| Connection exhaustion | Missing error handling en cadena de IO | ¿Toda operación IO tiene manejo de error? |
