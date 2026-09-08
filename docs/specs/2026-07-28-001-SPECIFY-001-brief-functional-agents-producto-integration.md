# Brief: Integración de agentes funcionales y evolución de `sofka-asdd-producto`

**Proyecto:** project-structure / Sofka ASDD
**Fecha:** 2026-07-28
**Owner:** Maintainers de Sofka ASDD
**Equipo receptor:** Equipo responsable de retomar Analyze, Design, Build y Verify
**Run:** `2026-07-28-001`
**Estado:** LISTO PARA INICIAR ANALYZE; no autoriza implementación
**Prioridad:** Urgente
**Baseline técnico:** template `3.1.0`, rama base `dev@3a1d760`
**Antecedente congelado:** commit `bf80191`

## Resumen ejecutivo

El template `3.1.0` ya contiene una capa BA/Funcional especializada compuesta
por cinco agentes y dieciocho skills, pero esa capa fue integrada como un flujo
opcional y paralelo a `sofka-asdd-producto`. Producto continúa siendo declarado
como dueño exclusivo del discovery, los requisitos y las specs funcionales, y
mantiene siete capabilities que se solapan con las nuevas capacidades BA.

El resultado actual tiene dos autoridades capaces de representar el mismo
concern funcional, dos formas de entrar al trabajo, dos layouts documentales y
un handoff no resuelto. La urgencia de esta iniciativa es completar la
integración funcional para que la especialización por rol no produzca fuentes
competidoras ni deje al equipo decidir manualmente cuál flujo es el correcto.

La arquitectura objetivo ya fue estudiada dentro de una iniciativa mayor y
quedó congelada en los documentos ANALYZE-012 a ANALYZE-016. Este brief extrae
exclusivamente el ajuste de agentes funcionales, Producto y especificaciones
para que otro equipo vuelva a ejecutar Analyze y Design contra el estado actual
del template, confirme el blast radius, cierre las decisiones abiertas y
prepare una implementación verificable.

El resultado final esperado es:

1. una sola autoridad funcional basada en los agentes BA especializados;
2. Product Strategy como capacidad independiente, estrecha y sin autoridad
   sobre specs funcionales;
3. las siete capabilities de Producto redistribuidas por responsabilidad;
4. un único paquete canónico de especificaciones por iniciativa y nodo EDT;
5. writers, readers, guards, comandos, routing, manifests, CLI y evaluaciones
   alineados con ese contrato;
6. compatibilidad y migración explícitas para proyectos y runs existentes;
7. retiro de `sofka-asdd-producto` únicamente cuando no deje consumidores ni
   capabilities huérfanas.

## 1. ¿Qué construimos?

Construiremos la integración definitiva entre la capa BA/Funcional incorporada
en `3.1.0` y el workflow ASDD del equipo. La capa BA dejará de ser una ruta
standalone competidora y se convertirá en la fuente funcional especializada
del mismo ciclo ASDD que consumen arquitectura, desarrollo, QA, seguridad,
datos, UX/UI y operación.

También evolucionaremos `sofka-asdd-producto`. Su responsabilidad estratégica
válida se conservará en un agente o capability de Product Strategy, limitada a
visión, outcomes, valor, priorización, roadmap, OKRs y métricas. Las
responsabilidades de análisis, requisitos, historias, aceptación, templates y
planeación técnica se moverán a los owners especializados correspondientes.

Finalmente, se definirá y habilitará una sola arquitectura documental para
especificaciones vivas. El objetivo no es crear un super-documento ni hacer que
todos los roles escriban el mismo archivo, sino compartir un paquete por nodo
EDT donde cada concern tenga una fuente y un owner inequívocos.

### 1.1 Cambio de autoridad

| Concern | Estado actual problemático | Estado objetivo |
|---|---|---|
| Visión, valor y prioridad | Mezclado dentro de Producto | Product Strategy independiente |
| Contexto, brief y EDT | Producto y BA pueden intervenir por flujos distintos | BA Functional Architect como owner funcional; Strategy aporta inputs |
| Spec y requisitos funcionales | Producto Funcional/BA y BA Specification Lead | BA Specification Lead como único writer |
| Auditoría funcional | Capa BA separada del ciclo | BA Specification Auditor dentro del mismo lifecycle |
| Conocimiento de dominio | Soportes parcialmente paralelos | BA Functional SME como contributor, nunca writer de la spec |
| Alcance y cambios | Responsabilidad distribuida o implícita | BA Scope Manager clasifica; owner funcional aplica cambios aprobados |
| Historias y aceptación | Producto PO/new-HU y BA User Story | BA conserva definición; QA verifica; stakeholder acepta negocio |
| Diseño técnico | Puede mezclarse en story planning de Producto | Cada dominio técnico escribe su slice; Tech Lead planifica implementación |
| Templates | Pertenecen al namespace Producto | Templates neutrales del contrato de specs |
| Routing | Intención → Producto o BA standalone | Intención → concern → owner especializado |

### 1.2 Cambio documental

La dirección que debe validar Analyze y formalizar Design es:

```text
docs/specs/{initiative-slug}/
├── index.md o manifest de iniciativa
├── brief.md
├── edt.md
├── strategy/                         # solo si aplica
├── decisions.md
├── sources/                          # fuentes de entrada, con frontera DATA
└── nodes/
    └── {edt-code}-{node-slug}/
        ├── index.md
        ├── decisions.md
        ├── functional/
        │   ├── spec.md
        │   ├── requirements.md
        │   ├── audit.md
        │   └── client-validation.md
        ├── technical/
        │   ├── backend.md             # si aplica
        │   ├── frontend.md            # si aplica
        │   ├── qa.md                  # si aplica
        │   ├── security.md            # si aplica
        │   └── {domain}.md
        └── implementation/
            ├── plan.md
            └── evidence/
```

La estructura exacta a nivel de iniciativa sigue siendo una decisión de Design.
No debe copiarse mecánicamente el ejemplo si el análisis de consumidores,
guards o lifecycle demuestra que requiere ajustes. Sí son invariantes:

- un solo paquete canónico por nodo EDT;
- un solo writer por concern;
- la spec funcional no contiene diseño de implementación;
- una spec técnica referencia RN/HU/AC por ID y no redefine su significado;
- developers implementan specs y no crean una segunda spec funcional;
- cambios funcionales posteriores pasan por CR y reabren los gates afectados;
- `ART-001` conserva evidencia inmutable de ejecución;
- el contrato de specs vivas debe diferenciarse de la evidencia de cada run.

## 2. ¿Por qué se realiza?

### 2.1 Doble autoridad funcional

Las descripciones y reglas actuales declaran simultáneamente que:

- la capa BA es opcional, standalone y coexiste con Producto;
- Producto es dueño exclusivo del discovery y de toda documentación de
  requisitos;
- BA Specification Lead puede construir el contenido funcional de la misma
  spec;
- ambos caminos usan convenciones documentales diferentes.

Esto permite que una misma necesidad produzca artefactos funcionales
equivalentes con owners y lifecycles distintos.

### 2.2 Handoff inexistente

El template no tiene un contrato ejecutable que convierta o adopte una spec BA
standalone dentro del ciclo del equipo. Mantener dos layouts y automatizar un
handoff solo haría más rápida la creación de una segunda fuente. La solución
debe ser que ambos modos de entrada trabajen sobre el mismo paquete.

### 2.3 Responsabilidades mezcladas en Producto

`sofka-asdd-producto` agrupa estrategia, análisis de negocio, autoría
funcional, historias, aceptación, templates y planeación táctica. Esas
responsabilidades tienen autoridades diferentes. Mantenerlas bajo un agente
paraguas dificulta:

- determinar quién puede escribir cada concern;
- aplicar least privilege;
- cargar solo el contexto necesario;
- evaluar cada rol de forma independiente;
- explicar routing y escalamiento;
- retirar capacidades duplicadas sin pérdida funcional.

### 2.4 Contrato documental inconsistente

El estado actual combina:

- specs planas ART-001 para el ciclo del equipo;
- carpetas por nodo para BA standalone;
- INDEX distintos;
- referencias antiguas a layout plano;
- guards y parsers que no recorren o no reconocen la estructura objetivo.

Sin resolver el contrato documental, integrar agentes solo trasladaría el
solapamiento a los archivos.

### 2.5 Riesgo operativo y de upgrade

Producto y sus capabilities están distribuidos en agentes, skills, comandos,
reglas, hooks, evaluaciones, schema, CLI y documentación. Eliminar primero los
archivos visibles puede dejar aliases, model pinning, manifests o instalaciones
consumidoras apuntando a IDs inexistentes.

## 3. ¿Para quién?

- **Analistas funcionales y BA:** necesitan una ruta reconocible, completa y
  conectada al ciclo del equipo.
- **Product Managers y responsables de estrategia:** necesitan conservar visión
  y priorización sin asumir autoridad funcional o técnica.
- **Product Owners humanos:** necesitan operar por intención mediante Strategy,
  BA y QA, aunque una misma persona desempeñe varias responsabilidades.
- **Arquitectos y Tech Leads:** necesitan consumir una fuente funcional estable
  y registrar decisiones técnicas sin reformular negocio.
- **Developers frontend/backend/data/platform:** necesitan saber qué implementar,
  dónde documentar diseño y cómo proponer un cambio funcional.
- **QA/ATF:** necesita requisitos y aceptación canónicos, trazables y
  verificables.
- **Security, UX/UI y Smart Data:** necesitan conservar sus fuentes
  especializadas y enlazarlas sin duplicarlas dentro del paquete.
- **Maintainers del template:** necesitan catálogo, routing, permisos,
  distribución y release coherentes.
- **Proyectos consumidores:** necesitan instalación limpia, upgrade
  diagnosticable, aliases temporales y migración sin pérdida.
- **Equipo receptor de esta iniciativa:** necesita un punto de partida autónomo
  para rehacer Analyze/Design sin depender del contexto conversacional previo.

## 4. Objetivos y criterios de éxito

| Objetivo | Criterio de éxito |
|---|---|
| Eliminar doble autoridad funcional | Cada concern funcional tiene un único writer verificable |
| Integrar BA al workflow | Entrada standalone y entrada orquestada terminan en el mismo package root |
| Conservar estrategia | Product Strategy cubre visión/valor/prioridad sin escribir specs |
| Redistribuir Producto | Las siete capabilities tienen owner, output, routing y pruebas |
| Unificar specs | No se crea copia ni conversión entre layouts para trabajo nuevo |
| Preservar especialización | Cada dominio técnico escribe solo su concern |
| Mantener trazabilidad | RN/HU/AC, EDT, decisiones, gates, commits y evidencia están enlazados |
| Proteger compatibilidad | Proyectos 3.x se pueden escanear y diagnosticar antes de migrar |
| Evitar pérdida | Migración nunca sobrescribe o borra contenido divergente automáticamente |
| Cerrar distribución | Instalación limpia y upgrade contienen todos los archivos/manifests requeridos |
| Reducir ambigüedad de routing | Ningún prompt nuevo termina en Producto genérico por fallback silencioso |
| Mantener seguridad | Cero regresiones en scopes, capability binding, DATA boundaries y Git safety |
| Mantener calidad | Validator, suites unitarias, integración y E2E consumidor pasan |
| Habilitar retiro | Cero referencias activas no cubiertas antes de eliminar Producto |

Los valores exactos de cobertura y duración de compatibilidad deben fijarse en
Analyze a partir de un baseline reproducible; no se inventan en este brief.

## 5. Alcance

### 5.1 Dentro

- confirmar el inventario de agentes y skills BA/Producto de `3.1.0`;
- definir autoridad, colaboración y write boundaries de los agentes
  funcionales;
- definir y crear Product Strategy;
- redistribuir las siete capabilities de Producto;
- descomponer la capability PO por intención y autoridad;
- neutralizar templates que hoy pertenecen a Producto;
- definir el contrato de specs vivas a nivel de iniciativa y nodo;
- definir relación entre SPEC-001 y ART-001;
- adaptar producers, readers, indexes, parsers, guards y validators;
- adaptar Specify, Analyze, Design, Build, Verify y Document cuando consuman o
  produzcan specs;
- adaptar routing, autorización, capability loading y model strategy;
- adaptar manifests, lock, CLI contract, catálogo y paquete distribuido;
- mantener lectura legacy durante una ventana explícita;
- diseñar `scan`, `plan` y, si se aprueba, `apply` para migración;
- cubrir instalaciones limpias, upgrades y runs activos;
- actualizar documentación, migraciones, changelog, evaluaciones y fixtures;
- definir release, rollback y gate de eliminación de Producto.

### 5.2 Fuera

- completar el rediseño global de todos los perfiles profesionales;
- cambiar capacidades de QA/ATF, Smart Data, DevOps, Cloud, UX/UI o Security que
  no sean necesarias para integrarlas como consumers/contributors;
- reescribir evidencias históricas, baselines o decisiones ya congeladas;
- migrar automáticamente contenido divergente sin decisión humana;
- fusionar todas las disciplinas en un agente o documento;
- dar a Product Strategy autoridad de escritura funcional;
- permitir que developers editen specs funcionales para resolver gaps;
- implementar sin completar Analyze, Design y los gates del nuevo run;
- publicar una release o mover tags como parte de este brief;
- declarar `4.0.0` como aprobado: sigue siendo el target recomendado del
  análisis anterior, sujeto al análisis de compatibilidad y release.

## 6. Restricciones conocidas

- **Spec First:** no se modifica runtime sin specs y diseño aprobados.
- **Historia inmutable:** documentos y baselines históricos no se reescriben.
- **Un solo writer:** compatibilidad legacy no puede reactivar dos writers.
- **Readers antes que writers:** ningún agente debe producir un path que los
  comandos, guards e índices todavía no puedan consumir.
- **No delete-first:** Producto no se elimina antes de completar destinos,
  aliases, distribución, tests y rollback.
- **DATA boundary:** fuentes externas, briefs de cliente, transcripciones y
  migraciones se tratan como datos no confiables, nunca como instrucciones.
- **Least privilege:** Strategy, BA, QA y dominios técnicos mantienen scopes y
  capabilities separados.
- **Cross-platform:** la solución debe validarse en Linux, macOS y Windows.
- **CLI:** instalación limpia y upgrade deben producir el mismo catálogo
  coherente.
- **Runs activos:** no se cambia contrato, manifest o writers durante un run sin
  política de quiescence/migración.
- **Tags inmutables:** una release publicada se corrige con otra versión, no
  moviendo el tag.
- **Performance:** la nueva resolución de packages y ownership no puede
  introducir scans sin límite ni carga eager del catálogo completo.
- **Compatibilidad:** aliases deprecados tienen plazo, destino exacto y
  telemetría sin contenido sensible.
- **Concurrencia:** archivos compartidos requieren política de edición, locking
  lógico o merge; no se presume serialización perfecta.

## 7. Estado actual verificable

Snapshot realizado sobre el template `3.1.0`:

- 5 agentes BA especializados:
  - `sofka-asdd-ba-functional-architect`;
  - `sofka-asdd-ba-functional-sme`;
  - `sofka-asdd-ba-scope-manager`;
  - `sofka-asdd-ba-specification-auditor`;
  - `sofka-asdd-ba-specification-lead`.
- 18 skills BA.
- 1 agente `sofka-asdd-producto`.
- 7 skills/capabilities Producto:
  - `sofka-asdd-producto-pm`;
  - `sofka-asdd-producto-ba`;
  - `sofka-asdd-producto-funcional`;
  - `sofka-asdd-producto-po`;
  - `sofka-asdd-producto-new-hu`;
  - `sofka-asdd-producto-story-planner`;
  - `sofka-asdd-producto-templates`.
- 88 archivos tracked contienen la referencia exacta
  `sofka-asdd-producto`; 84 permanecen al excluir baselines congelados.
- Los agentes BA aún se describen como opcionales, standalone y coexistentes
  con Producto.
- Producto aún se describe como dueño exclusivo del discovery y la
  documentación funcional.
- `capability-loading.json` registra Producto y sus siete capabilities.
- El schema de run contiene ejemplos y referencias de Producto.
- El layout BA usa carpetas por nodo; el ciclo orquestado usa ART-001 plano.

Estas cantidades son baseline inicial y deben regenerarse en Analyze. No son un
criterio para hacer reemplazos globales automáticos: cada referencia debe
clasificarse como productor, consumidor, enforcement, test, documentación,
evidencia histórica o compatibilidad.

## 8. Resultado final requerido

### 8.1 Ownership funcional

- BA Functional Architect mantiene contexto de iniciativa, brief funcional y
  EDT.
- BA Specification Lead es el único writer del comportamiento, requisitos,
  reglas, historias y criterios funcionales.
- BA Specification Auditor evalúa y emite veredicto; no corrige directamente.
- BA Functional SME aporta conocimiento clasificado; no muta la spec.
- BA Scope Manager clasifica cambios y hallazgos; no decide negocio ni muta la
  spec.
- Stakeholder valida negocio.
- QA verifica aceptación ejecutable y calidad; no redefine intención.
- Strategy prioriza; no escribe ni aprueba specs.
- Agentes técnicos escriben solo su slice técnico.
- Tech Lead escribe el plan de implementación.

### 8.2 Product Strategy

Puede:

- producir visión, outcomes y métricas;
- ordenar oportunidades y backlog por valor;
- mantener roadmap y OKRs;
- aportar restricciones estratégicas enlazables.

No puede:

- escribir o aprobar specs/requisitos/historias funcionales;
- auditar Functional DOR;
- escribir diseño técnico o plan de implementación;
- seleccionar agentes, ampliar permisos o resolver gaps en nombre del cliente.

### 8.3 Redistribución mínima

| Capability actual | Destino objetivo |
|---|---|
| `producto-pm` | Product Strategy |
| `producto-ba` | BA Functional Architect / BA Specification Lead según intención |
| `producto-funcional` | BA Specification Lead |
| `producto-po` | Strategy + BA + QA según autoridad |
| `producto-new-hu` | BA User Story |
| `producto-story-planner` | Tech Lead con input de Architecture |
| `producto-templates` | capability neutral de templates |

### 8.4 Compatibilidad

Durante la ventana acordada, `sofka-asdd-producto` puede existir solo como alias
deprecado:

- emite warning y destino exacto;
- resuelve a un único owner;
- no escribe artefactos legacy;
- se detiene ante intención ambigua;
- no actúa como fallback genérico;
- registra uso sin contenido sensible;
- tiene una condición y una versión de retiro.

## 9. Blast radius

El siguiente inventario es deliberadamente amplio. Analyze debe confirmar cada
superficie mediante búsqueda reproducible y clasificarla como `change`,
`compatibility`, `historical-only`, `test-only` o `no-impact`.

### 9.1 Agentes

Impacto directo:

- `.claude/agents/sofka-asdd-producto.md`;
- los cinco `.claude/agents/sofka-asdd-ba-*.md`;
- Tech Lead y Solution Architect por ownership de planeación/diseño;
- QA por descomposición de aceptación;
- Domain Expert y Functional SME por fronteras de conocimiento;
- UX/UI, Security, Smart Data, Cloud y DevOps como contributors técnicos.

Riesgos:

- descripciones contradictorias;
- herramientas Write/Edit demasiado amplias;
- owners duplicados;
- skills eager que ya no corresponden;
- aliases de IDs removidos;
- model pinning sobre agentes antiguos.

### 9.2 Skills y templates

Impacto directo:

- siete skills `sofka-asdd-producto-*`;
- dieciocho skills BA;
- brief, requirements, user story, client validation, spec index y change log;
- template funcional y reglas de slices;
- skills de Tech Lead que consumen specs, planes e INDEX;
- skills developer, QA, Architecture, UX/UI y Security que enlazan requisitos.

Validar:

- inputs y outputs;
- allowed tools;
- capability owner;
- paths de escritura;
- referencias internas;
- carga eager/condicional;
- compatibilidad de aliases;
- neutralidad de templates.

### 9.3 Routing y orquestación

Superficies:

- routing BA;
- routing heuristics;
- orchestration y orchestration ops;
- user-prompt-submit;
- selección por fase;
- autorización directa LIGHT;
- coordinator loading;
- rule loading;
- capability loading;
- orden y dependencias entre agentes.

Riesgos:

- fallback silencioso a Producto;
- intención PO enviada a un único agente aunque cruce tres authorities;
- autorización concedida a alias pero ejecutada por destino distinto;
- scope/capability mismatch;
- planes congelados cuyo agente desaparece;
- fan-out o contexto innecesario.

### 9.4 Workflow y comandos

Revisar al menos:

- `/sofka-asdd:specify`;
- `/sofka-asdd:analyze`;
- `/sofka-asdd:design`;
- `/sofka-asdd:build`;
- `/sofka-asdd:verify`;
- `/sofka-asdd:document`;
- comandos de ejecución ligera que resuelvan specs o agentes;
- workflow general y workflow Build;
- checkpoints y handoffs.

Cambios esperados:

- Strategy aporta visión en Specify;
- BA produce la fuente funcional en Analyze;
- dominios técnicos complementan el mismo paquete;
- Build consume functional + technical + plan;
- Verify usa aceptación canónica;
- Document enlaza evidencia sin copiar specs.

### 9.5 Paths, naming y lifecycle documental

Superficies:

- ART-001;
- SPEC-001;
- layout BA por nodo;
- layout plano spec-per-area;
- brief e iniciativa;
- INDEX legacy y `index.md`;
- `decisions.md`;
- snapshots de gates;
- manifests y enlaces;
- change control.

Riesgos:

- dos paquetes con el mismo EDT;
- colisión de IDs funcionales;
- links rotos;
- mezcla de estado vivo con hash de plan;
- movimiento de evidencia histórica;
- duplicación de artefactos especializados;
- ausencia de hogar para brief, EDT, estrategia, fuentes, lecciones, requisitos
  compartidos y decisiones cross-node.

### 9.6 Guards y enforcement

Revisar:

- artifact-name guard;
- Analyze guard;
- Design guard;
- spec check;
- spec guard;
- plan gate;
- operation authorization;
- data boundary;
- Git safety.

Hallazgos ya conocidos que deben revalidarse:

- artifact-name guard rechaza filenames semánticos;
- Analyze guard espera briefs planos;
- Design guard inspecciona specs planas y no recorre el package objetivo;
- spec check tiene profundidad limitada;
- spec guard y ownership actual no cubren el nuevo nesting;
- el plan gate puede asumir que todo documento es una reserva ART-001;
- no existe enforcement completo para writer por concern.

### 9.7 Estado de run, manifests e INDEX

Superficies:

- `.asdd-run.json`;
- `.sofka-asdd/asdd-run.schema.json`;
- run bootstrap;
- artifact-name helper;
- artifact runtime;
- run reconciliation;
- run manifest hook;
- `build.index_ref`;
- parser de INDEX;
- checkpoints y hashes del plan.

Riesgos:

- `index_ref` solo acepta `docs/specs/*-index.md`;
- formatos/estados incompatibles entre INDEX legacy y SPEC-001;
- run activo que cambia de contrato durante la ejecución;
- reconciliación que no encuentra nodos anidados;
- manifest que duplica estado vivo;
- snapshots que no identifican commit del paquete.

### 9.8 Configuración y distribución

Revisar:

- `.sofka-asdd/capability-loading.json`;
- `.sofka-asdd/coordinator-loading.json`;
- `.sofka-asdd/rule-loading.json`;
- `.sofka-asdd/sofka-asdd.lock`;
- `.sofka-asdd/cli-contract.json`;
- package version;
- scripts de distribución e instalación;
- archivos embebidos del CLI;
- validadores de integridad.

Riesgos:

- archivo nuevo no distribuido;
- archivo removido que permanece en upgrade;
- capability huérfana;
- counts/manifests desalineados;
- instalación limpia distinta de upgrade;
- cache de plugins/skills o templates obsoletos.

### 9.9 Evaluaciones y pruebas

Impacto:

- evals del orquestador;
- evals de Producto;
- evals de skills Producto;
- evals de Specify/Analyze/Verify;
- golden prompts y system prompts;
- tests de lazy capability loading;
- direct LIGHT authorization;
- artifact runtime y guards;
- run bootstrap/reconciliation/manifest;
- CLI runtime distribution;
- consumer E2E;
- seguridad fail-closed;
- Linux/macOS/Windows.

Casos mínimos:

1. Strategy produce outcome y BA lo convierte en requisitos.
2. Entrada standalone y orquestada resuelven al mismo nodo.
3. Developer detecta requisito faltante y abre CR.
4. QA verifica AC sin reescribirlos.
5. Alias Producto resuelve con warning.
6. Intención `producto-po` ambigua se detiene.
7. SPEC-001 válida pasa todos los guards.
8. Paquete duplicado por EDT se bloquea.
9. Spec legacy única produce plan de migración.
10. Specs legacy divergentes requieren decisión humana.
11. Instalación limpia y upgrade producen catálogo coherente.
12. Runs activos no cambian silenciosamente.
13. Rollback restaura el estado previo.

### 9.10 Documentación pública y adopción

Revisar:

- `CLAUDE.md`;
- `README.md`;
- changelog;
- guías de uso BA/Management;
- ADR-003, ADR-004, ADR-006, ADR-008, ADR-010;
- migraciones existentes;
- catálogo de MCPs y plugins cuando mencionen Producto;
- documentación de comandos, routing y specs;
- ejemplos y tutoriales;
- guías de upgrade y rollback.

No se debe editar una ADR histórica para aparentar que siempre declaró la nueva
arquitectura. Se crean deltas que indiquen qué se conserva, reemplaza o
depreca.

### 9.11 Consumidores y upgrades

Clasificar proyectos:

| Clase | Condición | Tratamiento |
|---|---|---|
| A | un solo conjunto legacy, mapping inequívoco | migración asistida |
| B | layouts duales equivalentes | comparar, elegir autoridad y registrar decisión |
| C | contenido divergente | STOP y resolución humana por CR |
| D | solo evidencia histórica | conservar y enlazar |

La herramienta debe ofrecer `scan` y `plan` read-only antes de cualquier
`apply`. No borra ni sobrescribe automáticamente.

### 9.12 Seguridad y límites de autoridad

Validar:

- Strategy no amplía permisos;
- aliases no heredan scopes superiores;
- contributors técnicos no escriben funcional;
- BA no escribe diseño técnico;
- QA no acepta negocio en nombre del stakeholder;
- contenido de fuentes y migraciones permanece DATA;
- logs de deprecación no contienen contenido sensible;
- guards fallan cerrados ante owners o paths ambiguos;
- comandos Git y release conservan sus gates.

### 9.13 Rendimiento y contexto

Medir:

- contexto inicial antes/después;
- skills eager por agente;
- costo de resolver package/owner;
- scans recursivos y profundidad;
- número de agentes activados por prompt;
- duplicación de templates/referencias;
- cold start de instalación y SessionStart.

La integración no debe solucionar ownership a costa de cargar simultáneamente
Strategy, todos los agentes BA y todos los dominios técnicos.

### 9.14 Concurrencia y colaboración

Definir:

- quién actualiza `index.md`;
- quién registra decisiones compartidas;
- cómo se serializan cambios sobre archivos comunes;
- cómo se detecta stale write;
- cómo se reabren gates;
- cómo se resuelve una decisión cross-domain;
- qué ocurre si dos agentes proponen el mismo ID;
- qué archivos son append-only, owner-only o generados.

### 9.15 Release y rollback

Analizar:

- nivel SemVer real;
- ventana deprecada;
- release objetivo;
- orden de merges;
- instalación limpia;
- upgrade;
- rollback por ola;
- tag inmutable;
- compatibilidad con ramas activas y proyectos consumidores.

El análisis anterior recomienda `4.0.0` porque cambia IDs públicos, paths,
routing y contratos. El equipo debe validar si existe un bridge compatible
previo; no puede etiquetar un cambio breaking como patch sin declarar la
excepción.

## 10. Riesgos principales y mitigaciones esperadas

| Riesgo | Mitigación mínima |
|---|---|
| Eliminar Producto antes de tener destinos | readers/writers nuevos, aliases y pruebas antes del retiro |
| Dos writers durante compatibilidad | single-write desde la primera ola |
| Migración destructiva | scan/plan, backup, dry-run, STOP ante divergencia |
| Guards incompatibles | fixtures y tests antes de habilitar writers |
| Runs activos corruptos | quiescence, versionado de contrato y migración explícita |
| Archivos compartidos con conflictos | ownership y política de concurrencia |
| Strategy recrea Producto | lista explícita de acciones prohibidas |
| PO queda ambiguo | routing por intención y authority |
| Artefactos especializados duplicados | referencias, no copias |
| Upgrade deja archivos obsoletos | inventario de distribución y prueba clean-vs-upgrade |
| Alias perpetuo | deadline y gate de eliminación |
| Regresión de contexto | benchmark y budgets |
| Ruptura cross-platform | matriz Linux/macOS/Windows |
| Evidencia histórica reescrita | deltas y migración no destructiva |

## 11. Estrategia de trabajo recomendada

### Ola 0 — Analyze y baseline

- regenerar inventario de productores, consumidores y enforcement;
- clasificar las 88 referencias;
- cerrar contrato de iniciativa;
- definir nombres públicos;
- fijar compatibilidad, versionado y métricas;
- congelar fixtures legacy y actuales.

### Ola 1 — Readers

- schema y resolver SPEC-001;
- guards, parsers, INDEX y comandos compatibles;
- lectura 3.x;
- diagnóstico de ambigüedad;
- sin writers nuevos en producción.

### Ola 2 — Writers

- templates neutrales;
- writers BA;
- writers técnicos;
- Tech Lead;
- snapshots ART-001;
- change control.

### Ola 3 — Strategy y routing

- Product Strategy;
- PO por intención;
- aliases;
- Producto fuera del routing primario;
- catálogo y evals.

### Ola 4 — Consumidores

- scan/plan/apply;
- backup y rollback;
- proyectos A–D;
- instalación limpia y upgrade.

### Ola 5 — Retiro y release

- cero referencias activas no cubiertas;
- eliminación física;
- suite completa;
- documentación de adopción;
- release desde `main`;
- tag inmutable.

## 12. Entregables esperados del equipo receptor

### Analyze

1. inventario reproducible de referencias y owners;
2. mapa producer → artifact → consumer → enforcement;
3. baseline de layouts, guards, runtime, CLI y upgrades;
4. contrato de iniciativa además del contrato por nodo;
5. clasificación de compatibilidad y runs activos;
6. riesgos priorizados;
7. decisiones abiertas con opciones y trade-offs;
8. criterios de aceptación funcionales, técnicos, seguridad y QA;
9. INDEX/plan gobernado para Design y Build.

### Design

1. ADR final;
2. schema ejecutable SPEC-001;
3. contrato de ownership y change control;
4. routing y alias contract;
5. diseño de Product Strategy;
6. matriz definitiva de redistribución;
7. diseño de migrador;
8. fixtures y matriz de pruebas;
9. orden de implementación;
10. rollback y release plan.

### Build y Verify

- slices pequeños y reversibles;
- tests antes de cada corte;
- evidencia por gate;
- clean install + upgrade;
- E2E consumidor;
- cross-platform;
- security/QA sign-off;
- cero drift entre catálogo, filesystem, manifests y CLI.

## 13. Decisiones abiertas

| Decisión | Estado | Owner esperado |
|---|---|---|
| Nombre público final de Product Strategy | PENDIENTE | Maintainer + equipo receptor |
| Agent vs capability independiente | PENDIENTE | Architecture |
| Contrato exacto a nivel de iniciativa | PENDIENTE | Architecture + BA |
| Schema y versión de SPEC-001 | PENDIENTE | Architecture |
| Owner y concurrencia de `index.md` | PENDIENTE | Architecture + Tech Lead |
| Formato de `decisions.md` | PENDIENTE | Architecture |
| Duración de aliases | PENDIENTE | Maintainer |
| Bridge 3.x previo a major | PENDIENTE | Maintainer + Architecture |
| Política para runs activos | PENDIENTE | Runtime owner |
| Comando y UX del migrador | PENDIENTE | CLI/runtime owner |
| Telemetría de deprecación | PENDIENTE; sin contenido sensible | Security + runtime owner |
| Release objetivo definitiva | PENDIENTE; recomendación previa `4.0.0` | Maintainer |

## 14. Supuestos

- **Confirmado:** la capa BA especializada ya está presente en `3.1.0`.
- **Confirmado:** Producto y sus siete capabilities siguen activos.
- **Confirmado:** el análisis previo fue congelado en `bf80191`.
- **Confirmado:** otro equipo retomará Analyze y Design desde este brief.
- **Supuesto:** se conservará la dirección de un paquete canónico por nodo; el
  equipo puede refinar su gramática si preserva los invariantes.
- **Supuesto:** Product Strategy debe sobrevivir como capacidad independiente.
- **Pendiente:** disponibilidad de proyectos consumidores representativos para
  probar upgrade y migración.
- **Pendiente:** ventana y política organizacional de release.

## 15. Roles técnicos requeridos

- [x] **Architect:** integración, migración, contratos, ownership y decisiones
  breaking.
- [x] **Security:** DATA boundaries, scopes, aliases, telemetría y enforcement
  fail-closed.
- [x] **Tech Lead:** factibilidad, orden de slices, deuda técnica, concurrencia,
  compatibilidad y rollback.
- [x] **QA/ATF:** matriz de aceptación, regresión, E2E consumidor y sign-off.
- [x] **BA/Functional:** contrato funcional, lifecycle, requisitos y ownership.
- [x] **CLI/runtime owner:** distribución, upgrades, run state, parsers y
  guards.

## 16. Referencias congeladas

- `docs/tech/2026-07-25-001-ANALYZE-012-unified-spec-package-change-request.md`
- `docs/adoption/2026-07-25-001-ANALYZE-013-unified-spec-package-adr.md`
- `docs/specs/2026-07-25-001-ANALYZE-014-unified-spec-package-contract.md`
- `docs/tech/2026-07-25-001-ANALYZE-015-producto-capability-migration.md`
- `docs/tech/2026-07-25-001-ANALYZE-016-unified-spec-package-impact-migration-plan.md`
- `.claude/reference/ba/sofka-asdd-ba-specs-layout.md`
- `.claude/references/rules/sofka-asdd-ba-layer-routing.md`
- `docs/adoption/ADR-004-spec-per-area-model.md`
- `docs/adoption/ADR-006-integracion-capa-ba-analista-funcional.md`
- `docs/adoption/ADR-010-refactor-consolidador-capa-ba.md`

Las referencias 012–016 son antecedentes y evidencia de decisiones. Este brief
no convierte automáticamente su arquitectura objetivo en implementación
aprobada. El equipo receptor debe verificarla contra el template actual y
producir los artefactos de Analyze/Design del nuevo run.

## 17. Artefactos de salida

- `docs/specs/2026-07-28-001-SPECIFY-001-brief-functional-agents-producto-integration.md`
  — este brief.
- Siguiente fase: artefactos ANALYZE reservados por el run
  `2026-07-28-001`; no fabricar nombres manualmente.

## 18. Gate de salida de Specify

- [x] Explica qué se ajusta.
- [x] Explica por qué se ajusta.
- [x] Define el resultado final.
- [x] Identifica actores y owners.
- [x] Delimita dentro y fuera de alcance.
- [x] Registra restricciones y supuestos.
- [x] Incluye blast radius de agentes, skills, routing, specs, runtime, CLI,
  guards, state, tests, documentación, consumidores, seguridad y release.
- [x] Enlaza el análisis congelado.
- [x] Deja decisiones desconocidas como pendientes.
- [x] No autoriza implementación.

**Handoff:** el equipo receptor debe iniciar `/sofka-asdd:analyze` para el run
`2026-07-28-001`, regenerar el baseline sobre su HEAD efectivo y detenerse ante
cualquier divergencia material respecto a este brief.
