#!/usr/bin/env node
// ADR-018 production dispatcher: one stdin read and one ASDD process for
// Bash|Write|Edit. Collector and foreign/global hooks remain independent.

import { appendFileSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDangerousBashDecision } from "./asdd-pre-tool-use-dangerous-bash.mjs";
import { getBranchGuardDecision } from "./asdd-guard-branch.mjs";
import { getPrePushDecision } from "./asdd-pre-push-gate.mjs";
import { getPrePrDecision } from "./asdd-pre-pr-gate.mjs";
import { getOperationAuthorizationDecision } from "./asdd-plan-authorization-operation.mjs";
import { getSpecGuardDecision } from "./asdd-pre-tool-use-spec-check.mjs";
import { getDependencyGuardDecision } from "./asdd-pre-tool-use-dep-check.mjs";
import { getAnalyzeGuardDecision } from "./asdd-pre-tool-use-analyze-guard.mjs";
import { getArtifactNameDecision } from "./asdd-pre-tool-use-artifact-name-guard.mjs";
import { getDesignGuardDecision } from "./asdd-pre-tool-use-design-guard.mjs";
import { getCoauthorshipDecision } from "./asdd-pre-tool-use-coauthorship-guard.mjs";
import { getOrchestratorGuardDecision } from "./asdd-orchestrator-guard.mjs";

const RANK = Object.freeze({ allow: 0, ask: 1, defer: 2, deny: 3 });
const GUARDS = Object.freeze([
  ["dangerous-bash", getDangerousBashDecision],
  ["branch", getBranchGuardDecision],
  ["pre-push", getPrePushDecision],
  ["pre-pr", getPrePrDecision],
  ["operation-authorization", getOperationAuthorizationDecision],
  ["spec", getSpecGuardDecision],
  ["dependency", getDependencyGuardDecision],
  ["analyze", getAnalyzeGuardDecision],
  ["artifact-name", getArtifactNameDecision],
  ["design", getDesignGuardDecision],
  ["coauthorship", getCoauthorshipDecision],
  ["orchestrator", getOrchestratorGuardDecision],
]);

function normalize(id, result) {
  if (result === null || result === undefined) return null;
  if (typeof result !== "object" || !Object.hasOwn(RANK, result.decision)) {
    return { id, decision: "deny", reasons: [`guard-error:${id}:invalid-result`], effects: [] };
  }
  const reasons = Array.isArray(result.reasons)
    ? result.reasons.filter((reason) => typeof reason === "string" && reason)
    : [result.reason].filter((reason) => typeof reason === "string" && reason);
  return {
    id,
    decision: result.decision,
    reasons,
    effects: Array.isArray(result.effects) ? result.effects : [],
  };
}

/**
 * Registro durable de los efectos de auditoría, en el mismo archivo que usan
 * los git hooks nativos. Nunca lanza: un fallo de auditoría no debe convertirse
 * en un bloqueo, pero se avisa por stderr para que no quede silencioso.
 */
function persistAudit(message) {
  try {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const runtime = path.join(root, ".claude", ".runtime");
    mkdirSync(runtime, { recursive: true, mode: 0o700 });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      hook: "pre-tool-dispatcher",
      rule: /GS-\d{3}|CORE-\d{3}|ORC-\d{3}|ART-\d{3}/.exec(message)?.[0] || "hatch",
      decision: "hatch",
      detail: message,
      user: process.env.USERNAME || process.env.USER || "",
    });
    appendFileSync(path.join(runtime, "git-audit.jsonl"), `${line}\n`, { mode: 0o600 });
  } catch (error) {
    process.stderr.write(`[asdd] no se pudo persistir la auditoría: ${error.message}\n`);
  }
}

function runEffect(effect) {
  if (!effect || typeof effect !== "object") throw new Error("invalid-effect");
  if (typeof effect.execute === "function") return effect.execute();
  if (effect.type === "unlink" && typeof effect.path === "string") {
    try { unlinkSync(effect.path); } catch (error) { if (!effect.optional) throw error; }
    return;
  }
  if (["stderr", "audit"].includes(effect.type) && typeof effect.message === "string") {
    process.stderr.write(`${effect.message}\n`);
    // Los efectos `audit` documentan el uso de un escape hatch. La regla los
    // llama "auditables", pero stderr es transitorio: sin persistencia no hay
    // forma de responder quién desactivó un guard ni qué operación pasó por
    // ahí. Se persisten en el mismo JSONL que usan los hooks nativos.
    if (effect.type === "audit") persistAudit(effect.message);
    return;
  }
  throw new Error("unsupported-effect");
}

export function evaluatePreToolEvent(input, environment = process.env) {
  const outcomes = [];
  for (const [id, check] of GUARDS) {
    try {
      const normalized = normalize(id, check(input, environment, { deferEffects: true }));
      if (normalized) outcomes.push(normalized);
    } catch {
      outcomes.push({ id, decision: "deny", reasons: [`guard-error:${id}:exception`], effects: [] });
    }
  }

  // Effects are centralized and retain guard/declaration order. An effect
  // failure becomes another fail-closed result without skipping later effects.
  for (const outcome of outcomes) {
    for (const effect of outcome.effects) {
      try {
        runEffect(effect);
      } catch (error) {
        if (effect?.ignore?.(error)) continue;
        const reason = typeof effect?.failureReason === "function"
          ? effect.failureReason(error)
          : effect?.failureReason;
        outcomes.push({
          id: outcome.id,
          decision: "deny",
          reasons: [reason || `guard-error:${outcome.id}:effect-failed`],
          effects: [],
        });
      }
    }
  }

  const highest = outcomes.length
    ? Math.max(...outcomes.map((outcome) => RANK[outcome.decision]))
    : RANK.allow;
  const winners = outcomes.filter((outcome) => RANK[outcome.decision] === highest);
  return {
    decision: winners[0]?.decision ?? "allow",
    reasons: winners.flatMap((outcome) => outcome.reasons),
  };
}

function parseEvent(raw) {
  if (!raw.trim()) return null;
  try {
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const toolName = input.tool_name ?? input.toolName;
    return ["Bash", "Write", "Edit"].includes(toolName) ? input : null;
  } catch {
    return null;
  }
}

function emit(result) {
  if (result.decision === "allow") return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.decision,
      permissionDecisionReason: result.reasons.join("\n---\n"),
    },
  }));
}

function main() {
  let raw = "";
  try { raw = readFileSync(0, "utf8"); } catch {}
  const input = parseEvent(raw);
  if (!input) {
    emit({ decision: "deny", reasons: ["dispatcher-schema-error:invalid-pretool-event"] });
    return;
  }
  emit(evaluatePreToolEvent(input));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
