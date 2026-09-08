---
description: Fase Especificar — alcance, restricciones y contexto. Produce el project brief que alimenta el análisis.
allowed-tools: [Read, Grep, Glob, Bash, Agent, Task]
---

Ejecutar la fase **Especificar** del workflow ASDD.

## Precondición mecánica — antes del plan y de cualquier agente

1. Derivar `{slug-proyecto}` del request, en kebab-case.
2. Ejecutar exactamente, desde la raíz y sin ruta absoluta ni redirecciones:
   ```bash
   node .claude/scripts/asdd-run-bootstrap.mjs --feature {slug-proyecto} --phase specify --artifact-dir docs/specs --artifact-slug brief-{slug-proyecto}
   ```
3. Tomar `artifact_path` del JSON de salida. Esa es la **única** ruta válida
   del brief; incluirla literalmente en `scope[]`, el plan y el prompt de
   Producto. No usar `brief-{proyecto}.md` ni fabricar el prefijo a mano.
4. El bootstrap es idempotente: si hay reintento/challenge nuevo, reutiliza la
   misma reserva y no consume otro `SEQ`.

## Instrucciones

1. Invocar el agente `producto` con skill **`pm`** (Product Manager) para capturar visión estratégica, alcance, objetivos, OKRs, prioridades y restricciones de negocio.
2. Si el brief involucra **procesos AS-IS/TO-BE, gap analysis o mapeo de reglas de negocio**, invocar también `producto` con skill **`ba`** como soporte.
3. Invocar el agente `domain-expert` para aportar contexto de dominio, regulaciones y flujos críticos relevantes.
4. Si hay incertidumbre sobre el dominio o la tecnología, incluir `researcher` (skill `spike`) con timebox corto.
5. Sintetizar los outputs en un **project brief** que responda:
   - ¿Qué construimos?
   - ¿Para quién?
   - ¿Con qué restricciones?
   - ¿En qué dominio y bajo qué regulaciones?

Usar la plantilla canónica `.claude/skills/asdd-producto-templates/reference/brief-template.md`.

`domain-expert` es un overlay por su **selección** de skill —uno solo, el del
dominio configurado en el init—, no por quedar fuera del manifiesto: figura en
`capability-loading.json` con una capability por sector, así que su entrada del
plan **declara `capability`** con el nombre canónico completo del dominio activo
(`asdd-domain-expert-fintech`, no `domain-expert-fintech`). Omitirla corta
la emisión del plan con `agent … requires one declared capability`. Normalmente
va con `scope: []`; si actúa como apoyo read-only, usar `budget_class: "support"`.
Todo `Agent` se lanza con `model` explícito y el marcador `[ASDD-BUDGET ...]` exacto.

Producto debe cargar primero la capability aprobada con el comando relativo
`node .claude/scripts/asdd-load-capability.mjs ...`; solo después puede
escribir el `artifact_path` reservado.

Si el usuario define el paquete curado como fuente única, Domain Expert no
puede introducir leyes, plazos, SLA ni obligaciones externas como hechos. Los
marca `HIPÓTESIS EXTERNA — REQUIERE VALIDACIÓN` o solicita un spike/research
autorizado con fuentes primarias.

## Triggers para roles técnicos (evaluarlos al cierre de la fase)

Invocar SOLO si el brief contiene señales claras. Marcar las casillas correspondientes en la sección "Roles técnicos requeridos" del brief:

| Señal en el brief | Agente | Qué aporta |
|---|---|---|
| "arquitectura", "integración", "sistema existente", "escalabilidad", "migración", "contrato API" | @asdd-solution-architect | Restricciones arquitectónicas, ADRs preliminares, impacto en sistema existente |
| "datos sensibles", "autenticación", "regulación", "PCI", "HIPAA", "KYC", "pagos" | @asdd-security | Requisitos de seguridad obligatorios, restricciones de compliance que condicionan el diseño |
| "estimación", "esfuerzo", "factibilidad técnica", "deuda técnica", "breaking change" | @asdd-tech-lead | Factibilidad, deuda técnica afectada, riesgo técnico que cambia el alcance |

Si ninguna señal aparece, NO invocar roles técnicos en esta fase: se evaluarán nuevamente en `/asdd:analyze`.

## Artefactos esperados

- `artifact_path` devuelto por el bootstrap, con forma
  `docs/specs/{run_id}-SPECIFY-{SEQ}-brief-{proyecto}.md` — project brief con
  alcance y restricciones (estructura: ver `brief-template.md`).
- Contexto de dominio activo confirmado (overlay de `domain-expert`)

## Siguiente paso

Una vez el brief está validado por el developer → `/asdd:analyze`
