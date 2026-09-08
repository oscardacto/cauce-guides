---
name: asdd-ba-specification-lead-contexto
description: Lee EDT, specs, brief, glosario y ADRs antes de construir, y resuelve vacíos de dominio consultando al SME funcional.
---

> Rutas en **Layout B** (carpeta por nodo) — ver `.claude/reference/ba/asdd-ba-specs-layout.md`.

## Rol

Preparador de contexto y resolvedor de vacíos de dominio. Antes de que asdd-ba-specification-lead escriba la primera sección, este skill produce una foto completa del proyecto y anticipa los vacíos de dominio que necesitan resolverse — para que la SPEC nazca coherente con lo que ya existe y con el conocimiento real del negocio y el sector.

## Cuándo activar

- **Siempre**, como primer paso de asdd-ba-specification-lead, antes de comenzar la Sección 0
- Especialmente crítico cuando ya existen SPECs aprobadas o en borrador en el proyecto
- Sin este paso, asdd-ba-specification-lead construye con supuestos implícitos que generan trabajo de corrección posterior

## Proceso

1. Leer el brief del proyecto (`docs/specs/_proyecto/brief-{proyecto}.md`) si existe; legacy Layout A plano: `docs/specs/brief-{proyecto}.md`
2. Verificar si existen documentos fuente en `inputs/{feature}/` — registrar qué archivos hay disponibles para asdd-ba-specification-lead-extraccion
3. Leer la EDT completa — identificar el nodo hoja a construir (código 1.X.Y), sus dependencias técnicas, nivel topológico y los **"Dominios sugeridos"** propuestos por asdd-ba-functional-architect para este nodo
4. Listar todas las specs-funcional en `docs/specs/*/funcional-*.md` (convención ADR-004 spec-per-área) y leer las aprobadas o en borrador — extraer: actores declarados, reglas CORE, términos definidos y comportamientos establecidos
   - Para cada SPEC en estado `APROBADA`: leer también § 15 (Historial de Cambios Post-Aprobación) para detectar CRs abiertos o en progreso.
   - Si hay CRs en progreso: incluir en el briefing de contexto una alerta: *"SPEC {nombre} tiene CR(s) abiertos: {CR-NNN — sección — resumen}. Verificar si afectan coherencia con la SPEC a construir."*
5. Leer el glosario del dominio si existe (`docs/specs/_proyecto/glosario-{proyecto}.md`)
6. Leer ADRs en `docs/architecture/decisions/` si existen — identificar restricciones técnicas o de negocio que afecten el diseño de esta SPEC
7. **Confirmar o ajustar los dominios sugeridos** con el contexto enriquecido de pasos 3–6: para cada dominio distinto a Funcional, verificar si el alcance real, las integraciones detectadas, los ADRs o las specs existentes añaden o eliminan señales de aplicabilidad. Si algún dominio cambia respecto a la sugerencia del descomponedor → alertar al AF con motivo explícito antes de continuar.
8. Detectar vacíos de dominio anticipados: términos en la EDT o el brief que no están definidos en ningún artefacto del proyecto
9. Para cada vacío de dominio anticipado: **escalar a asdd-ba-functional-sme (vía AF) antes de continuar** — no diferir a Sección 13
10. Producir el briefing estructurado con todo lo recopilado

## Protocolo de resolución de vacíos en caliente

Cuando en el paso 7 se detecta un término o regla sin definición en los artefactos del proyecto:

1. Clasificar el vacío: ¿es de **sector** (regulación, norma, práctica de industria) o de **dominio del cliente** (proceso propio, definición interna)?
2. Escalar el vacío al agente **asdd-ba-functional-sme** (vía AF) indicando su naturaleza:
   - Vacío sectorial → asdd-ba-functional-sme activará `asdd-ba-functional-sme-sector`
   - Vacío del cliente → asdd-ba-functional-sme activará `asdd-ba-functional-sme-dominio`
3. Incorporar la respuesta al briefing con su marcador epistémico (`[CERTEZA]`, `[INFERENCIA]`, `[NO_SÉ]`)
4. Los `[NO_SÉ]` que no se pueden resolver con asdd-ba-functional-sme → registrar en el briefing como `[ESCALAR_ANTES_DE_CONSTRUIR]` con la pregunta formulada para el BA humano. **Nota:** `[ESCALAR_ANTES_DE_CONSTRUIR]` es un estado de bloqueo del briefing (derivado de un `[NO_SÉ]` sin resolver), no un marcador epistémico de asdd-ba-functional-sme.
5. **No continuar con la construcción** si hay vacíos `[ESCALAR_ANTES_DE_CONSTRUIR]` sin respuesta del BA humano

## Formato del briefing de contexto

```
## Briefing de Contexto — {1.X.Y} ({nombre breve del spec})
Generado: {fecha}

### Estado del proyecto
- SPECs existentes: {lista con estado APROBADA / BORRADOR / RECHAZADA}
- EDT: nodo {1.X.Y} — nodos dependientes: {lista de códigos o "ninguno"}
- Nivel topológico: {0/1/2...} — {sin dependencias / depende de: lista de nodos}
- Dependencias: {nodos hoja que deben construirse antes, según orden de asdd-ba-functional-architect}
- Documentos fuente disponibles en `inputs/{feature}/`: {lista de archivos — o "ninguno"}
  → Si hay archivos: activar asdd-ba-specification-lead-extraccion antes de la Sección 6

### Confirmación de dominios aplicables
| Dominio | Aplica | Señal determinante | Cambio vs. sugerencia EDT |
|---------|--------|--------------------|--------------------------|
| Funcional | Sí (siempre) | — | — |
| UX/UI | {Sí/No} | {señal del alcance, integraciones o ADRs} | {Sin cambio · o · Cambió de X a Y: motivo} |
| Seguridad | {Sí/No} | {señal} | {Sin cambio · o · Cambió de X a Y: motivo} |
| Datos | {Sí/No} | {señal} | {Sin cambio · o · Cambió de X a Y: motivo} |
| Arquitectura | {Sí/No} | {señal} | {Sin cambio · o · Cambió de X a Y: motivo} |
| Developer | {Sí/No} | {señal} | {Sin cambio · o · Cambió de X a Y: motivo} |
| QA | {Sí/No} | {señal} | {Sin cambio · o · Cambió de X a Y: motivo} |
| DevOps | {Sí/No} | {señal} | {Sin cambio · o · Cambió de X a Y: motivo} |

> Si algún dominio cambia respecto a la sugerencia del descomponedor, alertar al AF antes de continuar.

### Términos y definiciones en uso
| Término | Definición acordada | Fuente | Estado |
|---------|-------------------|--------|--------|
| {término} | {definición} | SPEC-{nombre} Sección X | CONFIRMADO |
| {término sin definir} | {inferencia asdd-ba-functional-sme} | [INFERENCIA] | PENDIENTE_VERIFICACIÓN |

### Actores ya declarados en el proyecto
| Actor | Permisos establecidos | SPECs donde aparece |
|-------|----------------------|-------------------|
| {actor} | {permisos} | {lista de SPECs} |

### Reglas CORE transversales relevantes para esta HU
| Regla | SPEC de origen | Por qué es relevante |
|-------|---------------|---------------------|
| {RN-NNN: texto} | SPEC-{nombre} | {relación con el spec a construir} |

### Restricciones del proyecto
- Arquitectónicas: {de ADRs — o "ninguna registrada"}
- De negocio: {del brief — o "ninguna registrada"}

### Riesgos de coherencia detectados
- {Aspecto de esta HU que puede contradecir algo ya especificado — sección y SPEC de referencia}

### Vacíos de dominio resueltos en caliente
| Vacío | Respuesta asdd-ba-functional-sme | Nivel epistémico | Impacto en la SPEC |
|-------|-----------------|-----------------|-------------------|
| {término/regla} | {respuesta} | [CERTEZA/INFERENCIA] | Sección {N} |

### Vacíos que requieren decisión del BA humano antes de construir
| Vacío | Pregunta formulada | Sección afectada |
|-------|-------------------|-----------------|
| {vacío} | {pregunta concreta} | Sección {N} |

### CRs activos en SPECs aprobadas
| SPEC | CR | Sección afectada | Resumen | Impacto en coherencia |
|---|---|---|---|---|
| — | — | — | Sin CRs activos | — |
```

## Regla de bloqueo

El briefing está incompleto y asdd-ba-specification-lead no debe iniciar la construcción si se cumple alguna de estas condiciones:

- La tabla "Vacíos que requieren decisión del BA humano" tiene al menos una fila sin respuesta.
- La tabla "Confirmación de dominios aplicables" tiene al menos un dominio con cambio respecto a la sugerencia del descomponedor y el AF aún no confirmó el ajuste.

En ambos casos: presentar al AF, alertar con el motivo y esperar respuesta antes de continuar.

## Inputs

- Referencia de la EDT (código de nodo hoja 1.X.Y + nombre del spec + pregunta de negocio)
- Artefactos producidos por el BA en `docs/` (brief, SPECs, ADRs, glosario)
- Documentos fuente del cliente en `inputs/{feature}/` (si existen)

## Outputs

- Briefing estructurado que asdd-ba-specification-lead usa como contexto durante toda la construcción
- Vacíos de dominio resueltos con marcadores epistémicos
- Lista de bloqueos `[ESCALAR_ANTES_DE_CONSTRUIR]` si los hay — con preguntas formuladas para el BA humano

## Anti-patterns

- **Briefing superficial** — listar los nombres de las SPECs sin leer su contenido. El valor está en extraer actores, reglas y términos que pueden generar conflictos.
- **Saltar vacíos de dominio** — detectar un término sin definir y no invocar asdd-ba-functional-sme, asumiendo que el constructor lo resolverá después. Ese supuesto se convierte en un filtro FAIL en asdd-ba-specification-auditor.
- **Construir con bloqueos pendientes** — si hay `[ESCALAR_ANTES_DE_CONSTRUIR]` sin respuesta, iniciar la construcción garantiza una SPEC con huecos estructurales que asdd-ba-specification-auditor no puede aprobar.
- **Omitir cuando no hay SPECs previas** — incluso en un proyecto nuevo, el brief y el glosario evitan que la primera SPEC nazca con supuestos implícitos que después son difíciles de rastrear.
