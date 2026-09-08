# ADR — Un paquete canónico de especificaciones por nodo EDT

- **Estado:** Aceptada para arquitectura objetivo; implementación pendiente
- **Fecha:** 2026-07-27
- **Release objetivo:** `4.0.0`
- **Decisor:** Maintainer
- **Relacionados:** ADR-004, ADR-006, ADR-010, SPEC-001
- **Supersede parcialmente:** ADR-004 §1.2/§2 sobre layout plano y autoría por
  Producto; ADR-006 §2 y §9; ADR-010 §2.3 y su handoff pendiente

## 1. Contexto

ADR-004 separó una fuente funcional y slices técnicos, una decisión que se
conserva. ADR-006 agregó una ruta BA standalone que coexistía con Producto y
dejó pendiente el handoff al equipo. ADR-010 consolidó los agentes BA y declaró
Layout A plano, pero la referencia BA distribuida actualmente declara carpetas
por nodo. El resultado tiene especialización útil, pero también dos rutas de
autoría, dos layouts y una transición sin contrato.

Separar roles sigue siendo necesario: negocio, arquitectura, seguridad, QA y
desarrollo responden preguntas diferentes. Lo innecesario es que cada flujo
cree su propia representación del mismo requisito.

## 2. Decisión

### 2.1 Unidad canónica

Cada nodo hoja de una EDT tiene un único paquete:

```text
docs/specs/{initiative-slug}/nodes/{edt-code}-{node-slug}/
```

Ejemplo:

```text
docs/specs/portal-comercial/nodes/1.1.1-gestion-clientes/
```

El código EDT conserva puntos; un único guion separa código y slug. Los archivos
internos tienen nombres semánticos estables y no repiten código, slug, run ni
rol.

### 2.2 Una fuente por concern

| Concern | Fuente canónica | Owner |
|---|---|---|
| Alcance y comportamiento funcional | `functional/spec.md` | BA Specification Lead |
| Requisitos atómicos, RN, HU y AC | `functional/requirements.md` | BA Specification Lead |
| Auditoría funcional | `functional/audit.md` | BA Specification Auditor |
| Validación cliente | `functional/client-validation.md` | BA Specification Lead + stakeholder |
| Decisiones de dominio | `decisions.md` | owner de la decisión, registro compartido |
| Diseño por dominio técnico | `technical/{domain}.md` | agente técnico del dominio |
| Plan de implementación | `implementation/plan.md` | Tech Lead |
| Evidencia de construcción | `implementation/evidence/` | implementador/verificador |
| Estado y aplicabilidad | `index.md` | capability de índice, no los productores |

Una referencia no es una copia. Un archivo técnico enlaza RN/HU/AC por ID y no
reformula su significado. Si descubre un cambio funcional, abre un CR y espera
al owner funcional.

### 2.3 Separación de convenciones

- **ART-001:** evidencia inmutable de un run:
  `{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`.
- **SPEC-001:** documentos vivos ubicados por identidad de iniciativa y nodo.

El manifest del run registra enlaces a paquetes SPEC-001 y snapshots de gates.
El estado vivo no participa en el hash de un plan previamente aprobado.

### 2.4 Roles, no flujos competidores

El rótulo “standalone” describe cómo entra el trabajo, no una arquitectura
documental distinta. Un Analista Funcional puede iniciar el paquete y un equipo
adoptarlo posteriormente en el mismo path. La adopción completa `technical/` e
`implementation/` según aplicabilidad; no copia ni convierte `functional/`.

### 2.5 Product Strategy

Se conserva una capacidad/agente independiente y limitado, tentativamente
`asdd-product-strategy`, dueño de:

- visión y outcomes;
- valor y priorización;
- roadmap y OKRs;
- métricas de producto.

No puede escribir o aprobar specs funcionales, auditarlas, diseñar soluciones
técnicas ni decidir routing. Sus outputs son inputs estratégicos referenciables.

### 2.6 Retiro de `asdd-producto`

El agente paraguas se retira después de redistribuir sus siete capabilities y
actualizar todos sus consumidores. No se elimina primero porque eso rompería
routing, evaluaciones, templates y aliases sin destino.

## 3. Invariantes

1. `initiative-slug + edt-code` identifica un solo nodo canónico.
2. Cada concern tiene un solo owner de escritura.
3. `index.md` no contiene el texto normativo de las specs.
4. Los archivos funcionales nunca incluyen diseño de implementación.
5. Los archivos técnicos nunca redefinen intención o aceptación funcional.
6. Product Strategy informa prioridad; no adquiere autoridad documental.
7. Evidencia histórica no se mueve ni reescribe.
8. Un cambio aprobado se registra en `decisions.md` y actualiza solo los
   concerns afectados.

## 4. Alternativas descartadas

### Mantener dos layouts y crear un handoff

Descartada porque conserva la duplicidad conceptual. La automatización solo
haría más rápida la creación de una segunda fuente.

### Fusionar BA dentro de Producto

Descartada porque el agente paraguas mezcla estrategia, análisis, requisitos y
planeación técnica. Reduce nombres, pero no separa autoridad.

### Un super-documento

Descartada porque genera contención de escritura, lectura innecesaria y ownership
ambiguo. El paquete aporta cohesión sin mezclar concerns.

### Una spec funcional por developer

Descartada: un developer debe implementar una spec, no crear otra. Puede
proponer un CR o completar su archivo técnico.

## 5. Consecuencias

### Positivas

- desaparece el handoff entre layouts;
- se mantiene la especialización por rol sin duplicar fuente;
- el contexto puede cargarse por concern;
- la trazabilidad EDT es visible en el path;
- los developers reciben contratos estables y comparables;
- plan aprobado y operación viva quedan separados.

### Costos y riesgos

- migración breaking de paths, agentes, capabilities y validadores;
- periodo temporal con readers duales;
- necesidad de detectar paquetes legacy ambiguos antes de migrar;
- cambios coordinados en distribución CLI, documentación y evals;
- un paquete compartido requiere reglas de ownership y merge bien aplicadas.

## 6. Impacto sobre decisiones anteriores

| Decisión anterior | Tratamiento |
|---|---|
| Separar spec funcional de áreas técnicas | Se conserva y se expresa por carpetas |
| INDEX como entrada y progreso | Se conserva como `index.md`, sin contenido normativo |
| ART-001 universal bajo `docs/**` | Se limita a evidencia de run; SPEC-001 gobierna specs vivas |
| BA standalone coexistente con Producto | Se reemplaza por un modo de entrada al mismo paquete |
| Layout A plano | Se reemplaza para specs vivas; sigue válido para evidencia ART-001 |
| Layout BA por nodo | Se reemplaza su naming interno por archivos semánticos SPEC-001 |
| Perfiles como preferencia, no autoridad | Se conserva |
| Security transversal | Se conserva; `technical/security.md` aplica por señal |

## 7. Condición de adopción

Esta ADR pasa de arquitectura objetivo a implementada únicamente cuando:

1. SPEC-001 tiene schema y validador ejecutables;
2. producers y consumers escriben/leen el paquete;
3. capabilities de Producto están redistribuidas;
4. compatibilidad 3.x y diagnóstico de migración están probados;
5. catálogo, CLI, lock, routing, tests y documentación coinciden;
6. el maintainer aprueba el gate de release `4.0.0`.
