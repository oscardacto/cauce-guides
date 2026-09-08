#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/sofka-asdd-plan-gate.mjs
//
// Hook PreToolUse (matcher: Agent) — Tier A: ORC-010
// Implementa el gate mecánico del plan-gate (#3607).
//
// COMPORTAMIENTO:
//   - Cuando el orquestador intenta invocar la tool "Agent" (sub-agente),
//     consume una autorización estructurada, vigente y de uso único para el agente.
//   - Si existe autorización específica → ALLOW (exit 0, sin output).
//   - Si no existe un lote ASDD activo → ASK: conserva el flujo nativo para
//     rutas no formalizadas.
//   - Vía rápida ORC-010-F: las rutas que ya tienen su propio gate (operaciones
//     git bajo GS-003/008/009) o un scope exacto resoluble (cambio LIGHT
//     atómico) traen un token de UserPromptSubmit y no pagan la ceremonia.
//   - Si existe pero fue usada, venció o no coincide → DENY: un permiso nativo
//     posterior no puede ampliar el lote aprobado.
//
// DISEÑO: ASK se reserva para ausencia de lote. DENY se usa para mismatch/replay
// de un lote existente y obliga a emitir un challenge nuevo.
//
// CONFIGURACIÓN:
//   SOFKA_ASDD_PLAN_GATE_DISABLE=1      escape hatch auditable — desactiva el hook
//
// ROBUSTEZ:
//   - Error de estado de un lote existente → DENY (falla cerrada).
//   - Solo actúa sobre tool_name === "Agent". Todas las demás tools → allow.
//
// Referencia: ORC-010 (sofka-asdd-orchestration-plan-gate.md), GS-008 (sofka-asdd-git-safety.md).
// -----------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  approveActiveChallenge,
  consumeBudgetedLaunchAuthorization,
  isAuthorizationError,
  issueChallenge,
} from "../scripts/lib/sofka-asdd-plan-authorization-lib.mjs";
import { consumeDirectLightAuthorization, releaseDirectLightAuthorization } from "../scripts/lib/sofka-asdd-direct-light-authorization-lib.mjs";
import { appendInvocationTelemetry } from "../scripts/lib/sofka-asdd-subagent-budget-lib.mjs";

const ASK_REASON =
  "ORC-010: el orquestador debe presentar y recibir aprobación del plan antes de invocar sub-agentes. " +
  "Presentá el plan (agentes, artefactos, comandos [R/W/D]) y esperá una confirmación explícita del " +
  "usuario: sirve cualquier afirmación clara (`ok`, `dale`, `procede`, `aprobado`, `de acuerdo`…), " +
  "no una palabra en particular.";

const DENY_REASON =
  "ORC-010/ORC-002-C: la autorización activa no coincide con agente/modelo/budget, expiró o ya fue consumida. " +
  "No reutilices ni amplíes el lote: presentá un plan nuevo y esperá un challenge/aprobación nuevos.";

function denyReason(error) {
  const code = typeof error?.code === "string" ? error.code : "direct-light-launch-mismatch";
  const detail = typeof error?.message === "string" ? error.message : "authorization mismatch";
  return `${DENY_REASON} Diagnóstico: ${code} — ${detail}.`;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseInput(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function getPlanGateDecision(input, now = new Date()) {
  // Escape hatch auditable
  if (process.env.SOFKA_ASDD_PLAN_GATE_DISABLE === "1") {
    return null;
  }

  // Solo actúa sobre la tool "Agent" — todas las demás pasan directo
  const toolName = input.tool_name || input.toolName || "";
  if (toolName !== "Agent") {
    return null;
  }

  const toolInput = input.tool_input ?? input.toolInput ?? {};
  const agent = String(toolInput.subagent_type ?? toolInput.agent ?? toolInput.name ?? "");
  try {
    if (!agent) throw new Error("agent identity missing");
    let authorization;
    try {
      authorization = consumeBudgetedLaunchAuthorization(agent, toolInput, now);
    } catch (error) {
      // A deterministic LIGHT atomic change declares no plan and no user
      // confirmation. Its UserPromptSubmit token carries the exact existing
      // file scope; synthesize and atomically consume a normal authorization
      // rather than forcing a contradictory challenge/ok ceremony.
      const directPlan = consumeDirectLightAuthorization({ agent, toolInput }, now);
      if (!directPlan) throw error;
      try {
        issueChallenge(directPlan, now);
        approveActiveChallenge(now);
        // `normalizePlan` conserva solo agente/capability/scope/commands, así
        // que la vía rápida no sobrevive al challenge sintético: se sella en la
        // misma escritura que consume el lanzamiento. Solo desde esta rama — el
        // sello no puede declararse en un `--plan-json`, de modo que el
        // orquestador no puede auto-otorgarse la habilitación de comandos git.
        authorization = consumeBudgetedLaunchAuthorization(agent, toolInput, now, {
          fastLane: directPlan.fast_lane,
        });
      } finally {
        // Solo se libera si al token no le queda cupo. Un pedido con varias
        // operaciones git ("commiteá, pusheá y creá el MR") necesita el token
        // vivo para lanzar el agente de cada una; borrarlo acá siempre dejaba
        // la segunda operación sin autorización.
        releaseDirectLightAuthorization();
      }
    }
    try {
      appendInvocationTelemetry({
        timestamp: now.toISOString(), event: "launch", request_id: authorization.request_id,
        route: authorization.route, phase: authorization.phase, model: authorization.model,
        agent: authorization.agent, capability: authorization.capability,
        max_turns: authorization.max_turns, retries: authorization.retries,
        escalation_reason: authorization.escalation_reason, result: "authorized",
      });
    } catch {
      // La telemetría local es best-effort y nunca amplía ni revoca permisos.
    }
    return null;
  } catch (error) {
    // No existe lote ASDD activo: conservar el ask nativo para rutas LIGHT no
    // formalizadas. Un lote existente pero inválido/mismatched debe DENY: si
    // degradara a ask, una aprobación distinta ampliaría el plan original.
    const decision = isAuthorizationError(error, "no-active-authorization") ? "ask" : "deny";
    const reason = decision === "ask" ? ASK_REASON : denyReason(error);
    return { decision, reason };
  }
}

function main() {
  const result = getPlanGateDecision(parseInput(readStdin()));
  if (!result) process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.decision,
      permissionDecisionReason: result.reason,
    },
  }));
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
