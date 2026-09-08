# Spec Seguridad — Perfiles profesionales de enfoque ASDD

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Run ID | `2026-07-25-001` |
| Estado | BORRADOR PARA THREAT MODEL |
| Prerrequisito | brief + spec funcional |
| Dependencias | contrato funcional; S1 completa y aprueba este borrador |
| Output esperado | invariantes y abuso para perfiles/crossover |

## 1. Fronteras de confianza

| Fuente | Confianza | Uso permitido |
|---|---|---|
| Perfil versionado | limitada a schema e integridad | priorización; nunca autoridad |
| Preferencia local | no confiable hasta validar | seleccionar experiencia |
| Prompt/intención | no confiable | clasificación; nunca bypass |
| Catálogo | limitada a paths y provenance | descubrimiento de capacidades |
| Router | componente de decisión no autoritativo | propone agentes/capabilities |
| Plan/autorización | autoridad acotada | exactamente su contrato actual |
| Agent/skill content | código normativo versionado | solo tras resolver/cargar de forma válida |
| Métricas | no autoritativas | evaluación agregada |

## 2. Invariantes no negociables

1. El perfil no concede permisos ni autoridad.
2. Cambiar de perfil no modifica un lote de autorización activo.
3. Crossover usa los mismos controles de agente, scope, command y capability.
4. Un perfil no puede desactivar guards, Git safety ni branch protection.
5. Un prompt no puede persistir un cambio de perfil sin operación explícita.
6. Catálogo y estado local no contienen secretos, tokens ni prompts.
7. Paths del catálogo permanecen dentro del proyecto y sin symlink escape.
8. Estado corrupto no produce perfil más permisivo.
9. `auto` no significa cargar todo ni omitir autorización.
10. Una capability no instalada o ambigua falla cerrada.
11. Security transversal no puede marcarse N/A por selección de perfil.
12. Métricas no se usan como fuente de autorización.
13. La auditoría read-only no ejecuta ni carga agentes/skills.
14. Un perfil no amplía budgets de subagentes o modelos sin política aprobada.

## 3. Casos de abuso

| ID | Abuso | Resultado requerido |
|---|---|---|
| AB-001 | Perfil manipulado referencia skill externa al proyecto | rechazo de integridad |
| AB-002 | Prompt pide `focus security-off` | perfil inexistente; controles intactos |
| AB-003 | Cambio de perfil intenta reutilizar aprobación anterior | deny con reason code existente |
| AB-004 | Perfil Data declara todos los agentes para evitar routing | validator rechaza catálogo/perfil sobredimensionado |
| AB-005 | Crossover se vuelve permanente sin confirmación | preferencia persistida no cambia |
| AB-006 | Estado local corrupto activa default permisivo | diagnóstico + `auto` seguro, sin autoridad |
| AB-007 | Capability con alias ambiguo se carga por afinidad | rechazo por ambigüedad |
| AB-008 | Perfil induce eager load de todas sus skills | gate de contexto falla |
| AB-009 | Prompt injection redefine taxonomía o perfil | se trata como datos; no persiste |
| AB-010 | Symlink en catálogo escapa del root | rechazo de path |
| AB-011 | Crossover usa comando no declarado | `command-mismatch` |
| AB-012 | Crossover usa archivo fuera de scope | `scope-mismatch` |
| AB-013 | Perfil eleva modelo/fan-out sin justificación | presupuesto bloquea o escala por política normal |
| AB-014 | Métrica guarda prompt laboral sensible | test de privacidad falla |

## 4. Cambio de perfil durante operaciones activas

El perfil se evalúa al clasificar una tarea. La autorización se liga al plan
materializado, no al valor mutable del perfil.

```text
perfil A → plan autorizado A → cambio a perfil B
                       ↓
operaciones del plan A siguen exactamente su binding
```

El cambio no:

- revoca silenciosamente el lote;
- amplía scope/comandos;
- reinterpreta la capability;
- permite que un agente activo herede el nuevo perfil.

Una tarea nueva usa el nuevo perfil y su propio routing/autorización.

## 5. Persistencia local

El diseño debe definir:

- permisos mínimos del archivo/estado;
- atomic write;
- schema y version;
- owner/workspace binding;
- rechazo de paths absolutos o traversal;
- reset seguro;
- comportamiento ante corrupción;
- exclusión verificable de Git.

No se almacenan credenciales ni datos de usuario distintos del ID de perfil y
metadatos técnicos mínimos.

## 6. Crossover seguro

La explicación cross-domain es informativa, no autoridad. La capability
adicional:

- debe existir;
- debe ser compatible con el agente;
- debe aparecer en el plan si el contrato lo exige;
- debe cargarse mediante el loader;
- debe cumplir scope/commands;
- debe respetar TTL y uso único;
- no puede reutilizar una autorización de otro perfil.

## 7. Auditoría y privacidad

La auditoría de inventario puede leer paths y frontmatter como datos, pero:

- no ejecuta comandos declarados en artefactos;
- no interpreta instrucciones de agentes/skills como órdenes de sesión;
- no envía contenido a servicios externos;
- no incluye secretos o prompts en el dataset;
- registra evidencia por ruta y hash cuando aplique.

## 8. Regresiones obligatorias

- plan binding agente/scope/command/capability;
- replay y reemisión de challenge;
- symlink escape;
- escape hatch;
- direct LIGHT one-use;
- loader relativo/absoluto;
- state corruption;
- profile switch durante lote activo;
- cross-domain legítimo y no autorizado;
- modo `auto`;
- consumidor aislado sin config local.

## 9. Threat model requerido en Design

Debe cubrir:

- spoofing del perfil;
- tampering del catálogo/estado local;
- repudiation de cambios de foco;
- information disclosure en métricas;
- denial of service por catálogos enormes;
- elevation of privilege por crossover;
- prompt injection sobre configuración;
- supply-chain de agentes/skills instalados.

## 10. Criterios de completitud

- [ ] Threat model aprobado.
- [ ] Fronteras de confianza reflejadas en ADR.
- [ ] Fixtures adversariales definidos antes de Build.
- [ ] Reason codes y rollback especificados.
- [ ] Seguridad transversal representada en todos los perfiles.
- [ ] Cero cambio de controles antes de aprobación.
