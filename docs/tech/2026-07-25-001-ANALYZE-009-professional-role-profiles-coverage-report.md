# Reporte de cobertura profesional — Perfiles profesionales ASDD

**Run:** `2026-07-25-001`
**Slices fuente:** `SPIKE-1R` / publicación `SPIKE-1P`
**Estado:** revisión estructural aprobada en G1; recomendaciones provisionales

## 1. Resumen ejecutivo

El template ya contiene capacidades relevantes para seis áreas profesionales,
pero no ofrece una experiencia simétrica ni un foco persistente por trabajador.
La percepción de un producto “pesado y orientado a desarrollo” no se explica
porque las 153 skills locales se carguen todas al iniciar: la evidencia muestra
carga bajo demanda parcial, junto con catálogo global mezclado, journeys
desiguales, documentación desactualizada y nueve agentes con deuda eager.

La arquitectura propuesta de núcleo común + perfil preferente + router ponderado
+ capacidades cross-domain bajo demanda es compatible con la evidencia. Todavía
no está aprobada como diseño final.

## 2. Contabilidad global

| Superficie | Conteo |
|---|---:|
| Entradas totales inventariadas | 809 |
| Superficies primarias | 493 |
| Agentes | 24 |
| Skills locales | 153 |
| Archivos auxiliares bajo skills | 169 |
| Comandos | 40 |
| Rules core / referencias profundas | 17 / 20 |
| Fases condicionales / rollback de coordinadores | 10 / 2 |
| Hooks / librerías de hooks | 18 / 3 |
| Scripts totales | 82 |
| Tools | 89 |
| Fixtures de evaluación | 140 |
| Templates nombrados explícitamente | 19 |
| Superficies primarias `unclassified` | 227 |

Los 24 agentes se distribuyen como 20 de perfil y 4 transversales. Las 153
skills locales se reconcilian por ownership primario: 60 QA/ATF, 37 Software,
15 Experience/Design, 14 Management/Functional, 9 Platform/DevOps, 4 Data, 4
Security y 10 transversales.

Los 40 comandos se distribuyen en 23 QA, 5 Data, 10 del ciclo/general y 2 de
extensión (`add-agent`, `add-skill`).

## 3. Cobertura por perfil provisional

Los conteos de skills de esta tabla representan propiedad primaria. Las
relaciones secundarias cross-domain se conservan aparte para no duplicar.

| Perfil | Agentes | Skills propias | Comandos especializados | Madurez estructural |
|---|---:|---:|---:|---|
| Software Delivery | 4 | 37 | ciclo ASDD general | alta |
| Platform/DevOps | 2 | 9 | 0 | media |
| QA/ATF | 3 | 60 | 23 | muy alta |
| Data | 3 | 4 locales + 14 externas referenciadas | 5 | parcial |
| Management/Functional | 5 | 14 | 0 | media/parcial |
| Experience/Design | 2 | 15 | 0 | suficiente para piloto posterior |
| Security | 1 | 4 | 0 | AppSec parcial/transversal |
| Core/overlays | 4 | 10 | 12 generales/extensión | transversal |

### 3.1 Software Delivery

**Cobertura observada**

- desarrollo backend y frontend;
- arquitectura de solución y contratos;
- liderazgo técnico, code review, quality gates y trazabilidad;
- feature, bug-fix, refactor, unit/integration/E2E y build validation;
- ciclo ASDD general de Specify a Document.

**Vacíos o límites**

- no tiene namespace de comandos exclusivo porque utiliza el ciclo común;
- parte del contenido de arquitectura y liderazgo puede dominar la percepción
  global si se presenta sin foco;
- debe demostrarse que el perfil reduce ruido sin ocultar colaboración con QA,
  Security, Data o Platform.

### 3.2 Platform/DevOps

**Cobertura observada**

- Cloud Architect y DevOps Engineer;
- diseño multi-cloud, IaC, CI/CD, DevSecOps, observabilidad, FinOps y testing de
  infraestructura.

**Vacíos o límites**

- no hay persona explícita Platform Engineer/SRE, aunque varias actividades
  estén distribuidas en DevOps;
- no existe journey o namespace de comandos propio;
- el límite Cloud general vs plataforma analítica Data necesita permanecer
  explícito.

### 3.3 QA/ATF

**Cobertura observada**

- pipeline API completo;
- pipeline Web por fases condicionales;
- diseño, automatización, ejecución, performance, seguridad, evidencia,
  reporting y quality gate;
- 23 comandos dedicados, la entrada por rol más desarrollada del template.

**Vacíos o límites**

- no se observó un journey equivalente para mobile, desktop, pruebas manuales o
  UAT;
- existen fronteras compartidas con Software, Security, UX y Platform;
- la abundancia de contenido QA contribuye a la visibilidad global y debe
  filtrarse para otros perfiles, no eliminarse.

### 3.4 Data

**Cobertura observada**

- Data Architect, Data Governance y Data Engineer Databricks;
- discovery, arquitectura analítica, gobierno, contratos y workflow
  `discover → design → build → validate → publish`;
- cinco comandos dedicados.

**Vacíos o límites**

- no existen personas explícitas Data Analyst o Data Scientist;
- no se observó cobertura propia de ML/experimentación;
- AWS Data Engineer está descrito como plan, no como capacidad implementada;
- el agente Databricks referencia 14 skills externas no empaquetadas;
- la activación Data contradice sus fuentes: ADR/CLI indican disponibilidad
  permanente, mientras catálogo y lock la condicionan a `data_platform`.

El piloto Data debe declarar `bundled`, `external`, `planned` y `missing` para
no prometer capacidades ausentes. Inicialmente debería acotarse a discovery,
gobierno y arquitectura salvo que las dependencias externas estén instaladas.

### 3.5 Management/Functional

**Cobertura observada**

- agente Producto con subroles PO, PM, BA y funcional;
- capa BA separada: evaluador, descomponedor, constructor y bitácora;
- discovery, priorización, backlog, criterios de aceptación, Gherkin,
  coherencia, gaps y trazabilidad.

**Vacíos o límites**

- los cuatro agentes BA no aparecen en el catálogo principal de `CLAUDE.md`;
- no existe namespace de comandos propio;
- conviven dos rutas: Producto dentro del ciclo ASDD y BA standalone/EDT;
- no hay handoff automatizado de BA standalone al flujo de equipo;
- la documentación existente reconoce cinco componentes BA aún faltantes;
- no hay persona explícita para Project, Program o Delivery Management.

Antes del piloto debe decidirse la precedencia Producto/BA y no presentar
Management como cobertura completa de todo management organizacional.

### 3.6 Experience/Design

**Cobertura observada**

- agentes UX y UI separados;
- research, síntesis, flujos, storytelling, hi-fi, tokens, accesibilidad,
  responsive, motion y diseño en código;
- 15 skills propias y colaboración con frontend/QA.

**Vacíos o límites**

- no tiene comandos o tarjeta de entrada específica;
- faltan personas explícitas de Service Design, Product Design y DesignOps;
- el catálogo anuncia dos skills UX inexistentes: `success-metrics` y
  `monitoring-strategist`;
- debe mantenerse el límite entre UI design-in-code y frontend productivo.

La evidencia favorece **Experience/Design como sexto perfil inicial**, sujeto a
validación organizacional.

### 3.7 Security

**Cobertura observada**

- un agente AppSec;
- code scan, secrets, dependencies y compliance;
- capacidades relacionadas distribuidas en Cloud Security, DevSecOps, gobierno
  Data y QA API security.

**Vacíos o límites**

- no hay comando dedicado;
- no existe cobertura explícita suficiente de threat modeling, arquitectura de
  seguridad, IAM organizacional o pentesting como para prometer un perfil
  profesional completo.

Recomendación provisional: mantener Security como transversal obligatorio y
evaluar posteriormente un foco seleccionable o perfil ampliado.

## 4. Carga y costo contextual

### 4.1 Modelo observado en los agentes

| Patrón | Agentes |
|---|---:|
| catálogo de capabilities bajo demanda | 8 |
| coordinador delgado con fases condicionales | 2 |
| skills declaradas en frontmatter | 12 |
| body-only | 2 |
| agentes con más de una skill eager | 9 |

Los ocho catálogos bajo demanda enlazan 76 entradas y 65 skill IDs únicos. La
deuda de más de una skill eager se concentra en Reporting QA, BA Constructor,
BA Evaluador, Cloud Architect, Data Architect, Data Engineer Databricks, Data
Governance, Researcher y Security.

### 4.2 Rules y lifecycle

- 9 rules usan core compacto con referencia condicional;
- 8 rules permanecen always-on completas;
- 6 hooks lifecycle están registrados;
- 12 hooks adicionales son internos o no registrados.

### 4.3 Evidencia de volumen

- El corpus de agentes, skills y auxiliares suma aproximadamente 230.510
  palabras estáticas.
- QA/ATF + Software representan aproximadamente 55,8 % de ese corpus.
- La estimación estática del contexto always-on del HEAD auditado es
  aproximadamente 6.315 palabras; no es una medición runtime.
- El baseline runtime previo, tomado en un commit anterior, registró 5.863
  palabras always-on, 8.905 para el mayor agente+skills y 19.159 como mayor
  contexto efectivo medido.

No se ejecutó Claude durante `SPIKE-1R`; por tanto, latencia, tokens, ventana y
prompts de permisos quedan pendientes de los benchmarks consumidores previstos.

## 5. Calidad del catálogo y relaciones

### 5.1 Drift de fuente de verdad

- Los cuatro agentes BA existen, pero no aparecen en las tablas principales de
  agentes/skills de `CLAUDE.md`.
- README, `.claude/docs/plugins-by-role.md` y `.claude/docs/mcps-by-domain.md` todavía
  referencian `asdd-ux-ui`, `asdd-qa-engineer` y
  `asdd-platform-engineer`, que no existen con esos IDs.
- `CLAUDE.md` lista dos skills UX sin directorio correspondiente.
- La semántica de activación Data es contradictoria entre ADR, CLI, catálogo y
  lock.

### 5.2 Integridad de metadatos

- ocho skills de Solution Architect presentan diferencias entre ID de carpeta y
  frontmatter;
- dos skills no tienen evidencia inbound explícita y requieren revisión, aunque
  el barrido textual simple no marcó orphan definitivo;
- existen valores `used_by` virtuales o legacy;
- 29 skills no declaran `allowed-tools`;
- el único grupo de contenido exactamente duplicado encontrado corresponde a
  tres `.gitkeep` vacíos; no es duplicación funcional.

### 5.3 `unclassified`

De las 493 superficies primarias, 227 permanecen explícitamente
`unclassified`. Se concentran en infraestructura interna, herramientas,
validadores, fixtures, templates y artefactos cuya pertenencia profesional no
puede inferirse con seguridad. `SPIKE-2` debe decidir si son core,
maintainer-only, transversales o propiedad de un perfil.

## 6. Asimetría de experiencia

Solo QA y Data cuentan con journeys y namespaces especializados. Software tiene
el ciclo ASDD general; Management, Experience, Platform y Security poseen
contenido relevante, pero carecen de una entrada reconocible para su trabajador.

Esto explica por qué una persona no-desarrolladora puede no percibir el valor
del contenido existente: el problema es de descubrimiento, priorización y
lenguaje de entrada, además de vacíos reales de cobertura.

## 7. Recomendaciones provisionales

Estas recomendaciones son señales para `SPIKE-2`/Design, no decisiones finales:

1. conservar seis perfiles iniciales: Software Delivery, Platform/DevOps,
   QA/ATF, Data, Management/Functional y Experience/Design;
2. conservar Security como transversal obligatorio y estudiar un foco propio
   posterior;
3. pilotar Management + Data porque evidencian mejor el cambio desde una
   experiencia percibida como exclusivamente de desarrollo;
4. reconciliar catálogo y filesystem antes de construir el router;
5. modelar madurez con `bundled`, `external`, `planned` y `missing`;
6. definir precedencia Producto/BA y semántica única de activación Data;
7. mover deuda eager a on-demand solo mediante slices y pruebas específicos;
8. tomar perfil como preferencia, nunca como autorización;
9. permitir crossover temporal, explicado y sin cambiar el foco persistido;
10. derivar o validar la documentación visible contra un catálogo canónico.

## 8. Decisiones que siguen abiertas

- Experience/Design vs Security como sexto perfil organizacional definitivo;
- Security transversal únicamente o también seleccionable;
- alcance organizacional exacto de Management y autoridad de sign-off;
- alcance inicial del piloto Data con dependencias externas;
- clasificación de las 227 superficies pendientes;
- mecanismo de persistencia local y comandos públicos de foco;
- ponderación del perfil dentro del router;
- targets de relevancia, contexto y cross-domain;
- semántica realizable de “descargar” una capacidad temporal.

## 9. Conclusión

La evidencia soporta continuar con la iniciativa, pero no autoriza todavía
cambios funcionales. El siguiente análisis debe cerrar taxonomía, fuentes de
verdad y decisiones organizacionales antes de diseñar persistencia, routing o
runtime de perfiles.
