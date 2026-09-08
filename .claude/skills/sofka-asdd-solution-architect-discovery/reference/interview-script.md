# Guion de entrevista de discovery

Guion estructurado para una sesión de 60-90 minutos con el cliente. Hacerlo
con el equipo técnico líder (CTO, Tech Lead, Arquitecto del cliente).

## Bloque 1 — Sistema y propósito (10 min)

1. ¿Qué problema resuelve el sistema? ¿Para qué tipo de usuario?
2. ¿En qué fase está? (idea, MVP, producción estable, escalando, modernizando)
3. ¿Qué métrica de negocio se está optimizando? (revenue, retention, NPS, costo operativo)
4. ¿Qué pasa si el sistema no existe o se cae 1 hora? (impacto)

## Bloque 2 — Stack y arquitectura actual (15 min)

5. ¿Lenguajes y frameworks principales? (back, front, mobile)
6. ¿Bases de datos y motores? (relacional, document, cache, search)
7. ¿Cloud / on-prem / híbrido? ¿Cuál proveedor cloud?
8. ¿Estilo arquitectónico actual? (monolito, microservicios, serverless, EDA)
9. ¿CI/CD? ¿Cuántos deploys por día/semana?
10. ¿Observabilidad? (logs centralizados, métricas, trazas, APM)
11. ¿Hay diagrama de arquitectura actualizado? (pedir copia)

## Bloque 3 — Equipo (10 min)

12. ¿Cuánta gente trabaja en el sistema? (devs, QA, ops, data, design)
13. ¿Cómo está organizado? (squads por feature, por capa, monolítico)
14. ¿Senior/mid/junior ratio?
15. ¿Hay roles específicos: SRE, DBA, Security, Architect, Platform?
16. ¿Quién hace ops fuera de horario? ¿Hay rotación on-call?
17. ¿Frecuencia de incidentes en últimos 3 meses?

## Bloque 4 — Restricciones (15 min)

18. ¿Restricciones regulatorias? (PCI-DSS, HIPAA, SOX, ISO 27001, GDPR, locales)
19. ¿Auditorías periódicas? ¿Cuándo es la próxima?
20. ¿SLAs comprometidos con clientes finales o internos? (uptime, latencia, RPO/RTO)
21. ¿Restricciones de stack? ("solo .NET", "no Python en prod")
22. ¿Restricciones de proveedor? ("AWS sí, Azure no", "no SaaS")
23. ¿Presupuesto estimado mensual de cloud / licencias?
24. ¿Deadlines críticos en los próximos 6 meses?

## Bloque 5 — Deuda técnica (10 min)

25. ¿Qué te quita el sueño técnicamente? (top 3)
26. ¿Hay migraciones en curso? ¿En qué % están?
27. ¿Componentes legacy que no se pueden tocar y por qué?
28. ¿Versiones de runtime/framework atrasadas? ¿Política de upgrade?
29. ¿Tests automáticos? ¿Cobertura aproximada?

## Bloque 6 — Stakeholders y gobernanza (10 min)

30. ¿Quién aprueba decisiones arquitectónicas? (CTO, Architect Council, equipo solo)
31. ¿Hay arquitectura corporativa que limita lo que el equipo puede decidir?
32. ¿Cómo se documentan decisiones hoy? (ADRs, wiki, ninguno)
33. ¿Qué fuentes externas influyen? (proveedores, consultoras, lineamientos del grupo)

## Bloque 7 — Cierre (5 min)

34. ¿Qué esperás del COE Sofka en este engagement? (qué éxito significa)
35. ¿Qué temas son sensibles políticamente y que conviene tratar con cuidado?
36. ¿A quién más debería entrevistar antes de cerrar el discovery?

## Después de la entrevista

- Volcar respuestas a `templates/context-card.md` dentro de las 24h.
- Marcar gaps (preguntas sin respuesta clara) explícitamente.
- Compartir el draft con el entrevistado para validación.
