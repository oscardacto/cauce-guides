# Power/Interest Matrix — Stakeholders

**Cliente / Producto:** {…}
**Fecha:** {YYYY-MM-DD}

## Diagrama (texto)

```text
                        Alto interés
                              │
   Mantener informado     ────┼──── Gestionar de cerca
   - {nombre} ({rol})         │     - {nombre} ({rol}) [SPONSOR]
   - {nombre} ({rol})         │     - {nombre} ({rol})
                              │
─────────────────────────────┼─────────────────────────────
                              │
   Monitorear             ────┼──── Mantener satisfecho
   - {nombre} ({rol})         │     - {nombre} ({rol})
                              │
                        Bajo interés
                Bajo poder         Alto poder
```

## Tabla detallada

| # | Nombre | Rol | Poder | Interés | Cuadrante | Estrategia |
|---|---|---|---|---|---|---|
| 1 | {…} | CTO | Alto | Alto | Gestionar de cerca | 1:1 quincenal, involucrar en ADRs P1 |
| 2 | {…} | Lead Security | Alto | Medio (alto si toca security) | Mantener satisfecho | Notificar cambios estructurales con anticipación |
| 3 | {…} | Tech Lead Wallet | Medio | Alto | Mantener informado | Includir en discovery y reviews |
| 4 | {…} | DBA | Medio | Alto si toca BD | Mantener informado | Consultar para cambios de schema |
| 5 | {…} | PO | Alto | Medio | Mantener satisfecho | Compartir hitos y deltas vs roadmap |

## Sponsors y vetos

- **Sponsor del engagement:** {nombre}
- **Veto silencioso identificado:** {ej. Compliance corporativa, Finance}
- **Aliados tácticos:** {nombre, rol}

## Riesgos políticos

- {ej. Lead Security cambió hace 1 mes — tiene su propia agenda. Validar antes de proponer cambios mayores.}
- {…}

## Próximos pasos de relacionamiento

- [ ] Reunión inicial con {sponsor}.
- [ ] Presentación a {stakeholder de cuadrante "mantener satisfecho"}.
- [ ] Email periódico (mensual) a {stakeholder informados}.
