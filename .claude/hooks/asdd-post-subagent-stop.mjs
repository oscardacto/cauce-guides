#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/asdd-post-subagent-stop.mjs
//
// Hook SubagentStop — telemetría de cierre de subagentes ASDD.
//
// Registra en .claude/agent-memory/audit-log.jsonl un JSON por invocación:
//   { timestamp, agent, durationMs, outputSizeBytes, decision }
//
// El archivo audit-log.jsonl está en .gitignore (datos de sesión local).
// Para dashboards de governance, leer el JSONL con jq o un script externo.
// -----------------------------------------------------------------------------

import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { appendInvocationTelemetry } from "../scripts/lib/asdd-subagent-budget-lib.mjs";

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) { process.exit(0); }

  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  const agentName   = input?.agent_name   || input?.agentName   || "unknown";
  const durationMs  = input?.duration_ms  || input?.durationMs  || 0;
  const outputSize  = (input?.output || "").length;
  const decision    = input?.stop_reason  || input?.stopReason  || "completed";

  const record = JSON.stringify({
    timestamp:       new Date().toISOString(),
    agent:           agentName,
    durationMs:      durationMs,
    outputSizeBytes: outputSize,
    decision:        decision,
  });

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const logPath = `${projectDir}/.claude/agent-memory/audit-log.jsonl`;
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, record + "\n", "utf8");
    appendInvocationTelemetry({
      timestamp: new Date().toISOString(),
      event: "stop",
      request_id: input?.request_id ?? input?.requestId,
      route: input?.route,
      phase: input?.phase,
      model: input?.model,
      agent: agentName,
      capability: input?.capability,
      max_turns: input?.max_turns ?? input?.maxTurns,
      turns: input?.turns ?? input?.total_turns ?? input?.totalTurns,
      retries: input?.retries,
      duration_ms: durationMs,
      escalation_reason: input?.escalation_reason ?? input?.escalationReason,
      result: decision,
    });
  } catch {
    // Fallo silencioso — el hook no debe bloquear el flujo si no puede escribir
  }

  process.exit(0);
}

main();
