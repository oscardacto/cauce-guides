# DA_ADE44 — Arquitectura TO-BE
**Solución:** {nombre-solucion} | **Versión:** {version} | **Fecha:** {YYYY-MM-DD}
**Trazabilidad:** Responde a DA_ADE35 QAs: {lista de QAs que resuelve}

## 1. Modelo de Contexto C1
```mermaid
C4Context
  title Modelo de Contexto C1 — {nombre-solucion} TO-BE
  Person(usuario, "{Actor Principal}", "{descripción}")
  System(sbc, "{Sistema Bajo Consideración}", "{responsabilidad futura}")
  System_Ext(ext1, "{Sistema Externo}", "{rol}")
  Rel(usuario, sbc, "{acción}", "{protocolo}")
  Rel(sbc, ext1, "{integración nueva/mejorada}", "{protocolo}")
```

## 2. Modelo de Contenedores C2
```mermaid
C4Container
  title Modelo de Contenedores C2 — {nombre-solucion} TO-BE
  Person(usuario, "{Actor}")
  Container(web, "{Frontend}", "{tecnología}", "{responsabilidad}")
  Container(api, "{API Gateway}", "{tecnología}", "{responsabilidad}")
  Container(svc1, "{Microservicio 1}", "{tecnología}", "{responsabilidad}")
  ContainerDb(db, "{Base de Datos}", "{tecnología}", "{datos}")
  Container(cache, "{Cache}", "Redis", "desacoplar lecturas críticas")
  Rel(usuario, web, "usa", "HTTPS")
  Rel(web, api, "llama", "REST/JSON")
  Rel(api, svc1, "delega", "gRPC/REST")
  Rel(svc1, cache, "lee", "Redis Protocol")
  Rel(svc1, db, "escribe", "SQL/TCP")
```

## 3. Modelo de Componentes C3 (Contenedor crítico)
> Contenedor: {nombre del contenedor más crítico}

```mermaid
C4Component
  title Modelo de Componentes C3 — {nombre-contenedor}
  Component(comp1, "{Componente 1}", "{tecnología}", "{responsabilidad}")
  Component(comp2, "{Componente 2}", "{tecnología}", "{responsabilidad}")
  Rel(comp1, comp2, "{relación}", "{protocolo}")
```

## 4. Cómo resuelve los Gaps AS-IS
| GAP AS-IS | Solución TO-BE | QA que cumple |
|---|---|---|
| GAP-01 | {patrón o componente que lo resuelve} | QA-01 |

## 5. Roadmap de Implementación
| Fase | Capacidades a construir | Hito | Fecha estimada |
|---|---|---|---|
| Fase 1 — MVP | {capacidades core} | {hito medible} | {YYYY-MM} |
| Fase 2 — Escala | {mejoras de rendimiento/disponibilidad} | {hito} | {YYYY-MM} |
| Fase 3 — Optimización | {capacidades avanzadas} | {hito} | {YYYY-MM} |

## Control de Cambios
| Versión | Descripción | Autor | Fecha |
|---|---|---|---|
| 0.1 | Versión inicial | {autor} | {fecha} |
