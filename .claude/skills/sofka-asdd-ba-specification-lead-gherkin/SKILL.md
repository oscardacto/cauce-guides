---
name: sofka-asdd-ba-specification-lead-gherkin
description: Borrador de criterios Gherkin, insumo para spec-qa. Se activa dentro de sofka-asdd-ba-specification-lead.
---

## Rol

Generador de criterios de aceptación testeables en formato Gherkin. Garantiza cobertura mínima de los 5 tipos de escenario obligatorios en la sección de criterios de aceptación de la SPEC.

## Cuándo activar

- La SPEC es compleja y los Gherkin de la sección de criterios de aceptación requieren atención dedicada
- Los Gherkin existentes son narrativos en lugar de testeables
- Se necesita ampliar la cobertura de escenarios de borde

## Estructura obligatoria de la sección de criterios de aceptación

La sección de criterios de aceptación siempre empieza con el encabezado `Feature:` que describe la funcionalidad en lenguaje de negocio. Luego mínimo 5 `Scenario:`, uno por cada tipo obligatorio:

| Tipo | Qué cubre | Regla / control que corresponde |
|---|---|---|
| Happy path | El flujo principal en condiciones normales — todo funciona | Una regla [CORE] del flujo principal |
| Negativo | El sistema rechaza correctamente una entrada inválida | Una regla [CORE] de validación o restricción |
| Edge operativo | Un caso borde técnico (timeout, volumen máximo, dato vacío) | Puede ser [CORE] de timeout o [EDGE] técnico |
| Edge regulatorio | Un caso borde de negocio o regulación | Siempre una regla [EDGE] de la sección de reglas de negocio |
| Seguridad | Un intento de acceso no autorizado o manipulación de datos | Controles de la sección de seguridad funcional; si aplica, también una regla [EDGE] de la sección de reglas de negocio |

**Regla crítica**: cada `Scenario:` debe referenciar o derivarse de una regla [CORE] o [EDGE] de la sección de reglas de negocio, o de controles de la sección de seguridad funcional (escenario de seguridad). Si no se puede trazar el escenario a una regla o control, la sección de reglas de negocio o la sección de seguridad funcional tiene un vacío.

**Los 5 tipos son el piso, no el techo.** Para SPECs complejas con múltiples reglas CORE/EDGE relevantes, generar un escenario adicional por cada regla no cubierta por los 5 base. La subsección "Escenarios adicionales — QA" de la sección de criterios de aceptación de la plantilla contempla esta expansión.

## Formato Gherkin canónico

```gherkin
Feature: {Nombre de la funcionalidad en lenguaje de negocio}

  Scenario: Happy path — {descripción del caso exitoso principal}
    Given {precondición — estado del sistema o datos de entrada concretos}
    And {precondición adicional si aplica}
    When {acción que dispara el flujo — actor + acción específica}
    Then {resultado observable esperado — verificable sin acceso al código}
    And {resultado adicional verificable si aplica}

  Scenario: Negativo — {descripción del caso de fallo o rechazo}
    Given {precondición que genera el caso negativo}
    And {precondición adicional si aplica}
    When {acción que dispara el flujo}
    Then {resultado esperado en el caso negativo — mensaje de error o rechazo específico}
    And {estado del sistema que NO debe cambiar}

  Scenario: Edge case operativo — {descripción del caso límite técnico}
    Given {precondición del caso límite — timeout, volumen, concurrencia}
    When {acción que dispara el caso límite}
    Then {resultado esperado — respuesta parcial, estado específico, o mensaje de contingencia}
    And {verificación adicional del manejo del borde}

  Scenario: Edge case regulatorio — {descripción del caso con implicación regulatoria}
    Given {precondición regulatoria o contractual}
    When {acción que activa la regla [EDGE] de la sección de reglas de negocio}
    Then {resultado esperado con cumplimiento de la regla especial}
    And {verificación del comportamiento diferenciado}

  Scenario: Seguridad — {descripción del intento de acceso no autorizado o manipulación de datos}
    Given {actor sin permiso / con token inválido / intentando acceder a un recurso ajeno}
    When {intenta ejecutar la acción del flujo}
    Then {el sistema rechaza la operación con código 401 o 403 según corresponda}
    And {ningún dato sensible es expuesto en el cuerpo de la respuesta de error}
```

## Criterios de calidad de un Gherkin testeable

Un escenario ES testeable cuando:
- El `Dado` describe un estado inicial que puede ser reproducido en un ambiente de prueba
- El `Cuando` es una acción única y específica — no "el usuario hace varias cosas"
- El `Entonces` es verificable por un sistema automatizado o por un QA sin interpretación
- No hay adverbios de cantidad vaga: "varios", "muchos", "a veces", "rápidamente"

Un escenario NO es testeable cuando:
- `Entonces` dice "el sistema funciona correctamente" sin especificar qué se puede medir
- `Cuando` describe un proceso de varios pasos — debe dividirse en escenarios
- El escenario depende de datos que no están definidos (ej. "un usuario VIP" sin definir qué es VIP)

## Proceso

1. Leer la necesidad funcional documentada en la SPEC, el flujo de negocio, las reglas de negocio y los controles de seguridad funcional
2. Construir la tabla de correspondencia: regla [CORE]/[EDGE] → tipo de escenario que le corresponde
3. Escribir el encabezado `Feature:` con el nombre de la funcionalidad en lenguaje de negocio
4. Para cada tipo obligatorio, identificar la regla de negocio o control de seguridad funcional que lo origina y escribir el `Scenario:`
5. Verificar que cada `Given` es reproducible en ambiente de prueba
6. Verificar que cada `Then` es verificable por un analista sin acceso al código
7. Confirmar que los 5 tipos están cubiertos y que cada escenario tiene su regla o control trazable

## Inputs

- Referencia del nodo hoja de la EDT (1.X.Y) y la sección de flujo de negocio, la sección de reglas de negocio y la sección de seguridad funcional de la SPEC en construcción
- (Opcional) Gherkin previos a refinar

## Outputs

- **Borrador** de criterios de aceptación con encabezado `Feature:` y mínimo 5 `Scenario:` con los 5 tipos cubiertos — entregado como anexo/nota para quien construya `spec-qa §10` (ADR-004). No se integra dentro del spec-funcional.
- Tabla de correspondencia Regla de negocio → Escenario (para trazabilidad)

## Anti-patterns

- **Sin encabezado Feature:** — la sección de criterios de aceptación sin `Feature:` no es Gherkin válido según la plantilla canónica.
- **Escenarios sin regla trazable** — si no puedes señalar qué regla [CORE] o [EDGE] de la sección de reglas de negocio origina el escenario, o bien el escenario sobra o bien falta una regla.
- **Solo happy paths** — una SPEC con escenarios todos positivos no está probada. Los negativos, los edge y el de seguridad son los que encuentran los bugs.
- **Gherkin como historia** — "Dado que el usuario quiere hacer una transferencia..." no es un estado inicial, es una intención. El `Given` describe hechos concretos del sistema, no intenciones.
- **Then no verificable** — "Entonces el sistema funciona correctamente" no puede ser comprobado por un analista. Especificar el campo exacto, el valor o el estado observable.
