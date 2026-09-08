# Integración con Carriers y Geolocalización

## APIs de Carriers

La mayoría de carriers exponen APIs REST para:
- **Cotización**: precio de envío según origen, destino, peso y dimensiones
- **Generación de guía**: crear el envío y obtener el número de tracking
- **Tracking**: consultar el estado actual o historial de eventos
- **Pickup**: solicitar recolección en una dirección

Carriers comunes en LATAM: Servientrega, Coordinadora, Deprisa, Envia, Fedex, DHL, UPS

## Geolocalización

- **Coordenadas**: latitud/longitud en formato decimal (no grados/minutos/segundos)
- **Geofencing**: alertas automáticas cuando un vehículo entra o sale de una zona definida
- **Geocodificación**: convertir dirección textual en coordenadas (y viceversa)
- **Precisión**: GPS en vehículos tiene precisión de ±5m, suficiente para logística urbana

## Notas de integración

- Cada carrier tiene su propio formato de código de barras / QR para la guía impresa — no son intercambiables
- Los webhooks de tracking tienen formatos distintos por carrier — normalizar a schema interno
- El campo `event_id` del carrier es el identificador de idempotencia para webhooks
