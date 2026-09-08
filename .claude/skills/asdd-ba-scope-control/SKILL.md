---
name: asdd-ba-scope-control
description: Evalúa un cambio contra el baseline y recomienda INCLUIR/NEGOCIAR/DIFERIR/RECHAZAR. Se activa dentro de asdd-ba-scope-manager.
---
> Rutas en **Layout B** (carpeta por nodo) — ver `.claude/reference/ba/asdd-ba-specs-layout.md`.

Skill de control de cambios del `asdd-ba-scope-manager`. Evalúa toda solicitud de cambio o expansión de scope contra el baseline acordado y emite una recomendación fundamentada antes de que el BA humano decida. **Clasifica y recomienda por defecto; la decisión final de negocio es del AF/PO.**

## Cuándo se activa

- El stakeholder solicita agregar funcionalidad durante la ejecución.
- El AF recibe una petición de cambio y necesita evaluar su impacto.
- Un nuevo requisito aparece después de que la SPEC fue aprobada.
- Llega un hallazgo de tipo `ALCANCE`/`GAP-EXTERNO` (del AF o del skill hermano `asdd-ba-uat-classifier`). Un `GAP-EXTERNO` se reclasifica en la taxonomía de abajo igual que un `ALCANCE`.

## Paso 0 — Precondición: baseline congelado (obligatorio)

Antes de clasificar nada, verificar que existe un baseline contra el cual medir: EDT aprobada, y al menos una SPEC en estado APROBADA o un DVF firmado.

Si **no hay baseline congelado** (todo en BORRADOR, sin DVF) → el control reactivo **no aplica todavía**: el encuadre del alcance en esta etapa lo cubre el skill hermano `asdd-ba-early-scope`. Reportar "el alcance aún está en negociación/definición; corresponde early-scope, no scope-control" y detener. No forzar una clasificación contra un baseline inexistente.

## Proceso de evaluación

1. Confirmar baseline congelado (Paso 0).
2. Identificar el baseline relevante — qué nodo EDT / SPEC cubre (o debería cubrir) la solicitud.
3. Clasificar con el árbol de decisión de abajo.
4. Estimar impacto funcional — specs, `RN-NNN`, flujos afectados (tu carril). El **esfuerzo técnico** se marca `PENDIENTE (tech-lead)` — no lo estimás vos.
5. Contrastar scope acumulado — leer los `docs/specs/_proyecto/cambio-alcance-*` previos y reportar el creep agregado ya incluido, no solo esta solicitud aislada.
6. Emitir recomendación por defecto + trade-offs (costo de oportunidad). Si la decisión depende de contrato/presupuesto/prioridad → marcar **"Requiere decisión PO/comercial"**.
7. Verificar estado de la SPEC afectada:
   - `BORRADOR` o `APROBADA CON OBSERVACIONES` → INCLUIR aplica directo.
   - `APROBADA` → nota obligatoria: *"La SPEC está APROBADA. Si se acepta, requiere CR en el Historial de Cambios Post-Aprobación antes de aplicar el cambio (ver `asdd-spec-guard.md` SPG-001). El AF abre el CR; `asdd-ba-specification-lead` aplica el cambio después."*
8. Documentar — guardar el análisis en `docs/specs/_proyecto/cambio-alcance-{N}-{feature}.md`.
9. Registrar en bitácora — activar `asdd-ba-change-log` (tipo `ALCANCE`). Si el origen es un hallazgo UAT con `H-NNN`, propagarlo para trazabilidad de extremo a extremo; si no (solicitud directa del AF), omitir ese campo.

## Árbol de decisión — clasificación (aplicar en orden)

1. ¿El comportamiento **ya está especificado** en una SPEC del baseline pero se implementó mal? → **`IN_SCOPE`**.
2. ¿La spec es **ambigua/contradictoria** y la solicitud es una disputa de interpretación (no pide algo nuevo)? → **`AMBIGÜEDAD`** (es aclaración/corrección de error, no cambio de alcance).
3. ¿El flujo **ya especificado se rompe o queda incoherente** sin esto? → **`GAP_LEGÍTIMO`**.
4. ¿El flujo especificado **funciona igual** y esto agrega una **capacidad nueva** no relacionada con el core? → **`SCOPE_CREEP`**.
5. ¿El negocio **cambió sus reglas o prioridades** (no es error ni omisión)? → **`CAMBIO_DE_NEGOCIO`**.

## Taxonomía de solicitudes de cambio

| Tipo | Definición | Recomendación por defecto |
|---|---|---|
| `IN_SCOPE` | Comportamiento ya especificado, mal implementado | INCLUIR (corrección) — sin trámite de alcance |
| `AMBIGÜEDAD` | Disputa de interpretación de una spec poco clara | Aclarar spec; si APROBADA → CR de corrección de error (no es cambio de alcance) |
| `GAP_LEGÍTIMO` | Necesario para la coherencia del flujo especificado | INCLUIR (bajo impacto) / INCLUIR CON NEGOCIACIÓN (alto impacto) |
| `SCOPE_CREEP` | Capacidad nueva sin relación directa con el core | DIFERIR (si tiene valor) / RECHAZAR (sin valor claro) |
| `CAMBIO_DE_NEGOCIO` | El negocio cambió reglas o prioridades | Escalar — **requiere decisión PO/comercial** |

## Formato del análisis de impacto

```
## Análisis de Impacto de Alcance — {nombre de la solicitud}
Fecha: {fecha} | Solicitante: {nombre/rol} | Origen: {AF | hallazgo H-NNN}
Clasificación: IN_SCOPE / AMBIGÜEDAD / GAP_LEGÍTIMO / SCOPE_CREEP / CAMBIO_DE_NEGOCIO

### Descripción de la solicitud
{Qué se está pidiendo, en lenguaje concreto}

### Contraste con baseline
- Nodo EDT de referencia: {1.X.Y — nombre del nodo hoja}
- SPEC de referencia: {feature} — Estado: {BORRADOR / APROBADA CON OBSERVACIONES / APROBADA}
- ¿Está cubierto?: {Sí parcialmente / No}

### Scope acumulado (creep agregado)
- Cambios INCLUIR previos en este feature: {lista de cambio-alcance-* o "ninguno"}
- Señal de acumulación: {ok / atención — N cambios "pequeños" ya sumados}

### Impacto
- Impacto funcional: SPECs a modificar {lista}; RN-NNN afectadas {lista}; flujos {lista}
- Esfuerzo técnico: PENDIENTE (tech-lead) — fuera del carril de este skill
- EDT: {sin cambio / agregar nodo / modificar nodo}

### Costo de oportunidad / trade-off
{Qué se retrasa o se resigna si se incluye; con qué compite en prioridad}

### Recomendación (por defecto)
**{INCLUIR / INCLUIR CON NEGOCIACIÓN / DIFERIR / RECHAZAR}**
Justificación: {razón concreta referenciando el baseline}
[Requiere decisión PO/comercial: {sí + motivo contractual/presupuestal | no}]
[Si SPEC APROBADA: requiere CR previo — ver SPG-001]

### Acción requerida del BA humano
{Qué decide, con quién negocia, qué artefacto se actualiza si acepta}
```

## Niveles de recomendación

| Recomendación | Criterio | Acción del BA humano |
|---|---|---|
| **INCLUIR** | `IN_SCOPE`, `AMBIGÜEDAD` resuelta, o `GAP_LEGÍTIMO` de bajo impacto | Actualizar SPEC y notificar *(si APROBADA: CR previo — SPG-001)* |
| **INCLUIR CON NEGOCIACIÓN** | `GAP_LEGÍTIMO` de alto impacto | Negociar con stakeholder prioridad vs. esfuerzo |
| **DIFERIR** | `SCOPE_CREEP` con valor real | Registrar en backlog para próximo ciclo |
| **RECHAZAR** | `SCOPE_CREEP` sin valor claro | Comunicar al stakeholder con justificación |

> `CAMBIO_DE_NEGOCIO` no tiene recomendación automática: se **escala como decisión PO/comercial**. El skill aporta el análisis; no dicta el veredicto.

## Write boundary

Escribís ÚNICAMENTE `docs/specs/_proyecto/cambio-alcance-{N}-{feature}.md` y la entrada de bitácora (vía skill). **NUNCA** mutás la SPEC, el glosario, el INDEX ni ningún artefacto ajeno — si se acepta INCLUIR, lo aplica `asdd-ba-specification-lead` tras el CR del AF.

## Checklist de salida

- [ ] Baseline congelado verificado (Paso 0); si no hay → derivado a `asdd-ba-early-scope`
- [ ] Solicitud clasificada con uno de los 5 tipos vía el árbol de decisión
- [ ] Impacto funcional estimado; esfuerzo técnico marcado PENDIENTE (tech-lead), no inventado
- [ ] Scope acumulado contrastado contra `cambio-alcance-*` previos
- [ ] Costo de oportunidad / trade-off explícito
- [ ] Recomendación por defecto + flag "Requiere decisión PO/comercial" cuando aplica
- [ ] Estado de la SPEC verificado; nota de CR si APROBADA (SPG-001)
- [ ] Referencias por nombre/ID (Estado en Metadatos, CR-NNN, RN-NNN), nunca por número de sección
- [ ] Análisis guardado; bitácora registrada (tipo ALCANCE), con H-NNN si vino de UAT
- [ ] No se mutó ningún artefacto ajeno

## Anti-patterns

- **Scope creep silencioso** — absorber cambios pequeños uno a uno sin registrarlos ni contrastar el acumulado. 10 cambios "pequeños" suelen equivaler a un sprint no planificado.
- **Rechazar todo** — clasificar como `SCOPE_CREEP` lo que es un `GAP_LEGÍTIMO`. El control de alcance toma decisiones informadas, no defiende el scope a ultranza.
- **Análisis sin posición** — presentar impacto sin recomendación por defecto. El BA humano necesita una posición de partida (no un veredicto final).
- **Estimar esfuerzo técnico** — inventar Alto/Medio/Bajo de ingeniería sin acceso al código. Ese dato es del tech-lead; marcarlo PENDIENTE.
- **Dictar la decisión de negocio** — recomendar RECHAZAR/DIFERIR como si fuera veredicto. En `CAMBIO_DE_NEGOCIO` y casos con implicación contractual, la decisión es del AF/PO.
