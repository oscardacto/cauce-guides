# Priority Matrix — Atributos de calidad

**Sistema:** {…}
**Fecha:** {YYYY-MM-DD}
**Validado con:** {PO, Arquitecto, CTO}

## Matriz importance × difficulty

```text
                        Alta importancia
                              │
   Quick wins             ────┼──── Estratégicos (foco)
   - {atributo}               │     - {atributo}
                              │
─────────────────────────────┼─────────────────────────────
                              │
   Marginales            ────┼──── Defensivos
   - {atributo}               │     - {atributo}
                              │
                        Baja importancia
                Baja dificultad     Alta dificultad
```

## Tabla detallada

| Atributo ISO/IEC 25010 | Importancia | Dificultad | Cuadrante | Prioridad | Comentario |
|---|---|---|---|---|---|
| Performance Efficiency | Alta | Alta | Estratégicos | P1 | Driver de NPS y SLA |
| Reliability | Alta | Alta | Estratégicos | P1 | SLA contractual 99.9% |
| Security | Alta | Media | Estratégicos | P1 | Compliance regulatoria |
| Maintainability | Media | Alta | Defensivos | P2 | Equipo creciendo |
| Usability | Alta | Baja | Quick wins | P2 | Mejora con design system |
| Compatibility | Media | Baja | Marginales | P3 | API vigente, sin nuevos consumidores |
| Functional Suitability | Alta | Media | — | Continuo | Cubierto por testing funcional |
| Portability | Baja | Alta | — | P3+ | Cliente comprometido a un cloud por contrato |

## Top 3 atributos (foco del trimestre)

1. **{Atributo 1}** — driver: {NFR clave}
2. **{Atributo 2}** — driver: {NFR clave}
3. **{Atributo 3}** — driver: {NFR clave}

Los demás atributos se mantienen sin regresión, no se invierte en mejorarlos
activamente.

## Trade-offs declarados

- **Performance vs Maintainability:** aceptamos código menos modular en el path crítico (checkout) para garantizar P95.
- **Security vs Usability:** MFA obligatorio degrada el journey de login, aceptado por compliance.

## Próxima revisión

{YYYY-MM-DD} — al cierre del trimestre.
