---
name: asdd-domain-expert-logistics
description: Dominio Logística — tracking, rutas, geolocalización, flota, warehousing, última milla y carriers.
---

## Dominio activo: Logística

Skill cargado cuando el proyecto opera en el dominio logístico o de cadena de suministro. Activo como soporte transversal en todas las fases.

## Flujos críticos del dominio

### Ciclo de vida de un envío
```
Creación de guía → Recolección → En tránsito → Hub intermedio →
  Última milla → Intento de entrega → Entregado | Devuelto | En bodega
```

### Estados de un envío
`creado → recogido → en_transito → en_hub → en_reparto → entregado | fallido | devuelto | perdido`

### Flujo de última milla
```
Asignación a repartidor → Ruta optimizada → Salida del hub →
  Geolocalización en tiempo real → Intento de entrega → POD | Reagendamiento
```

### Flujo de devolución (reverse logistics)
```
Solicitud de devolución → Generación de guía de retorno →
  Recolección → Tránsito → Recepción en origen → Inspección
```

## Reglas de negocio frecuentes

- Un envío puede tener múltiples intentos de entrega — definir política de reintentos (típico 3 intentos)
- El POD es evidencia legal — debe almacenarse con timestamp, geolocalización y datos del receptor
- La ruta de reparto se optimiza por capacidad del vehículo, ventanas horarias y distancia
- Los envíos internacionales requieren declaración de aduana — código arancelario (HS Code) y valor declarado
- El peso de facturación es el mayor entre peso real y peso volumétrico: `(largo × ancho × alto) / 5000`
- Las guías tienen TTL — si no se recogen en X días, se cancelan automáticamente

## Cuándo NO invocar

- El proyecto no involucra envíos, tracking, rutas ni carriers — contexto genérico.
- La consulta es sobre WMS interno (almacén) sin componente de transporte — el skill cubre el ciclo de envío.
- Diseño general de microservicios — usar `architect-bounded-context`.

## Anti-patterns de dominio

- **Dirección no encontrada**: las direcciones en LATAM son menos estructuradas — validar con geocodificación, no solo formato
- **Ventanas horarias**: los destinatarios tienen disponibilidad limitada — respetar las ventanas prometidas es crítico
- **Temperatura controlada**: envíos de farmacia o alimentos requieren tracking de temperatura además de ubicación
- **Webhook de carrier no idempotente** — recibir el mismo evento 3 veces y crear 3 POD. Deduplicar por `event_id` del carrier.
- **ETA estática sin recalcular** — calcular ETA al crear la guía y no actualizarla. Recalcular en hitos clave (salida del hub, asignación a repartidor).

## Integración con otros agentes

| Agente | Qué aporta este dominio |
|---|---|
| **architect** | Separar tracking, OMS, flota y carriers como servicios independientes |
| **developer** | Integración con APIs de carriers, optimización de rutas, geofencing |
| **developer** | Tests de estados del envío, intentos fallidos, cálculo de peso volumétrico |
| **devops-engineer** | Webhooks de carriers para actualizaciones de tracking en tiempo real |

## Referencia

Cargar bajo demanda cuando se necesite detalle:
- `reference/glosario.md` — 14 términos del dominio (Shipment, Waybill, Tracking, Milestone, ETA, POD, 3PL, etc.)
- `reference/carriers.md` — integración con APIs de carriers LATAM, geolocalización y geocodificación
