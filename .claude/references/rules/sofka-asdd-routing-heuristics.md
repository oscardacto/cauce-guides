# ASDD Routing Heuristics

Define los criterios que el orquestador usa en `ORC-001-B` para clasificar un
request con profundidad **TRIVIAL/LIGHT/MEDIUM/FULL**. La tabla histórica de
Tipos 1-6 conserva señales útiles, pero la profundidad autoritativa la resuelve
`.claude/scripts/sofka-asdd-route-request.mjs` con política versionada.

## Taxonomía de requests

### Tipo 1 — Query (consulta sobre el código)
**Señales**: pregunta factual, verbo de lectura, sin intención de cambio.
**Ejemplos**: "¿cómo funciona X?", "¿dónde está Y?", "listame los endpoints", "explicame este módulo"
**Profundidad**: TRIVIAL → lectura directa o `sofka-asdd-explorer` solo si la consulta requiere exploración amplia
**Escalamiento**: no aplica — es solo lectura

### Tipo 2 — Cambio atómico
**Señales**: verbo imperativo concreto + objeto específico + scope de 1 archivo o 1 elemento.
**Ejemplos**: "cambiá el color del botón a amarillo", "renombrá esta variable", "actualizá este texto", "movéme este archivo"
**Profundidad**: LIGHT → developer del dominio
**Escalamiento**: bajo — solo si el cambio afecta más archivos de lo aparente

### Tipo 3 — Bug con detalle
**Señales**: el usuario identifica causa, archivo, línea o componente específico.
**Ejemplos**: "en `AuthService.login()` falla cuando el token expira", "el bug está en línea 42 de `user.controller.ts`"
**Profundidad**: MEDIUM → exploración acotada + developer + verificación
**Escalamiento**: medio — si la causa raíz resulta ser un problema de diseño

### Tipo 4 — Bug por comportamiento (sin detalle)
**Señales**: el usuario describe síntoma o comportamiento inesperado, sin indicar causa ni ubicación.
**Ejemplos**: "a veces el login falla", "el carrito no actualiza el precio", "la exportación queda vacía"
**Profundidad**: MEDIUM; confianza baja escala un nivel a FULL
**Escalamiento**: alto — la causa puede revelar un problema mayor

### Tipo 5 — Feature / HU / Spec
**Señales**: historia de usuario, criterio de aceptación, spec, ticket de Jira, verbo "implementar", "crear", "agregar" con objeto nuevo.
**Ejemplos**: "implementá autenticación con Google", "HU-001: como usuario quiero...", "agregar módulo de reportes"
**Ruta**: FULL siempre
**Escalamiento**: N/A — entra directo a workflow

### Tipo 6 — Solicitud abierta o ambigua
**Señales**: verbo de mejora sin scope definido, refactor general, optimización sin métrica, solicitud que requiere decisión de diseño.
**Ejemplos**: "mejorá el rendimiento", "refactorizá el módulo de auth", "limpiá el código", "optimizá las queries"
**Ruta**: FULL siempre
**Escalamiento**: N/A — entra directo a workflow

---

## Reglas de clasificación

1. Si el request coincide con Tipo 5 → **FULL inmediato**.
2. Si el request menciona artefactos ASDD (spec, ADR, HU, brief, sign-off) → **FULL inmediato**.
3. Si el request toca áreas críticas sin scope acotado (auth, pagos, PII, pipelines, contratos públicos) → **FULL inmediato**.
4. Tipo 1 → TRIVIAL; Tipo 2 → LIGHT; Tipos 3-4 → MEDIUM.
5. Una solicitud abierta comienza en MEDIUM; si su confianza es menor a `routing.confidence_threshold`, escala exactamente un nivel a FULL.
6. ORC-001-C permite escalar nuevamente si aparece complejidad real. Nunca se reduce un dominio sensible.

### Regla de routing de diagramas (FULL → agente correcto)

Cuando el request entra como FULL en fase **Diseñar**, el orquestador aplica esta regla adicional para seleccionar el agente primario correcto:

| Señales en el request | Agente primario | Skill |
|---|---|---|
| "diagrama de infraestructura", "diagrama cloud", "infraestructura AWS/GCP/Azure", "VPC", "EKS/AKS/GKE", "RDS/CloudSQL/Azure SQL", "deployment diagram", "topología cloud", iconografía oficial, regiones/zonas cloud | `sofka-asdd-cloud-architect` | `cloud-architect-design` |
| "diagrama C4" sin contexto de infra, "C4 L1/L2/L3", "component diagram", "secuencia", "ERD", bounded contexts, "componentes de aplicación" | `sofka-asdd-solution-architect` | `architect-component-diagram` |
| "diagrama C4" + señales de infra cloud (proveedor, VPC, nodo de despliegue, etc.) | `sofka-asdd-cloud-architect` | `cloud-architect-design` (C4 Deployment Diagram) |

**Aclaración para requests ambiguos con "diagrama C4":** si el usuario solo dice "quiero un diagrama C4" sin más contexto, el orquestador pregunta: ¿Es para modelar la arquitectura de la aplicación (L1/L2/L3) o para mostrar cómo se despliega en la infraestructura cloud (Deployment Diagram)? La respuesta determina el agente.

---

## Arbitraje ORC-001 ↔ D0-D7 (Smart Data — ADR-002)

El dominio Smart Data tiene su propio routing (`sofka-asdd-data-routing.md`, taxonomía D0-D7). Este routing **no reemplaza** a ORC-001 — se compone con él en dos pasos secuenciales, sin competir.

### Paso 1 — ORC-001 fija la fase ASDD

Toda tarea (Data o no) pasa primero por ORC-001 (Especificar…Documentar). Sin excepción — Smart Data no salta el ciclo ASDD.

### Paso 2 — D0-D7 elige la sub-fase Data DENTRO de la fase ORC ya fijada

Solo si hay señales inequívocas de dominio de datos analíticos (Medallion, lakehouse, Databricks, Auto Loader, Unity Catalog, ETL/ELT analítico, contratos de datos inter-equipo), el orquestador aplica D0-D7 encima de la fase ORC ya elegida. Tabla de correspondencia obligatoria:

| Tipo Data (D0-D7) | Fase ORC-001 correspondiente | Agente primario |
|---|---|---|
| `D1 discover` | Especificar (con soporte de Analizar) | `sofka-asdd-data-architect` + `sofka-asdd-data-governance` |
| `D3 design` | Diseñar | `sofka-asdd-data-architect` |
| `D4 build` | Construir | `sofka-asdd-data-eng-databricks` (solo Azure + Databricks en v1) |
| `D5 governance` (transversal) | cualquier fase ORC | `sofka-asdd-data-governance` |
| `D6 validate` | Verificar | `sofka-asdd-data-architect` + `sofka-asdd-data-governance` |
| `D7 publish` | Verificar (release-gate) o Documentar | `sofka-asdd-data-eng-databricks` |
| `D0` (fuera de dominio Data) | ORC-001 estándar | Agente base según fase |

### Regla de desambiguación software ↔ datos

Cuando el request contiene señales de **ambos** dominios (ej. "migrá la base de datos del CRM a un data warehouse", "el microservicio de reporting escribe a Silver"), el orquestador **NO auto-elige**. Pregunta al usuario UNA sola vez:

> ¿Este request es sobre plataforma de **datos analíticos** (data lake / lakehouse / Medallion / pipeline analítico) o sobre **arquitectura de software transaccional** (aplicación / microservicio / API de dominio) que además usa una base de datos?

La respuesta determina el árbol de routing (D0-D7 vs ORC estándar). Sin respuesta clara → repetir la pregunta; nunca asumir.

### Anuncio ORC-008 con doble routing activo

Cuando D0-D7 se activa, el anuncio de agente incluye ambas coordenadas:

```
→ Orquestador ASDD — Ruta FULL → activando workflow ASDD fase Diseñar + sub-flujo Data D3
→ @sofka-asdd-data-architect (model: opus, skill: sofka-asdd-data-eng-architecture-design) — diseño Medallion + Star schema
```

Un anuncio con solo la fase ORC y sin sub-flujo Data — o al revés — es signo de arbitraje incompleto: revisar.

### Sanity check

Si el orquestador detecta señales D1-D7 pero está en una fase ORC que no aparece en la tabla anterior (ej. señales D4 build pero fase ORC "Especificar"), reporta un mismatch al usuario antes de invocar el agente. Los saltos de fase ORC no los decide D0-D7.

---

## Contrato universal de escalamiento

**Aplica a todos los agentes invocados en ruta LIGHT.**

Al iniciar su trabajo, el agente evalúa si se cumple alguna de estas condiciones:

- El scope real es mayor al aparente (más archivos, más módulos de lo esperado)
- La solución requiere una decisión que debería vivir en un ADR
- No existe un artefacto previo que debería existir (spec, diseño, contrato de API)
- El cambio toca código crítico no mencionado explícitamente en el request
- El cambio rompe un contrato externo (API pública, schema de DB, evento publicado)

Si se cumple alguna condición → el agente **no continúa** — retorna al orquestador con:
```
ESCALAMIENTO REQUERIDO
Motivo: {uno de: scope_mayor | requiere_adr | falta_artefacto | codigo_critico | rompe_contrato}
Detalle: {descripción breve de qué encontró}
Recomendación: {fase ASDD sugerida para retomar — ej. "Diseñar" o "Analizar"}
```

El orquestador re-encola la tarea como FULL desde la fase recomendada y lo comunica al usuario antes de continuar.

---

## Agente por defecto en ruta LIGHT

| Tipo de request | Agente LIGHT |
|---|---|
| Query / consulta | `sofka-asdd-explorer` |
| Cambio atómico | `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend` |
| Bug con detalle | `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend` |
| Bug por comportamiento | `sofka-asdd-explorer` → `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend` si confirma scope acotado |

Para el modificador de tamaño `codebase_size`: ver `sofka-asdd-routing-heuristics-size.md`.
