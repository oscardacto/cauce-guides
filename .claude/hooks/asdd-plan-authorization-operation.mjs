#!/usr/bin/env node
// Enforces the approved ASDD plan at the point where a subagent's actual
// Write/Edit/Bash target is known. Agent launch alone only exposes its type.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { authorizeAgentOperation, isAuthorizationError } from "../scripts/lib/asdd-plan-authorization-lib.mjs";

const DENY_PREFIX =
  "ORC-010: la operación del subagente no coincide con el lote ASDD aprobado. " +
  "No amplíes la autorización: actualizá el plan y solicitá un challenge nuevo.";

function readEvent() {
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getOperationAuthorizationDecision(input, _environment = process.env, context = {}) {
  if (input === null) return { decision: "deny", reason: `${DENY_PREFIX} JSON de hook inválido.` };

  const toolName = input.tool_name ?? input.toolName ?? "";
  if (!["Write", "Edit", "Bash"].includes(toolName)) return null;

  const agentId = input.agent_id ?? input.agentId;
  const agentType = input.agent_type ?? input.agentType;
  // Main-thread operations are governed by the orchestrator guard. This hook
  // only adds scope enforcement after Claude Code has identified a subagent.
  if (!agentId && !agentType) return null;
  if (!agentId || !agentType) return { decision: "deny", reason: `${DENY_PREFIX} missing-runtime-identity.` };

  const now = context.now ?? new Date();
  const effect = {
    type: "authorize-agent-operation",
    execute: () => authorizeAgentOperation(input, now),
    ignore: (error) => isAuthorizationError(error, "no-active-authorization"),
    failureReason: (error) => {
      const code = error?.code ?? "authorization-store-invalid";
      return `${DENY_PREFIX} ${code}.`;
    },
  };
  if (!context.deferEffects) {
    try {
      effect.execute();
      return null;
    } catch (error) {
      if (effect.ignore(error)) return null;
      return { decision: "deny", reason: effect.failureReason(error) };
    }
  }
  return {
    decision: "allow",
    effects: [effect],
  };
}

function main() {
  const result = getOperationAuthorizationDecision(readEvent());
  if (!result) process.exit(0);
  for (const effect of result.effects ?? []) {
    try { effect.execute(); } catch (error) {
      if (effect.ignore?.(error)) continue;
      process.stdout.write(JSON.stringify({ hookSpecificOutput: {
        hookEventName: "PreToolUse", permissionDecision: "deny",
        permissionDecisionReason: effect.failureReason(error),
      }}));
      process.exit(0);
    }
  }
  if (result.decision === "allow") process.exit(0);
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
