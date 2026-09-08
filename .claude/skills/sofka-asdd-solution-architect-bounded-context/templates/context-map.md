# Context Map — {Sistema / Producto}

**Fecha:** {YYYY-MM-DD}
**Autor:** {nombre}
**Estado:** Borrador | Aceptado

## Diagrama (Mermaid)

```mermaid
graph LR
  classDef core fill:#fde4cf,stroke:#d97706
  classDef supporting fill:#e0f2fe,stroke:#0284c7
  classDef generic fill:#f3f4f6,stroke:#6b7280

  A[Bounded Context A]:::core
  B[Bounded Context B]:::supporting
  C[Bounded Context C — externo]:::generic

  A -->|Customer-Supplier| B
  A -->|ACL| C
```

## Inventario de contextos

| Contexto | Subdomain | Equipo | Patrón frente a vecinos |
|---|---|---|---|
| {A} | Core | {team} | OHS / Customer-Supplier hacia {B} |
| {B} | Supporting | {team} | Customer hacia {A} |
| {C} | Generic (externo) | proveedor | Conformist con ACL desde {A} |

## Decisiones clave del mapa

1. {¿Por qué estos contextos y no otros?}
2. {¿Por qué este patrón en cada arista?}
3. {¿Qué riesgos asumimos al aceptar Conformist en X?}

## Cambios desde la última versión

- {YYYY-MM-DD: descripción}
