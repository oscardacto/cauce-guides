# CR — Paquete unificado de especificaciones por nodo EDT

| Campo | Valor |
|---|---|
| Run | `2026-07-25-001` |
| Fase | Analyze |
| Estado | Aprobado para diseño documental; implementación pendiente |
| Cambio objetivo | Arquitectura de especificaciones v4 |
| Release objetivo | `4.0.0` |
| Solicitante | Maintainer |
| Evidencia origen | ADR-004, ADR-006, ADR-010 y análisis de perfiles profesionales |

## 1. Motivo

La incorporación del flujo BA/Funcional dejó tres bloqueantes estructurales:

1. **Autoridad funcional duplicada.** `sofka-asdd-producto` y los agentes
   `sofka-asdd-ba-*` pueden producir requisitos, historias y especificaciones
   funcionales con fronteras de ownership difíciles de distinguir.
2. **Dos layouts activos para el mismo concepto.** El ciclo ASDD documenta
   artefactos planos ART-001 y la referencia BA viva documenta carpetas por
   nodo. Esto obliga a decidir cuál adoptar y cómo hacer handoff entre ambos.
3. **Plan y estado operativo mezclados.** El INDEX congelado del run contiene
   contrato sustantivo y estado mutable. Editar el progreso altera el hash del
   plan que el usuario aprobó.

La causa común no es que existan roles distintos, sino que esos roles pueden
crear representaciones competidoras del mismo concern.

## 2. Cambio solicitado

Adoptar un único **paquete canónico por nodo EDT**:

```text
docs/specs/{initiative-slug}/nodes/{edt-code}-{node-slug}/
```

El paquete separa concerns mediante rutas semánticas:

- `functional/`: qué necesita el negocio y cómo se valida funcionalmente;
- `technical/`: cómo los dominios técnicos satisfacen el contrato funcional;
- `implementation/`: plan y evidencia de construcción;
- `index.md`: navegación, aplicabilidad y estado vivo;
- `decisions.md`: decisiones y change control append-only.

ART-001 continúa siendo obligatorio para evidencia inmutable de ejecución. El
nuevo contrato `SPEC-001` gobierna las especificaciones vivas. Un artefacto de
run puede **referenciar** un archivo SPEC-001, pero no convertirse en una copia
activa de este.

## 3. Alcance

### Incluido

- contrato de path, naming, ownership, lifecycle y unicidad;
- retiro planificado del agente paraguas `sofka-asdd-producto`;
- redistribución explícita de sus siete capabilities;
- conservación de Product Strategy como capacidad independiente y limitada;
- impacto sobre routing, plantillas, guards, manifests, comandos y perfiles;
- estrategia de compatibilidad para consumidores 3.x;
- separación entre plan aprobado y ledger operativo.

### Excluido de este slice

- modificar agentes, skills, hooks, comandos o manifests;
- mover o reescribir specs históricas;
- migrar automáticamente proyectos consumidores;
- crear el tag o publicar la release `4.0.0`;
- cerrar SPIKE-3 o implementar perfiles profesionales.

## 4. Diferencia exacta contra el contrato vigente

| Concern | Contrato vigente | Contrato objetivo |
|---|---|---|
| Unidad canónica | archivos por run/área y layout BA alternativo | un paquete por nodo EDT |
| Naming vivo | ART-001 plano o naming BA por nodo | SPEC-001 path-based |
| Fuente funcional | Producto o BA según ruta | agentes BA/Funcional, una sola fuente |
| Estrategia de producto | sub-rol dentro de Producto | capacidad independiente y limitada |
| Diseño técnico | slices planos por área | archivos condicionales en `technical/` |
| Implementación | INDEX y planes distribuidos | `implementation/plan.md` + evidencia |
| Handoff | standalone → equipo pendiente | adopción del mismo paquete, sin conversión |
| Hash de aprobación | puede incluir campos mutables | snapshot inmutable separado del estado vivo |

## 5. Criterios de aceptación

1. Para una iniciativa y código EDT existe como máximo un paquete canónico.
2. Ningún agente distinto del owner funcional puede crear otra spec funcional.
3. Cada concern normativo tiene una ruta y un owner únicos.
4. Un developer consume `functional/` y escribe únicamente su concern técnico
   o evidencia de implementación; nunca recrea requisitos funcionales.
5. Product Strategy no escribe, audita ni aprueba archivos funcionales o
   técnicos.
6. ART-001 y SPEC-001 pueden coexistir sin duplicar estado ni contenido activo.
7. Los proyectos 3.x reciben diagnóstico y ruta de migración antes de retirar
   aliases.
8. El template, sus paquetes distribuidos y sus pruebas quedan consistentes.

## 6. Riesgo, compatibilidad y rollback

El cambio es breaking porque altera IDs de agentes/capabilities, rutas públicas,
plantillas, routing y expectativas de consumidores. Por SemVer, la release
objetivo es `4.0.0`.

El rollback de implementación consiste en revertir el lote v4 antes de publicar
la release. Después de publicar, no se reescribe historia ni se reutiliza el tag:
se corrige con una nueva versión. Durante la ventana de migración, los readers
pueden reconocer 3.x y SPEC-001; los writers solo generan SPEC-001 para evitar
divergencia.

## 7. Aprobación y trazabilidad

El maintainer aprobó:

- conservar Product Strategy como capacidad independiente y limitada;
- ejecutar el rediseño como versión mayor;
- proceder con este slice documental.

Esta aprobación autoriza formalizar el diseño. No autoriza implementación,
commit, push, MR ni release.
