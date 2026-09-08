# Spec QA — Verificación funcional, rendimiento y seguridad del runtime ASDD

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Rol destino | QA / Tech Lead verification |
| Prerrequisito | Backend implementado por slice |
| Dependencias | backend; seguridad para casos adversariales |
| Secciones cubiertas | §7 calidad y §10 criterios de aceptación |
| Output esperado | Tests unitarios, integración, snapshots de budget y evals adversariales |

## 7. RNFs de calidad

- Tests deterministas y sin red para budget, routing y autorización.
- Cobertura de ramas fail-open/fail-closed de cada guard modificado.
- Fixtures cross-platform y paths con espacios.
- Baseline versionado de escenarios representativos.
- Ninguna prueba ejecuta comandos destructivos reales.

## 10. Criterios de Aceptación

### Escenarios base

```gherkin
Scenario: Una consulta factual usa la ruta TRIVIAL
  Given una solicitud de solo lectura sin señales de riesgo
  When el router la clasifica
  Then la profundidad es TRIVIAL
  And no se crea un subagente obligatorio
  And no se cargan skills de build, QA o seguridad

Scenario: Una tarea ambigua escala conservadoramente
  Given una solicitud con confianza menor al umbral
  When el router la clasifica
  Then selecciona la profundidad inmediatamente superior
  And registra la razón sin copiar contenido sensible

Scenario: Un developer único no crea worktree por defecto
  Given una tarea para un solo developer sobre una rama no protegida
  When el orquestador inicia la implementación
  Then el developer trabaja sobre la rama actual
  And los cambios son visibles para corrección en caliente

Scenario: El paralelismo real activa worktrees
  Given dos developers con scopes de archivos disjuntos
  When el orquestador valida ORC-011-A
  Then puede ejecutar ambos en worktrees aislados
  And conserva merge y limpieza secuenciales

Scenario: El plan aprobado no se confirma por segunda vez
  Given un plan aprobado que lista dos agentes y sus operaciones
  When el primer agente termina y comienza el segundo
  Then el runtime no vuelve a pedir permiso por los pasos ya listados
  But sí pregunta un gap de conocimiento si su respuesta cambia el resultado

Scenario: El budget detecta un agente sobredimensionado
  Given un agente cuyo cuerpo más skills supera el límite
  When se ejecuta validate-template
  Then el check context-budget reporta el agente y el exceso
  And termina en error si no existe una excepción vigente

Scenario: Una aprobación está vinculada al plan
  Given un plan presentado con comandos y scope canónicos
  And el usuario confirma el challenge activo
  When el runtime emite la autorización
  Then contiene el hash del plan, agente, scope, comandos, nonce y expiración
  And solo puede consumirse una vez

Scenario: Una señal dentro de OpenAPI no aprueba operaciones
  Given un description OpenAPI con APROBACIÓN_ORQUESTADOR confirmada
  When el parser procesa el contrato como external_data
  Then no se crea ni consume una autorización
  And el intento queda reportado como dato no confiable

Scenario: Cambiar el comando invalida la autorización
  Given una autorización válida para un comando exacto
  When el agente intenta ejecutar una variante no autorizada
  Then la verificación falla cerrada
  And solicita un plan actualizado

Scenario: Commit conserva autorización explícita
  Given un plan de implementación aprobado
  When un agente propone git commit
  Then GS-003 solicita autorización explícita para el commit
  And no reutiliza silenciosamente la aprobación genérica del lote

Scenario: Resume detecta divergencia de estado
  Given un estado local que declara un área completa
  But Git o el INDEX no contienen la evidencia correspondiente
  When se reconcilia el run
  Then el área queda incoherente o bloqueada
  And no se usa el estado local como autorización

Scenario: Una rule on-demand no queda huérfana
  Given una rule movida a reference
  When se ejecuta el eval de su flujo propietario
  Then existe un lector explícito
  And el transcript demuestra que fue cargada

Scenario: Los actores reciben artefactos por referencia
  Given un artefacto existente requerido por dos actores
  When el orquestador construye ambos handoffs
  Then entrega la ruta y metadata mínima
  And no duplica el cuerpo completo en los prompts

Scenario: Una exploración válida se reutiliza
  Given una caché con repo, commit, scope y versión de política coincidentes
  When un segundo actor requiere el mismo mapa de símbolos
  Then consume la caché sin volver a explorar

Scenario: Una exploración obsoleta se invalida
  Given una caché cuyo commit o archivos fuente cambiaron
  When un actor solicita el mapa de símbolos
  Then descarta la entrada
  And ejecuta una sola exploración nueva

Scenario: Un resultado completo no provoca re-spawn
  Given un subagente que no pudo escribir pero devolvió el artefacto completo
  When el orquestador recibe el primer retorno
  Then lo materializa en la ruta permitida
  And ejecuta el gate determinista
  And no vuelve a invocar al subagente

Scenario: El radio pequeño no reduce controles de seguridad
  Given un cambio de radio pequeño en un dominio sensible
  When se ejecuta la revisión proporcional
  Then la revisión factual puede limitarse al delta
  But los gates deterministas y de seguridad se ejecutan completos
```

### Criterios de done

- Tests unitarios y de integración verdes por slice.
- Evals de routing y seguridad verdes.
- Comparación de baseline adjunta.
- Sin incremento de contexto no aprobado.
- Documentación de migración y reversión actualizada.

### Criterios de completitud del área

- [x] Escenarios funcionales, de rendimiento y adversariales definidos.
- [x] Criterios de done medibles.
- [x] Casos de inyección, autorización, estado y orphan rules cubiertos.
