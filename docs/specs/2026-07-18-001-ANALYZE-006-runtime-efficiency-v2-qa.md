# Spec QA — Runtime Efficiency v2

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Rol destino | QA de runtime/tooling |
| Prerrequisito | Specs funcional, backend y seguridad del run 001 |
| Dependencias | backend + seguridad |
| Output esperado | Harness de benchmark, regresiones y E2E de consumidor |

## 7. RNFs de calidad

- Tests deterministas, sin red y con temporales aislados.
- Benchmarks con warm-up, múltiples muestras y publicación de p50/p95.
- Separación entre tiempo de proceso, filesystem/Git y latencia de proveedor LLM.
- Fixtures POSIX/Windows, espacios, symlinks, paths anidados y repos múltiples.
- Comparación diferencial de hooks antes/después.
- Cero tolerancia a regresiones de routing y seguridad.
- Targets versionados; cambiar un límite requiere evidencia y motivo.

## 10. Escenarios de aceptación

```gherkin
Scenario: Skills inline y de bloque tienen el mismo costo
  Given dos agentes equivalentes con las mismas skills
  And uno usa YAML inline y otro lista de bloque
  When se calcula el presupuesto
  Then ambos totales son iguales

Scenario: Una skill inexistente no desaparece de la métrica
  Given un agente referencia una skill no instalada
  When se calcula el contexto efectivo
  Then el validator falla con la referencia exacta
  And no suma cero silenciosamente

Scenario: El dispatcher conserva una decisión de bloqueo
  Given un fixture de Bash destructivo bloqueado por la cadena anterior
  When se ejecuta contra el dispatcher consolidado
  Then exit code, decision y reason son equivalentes
  And el comando no se ejecuta

Scenario: El fast path evita trabajo no aplicable
  Given un git status local permitido
  When se evalúa PreToolUse
  Then se inicia un solo proceso ASDD
  And no se escanean specs ni stores de autorización innecesarios

Scenario: Múltiples denies conservan todas las razones ganadoras
  Given dos guards ASDD aplicables que retornan deny
  When el dispatcher combina el evento
  Then ambos guards se ejecutan
  And la decisión final es deny
  And ambas razones aparecen en orden determinista

Scenario: El dispatcher coexiste con collector
  Given un dispatcher ASDD de proyecto y sofka-collector instalado globalmente
  When una tool permitida completa PreToolUse y PostToolUse
  Then se inicia exactamente un proceso de enforcement ASDD
  And collector conserva exactamente un evento Pre y uno Post con el mismo tool_use_id
  And PostToolUse no es ejecutado ni reemplazado por el dispatcher

Scenario: Un deny ASDD no suprime telemetría
  Given una operación bloqueada por un guard ASDD
  When Claude Code ejecuta los hooks PreToolUse coincidentes en paralelo
  Then collector registra exactamente un evento PreToolUse
  And no se espera PostToolUse porque la tool no se ejecutó
  And el Pre huérfano se clasifica como intento bloqueado y no como pérdida

Scenario: La inyección normal es compacta
  Given un prompt conversacional sin señal especial ni challenge
  When se ejecuta UserPromptSubmit
  Then la salida contiene como máximo el budget aprobado
  And no repite el núcleo ORC completo

Scenario: Una señal sensible conserva su recordatorio
  Given un cambio real de autorización o seguridad
  When se ejecuta UserPromptSubmit
  Then se emite routing seguro y plan requerido

Scenario: Una capability se carga bajo demanda
  Given un plan con una capability canónica
  When el agente inicia
  Then solo se entrega el SKILL.md autorizado
  And una segunda capability no aprobada es rechazada

Scenario: Una rule movida se lee en consumidor real
  Given una rule especializada trasladada a reference
  When un proyecto consumidor ejecuta la ruta correspondiente
  Then el transcript evidencia su Read antes de actuar

Scenario: El reconciliador respeta la fase
  Given runs válidos en Specify, Analyze, Build y Complete
  When se ejecuta validate-template sobre cada fixture
  Then Specify sin INDEX se omite explícitamente
  And Analyze cerrado o fases posteriores exigen INDEX válido

Scenario: Routing económico escala ante riesgo
  Given un request de alto riesgo o baja confianza
  When el modelo inicial es económico
  Then la política escala antes de actuar
```

## Matriz de medición

| Métrica | Método mínimo | Gate inicial |
|---|---|---|
| Always-on words | Conteo determinista de fuentes | target confirmado por SPIKE-1 |
| Agent + eager skills | YAML real + SKILL.md resolubles | sin falsos mínimos |
| Prompt injection | palabras y bytes por fixture | ≤ target confirmado |
| Procesos por evento | instrumentación de child processes | 1 |
| Fast path hook | warm-up + ≥30 muestras | p50/p95 confirmados |
| Fan-out | log estructurado por ruta | TRIVIAL=0 |
| Routing | evals positivos/negativos | 0 regresiones |
| Seguridad | fixtures adversariales | 0 diferencias no aprobadas |

## Estrategia por slice

Cada slice incluye:

1. baseline previo;
2. prueba que falla;
3. implementación mínima;
4. suites focalizadas;
5. `npm run validate`;
6. comparación de métrica;
7. commit aislado y rollback definido.

No se acumulan todas las pruebas para el final.

## Criterios de done

- Parser y budget cubren sintaxis YAML válida y referencias rotas.
- Reconciliación cubre todas las fases del run.
- Dispatcher pasa pruebas diferenciales y adversariales.
- Lazy loading tiene happy path y mismatch.
- Evals de routing/modelo no degradan precisión.
- Un consumidor aislado demuestra carga condicional y guards.
- Baseline final publica método y componentes no medidos.

