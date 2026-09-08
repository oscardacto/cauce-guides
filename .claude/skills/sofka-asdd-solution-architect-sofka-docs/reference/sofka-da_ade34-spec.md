# Estándar Sofka DA_ADE34 — Registro de Decisiones de Arquitectura (ADR)

**Documento fuente:** DA_ADE34 — Drivers de Arquitectura
**Versión del estándar:** 0.1 (2025-10-27)
**Acceso:** Interno Sofka
**Responsable de gobernanza:** Líder de la Práctica de Arquitectura
(Head of Architecture Practice / Arquitecto Empresarial Principal)

Este documento es el **formato default** para ADRs en proyectos Sofka.
Tiene precedencia sobre MADR y Nygard cuando el contexto sea un cliente o
solución corporativa Sofka.

## Objetivo del ADR (según el estándar)

Formalizar y documentar de manera explícita las Decisiones de Arquitectura
más significativas, su contexto, las opciones consideradas y la justificación
técnica detrás de la elección final. El documento sirve como registro
histórico para la **gobernanza**, **revisión de diseño** y **gestión futura
de la Deuda Arquitectónica (DA)**.

## Alcance

Cubre todas las decisiones que tienen impacto significativo en los
**Atributos de Calidad** (Disponibilidad, Rendimiento, Seguridad, etc.) o
que resuelven directamente los **Architecture Concerns** (conflictos entre
drivers) identificados en la fase de Diseño.

## Conceptos Sofka usados en el ADR

| Concepto | Definición |
|---|---|
| **Atributos de Calidad (QA)** | Requisitos no funcionales: rendimiento, seguridad, escalabilidad, disponibilidad. |
| **Drivers de Arquitectura** | QAs y Restricciones que guían la decisión. |
| **Architecture Concern** | Conflicto entre dos o más drivers que la decisión debe resolver. |
| **AS-IS** | Estado actual de la arquitectura antes del cambio. Punto de partida. |
| **TO-BE** | Estado futuro propuesto que cumple los Drivers de Negocio. |
| **Trazabilidad** | Cadena: Driver de Negocio → QA → Decisión de diseño que lo implementa. |
| **Trade-off** | Decisión de compromiso: mejorar un QA degrada otro (ej. seguridad ↑ → rendimiento ↓). |
| **Deuda Arquitectónica (DA)** | Compromiso aceptado hoy que requerirá inversión futura para resolverse. |
| **Driver Regulatorio** | Restricción impuesta por compliance o regulación (PCI, HIPAA, soberanía de datos). |

## Estructura estandarizada del ADR (8 ítems obligatorios)

| Ítem | Contenido esperado |
|---|---|
| **Id** | `ADR-NNN` con numeración secuencial sin huecos. |
| **Título** | Patrón: `[Verbo de Acción] [Objeto] usando [Tecnología/Patrón]`. Auto-explicativo. |
| **Estado** | `{Propuesta \| Aceptada \| Sustituida \| Desaprobada \| Obsoleta \| Rechazada}`. |
| **Fecha** | `YYYY-MM-DD` — fecha de la última actualización. |
| **Contexto y Problema** | Entorno, AS-IS, Drivers de Arquitectura (QAs), Restricciones Técnicas, Architecture Concern a resolver. |
| **Factores Impulsores** | Criterios de prioridad: QAs maximizados + Restricciones respetadas. Lista explícita. |
| **Opciones Consideradas** | Todas las alternativas viables (incluir "No hacer nada" si aplica). Para cada una: tecnología/patrón/costo. Marcar la elegida. |
| **Resultado de la Decisión** | Opción elegida especificada inequívocamente. Debe referenciar el patrón o tecnología exacta que se integra a la Arquitectura TO-BE. |
| **Consecuencias** | Impactos objetivos: ganancias (QAs cumplidos, riesgos mitigados) y compromisos (mayor OpEx, complejidad, dependencias). Pueden ser positivas, negativas o neutrales. |
| **Más Información** | Referencias técnicas/documentales: estándares, catálogos de patrones, ADRs de seguimiento, matrices de dependencias. |

## Estados del ADR (terminología Sofka)

| Estado Sofka | Equivalente comunidad | Cuándo usar |
|---|---|---|
| **Propuesta** | Proposed | Borrador en revisión, no aplicado todavía. |
| **Aceptada** | Accepted | Aprobado y vigente. Inmutable. |
| **Sustituida** | Superseded by ADR-NNN | Reemplazado por otro ADR posterior. |
| **Desaprobada** | Deprecated | Práctica vigente lo ignora, sin reemplazo formal. |
| **Obsoleta** | (alias de Sustituida) | El estándar lo lista; usar "Sustituida" si hay reemplazo formal. |
| **Rechazada** | Rejected | Evaluado y descartado en revisión. Conservar para evitar re-proponer. |

## Reglas de redacción Sofka

1. **Título auto-explicativo:** debe seguir el patrón `[Verbo] [Objeto] usando [Tecnología/Patrón]`.
   Ejemplos válidos:
   - `Adoptar el patrón Cache-Aside para desacoplar lecturas críticas del Core System`
   - `Estandarizar Kubernetes (EKS/AKS) como Plataforma de Despliegue de Microservicios`
   - `Adoptar OAuth 2.0/OIDC para Autenticación, delegando al SSO Corporativo`
2. **Trazabilidad explícita:** el contexto debe nombrar los Drivers de Arquitectura específicos (QAs y Restricciones), no genéricos. Ej: "QA de Disponibilidad (99.99%)" no "alta disponibilidad".
3. **AS-IS antes de TO-BE:** describir primero el estado actual antes de proponer el cambio.
4. **Opciones con justificación de descarte:** cada opción NO elegida debe tener motivo concreto (Ej: "No viable, riesgo legacy").
5. **Resultado referenciando TO-BE:** especificar la tecnología o patrón exacto que se integrará a la arquitectura objetivo.
6. **Consecuencias balanceadas:** SIEMPRE incluir Bueno y Malo. Una decisión sin trade-offs visibles es sospechosa de no estar bien analizada.
7. **Más Información con ADRs de seguimiento:** si la decisión genera nuevas decisiones derivadas (TTL, proveedor específico, política de invalidación), nombrarlas como "ADR de seguimiento" pendiente.
8. **Lenguaje formal en español:** el documento es interno Sofka; mantener el idioma del estándar.

## Antipatrones específicos del estándar Sofka

- ADR sin Drivers de Arquitectura nombrados → falla la trazabilidad QA → decisión.
- Resultado que no menciona TO-BE → la decisión queda sin gancho con la arquitectura objetivo.
- Opciones consideradas sin "No hacer nada" cuando aplica → sesgo hacia la acción.
- Consecuencias solo positivas → no es un ADR, es un anuncio.
- Título narrativo (`"Sobre la base de datos para clientes"`) → viola el patrón `[Verbo] [Objeto] usando [Tecnología]`.
- Mezcla de Propuesta y Aceptada (decisión "ya tomada" presentada como propuesta) → inhibe el debate.

## Cuándo elegir el formato Sofka DA_ADE34

- **Default** para todo ADR en proyectos del COE Sofka entregados a clientes.
- Cuando la decisión impacta Atributos de Calidad o resuelve Architecture Concerns.
- Cuando el ADR debe servir como evidencia de gobernanza ante el Líder de Práctica de Arquitectura.
- Cuando hay Drivers Regulatorios o de Negocio que requieren trazabilidad explícita.

## Cuándo considerar otro formato

- **MADR** (`reference/madr-spec.md`) — proyecto open-source, equipo externo, comunidad técnica que ya usa MADR como estándar.
- **Nygard** (`reference/nygard-spec.md`) — decisiones internas pequeñas donde el formato Sofka es overhead innecesario.

## Referencia al documento fuente

Estándar interno Sofka: **DA_ADE34 — Drivers de Arquitectura**, versión 0.1
del 2025-10-27. El documento PDF original es el authoritative source. Este
reference es la traducción operativa para uso del agente.
