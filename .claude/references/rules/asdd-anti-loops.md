# Anti-Loop Rules

Previene agentes desbocados y quema de tokens sin progreso. Aplica a todo
agente y al orquestador en todas las fases ASDD.

## AL-001: Límite de corrección por verificador

**Máximo 2 ciclos de corrección** por agente verificador. Si el problema
persiste después de 2 intentos → STOP y reportar al usuario.

## AL-002: No releer lo ya leído

**NUNCA releer** un archivo ya leído en el mismo turno de conversación.

## AL-003: No re-ejecutar búsquedas

**NUNCA re-ejecutar** el mismo grep/glob si los resultados ya fueron obtenidos.

## AL-004: Progreso visible obligatorio

**Si un agente no muestra progreso en 5 minutos** → STOP inmediato; reportar
el blocker exacto; pedir decisión al usuario. NO continuar reintentando en
silencio.

## AL-005: Tests — una sola ejecución

**Tests: ejecutar UNA VEZ** y analizar resultados. NO volver a correr en
loop esperando que pasen solos.

## AL-006: Compilación — dos fallos = análisis

**Si falla 2 veces** con el mismo error → STOP y analizar causa raíz.

## AL-007: Refactoring — dos quiebres = revert

**Si el refactoring rompe tests 2 veces** → REVERT y repensar el approach
con `asdd-tech-lead`.

**Nota:** AL-007 cubre ciclos internos del agente (correcciones sobre su propio output).
Para el caso en que el agente completo falla 2 veces desde el orquestador, ver ORC-000-C
(`asdd-orchestration.md`).

## AL-008: Agentes paralelos — lanzar todos a la vez

**Lanzar TODOS los agentes paralelos en un solo mensaje.** NO lanzar uno,
esperar, y lanzar otro secuencialmente. El grafo exacto de qué agentes van
en paralelo en cada fase está en `asdd-orchestration.md` (ORC-003).

---

## Circuit-Breaker — Backoff antes de retry

El retry inmediato con el mismo enfoque quema tokens sin avanzar. Patrón
obligatorio:

1. **Intento 1** falla → analizar causa raíz. No repetir sin cambio de enfoque.
2. **Cambiar estrategia** → distinto approach, distintos archivos, distinta herramienta.
3. **Intento 2** falla → STOP. Reportar blocker exacto. El usuario decide.

Reglas:

- **Nunca hacer retry con el MISMO código o enfoque** que ya falló. Cambio
  de estrategia es condición para el intento 2.
- Si la causa raíz no es clara después del intento 1 → consultar
  `asdd-tech-lead` o `asdd-solution-architect` antes del intento 2.
- **3 fallos del mismo tipo en la misma sesión** = patrón sistémico → escalar,
  no reintentar.
- Aplica a: compilación, tests, búsquedas, ediciones de archivo, llamadas a
  agentes.

---

## Presupuesto de Turnos por Agente

> **AVISO (verificado 2026-06-09):** `maxTurns` es un campo oficial de
> frontmatter PERO la versión actual del CLI NO lo enforza — un agente puede
> correr muy por encima de su `maxTurns` sin detenerse ni avisar. El único
> techo real hoy es el agotamiento de contexto (auto-compactación ~95%).
> `maxTurns` funciona como presupuesto declarativo + red de seguridad futura,
> NO como barrera técnica activa.
>
> El mecanismo que SÍ corta a tiempo es el "Turn Budget Awareness" en el
> system prompt del agente. SUPERVISAR activamente: si no ves progreso visible
> después de ~10 mensajes → STOP manual.

| Agente | maxTurns | Riesgo token |
|---|---|---|
| `asdd-solution-architect` | 40 | ALTO — supervisa siempre |
| `asdd-cloud-architect` | 40 | ALTO — supervisa siempre |
| `asdd-developer-frontend` | 60 | ALTO — muchos turns |
| `asdd-developer-backend` | 60 | ALTO — muchos turns |
| `asdd-atf-api-qa-engineer` | 80 | ALTO — muchos turns |
| `asdd-devops-engineer` | 60 | MEDIO-ALTO |
| `asdd-security` | 50 | MEDIO |
| `asdd-ux` | 50 | MEDIO |
| `asdd-ui` | 50 | MEDIO |
| `asdd-tech-lead` | 40 | BAJO-MEDIO |
| `asdd-explorer` | 20 | BAJO |

Si un agente con `maxTurns >= 50` lleva más de 15 minutos sin producir output
nuevo → interrumpir con Ctrl+C y evaluar si relanzar con scope más acotado.

---

## Worktrees — Supervisión Obligatoria

- Cada agente con `isolation: worktree` crea un worktree git separado en disco.
- Si el agente falla o se interrumpe → el worktree puede quedar huérfano
  consumiendo espacio.

**Después de cada sesión con agentes de worktree:** verificar worktrees activos:

```bash
git worktree list
```

Worktrees sin rama activa → eliminar: `git worktree remove --force <path>`

**Ruta de éxito (ORC-011)**: cuando el developer termina con commit, su resultado
incluye los campos `WORKTREE COMMIT: {sha7}`, `Files:` y `Branch:`. El orquestador
aplica ORC-011 (`asdd-orchestration-worktree.md`) para validar tests, hacer
merge con `--no-ff` y limpiar el worktree. Sin esos campos → el agente no commitó y
el worktree fue destruido automáticamente.

**NUNCA lanzar más de 3 agentes con worktree en paralelo** para evitar
saturación de RAM y conflictos en el index de git.

---

## Token Management — Patrón de 3 Capas

### Por qué importa: Context Rot

Los LLMs tienen un presupuesto de atención finito. A medida que el contexto
crece, la precisión cae. Añadir tokens innecesarios no es neutral: activamente
degrada la calidad de razonamiento.

**Regla de oro:** el conjunto más pequeño de tokens de alta calidad produce
el mejor output.

### Las 3 Capas (obligatorio para cualquier búsqueda)

```
Capa 1 — GREP   → pattern matching, lista de archivos (~10-50 tokens por resultado)
Capa 2 — GLOB   → confirmar estructura, ubicación exacta
Capa 3 — READ   → offset + limit, solo el fragmento relevante (max 200 líneas)
```

**Nunca saltar a Capa 3 sin pasar por Capa 1.** Leer un archivo completo
cuando solo se necesita una función es un desperdicio que perjudica el resto
de la sesión.

### Reglas concretas

- Grep BEFORE Read — nunca leer archivos >100 líneas sin localizar la sección.
- NEVER read: OpenAPI specs completos, ORCHESTRATION.md completo, lock files,
  migraciones completas.
- Usar `Read` con `offset` + `limit` cuando la ubicación ya es conocida.
  Max 200 líneas por Read.
- Leer el CLAUDE.md SOLO del módulo afectado, no de todos los módulos.
- Si un grep devuelve el fragmento necesario → NO hacer Read adicional del
  mismo archivo.

---

## Compactación Proactiva — Prevenir Alucinaciones por Contexto Lleno

El contexto lleno es la causa más común de alucinaciones en sesiones largas.
El statusline muestra el % en tiempo real — actuar ANTES del punto crítico.

> **Dueño de la política de token budget: `asdd-meta`.**
> Los umbrales de acción son su contrato. Ante conflicto entre estos valores y
> los de cualquier otra regla (ej. `asdd-orchestration-ops.md`), el
> orquestador consulta a `asdd-meta` para resolver la discrepancia.

### Umbrales de acción

| Contexto usado | Estado | Acción obligatoria |
|---|---|---|
| < 60% | Normal | Continuar |
| 60–70% | Alerta | Priorizar Grep sobre Read; evitar reads de archivos grandes |
| 70–80% | Alto | Compactar al terminar el paso o fase actual |
| > 80% | Crítico | Compactar ANTES del próximo Agent tool call |
| > 90% | Bloqueante | STOP — compactar antes de cualquier acción |

### Cuándo es seguro compactar

Momentos correctos:

- Al terminar una fase completa del ciclo ASDD (después de Analizar, después
  de Diseñar, antes de Construir)
- Después de consolidar resultados de todos los agentes paralelos
- Entre tareas distintas dentro de la misma sesión

Nunca compactar:

- En medio de una fase (entre agentes paralelos aún corriendo)
- Después de iniciar una edición y antes de compilar/verificar
- Con gates pendientes sin resolver

### Señales de alucinación activa — compactar inmediatamente

- El agente referencia archivos o cambios que no se han hecho en esta sesión
- El agente repite instrucciones ya ejecutadas como si fueran nuevas
- El agente "olvida" decisiones tomadas hace pocos mensajes
- El agente produce código que contradice la spec aprobada
