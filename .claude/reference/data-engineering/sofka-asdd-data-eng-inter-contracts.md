# Smart Data — Contratos de Datos Inter-Equipo

Define cuándo y cómo se formaliza un contrato de datos entre un equipo productor y un equipo consumidor. Aplica de forma transversal a todas las fases del flujo Smart Data (`discover → design → build → validate → publish`), con énfasis en `design`, `build` y `validate`. Complementa `sofka-asdd-data-eng-schema-contracts.md` (enforcement de schema en Silver) — esta regla cubre el **acuerdo entre equipos**, no el enforcement técnico de tipos.

## DC-000: Principio fundamental (regla absoluta)

**Sin contrato de datos firmado, no hay integración aprobada entre equipos.**

Ningún equipo consume datos producidos por otro equipo sin un contrato formal versionado en el repositorio. Esto no es burocracia: es la frontera que hace que un cambio de schema en el productor no rompa silenciosamente al consumidor. Si Claude detecta que se está diseñando o construyendo una integración inter-equipo sin contrato, **pausa y aplica DC-006** antes de continuar.

El principio no admite excepción por urgencia, por POC ni por "es solo una tabla". Un consumo no contractualizado es deuda de gobernanza que se paga con un incidente.

## DC-001: Cuándo se necesita un contrato

Claude exige un contrato de datos cuando aplica **cualquiera** de estas condiciones. Basta una para activar la regla:

| Condición | Señal en la conversación |
|---|---|
| Un equipo va a consumir una tabla/topic producida por **otro equipo** | "el equipo de riesgo va a leer", "consumir el topic de", "compartir la tabla con" |
| Se formaliza el consumo de **Silver o Gold** por analytics, BI o ML | "dashboard sobre Gold", "feature store desde Silver", "modelo que lee" |
| Se define un **SLA** de frescura o uptime entre productor y consumidor | "frescura de 15 min", "disponibilidad 99.9%", "datos del día anterior" |
| Se cambia un **schema con consumidores activos** (breaking change) | "renombrar columna", "cambiar el tipo de", "eliminar campo", "deprecar tabla" |

Consumos **dentro del mismo equipo** y entre capas del propio pipeline (Bronze → Silver → Gold del mismo dominio) **no requieren** contrato inter-equipo; se gobiernan por `sofka-asdd-data-eng-schema-contracts.md`. La frontera es el límite de equipo, no el límite de capa.

## DC-002: Los 6 elementos obligatorios

Un contrato de datos válido tiene **los 6 elementos**. Si falta uno, el contrato no está completo y la integración no se aprueba.

| # | Elemento | Qué debe especificar |
|---|---|---|
| 1 | **Productor** | Equipo responsable + sistema de origen + tabla/topic exacto (ej. `cao_{cliente}.gold.polizas_activas`) |
| 2 | **Consumidor** | Equipo consumidor + caso de uso concreto (ej. "dashboard de siniestralidad mensual") |
| 3 | **Schema comprometido** | Columnas, tipos y `nullable` por cada campo expuesto. Lo que no está en el schema no está garantizado |
| 4 | **SLA** | Frescura (ej. máx. 15 min de lag), uptime (ej. 99.9%) y RPO (punto de recuperación objetivo) |
| 5 | **ACL** | Quién puede leer y quién no — grants explícitos sobre el objeto en Unity Catalog o equivalente |
| 6 | **Proceso de breaking-change** | Cómo se comunica un cambio mayor, con **preaviso mínimo de referencia (1 día laborable para impacto bajo; 2 días laborables para impacto medio/alto o con consumidores activos — sin contar fines de semana ni festivos)** al consumidor |

El elemento 3 (schema) es el corazón del contrato: define la superficie estable. El elemento 6 es el seguro: nadie rompe esa superficie sin preaviso.

## DC-003: Versionado semántico de contratos

Los contratos se versionan con semántica `MAJOR.MINOR.PATCH`. El tipo de cambio determina el proceso:

| Cambio | Versión | Proceso requerido |
|---|---|---|
| Agregar columna **opcional** (nullable), agregar metadato no rompiente | **MINOR** (`1.0.0` → `1.1.0`) | Notificación simple — **sin** proceso de breaking-change |
| **Renombrar** columna, **cambiar tipo**, hacer un campo `NOT NULL`, **eliminar** columna o tabla, endurecer un SLA | **MAJOR** (`1.1.0` → `2.0.0`) | Proceso completo de breaking-change con preaviso mínimo (1 día laborable para impacto bajo; 2 días laborables para impacto medio/alto) |

Regla práctica: si el cambio **puede romper a un consumidor que no se entere**, es MAJOR. Si el consumidor puede ignorarlo sin que nada falle, es MINOR. Ante la duda, tratar como MAJOR.

Un cambio MAJOR genera un **nuevo archivo de contrato** con la versión incrementada; el contrato anterior se marca como `deprecated` indicando la fecha de fin de soporte (fin del preaviso).

## DC-004: Dónde viven los contratos

Todo contrato es un archivo markdown versionado en el repositorio, bajo:

```
docs/specs/contracts/smart-data-eng-contract-{productor}-{consumidor}-{version}.md
```

Ejemplos:

```
docs/specs/contracts/smart-data-eng-contract-polizas-riesgo-1.0.0.md
docs/specs/contracts/smart-data-eng-contract-gold-analytics-bi-2.1.0.md
```

Convenciones de nombre: `{productor}` y `{consumidor}` en `kebab-case` identificando equipo o dominio; `{version}` en formato `MAJOR.MINOR.PATCH`. Un contrato por par productor-consumidor-versión. El contrato vive en el repo del consumidor o en un repo de gobernanza compartido, según defina el proyecto, pero **siempre** versionado en git — nunca en un wiki suelto ni en un chat.

## DC-005: Estructura mínima de un contrato

Cada archivo de contrato incluye, en este orden, los 6 elementos de DC-002 más metadata de versión:

```markdown
# Contrato de Datos — {productor} → {consumidor} {version}

- Estado: active | deprecated
- Versión: {MAJOR.MINOR.PATCH}
- Vigente desde: YYYY-MM-DD
- Reemplaza a: smart-data-eng-contract-...-{anterior}.md  (si aplica)

## 1. Productor
## 2. Consumidor
## 3. Schema comprometido   (tabla columna | tipo | nullable)
## 4. SLA                   (frescura · uptime · RPO)
## 5. ACL                   (lectores autorizados)
## 6. Proceso de breaking-change  (preaviso ref. 1-2 días lab.)
```

## DC-006: Si se detecta integración sin contrato

Cuando Claude detecta un consumo de datos inter-equipo, un SLA o un cambio de ACL **sin contrato existente** que lo respalde:

1. **Pausar** — no continuar diseñando ni construyendo la integración.
2. **Anunciar** el hallazgo en una línea, identificando el par productor-consumidor sin contrato.
3. **Invocar a `@sofka-asdd-data-governance`** para que produzca o complete el contrato antes de avanzar.
4. **No reanudar** la integración hasta que el contrato exista en `docs/specs/contracts/` con los 6 elementos de DC-002 completos.

```
⚠ Integración sin contrato detectada: {productor} → {consumidor}
→ Pausando. Invocando @sofka-asdd-data-governance para formalizar el contrato antes de continuar.
```

El escalamiento a gobernanza **no es un bloqueo punitivo** — es el mecanismo que convierte un consumo informal en un acuerdo trazable. Un proyecto que escala correctamente está aplicando bien la regla.

## DC-007: Resumen operativo

- Sin contrato firmado → integración inter-equipo **no aprobada** (DC-000).
- Activan contrato: consumo entre equipos, consumo de Silver/Gold por analytics/BI/ML, SLA, breaking change (DC-001).
- 6 elementos obligatorios: productor, consumidor, schema, SLA, ACL, proceso de breaking-change (DC-002).
- MINOR = columna opcional, sin proceso. MAJOR = rename/tipo/eliminar/endurecer SLA, con preaviso de 1-2 días laborables (DC-003).
- Ubicación: `docs/specs/contracts/smart-data-eng-contract-{productor}-{consumidor}-{version}.md` (DC-004).
- Detección de integración sin contrato → pausar e invocar `@sofka-asdd-data-governance` (DC-006).
