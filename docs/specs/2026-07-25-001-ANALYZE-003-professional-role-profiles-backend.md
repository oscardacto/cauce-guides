# Spec Backend/Runtime — Perfiles profesionales de enfoque ASDD

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Run ID | `2026-07-25-001` |
| Rol destino | Arquitectura + backend/tooling |
| Estado | BORRADOR PARA AUDITORÍA Y DISEÑO |
| Prerrequisito | brief + spec funcional + auditoría estructural |
| Dependencias | spec-seguridad para invariantes |
| Output esperado | catálogo, estado local, resolver y routing por perfil |

> Ver `2026-07-25-001-ANALYZE-004-professional-role-profiles-seguridad.md`
> para el contrato de seguridad. Este documento no redefine autoridad.

## 1. Fronteras técnicas

La solución se divide en cinco componentes:

```text
Capability Catalog
      ↓
Profile Registry
      ↓
Local Focus State
      ↓
Profile-aware Resolver/Router
      ↓
Existing Capability Loader + Authorization Runtime
```

El catálogo y los perfiles son configuración versionada. La selección del
trabajador es estado local no versionado. El loader y la autorización existentes
siguen siendo la única vía para entregar y ejecutar capabilities.

## 2. Auditoría estructural read-only

Antes de diseñar schema o archivos productivos se debe construir un inventario
reproducible de:

- `.claude/agents/`;
- `.claude/skills/`;
- `.claude/commands/`;
- `.claude/rules/` y `.claude/references/`;
- workflows y phase specs;
- templates;
- configuraciones `.sofka-asdd/`;
- validadores y artefactos documentales.

La auditoría:

1. enumera rutas sin ejecutar contenido;
2. parsea frontmatter/configuración como datos;
3. calcula tamaño y estrategia actual de carga;
4. propone dominios con evidencia;
5. conserva `unclassified` cuando la evidencia no alcanza;
6. conserva resultados candidatos solo en memoria o `/tmp`;
7. presenta el mapa y decisiones pendientes al usuario;
8. demuestra con snapshots before/after que no escribió en el repositorio;
9. no escribe runtime, routing, perfil local, specs ni reportes.

La publicación del dataset procesable y sus reportes pertenece a
`SPIKE-1P`, un slice posterior que requiere aprobación explícita sobre las
salidas de la inspección `SPIKE-1R`.

## 3. Esquema mínimo del catálogo

El formato exacto se decidirá en Design. Debe representar al menos:

```json
{
  "schema_version": 1,
  "capabilities": [
    {
      "id": "sofka-asdd-example",
      "kind": "agent|skill|command|rule|reference|workflow|template|artifact-contract|validator|config|loader",
      "primary_domain": "data",
      "secondary_domains": ["quality"],
      "roles": ["data-analyst"],
      "activities": ["analyze", "validate"],
      "loading": "always|conditional|on-demand|not-applicable",
      "load_trigger": "session-start|prompt-signal|explicit|dependency|never",
      "cross_domain": true,
      "context_cost": {
        "unit": "words",
        "measured": 0
      },
      "entrypoints": [".claude/scripts/example.mjs"],
      "requires": ["capability-id"],
      "loads": ["skill-id"],
      "invokes": ["command-id"],
      "produces": ["artifact-contract-id"],
      "consumes": ["template-id"],
      "validated_by": ["validator-id"],
      "evidence": ["relative/path"],
      "provenance": {
        "source_of_truth": "relative/path",
        "sha256": "hex-or-null"
      },
      "status": "classified|unclassified|deprecated"
    }
  ]
}
```

### Reglas del catálogo

- IDs únicos y canónicos.
- Paths relativos dentro del proyecto.
- Dominios y actividades referencian enums versionados.
- La ontología distingue dominio, rol/persona, actividad, capability y artefacto.
- Toda clasificación tiene evidencia.
- `unclassified` es válido y visible.
- Ningún perfil incorpora contenido por copia.
- Aliases ambiguos fallan.
- Las métricas distinguen medido, estimado y no observable.
- Las relaciones permiten derivar el mapa solicitado sin afirmaciones manuales.
- Configs, loaders y contratos de artefacto también se inventariarían.

## 4. Registro de perfiles

Un perfil referencia tags/capabilities del catálogo:

```json
{
  "id": "data",
  "label": "Data",
  "primary_domains": ["data"],
  "preferred_activities": ["data-analysis", "data-quality"],
  "cross_domain_policy": "on-demand",
  "startup_budget": {
    "unit": "words",
    "max": 500
  },
  "status": "pilot"
}
```

El registro no debe convertirse en una lista exhaustiva de agentes. El resolver
combina tags, intención y disponibilidad real.

## 5. Estado local del perfil

### Requisitos

- no versionado;
- escritura atómica;
- schema y versionado;
- valor `auto`;
- consulta/reset;
- no contiene prompts, credenciales ni autoridad;
- precedence explícita entre valor local, default organizacional y `auto`;
- identidad de usuario + workspace cuando exista persistencia duradera;
- aislamiento demostrable para dos usuarios sobre el mismo checkout;
- un estado corrupto produce diagnóstico y recuperación segura.

El path y mecanismo se deciden en Design después de comparar:

1. preferencia de usuario fuera del repo, namespaced por workspace;
2. configuración local de Claude por usuario + workspace;
3. estado únicamente por sesión;
4. archivo gitignored dentro del proyecto solo si es user-keyed, privado y
   seguro para múltiples usuarios del sistema operativo.

Precedencia mínima a evaluar:

```text
override de sesión
  > preferencia usuario + workspace
  > default organizacional
  > auto
```

No se elige una alternativa en Analyze.

## 6. SessionStart y tarjeta compacta

SessionStart resuelve:

```js
{
  profile_id,
  label,
  primary_domains,
  preferred_activities,
  cross_domain_available: true,
  profile_registry_version
}
```

La inyección:

- no incluye SKILL.md;
- no enumera todos los agentes;
- no carga catálogos QA/Data/DevOps completos;
- no excede el budget aprobado;
- reporta `auto` o error de estado;
- reutiliza el dispatcher/context runtime existente.

## 7. Router ponderado por perfil

El router recibe:

```js
{
  prompt_signals,
  explicit_intent,
  active_profile,
  complexity,
  risk,
  available_capabilities
}
```

Precedencia funcional:

```text
seguridad/política obligatoria
  > intención explícita y dominio requerido
  > complejidad/riesgo
  > perfil activo
  > default compatible
```

El peso exacto no se fija en esta spec. Debe calibrarse con escenarios positivos,
negativos y cross-domain. Empates no se resuelven por orden accidental.

## 8. Resolución cross-domain

Para incorporar otra área:

1. registrar señal que justifica el crossover;
2. resolver capability instalada;
3. incluirla en el plan/autorización normal cuando aplica;
4. cargarla bajo demanda;
5. emitir explicación compacta;
6. no mutar la preferencia local;
7. aislar su contenido en el subagente/tarea cuando sea posible;
8. no reinyectarlo, propagarlo ni persistirlo en tareas posteriores.

No se promete borrar tokens ya inyectados de una ventana LLM. “Descargar” una
capability significa cerrar su frontera aislada y evitar reutilización futura,
no alterar retroactivamente el contexto.

El crossover no introduce un nuevo mecanismo de permisos.

## 9. Integración con runtime existente

Debe reutilizar:

- carga condicional de rules;
- capability loading;
- thin coordinators;
- proportional router;
- subagent budgets;
- plan/operation authorization;
- artifact runtime y consumer distribution.

Cambios incompatibles requieren ADR/enmienda y migración. El modo `auto` debe
permitir rollback independiente de los perfiles.

## 10. Validadores requeridos

- schema del catálogo y profiles;
- IDs, enums y paths válidos;
- cobertura: classified + unclassified = inventario total;
- referencias a capabilities instaladas;
- perfiles sin duplicación de contenido;
- tarjeta dentro del budget;
- estado local nunca trackeado;
- no eager loading añadido por un perfil;
- distribución completa a consumidor;
- compatibilidad del modo `auto`;
- ausencia de reglas especializadas huérfanas.

## 11. Observabilidad

Medir por escenario:

- perfil activo;
- dominio detectado;
- capability elegida;
- crossover y motivo;
- agentes/turnos;
- palabras/tokens iniciales;
- tiempo de routing local;
- permisos/challenges solicitados;
- resultado y reason codes.

No persistir prompt completo, secretos ni argumentos sensibles.

## 12. Alternativas a evaluar en Design

| ID | Tema | Alternativas |
|---|---|---|
| ALT-001 | Catálogo | archivo central, generación desde frontmatter, modelo híbrido |
| ALT-002 | Persistencia | workspace local, user-global, session-only |
| ALT-003 | Routing | boost fijo, scoring configurable, reglas por señales |
| ALT-004 | Tarjeta | SessionStart, resolver lazy, combinación |
| ALT-005 | Taxonomía | dominios planos, jerarquía dominio/rol/actividad |
| ALT-006 | Security | transversal únicamente o transversal + perfil |
| ALT-007 | Contexto temporal | subagente aislado, frontera por tarea, no reinyección |

## 13. Criterios de completitud de Analyze

- [ ] Auditoría procesable publicada.
- [ ] Esquema derivado de datos reales.
- [ ] Estrategia actual de carga medida.
- [ ] Alternativas y trade-offs listos para Design.
- [ ] Compatibilidad/rollback definidos.
- [ ] Sin cambios productivos de routing o SessionStart.
