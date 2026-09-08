# Migración de capabilities de `sofka-asdd-producto`

## 1. Regla de retiro

`sofka-asdd-producto` no se elimina como primer paso. Se retira cuando cada una
de sus siete capabilities tenga owner, contrato de output, routing, pruebas y
compatibilidad definidos. Hasta entonces permanece como alias deprecado y no
como writer alternativo.

## 2. Matriz de redistribución

| Capability actual | Destino v4 | Decisión de ownership |
|---|---|---|
| `sofka-asdd-producto-pm` | `sofka-asdd-product-strategy` | Se conserva estrategia como agente limitado: visión, valor, priorización, roadmap, OKRs y métricas |
| `sofka-asdd-producto-ba` | BA Functional Architect + BA Specification Lead | Contexto/EDT al Architect; procesos, reglas, gaps y requisitos al Lead |
| `sofka-asdd-producto-funcional` | BA Specification Lead | Único writer de `functional/spec.md` y `functional/requirements.md` |
| `sofka-asdd-producto-po` | Product Strategy + BA Specification Lead + QA | Prioridad en Strategy; requisitos/HU/AC en BA; verificación ejecutable en QA |
| `sofka-asdd-producto-new-hu` | `sofka-asdd-ba-user-story` | Una sola capability genera `functional/user-stories.md` desde requisitos aprobados |
| `sofka-asdd-producto-story-planner` | Tech Lead, con input de Solution Architect | Tech Lead escribe `implementation/plan.md`; Architecture define decisiones cross-domain |
| `sofka-asdd-producto-templates` | capability neutral `sofka-asdd-spec-package-templates` | Templates de SPEC-001 sin pertenecer a un rol de Producto |

## 3. Product Strategy: límite formal

### Puede

- producir visión, outcomes y métricas;
- ordenar oportunidades y backlog por valor;
- mantener roadmap y OKRs;
- aportar restricciones estratégicas como input enlazado.

### No puede

- escribir `functional/spec.md`, `requirements.md` o historias;
- auditar o aprobar el Functional DOR;
- escribir `technical/` o `implementation/plan.md`;
- seleccionar agentes o ampliar permisos;
- resolver gaps funcionales en nombre del stakeholder.

Ejemplo: Strategy puede indicar “reducir abandono de onboarding del 35% al
20%”. BA convierte el outcome en comportamiento y aceptación. Architecture y
developers deciden cómo implementarlo. Strategy no redacta la spec.

## 4. Descomposición de `producto-po`

La capability PO actual mezcla tres authorities:

1. **Prioridad/valor:** Product Strategy.
2. **Definición funcional y backlog:** BA Specification Lead.
3. **Comprobación de aceptación:** QA valida; el stakeholder acepta negocio.

La separación evita crear un nuevo paraguas con otro nombre. Si un Product
Owner humano desempeña las tres actividades, opera mediante las capabilities
correspondientes y conserva sus límites de escritura.

## 5. Compatibilidad de routing

Durante la migración:

```text
producto-pm            → product-strategy
producto-ba            → ba-functional-architect | ba-specification-lead
producto-funcional     → ba-specification-lead
producto-po            → strategy | ba-specification-lead | qa, según intención
producto-new-hu        → ba-user-story
producto-story-planner → tech-lead
producto-templates     → spec-package-templates
```

Un alias debe:

- emitir advertencia deprecada con destino exacto;
- resolver a un solo writer;
- no crear archivos legacy;
- registrar telemetría sin contenido sensible;
- desaparecer en la siguiente major posterior a la ventana acordada.

Cuando una intención antigua es ambigua, el router se detiene. No selecciona
`sofka-asdd-producto` genérico.

## 6. Superficies impactadas antes del retiro

- `.claude/agents/sofka-asdd-producto.md`;
- siete directorios `.claude/skills/sofka-asdd-producto-*`;
- capability/rule/coordinator loading manifests;
- routing de Specify, Analyze, Design y Verify;
- templates de brief/spec;
- comandos `/sofka-asdd:*`;
- evals y prompts de Producto;
- `CLAUDE.md`, changelog, lock y contrato CLI;
- documentación que atribuye specs al paraguas;
- paquetes distribuidos a consumidores.

## 7. Gate de eliminación

El archivo del agente y sus capabilities solo pueden eliminarse cuando:

1. el inventario de referencias legacy sea cero o esté cubierto por aliases;
2. todas las rutas intentadas produzcan SPEC-001;
3. no haya capability huérfana en manifests;
4. los evals funcionales, estratégicos y técnicos pasen;
5. el CLI instale/actualice sin referencias colgantes;
6. exista rollback probado;
7. el maintainer apruebe explícitamente la eliminación.
