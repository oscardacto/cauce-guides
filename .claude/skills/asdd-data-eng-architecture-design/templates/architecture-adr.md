<!--
INSTRUCCIONES DE USO — architecture-adr.md (no incluir este bloque en el ADR final)

QUÉ ES
  Template de ADR para decisiones MAYORES de arquitectura de datos. Sigue el estándar
  Guide DA_ADE34 adaptado al dominio de datos (capas, contratos de Silver, formatos,
  patrones de ingesta).

CUÁNDO GENERAR UN ADR (decisión mayor):
  - Elección de patrón de arquitectura (Medallion, Star Schema, Medallion + Gold Star).
  - Elección o cambio de plataforma (Azure + Databricks, AWS nativo).
  - Decisión de Landing sí/no.
  - Cambio de formato de almacenamiento (CSV → Delta, Delta → Iceberg, etc.).
  - Escenario de coexistencia (migración limpia / temporal / permanente).
  - Breaking change sobre el contrato de Silver, con su preaviso.

CUÁNDO NO GENERAR ADR:
  - Recomendación de patrón en un caso simple → el agente da la recomendación
    directamente en el smart-data-eng-design, sin ADR. El ADR es overhead para decisiones
    que no impactan capas, contratos ni plataforma.

REGLAS DE REDACCIÓN (heredadas de DA_ADE34, adaptadas a datos):
  1. Título auto-explicativo, patrón [Verbo] [Objeto] usando [Patrón/Tecnología].
     Ej: "Adoptar Medallion con Gold = Star Schema para la plataforma analítica".
  2. Numeración ADR-NNN secuencial sin huecos.
  3. Contexto nombra DRIVERS concretos: fuentes, volúmenes, SLA de frescura,
     restricciones de plataforma — no genéricos ("muchos datos" → "3 TB/día, +15% anual").
  4. Describir el estado actual (cómo se resuelve hoy) antes de proponer el cambio.
  5. Toda alternativa descartada lleva motivo concreto ("no viable, fuentes inestables").
  6. Consecuencias balanceadas: SIEMPRE Habilita y Cierra. Si solo hay beneficios,
     la decisión no está bien analizada.
  7. Deuda técnica asumida explícita si la hay (componente operativo nuevo, data stale,
     reproceso pendiente).
  8. Si la decisión genera decisiones derivadas (TTL, sizing, política CDC) → nombrarlas
     como "ADR de seguimiento" pendiente.
  9. Lenguaje formal en español.

ESTADOS VÁLIDOS: Propuesta | Aceptada | Sustituida (por ADR-NNN) | Desaprobada | Rechazada.
  - No presentar una decisión ya tomada como "Propuesta" — inhibe el debate.
  - Una vez Aceptada, el ADR es inmutable: un cambio posterior se documenta en un ADR nuevo
    que sustituye a este (registrar en Historial de estados).

UBICACIÓN: docs/architecture/decisions/smart-data-eng-ADR-{NNN}-arquitectura-datos.md

NOTAS DE LLENADO:
  - Borrar todos los {PLACEHOLDER} y reemplazar por contenido real. No dejar placeholders.
  - "Silver contract resultante": completar SOLO si la decisión afecta el schema de Silver.
    Si no lo afecta, eliminar la sección completa (encabezado y tabla).
  - "Relacionado con": enlazar el discovery y el smart-data-eng-design del mismo cliente para
    preservar trazabilidad.
  - Notificar a asdd-data-governance cuando el ADR registre un breaking change de Silver,
    para que actualice los contratos de datos.
-->

# ADR-{NNN} — {Título de la decisión de datos}
Fecha: {YYYY-MM-DD} | Estado: {Propuesta / Aceptada / Sustituida}
Deciders: {nombres y roles — ej. Ana Pérez (Data Architect), Luis Gómez (Lead Data Eng)}
Relacionado con: {smart-data-eng-discovery-{cliente}.md, smart-data-eng-design-{cliente}.md}

---

## Contexto
{Fuentes de datos, volúmenes, restricciones y el problema concreto que motivó esta decisión.
Nombrar drivers específicos, no genéricos: volumen (ej. 3 TB/día, +15% anual), SLA de
frescura, plataforma del cliente, ventanas de procesamiento, regulación aplicable.
Incluir: cómo se resuelve hoy (estado actual), qué se intentó antes, por qué no funcionó
o por qué se necesita decidir ahora.}

## Decisión
{Una línea clara: qué se decidió. Referenciar el patrón o tecnología exacta que se integra
a la arquitectura objetivo — ej. "Adoptar Medallion sobre Delta con Gold modelado como
Star Schema en Databricks".}

## Justificación
{2-3 líneas explicando por qué esta opción es la correcta dado el contexto. Atar la decisión
a los drivers nombrados en el Contexto.}

## Alternativa considerada y descartada
**Opción descartada:** {nombre de la alternativa — ej. Star Schema puro sin Bronze/Silver}
**Por qué no:** {una línea clara y concreta — ej. "fuentes aún inestables, el remodelado
constante anula su valor"}

## Consecuencias
**Habilita:** {qué se puede hacer ahora que antes no — ej. reprocesar Silver desde el raw,
trazabilidad origen→consumo, consumo BI sobre Gold}
**Cierra:** {qué opciones quedan fuera con esta decisión — ej. lectura directa de las
fuentes legacy por parte de analytics}
**Deuda técnica asumida:** {si hay alguna, documentarla — ej. data stale de hasta 6h en
Gold por el batch diario; componente operativo nuevo a monitorear. Si no hay, escribir "Ninguna".}

## Silver contract resultante (si aplica)
{Schema comprometido de la capa Silver que resulta de esta decisión. Este schema es el
contrato principal con analytics y alimenta a asdd-data-eng-contract.
Si la decisión no afecta Silver, ELIMINAR esta sección completa.}

| Columna | Tipo | Nullable | Descripción |
|---|---|---|---|
| {columna} | {string / int / date / decimal} | {sí / no} | {qué representa en negocio} |

## Más información / ADRs de seguimiento
{Referencias técnicas y decisiones derivadas que esta genera. Nombrar como "ADR de
seguimiento" pendiente — ej. política de retención por capa, sizing del warehouse,
mecanismo de CDC, política de invalidación. Trazabilidad: qué driver de negocio implementa.
Si no hay, eliminar esta sección.}

## Historial de estados
| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| {YYYY-MM-DD} | — | Propuesta | Decisión inicial |
