---
name: asdd-domain-expert-fintech
description: Dominio Fintech y banca — pagos, tarjetas, KYC/AML, core bancario, conciliación, PCI-DSS y anti-fraude.
---

## Dominio activo: Fintech / Banca

Skill cargado cuando el proyecto opera en el dominio de servicios financieros, pagos digitales o banca. Activo como soporte transversal en todas las fases.

## Flujos críticos del dominio

### Flujo de pago con tarjeta
```
Cliente → Comercio → Acquirer → Switch (Visa/MC) → Issuer
                                                  ↓
                              Autorización / Rechazo + Código de respuesta
```

### Flujo de tokenización
```
PAN real → TSP → Token (almacenado en sistema del comercio)
Token → TSP → PAN real (solo en el momento de la transacción)
```

### Flujo KYC
```
Onboarding → Captura de datos → Validación documental →
  Verificación biométrica → Listas negras → Nivel de riesgo → Aprobación/Rechazo
```

## Reglas de negocio frecuentes

- Un pago puede estar en estados: `pendiente → autorizado → capturado → liquidado → revertido`
- La autorización no implica cobro — se cobra en la captura
- Los chargebacks tienen ventanas de tiempo estrictas (típico 60-120 días)
- Conciliación debe ejecutarse diariamente al cierre del día operativo
- Transacciones internacionales requieren conversión de divisa en tiempo real

## Cuándo NO invocar

- El proyecto no involucra pagos, banca, KYC/AML ni datos financieros — el contexto es genérico.
- La pregunta es de seguridad general (OWASP) — usar `security-code-scan` (este skill complementa, no reemplaza).
- Se necesita arquitectura general — usar `architect-*`. El domain-expert aporta contexto, no diseña componentes.

## Anti-patterns de dominio

- **Idempotencia es crítica**: reintentos de pago pueden generar cobros dobles — siempre usar `idempotency_key`
- **Códigos de respuesta ISO 8583**: cada código tiene semántica precisa (ej. 51 = fondos insuficientes, 05 = no autorizado)
- **Horario de corte**: las transacciones tienen un "día operativo" que puede no coincidir con el día calendario
- **Regulación local varía**: PCI-DSS es global, pero KYC/AML tienen requerimientos adicionales por país
- **Logs con PAN completo** — auditoría PCI-DSS lo detecta y bloquea certificación. Mascarar PAN (primeros 6 + últimos 4); nunca loggear CVV ni PIN.
- **Settlement vs autorización confundidos** — autorizar reserva fondos, no los cobra. "Venta confirmada" debe basarse en captura/settlement.

## Integración con otros agentes

| Agente | Qué aporta este dominio |
|---|---|
| **architect** | Separar CDE del resto del sistema — reducir alcance PCI |
| **security** | Complementar OWASP con controles PCI-DSS específicos |
| **developer** | Idempotencia, manejo de códigos ISO 8583, nunca loggear PAN |
| **developer** | Tests de conciliación, casos de chargeback, flujos de reintento |

## Referencia

Cargar bajo demanda cuando se necesite detalle:
- `reference/glosario.md` — 14 términos del dominio (PAN, CVV, Token, TSP, KYC, AML, Settlement, etc.)
- `reference/regulacion.md` — PCI-DSS, KYC/AML, umbrales por jurisdicción, listas OFAC/ONU/GAFI
