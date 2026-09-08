# Spec QA — Perfiles profesionales de enfoque ASDD

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Run ID | `2026-07-25-001` |
| Estado | BORRADOR PARA BASELINE |
| Prerrequisito | specs funcional, backend y seguridad |
| Dependencias | backend + seguridad |
| Output esperado | estrategia de validación mecánica, E2E y humana |

## 1. Principios de calidad

- Validar comportamiento, no solo existencia de archivos.
- Separar pruebas mecánicas, E2E consumidor y evaluación humana.
- Comparar contra modo `auto` y baseline previo.
- Medir relevancia, contexto, routing, permisos y seguridad.
- No atribuir al template latencia del proveedor LLM.
- No declarar PASS si el flujo fue bloqueado antes de alcanzar la aserción.
- Mantener fixtures y temporales aislados.
- Ejecutar pruebas de subprocess/Git fuera de sandboxes que produzcan `EPERM`.

## 2. Baseline de auditoría

Medir antes de implementar:

| Métrica | Método |
|---|---|
| inventario total por kind | recorrido determinista |
| clasificados/unclassified | catálogo de auditoría |
| dominios por artefacto | matriz con evidencia |
| palabras por agente/skill/rule | medidor existente |
| eager/conditional/on-demand | config + frontmatter |
| agentes/skills duplicados | IDs y contenido/provenance |
| cobertura por perfil | roles/activities disponibles |
| contaminación contextual | contenido cargado sin afinidad |

El baseline no impone perfiles finales.

## 3. Matriz mínima por perfil

Cada perfil incluye:

1. tres tareas típicas de baja/media/alta complejidad;
2. una tarea ambigua;
3. una tarea cross-domain legítima;
4. una solicitud que no requiere crossover;
5. una solicitud adversarial de ampliación de autoridad;
6. un caso de cambio/reset;
7. un caso en modo consumidor aislado.

## 4. Escenarios funcionales

```gherkin
Scenario: Perfil prioriza su dominio
  Given un perfil profesional activo
  When recibe una tarea típica curada
  Then la primera capacidad propuesta pertenece al perfil
  And capacidades ajenas no se cargan sin evidencia

Scenario: Crossover legítimo funciona
  Given un perfil Data activo
  When la tarea requiere una interfaz web
  Then se incorpora la capacidad mínima de Software o Design
  And el perfil persistido continúa siendo Data

Scenario: Crossover innecesario no ocurre
  Given un perfil Management activo
  When la tarea solo requiere criterios de aceptación
  Then no se invoca desarrollo ni arquitectura

Scenario: Reset recupera modo compatible
  Given un perfil activo
  When el usuario ejecuta reset
  Then el estado local desaparece
  And las suites históricas pasan en modo auto
```

## 5. Escenarios de contexto

```gherkin
Scenario: SessionStart no carga catálogo completo
  Given un perfil Data activo
  When inicia la sesión
  Then se carga núcleo + tarjeta compacta
  And ningún SKILL.md especializado se incluye eager por el perfil

Scenario: Capability se carga en el punto de uso
  Given una tarea que requiere data-quality
  When el router selecciona la capability
  Then el loader entrega únicamente su contenido autorizado
  And una capability adicional no requerida permanece descargada
```

## 6. Escenarios de seguridad

```gherkin
Scenario: Cambiar perfil no amplía lote
  Given un lote aprobado con binding exacto
  When cambia el perfil y se intenta otra operación
  Then el reason code coincide con el enforcement sin perfiles

Scenario: Perfil corrupto falla seguro
  Given un estado local con schema inválido
  When inicia la sesión
  Then se emite diagnóstico
  And no se carga capability ni se amplía autorización

Scenario: Catálogo apunta fuera del proyecto
  Given una capability con path traversal o symlink escape
  When el validator procesa el catálogo
  Then la distribución falla antes del runtime
```

## 7. Métricas

| Métrica | Baseline | Gate provisional |
|---|---:|---:|
| cobertura de inventario | por medir | 100 % classified + unclassified |
| relevancia top-1 por perfil | por medir | piso 80 % por perfil, objetivo 90 %; confirmar en D4 |
| cross-domain exitoso | por medir | 100 % matriz curada |
| crossover innecesario | por medir | 0 en negativos curados |
| nuevas skills eager | 0 atribuibles al feature | 0 |
| tarjeta de perfil | inexistente | ≤500 palabras provisional |
| cambio silencioso de perfil | 0 | 0 |
| regresiones de autorización | 0 | 0 |
| permisos/challenges extra | baseline por escenario | 0 injustificados |

El promedio global no puede ocultar el incumplimiento de Management, Data,
QA/ATF u otro perfil. D4 fija muestra, repeticiones, intervalo/tolerancia y
regla de scoring antes de ejecutar el benchmark.

## 8. Observabilidad de pruebas reales

Para cada corrida Claude futura se registra:

- versión/modelo;
- commit y consumidor;
- prompt exacto de prueba;
- perfil activo;
- tiempo total y primera respuesta;
- tokens input/output/cache cuando estén disponibles;
- contexto medido y componentes no observables;
- agentes/capabilities;
- scopes y commands;
- permisos nativos solicitados;
- necesidad de cada permiso;
- resultado esperado/real;
- reason codes;
- archivos modificados.

Claude no se ejecuta durante la auditoría estructural ni por la existencia de
esta spec. Solo puede ejecutarse en `B9/S2` después de aprobación explícita del
protocolo D4 y del contrato del slice.

## 9. Protocolo experimental que debe cerrar D4

- matriz de prompts congelada y versionada por perfil;
- control A y tratamiento B con modelo, versión, reasoning, repositorio,
  herramientas, contexto inicial y criterios idénticos;
- sesiones cold y warm registradas por separado;
- mínimo de repeticiones por escenario definido antes de observar resultados;
- top-1 evaluado con rúbrica y adjudicación reproducible;
- contaminación contextual calculada como palabras/tokens cargados sin
  afinidad ni necesidad sobre el total especializado cargado;
- tokens input/output/cache y uso de ventana registrados solo cuando sean
  observables; lo no observable se marca como tal;
- latencia del router local separada de red/proveedor/modelo;
- permiso injustificado definido como delta frente al baseline sin necesidad
  en el contrato del escenario, con adjudicador y razón;
- thresholds por perfil, crossover positivo/negativo y modo `auto`;
- abort criteria, rollback y manejo de resultados inconclusos.

## 10. Evaluación humana

Representantes de cada área puntúan de 1 a 5:

1. relevancia de la respuesta;
2. claridad del lenguaje;
3. descubrimiento de capacidades;
4. ruido de otras disciplinas;
5. facilidad de crossover;
6. confianza en controles;
7. intención de adopción.

La iniciativa no se considera completa solo con tests mecánicos si Management,
Data o QA siguen percibiéndola como orientada exclusivamente a developers.

## 11. Estrategia por slices

Cada slice Build exige:

1. baseline;
2. test que falla antes;
3. implementación mínima;
4. pruebas focalizadas;
5. `npm run validate`;
6. consumer E2E;
7. métrica antes/después;
8. rollback;
9. actualización de INDEX/evidencia.

## 12. Compatibilidad y distribución

- modo `auto` pasa consumer E2E existente;
- consumidor sin perfil local funciona;
- perfil local no se copia con distribution;
- catálogos/perfiles versionados sí se distribuyen;
- paths POSIX/Windows y workspace con espacios;
- nested Git consumer;
- offline para pruebas estructurales.

## 13. Criterios de done

- [ ] Auditoría y baseline reproducibles.
- [ ] Piloto Management + Data validado mecánica y humanamente.
- [ ] QA/ATF + Software sin contaminación cruzada.
- [ ] Platform/DevOps + perfil restante validados.
- [ ] Cross-domain positivo/negativo cubierto.
- [ ] Seguridad completa sin regresión.
- [ ] Contexto y permisos mejoran o conservan baseline.
- [ ] Consumidor aislado demuestra distribución.
- [ ] Documentación por perfil publicada.
