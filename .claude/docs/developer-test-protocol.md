# Developer Test Protocol

> Doc normativo on-demand (#3644). Referenciado por las skills que lo requieren; no se carga always-loaded (criterio #3671).

Aplica a `sofka-asdd-developer-frontend` y `sofka-asdd-developer-backend` en la fase Construir.
**Sin Test Coverage Declaration publicada → NO declarar done.**

---

## CASO A — Acceptance criteria definidos en la spec

1. Leer los acceptance criteria completos antes de escribir código.
2. Publicar **Test Coverage Declaration** mapeando cada criterio → `archivo:método de test`.
3. Boundary values y error states → TDD obligatorio: test en RED primero, luego código de producción.
4. Criterio de aceptación sin test al terminar = GAP = **BLOQUEANTE** antes de declarar done.

---

## CASO B — Sin spec / hotfix / bug puntual sin QA

El implementador DEBE derivar sus propios casos. No se acepta "no hay escenarios definidos" como justificación para entregar sin tests de borde.

### Técnicas obligatorias

**PE — Partición de Equivalencia**
Por cada parámetro o campo de entrada relevante:
- Clase válida: valor representativo que funciona
- Clase inválida: nulo, vacío, tipo incorrecto, fuera de rango

**AVF — Análisis de Valor Frontera**
Para strings con `minLength`/`maxLength`, números con rangos, fechas con restricciones:
- Exactamente en el límite mínimo y máximo
- Un valor justo por encima y justo por debajo

**Error states obligatorios** — todo endpoint / caso de uso / acción con datos remotos:

| Estado | HTTP backend | Frontend / cliente |
|--------|-------------|---------------------|
| Input inválido | 400 / 422 | Validación de entrada |
| No autorizado | 401 / 403 | Ruta protegida / rol incorrecto |
| No encontrado | 404 (si el recurso puede no existir) | Estado `empty` |
| Conflicto | 409 (si hay unicidad) | — |
| Error externo | 500 / timeout (adapters externos) | Estado `error` |

**Happy path por rol**
Un test del flujo completo exitoso para cada rol que use el feature.

### Mínimos por tipo de componente (CASO B)

> Ejemplos para stacks típicos — adaptar al stack y arquitectura del proyecto consumidor.

| Tipo | Tests mínimos obligatorios |
|------|---------------------------|
| Servicio de dominio / caso de uso | happy path + 2 inputs inválidos (PE) + 1 boundary (AVF) + 1 error estado |
| Servicio de aplicación | happy path + not-found + error delegado |
| Repositorio / adaptador de puerto | found + not-found + error de persistencia |
| Controlador / handler HTTP | 200 ok + 400 input inválido + 403 no autorizado |
| Componente UI con datos remotos | loading + success + error + empty (4 estados) |
| Schema de validación de entrada | 1 objeto válido completo + 1 por cada campo con restricción |
| Consumer de mensajes / listener | mensaje válido + mensaje malformado + error downstream |
| Función con operaciones de I/O o llamadas externas | happy path + fallo de I/O/red (timeout/conexión) + respuesta inesperada del externo |
| Módulo con exception handling | excepción de dominio lanzada correctamente + excepción técnica no expuesta al usuario + cleanup de recursos ejecutado |

---

## Test Coverage Declaration (OBLIGATORIA — publicar antes de escribir código)

```
Test Coverage Declaration — [ClaseOMódulo]:
Origen: CASO A — Acceptance criteria IDs: AC-NNN..AC-MMM
      | CASO B — self-derived (no hay spec con criterios de aceptación)

Tests a implementar:
- [T01] [PE válido / AVF límite / happy / error / ...] — [descripción]
- [T02] ...
- [T0N] ...
Total declarado: N tests
```

**Regla:** terminar el turno con menos tests que los declarados = BLOQUEANTE. Tests adicionales son bienvenidos.

---

## Done criteria — tests completos

1. Todos los tests declarados implementados y en GREEN.
2. Coverage ≥ thresholds del proyecto (declarados en el CLAUDE.md del proyecto consumidor).
3. Nombres de test descriptivos en el idioma y convención del proyecto.
4. Ningún test depende de timing implícito o estado compartido entre tests.

---

## Exception Handling — Tests obligatorios

Todo módulo con `try/catch` o manejo de excepciones requiere al menos:

**T-EX-01 — Excepción de dominio propagada correctamente**
El caso de uso o servicio lanza la excepción específica cuando se viola una regla de negocio.
El test verifica: tipo de excepción correcto + mensaje en español.

**T-EX-02 — Error técnico no expuesto al usuario**
Cuando un adaptador de infraestructura falla (BD caída, timeout, error de red), el error
técnico NO llega al boundary del usuario. El test verifica que la respuesta al cliente
es un mensaje genérico (no el mensaje interno de la excepción).

**T-EX-03 — Cleanup de recursos garantizado**
Si el módulo abre un recurso externo (conexión, archivo, lock), el test verifica que el
recurso se libera tanto en el happy path como cuando ocurre una excepción.

**T-EX-04 — No silencio ante fallos**
Un fallo en una operación crítica (persistencia, publicación de evento) resulta en
excepción visible — nunca en retorno silencioso o log sin propagación.

Estos tests se declaran en la Test Coverage Declaration con prefijo `[T-EX-NN]`.
