---
fecha: YYYY-MM-DD
actualizado: YYYY-MM-DD
estado: En ejecución
generado_por: asdd-data-architect
alcance: {resumen de fuentes y tablas del engagement}
---

# Discovery Técnico de Datos — {Nombre del cliente}

---

## Escenario de integración
Marcar el que aplica (determinado durante el discovery):
- [ ] Migración limpia: source → landing/bronze directo, sin sistemas legacy corriendo en paralelo
- [ ] Coexistencia temporal: legacy + nuevo sistema en paralelo — fecha de corte comprometida: {fecha}
- [ ] Coexistencia permanente: arquitectura híbrida estable, ambos sistemas coexisten indefinidamente

## Inventario de fuentes de datos
| Fuente | Sistema origen | Tipo | Volumen aprox | Frecuencia | Formato | Calidad conocida | Owner técnico | SLA Origen |
|---|---|---|---|---|---|---|---|---|
| {nombre} | {ERP/CRM/BD/API/archivo} | {transaccional/maestro/evento/referencia} | {filas/GB} | {real-time/batch-diario/etc} | {CSV/JSON/Parquet/DB} | {nulos/duplicados/encoding} | {equipo} | {ventana horaria / frecuencia / Siempre disponible} |

## Detalle de coexistencia (completar solo si aplica)
| Tabla/entidad legacy | Tabla/entidad nueva | Período de convivencia | Responsable de migración | Criterio de corte |
|---|---|---|---|---|
| {tabla legacy} | {tabla nueva} | {ventana de fechas} | {equipo/persona} | {condición que dispara el corte} |

## Stakeholders de datos
| Nombre | Rol | Equipo | Poder de decisión | Contacto |
|---|---|---|---|---|
| {nombre} | {Data Owner/Steward/Consumer/Sponsor/Compliance} | {equipo} | {Alto/Medio/Bajo} | {email/slack} |

## Restricciones identificadas
| Tipo | Dureza | Origen | Impacto en arquitectura | Vigencia |
|---|---|---|---|---|
| {Regulatoria/Técnica/Presupuesto/Tiempo/Organizacional} | {Dura/Semi-dura/Blanda} | {quién la impone} | {qué decisiones bloquea} | {fecha o permanente} |

## Decisiones técnicas previas relevantes
{Arquitectura existente, tecnologías ya decididas, contratos vigentes que afectan el diseño.}

## Ingesta por fuente (tabla resumen)

| Fuente | Herramienta origen | Herramienta carga | Destino capa | Formato destino | Frecuencia carga |
|---|---|---|---|---|---|
| {nombre fuente} | {ADF / Event Hubs / SFTP} | {Auto Loader / Spark JDBC / N/A} | {Landing o Bronze} | {CSV / Parquet / Delta} | {Batch diario / Batch mensual / Streaming} |

> `Herramienta origen`: extrae del sistema fuente y deposita en la plataforma (fuera del scope del ingeniero de datos).
> `Herramienta carga`: carga al destino (Auto Loader, Spark JDBC — scope del agente de ingeniería).
> `Formato destino`: formato del archivo o tabla en el destino (CSV si va a Landing, Delta si va directo a Bronze).
> `Frecuencia carga`: cada cuánto corre la herramienta de carga — independiente de la frecuencia de actualización del origen.

## Gaps y preguntas abiertas
{Gaps técnicos de ingesta o de diseño de arquitectura que quedaron sin respuesta. Scope válido: schema, volumen, conectividad, frecuencia, calidad de fuente, disponibilidad de ventana de datos, decisiones de plataforma. No incluye PII, retención, compliance ni governance — esos los captura @asdd-data-governance en su propio assessment.}

## Señales para el arquitecto
{Observaciones del discovery que el arquitecto debe considerar: datos de baja calidad, restricciones de red, equipo sin experiencia cloud, etc.}

---

## Historial de sincronización

| Versión | Fecha | Cambio |
|---|---|---|
| Sync {YYYY-MM-DD} | {YYYY-MM-DD} | {descripción breve de qué cambió en este Sync} |
