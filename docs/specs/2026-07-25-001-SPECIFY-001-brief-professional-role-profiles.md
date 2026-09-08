# Brief: Perfiles profesionales de enfoque ASDD

**Proyecto:** project-structure / Guide ASDD
**Fecha:** 2026-07-25
**Owner:** Maintainers de Guide ASDD + representantes de las áreas profesionales
**Run:** `2026-07-25-001`
**Estado:** APROBADO EN G0 PARA INICIAR ANALYZE READ-ONLY

## ¿Qué construimos?

Evolucionaremos el template ASDD para que cada trabajador pueda seleccionar un
perfil profesional principal y recibir una experiencia enfocada en su área, sin
crear templates separados ni perder acceso puntual a capacidades de otras
áreas.

La arquitectura objetivo es por capas:

```text
Núcleo ASDD común
        ↓
Perfil profesional activo
        ↓
Router ponderado por perfil + intención de la tarea
        ↓
Agentes/skills cargados bajo demanda
        ↓
Capacidades temporales de otras áreas cuando sean necesarias
```

El perfil orienta contexto, lenguaje, descubrimiento, routing y journeys, pero
no es una frontera de permisos. Seguridad, autorización, Git safety y demás
controles universales permanecen en el núcleo común.

## ¿Para quién?

- Personas de **Software Delivery**: desarrollo, arquitectura y liderazgo
  técnico.
- Personas de **Platform/DevOps**: infraestructura, cloud, CI/CD,
  observabilidad y operación.
- Personas de **QA/ATF**: estrategia, automatización, ejecución, evidencias,
  reporting y sign-off.
- Personas de **Data**: análisis, calidad, modelado, pipelines, ciencia y
  arquitectura de datos.
- Personas de **Management/Functional**: discovery, BA, producto, alcance,
  priorización, backlog, criterios de aceptación y trazabilidad.
- Personas de **Experience/Design** si la auditoría confirma que UX/UI/Design
  constituye un perfil profesional propio.
- Personas de **Security** si la organización decide ofrecerlo también como
  perfil, además de mantenerlo como capacidad transversal obligatoria.

## Problema

El template contiene capacidades valiosas para distintas áreas, pero hoy su
experiencia se percibe mezclada, pesada y predominantemente orientada al
desarrollo de software. Una persona de Data, QA o Management puede:

- recibir lenguaje, reglas o agentes ajenos a su trabajo cotidiano;
- desconocer qué capacidades relevantes ya existen para su área;
- consumir contexto de skills y referencias que no necesita;
- percibir el template como una herramienta para developers, aunque posea
  capacidades útiles para su rol;
- no saber cómo incorporar puntualmente otra disciplina sin abandonar su
  enfoque principal.

## Hipótesis de solución

Un núcleo mínimo más perfiles profesionales declarativos permitirá:

1. mostrar primero las capacidades que cada trabajador entiende y necesita;
2. reducir el contexto técnico irrelevante;
3. priorizar agentes y skills del perfil activo;
4. cargar capacidades de otras áreas solo cuando la intención de la tarea lo
   exija;
5. conservar una única plataforma, una única política de seguridad y un único
   catálogo de capacidades;
6. medir cobertura, duplicidad, costo de contexto y vacíos por dominio.

## Objetivos

1. Crear un catálogo único y validable de agentes, skills, comandos, workflows,
   reglas, templates y artefactos.
2. Clasificar cada capacidad por dominio principal, dominios secundarios, roles
   atendidos, actividades, estrategia de carga, transversalidad y evidencia.
3. Definir perfiles profesionales como preferencias declarativas, no como
   copias de agentes ni listas rígidas de permisos.
4. Permitir selección local, persistente y reversible del perfil, sin
   versionarla en el proyecto compartido.
5. Hacer que SessionStart cargue únicamente el núcleo compacto y una tarjeta
   resumida del perfil.
6. Incorporar el perfil como señal ponderada del router, subordinada a la
   intención explícita, complejidad y riesgo de la tarea.
7. Permitir colaboración cross-domain temporal, explicable y auditable.
8. Entregar experiencias reconocibles para cada área: lenguaje, journeys,
   artefactos y capacidades relevantes.
9. Demostrar que los perfiles reducen ruido y contexto sin degradar seguridad,
   calidad ni acceso a capacidades transversales.

## Catálogo único de capacidades

Antes de implementar perfiles se realizará una auditoría estructural read-only
de:

- agentes;
- skills;
- comandos;
- workflows;
- reglas y references;
- templates;
- artefactos producidos;
- validadores y mecanismos de carga.

Cada elemento tendrá metadatos equivalentes a:

```json
{
  "id": "asdd-data-quality",
  "kind": "skill",
  "primary_domain": "data",
  "secondary_domains": ["quality"],
  "roles": ["data-analyst", "data-engineer"],
  "activities": ["analyze", "validate"],
  "loading": "on-demand",
  "cross_domain": true,
  "context_cost": "medium",
  "evidence": ".claude/skills/.../SKILL.md"
}
```

El esquema definitivo se decidirá en Design después de medir el inventario
real. No se duplicarán agentes ni skills para construir perfiles.

## Perfiles profesionales provisionales

| Perfil provisional | Enfoque principal |
|---|---|
| `software` | análisis, diseño, arquitectura, desarrollo, validación y documentación de software |
| `platform-devops` | infraestructura, cloud, entrega, observabilidad y operación |
| `qa-atf` | estrategia, automatización, ejecución, evidencias y gobierno de calidad |
| `data` | análisis, calidad, modelado, procesamiento, ciencia y arquitectura de datos |
| `management-functional` | discovery, BA, producto, requerimientos, priorización y trazabilidad |
| `experience-design` | investigación, UX, UI, accesibilidad y diseño de experiencias |

Security permanece transversal y la auditoría determinará si además debe ser un
perfil seleccionable. Los nombres y límites son provisionales hasta cerrar el
inventario y la validación organizacional.

## Selección local por trabajador

La experiencia objetivo incluye operaciones conceptuales equivalentes a:

```text
focus data
focus qa-atf
focus management-functional
focus software
focus status
focus reset
```

Los nombres y mecanismo exactos no se consideran decididos en este brief. El
diseño debe garantizar:

- estado local y no versionado;
- pertenencia al usuario, no al repositorio compartido;
- persistencia opcional entre sesiones;
- cambio y reset explícitos;
- modo `auto`;
- visibilidad del perfil activo;
- compatibilidad con múltiples personas y perfiles sobre el mismo proyecto.

## Contrato de interoperabilidad

Todo perfil debe:

1. priorizar capacidades de su dominio;
2. evitar precargar capacidades de otras áreas;
3. permitir colaboración puntual cuando la tarea la requiera;
4. explicar por qué incorpora otro dominio;
5. mantener la capacidad cross-domain como contexto temporal;
6. no cambiar silenciosamente el perfil persistido;
7. no debilitar seguridad, autorización, scopes, commands, capability binding,
   protección Git ni trazabilidad.

## Experiencia esperada por área

### Management/Functional

- entrada orientada a problemas, objetivos, stakeholders y valor;
- discovery, alcance, backlog, priorización y criterios de aceptación;
- lenguaje funcional y ejecutivo;
- arquitectura o desarrollo solo ante necesidad técnica concreta.

### QA/ATF

- estrategia, cobertura y riesgo;
- diseño y automatización de casos;
- ejecución, evidencia, defectos, reporting y sign-off;
- integración puntual con desarrollo, seguridad o datos cuando aplique.

### Data

- exploración, análisis y calidad;
- modelado, fuentes y pipelines;
- procesamiento, ciencia, gobierno y arquitectura;
- incorporación puntual de visualización, plataforma o QA sin perder el foco.

### Software Delivery

- análisis, diseño, arquitectura, construcción, validación y documentación;
- colaboración puntual con Data, QA, Platform, Management o Security según la
  tarea.

### Platform/DevOps y Experience/Design

Sus journeys y límites definitivos se derivarán del inventario. No se asumirán
capacidades inexistentes ni se forzará una sexta área por conveniencia.

## Implementación incremental

### Etapa 1 — Inventario sin cambio de comportamiento

- mapa de agentes, skills y comandos por dominio;
- capacidades compartidas;
- vacíos, duplicados, huérfanos y ambigüedades;
- costo actual de contexto por dominio;
- propuesta definitiva de perfiles.

### Etapa 2 — Infraestructura de perfiles

- esquema del catálogo;
- registro de perfiles;
- selección local;
- consulta, cambio y reset;
- validadores de integridad;
- compatibilidad con modo `auto`.

### Etapa 3 — Piloto Management + Data

- tarjetas de arranque;
- journeys;
- routing preferente;
- capabilities;
- pruebas específicas;
- métricas de contexto y relevancia.

### Etapa 4 — QA/ATF + Software

- cobertura de áreas con catálogo amplio;
- pruebas de aislamiento de contexto;
- colaboración cross-domain en ambas direcciones.

### Etapa 5 — Platform/DevOps + perfil restante

- cierre del catálogo;
- decisión organizacional sobre Experience/Design y Security;
- adopción completa y documentación.

## Primer paso ejecutable: auditoría estructural read-only

La auditoría recorrerá el repositorio sin cargar agentes o skills como
instrucciones y sin modificar routing o configuración. Su matriz mínima es:

| Campo | Descripción |
|---|---|
| Artefacto | ID canónico |
| Tipo | agente, skill, comando, rule, reference, workflow, template, validador |
| Dominio principal | dominio de mayor afinidad |
| Dominios secundarios | afinidades adicionales |
| Roles atendidos | perfiles profesionales beneficiados |
| Actividades | analizar, diseñar, construir, validar, documentar u otras |
| Carga | eager, condicional o bajo demanda |
| Uso transversal | sí/no y justificación |
| Evidencia | ruta exacta |
| Observación | duplicidad, vacío, ambigüedad, huérfano o deuda |

Los casos ambiguos permanecerán `unclassified` hasta decisión explícita. La
auditoría no ejecutará Claude, no cargará agentes/skills en la sesión y no
cambiará comportamiento. Tampoco escribirá archivos dentro del repositorio:
sus resultados candidatos vivirán solo en memoria o `/tmp` y se presentarán al
usuario. Un slice posterior, separado y aprobado, podrá materializar el
inventario y los reportes aceptados.

## Entregables de la auditoría

La inspección read-only presenta primero, sin persistirlos en el repositorio:

1. Mapa candidato completo:
   `perfil → roles → agentes → skills → comandos → workflows → artefactos`.
2. Cobertura candidata por área.
3. Vacíos, duplicidades, capacidades sin dueño y sesgo hacia
   desarrollo.
4. Carga y costo contextual medidos.
5. Propuesta definitiva de perfiles y capacidades transversales.
6. Journeys iniciales por trabajador.
7. Recomendación validada del piloto.

Después de la revisión y aprobación del usuario, un slice de publicación
materializa el protocolo, inventario, baseline y reportes aprobados sin tocar
runtime ni routing.

## Fuera de alcance

- Crear seis copias del template.
- Duplicar agentes o skills para cada perfil.
- Convertir el perfil en una frontera de autorización.
- Permitir que el perfil desactive guards o políticas universales.
- Cargar todos los catálogos del perfil en SessionStart.
- Implementar UI visual antes de decidir si es necesaria.
- Inventar agentes, skills o capacidades ausentes del repositorio.
- Cambiar el comportamiento del runtime antes de aprobar Analyze y Design.
- Ejecutar Claude durante la auditoría estructural.

## Restricciones conocidas

- **Compatibilidad:** el modo `auto` debe preservar la experiencia existente.
- **Persistencia:** el perfil del trabajador no puede contaminar Git ni imponer
  preferencias a otros usuarios.
- **Contexto:** el perfil debe reducir o mantener el costo inicial; nunca
  incrementarlo cargando catálogos completos.
- **Seguridad:** el perfil no amplía autoridad, scope, commands ni capabilities.
- **Trazabilidad:** cambios de taxonomía y routing requieren evidencia, versión
  y pruebas.
- **Gobierno:** la taxonomía final requiere validación de representantes de las
  áreas, no solo inferencia técnica.
- **Ejecución:** cualquier desviación del INDEX aprobado requiere CR y nueva
  aprobación; no se amplía silenciosamente el plan.

## Criterios de éxito provisionales

| Criterio | Objetivo provisional |
|---|---:|
| Artefactos inventariados | 100 % clasificados o marcados explícitamente `unclassified` |
| Duplicación para perfiles | 0 agentes/skills copiados |
| Carga inicial | núcleo + tarjeta compacta del perfil |
| Skills especializadas eager sin necesidad | 0 nuevas |
| Prompts típicos que priorizan el perfil correcto | 80–90 %, sujeto a baseline |
| Cross-domain válido | 100 % de escenarios curados puede incorporar capacidad puntual |
| Cambio silencioso del perfil persistido | 0 |
| Regresiones de seguridad/autorización | 0 |
| Permisos/challenges innecesarios añadidos | 0 |
| Percepción de relevancia por área | objetivo a fijar con representantes |

Los umbrales definitivos se fijarán después de la auditoría y un benchmark
repetible. No se endurecerán usando intuición.

## Mapa preliminar de dominios de implementación

| Área spec | Aplica | Motivo |
|---|---:|---|
| Funcional | Sí | experiencia observable, selección, journeys e interoperabilidad |
| Backend/runtime | Sí | catálogo, persistencia local, resolver, routing y carga |
| Seguridad | Sí | perfiles no son autoridad y no pueden debilitar controles |
| QA | Sí | matriz por perfil, cross-domain, contexto, seguridad y E2E consumidor |
| Frontend | No inicialmente | no se ha decidido una interfaz visual |
| Diseño UX/UI | No inicialmente | Experience/Design es perfil de contenido, no UI del selector |
| DevOps | No como capa técnica | Platform/DevOps es perfil; no se cambia pipeline en esta iniciativa |
| Data | No como plataforma técnica | Data es perfil; no se construye un sistema de datos |

La cobertura profesional de Data, Platform y Experience vive en el contrato
funcional y en la auditoría del catálogo. Marcar su spec técnica como N/A no
elimina esos perfiles.

## Roles técnicos requeridos

- [x] Architect — arquitectura por capas, persistencia y routing.
- [x] Security — invariantes de autorización y aislamiento.
- [x] Tech Lead — slices, compatibilidad, migración y deuda.

## Decisiones arquitectónicas previstas

- ADR de arquitectura de perfiles profesionales y catálogo.
- Decisión sobre persistencia local y precedencia del modo `auto`.
- Decisión sobre ponderación del perfil dentro del router.
- Enmienda de ADR-017 solo si la tarjeta de perfil cambia el contrato de carga
  contextual existente.
- No decidir ADRs antes de completar la auditoría y evaluar alternativas.

## Artefactos de salida previstos

- Este brief.
- Spec funcional, backend/runtime, seguridad y QA.
- INDEX incremental con slices y gates.
- Auditoría estructural y baseline de cobertura/carga.
- ADRs confirmados por Design.
- Implementación incremental, pruebas mecánicas y E2E consumidor.
- Guías por perfil, benchmark final y cierre documental.

## Checklist de Specify y gate G0 previo a la auditoría

- [x] Problema, actores y propuesta por capas definidos por el usuario.
- [x] Alcance, fuera de alcance y restricciones explícitos.
- [x] Perfiles provisionales declarados como hipótesis.
- [x] Primer paso read-only definido.
- [x] Ciclo completo Specify → Document requerido.
- [x] Usuario autorizó materializar el borrador de brief y specs iniciales.
- [x] Usuario ratificó el set canónico y su INDEX antes de iniciar la auditoría.

> Estos documentos son artefactos de gobierno creados antes de la auditoría;
> no son resultado del inventario read-only ni anticipan sus conclusiones.
> Specify queda documentalmente materializado; el ítem pendiente es el gate G0
> de Analyze que bloquea `SPIKE-1R`.
