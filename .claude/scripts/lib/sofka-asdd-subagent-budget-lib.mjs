import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, "..", "..", "..");
export const POLICY_PATH = resolve(PROJECT_ROOT, ".sofka-asdd/subagent-budget.json");
export const LOCK_PATH = resolve(PROJECT_ROOT, ".sofka-asdd/sofka-asdd.lock");
export const AGENTS_ROOT = resolve(PROJECT_ROOT, ".claude/agents");
const PHASES = new Set(["specify", "analyze", "design", "build", "verify", "document"]);
const RISKS = new Set(["low", "medium", "high"]);
const MODELS = new Set(["haiku", "sonnet", "opus"]);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const SUBAGENT_BUDGET = Object.freeze(readJson(POLICY_PATH));

export function logicalModel(value) {
  const model = String(value ?? "").toLowerCase();
  for (const name of MODELS) if (model === name || model.includes(name)) return name;
  throw new Error(`unknown logical model: ${value}`);
}

function frontmatterModel(agent) {
  const path = resolve(AGENTS_ROOT, `${agent}.md`);
  if (!existsSync(path)) return null;
  const match = readFileSync(path, "utf8").match(/^---\s*\n([\s\S]*?)\n---/u)?.[1]
    ?.match(/^model:\s*["']?([^"'\n]+)["']?\s*$/mu);
  return match ? logicalModel(match[1].trim()) : null;
}

export function resolveLogicalModel({ phase, agent, capability, risk = "low", escalation_reason = "" }) {
  if (risk === "high" || String(escalation_reason).trim()) {
    return { model: "opus", source: risk === "high" ? "high_risk" : "explicit_escalation" };
  }
  const strategy = readJson(LOCK_PATH).model_strategy ?? {};
  const skillKey = `${agent}.${capability ?? ""}`;
  if (strategy.skill_override?.[skillKey]) return { model: logicalModel(strategy.skill_override[skillKey]), source: "skill_override" };
  if (strategy.agent_pinning?.[agent]) return { model: logicalModel(strategy.agent_pinning[agent]), source: "agent_pinning" };
  if (strategy.phase_default?.[phase]) return { model: logicalModel(strategy.phase_default[phase]), source: "phase_default" };
  const pinned = frontmatterModel(agent);
  if (pinned) return { model: pinned, source: "agent_frontmatter" };
  return { model: SUBAGENT_BUDGET.orchestrator_default, source: "orchestrator_default" };
}

export function normalizeBudgetEnvelope(input, normalizedAgents) {
  if (input.budget_policy_version !== SUBAGENT_BUDGET.schema_version) throw new Error("plan requires budget_policy_version 1");
  const route = String(input.route ?? "").toUpperCase();
  const budget = SUBAGENT_BUDGET.routes[route];
  if (!budget) throw new Error("plan route must be TRIVIAL, LIGHT, MEDIUM or FULL");
  const phase = String(input.phase ?? "").toLowerCase();
  if (!PHASES.has(phase)) throw new Error("plan phase is invalid");
  const risk = String(input.risk ?? "").toLowerCase();
  if (!RISKS.has(risk)) throw new Error("plan risk must be low, medium or high");
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("plan confidence must be between 0 and 1");
  if (normalizedAgents.length > budget.max_agents) throw new Error(`${route} allows at most ${budget.max_agents} subagents`);
  const maxConcurrent = Number(input.max_concurrent);
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > budget.max_concurrent || maxConcurrent > normalizedAgents.length) {
    throw new Error(`${route} max_concurrent exceeds its budget or planned fan-out`);
  }
  if (risk === "high" && route !== SUBAGENT_BUDGET.high_risk.required_route) throw new Error("high risk requires FULL before tools");
  const rawByAgent = new Map(input.agents.map((entry) => [String(entry.agent ?? ""), entry]));
  const agents = normalizedAgents.map((entry) => {
    const raw = rawByAgent.get(entry.agent) ?? {};
    const model = logicalModel(raw.model);
    const maxTurns = Number(raw.max_turns);
    const retries = Number(raw.retries);
    const budgetClass = String(raw.budget_class ?? "primary").toLowerCase();
    if (!new Set(["primary", "support"]).has(budgetClass)) throw new Error(`${entry.agent}: budget_class must be primary or support`);
    const turnBudget = budgetClass === "support" ? budget.support_turns : budget.turns;
    if (budgetClass === "support" && !turnBudget) throw new Error(`${route} does not allow support-agent budgets`);
    const escalationReason = String(raw.escalation_reason ?? "").trim();
    if (!turnBudget || !Number.isInteger(maxTurns) || maxTurns < turnBudget.min || maxTurns > turnBudget.max) {
      throw new Error(`${entry.agent}: max_turns is outside ${route} budget`);
    }
    if (!Number.isInteger(retries) || retries < 0 || retries > budget.max_retries) throw new Error(`${entry.agent}: retries exceed ${route} budget`);
    if (!budget.models.includes(model)) throw new Error(`${entry.agent}: model ${model} is not allowed for ${route}`);
    const resolved = resolveLogicalModel({ phase, agent: entry.agent, capability: entry.capability, risk, escalation_reason: escalationReason });
    if (model !== resolved.model) throw new Error(`${entry.agent}: model ${model} violates resolved ${resolved.model} (${resolved.source})`);
    return { ...entry, budget_class: budgetClass, model, max_turns: maxTurns, retries, escalation_reason: escalationReason || null, model_source: resolved.source };
  });
  return { route, phase, risk, confidence, max_concurrent: maxConcurrent, agents };
}

export function launchMarker(authorization) {
  return `[ASDD-BUDGET route=${authorization.route} phase=${authorization.phase} model=${authorization.model} max_turns=${authorization.max_turns} retries=${authorization.retries}]`;
}

export function assertBudgetedLaunch(authorization, toolInput = {}) {
  const model = logicalModel(toolInput.model);
  if (model !== authorization.model) throw new Error(`launch model ${model} does not match authorized ${authorization.model}`);
  const marker = launchMarker(authorization);
  if (!String(toolInput.prompt ?? "").includes(marker)) throw new Error(`launch prompt missing exact budget marker ${marker}`);
  if (authorization.capability) {
    const loader = `node .claude/scripts/sofka-asdd-load-capability.mjs ${authorization.capability}`;
    if (!String(toolInput.prompt ?? "").includes(loader)) {
      throw new Error(`launch prompt missing primary capability loader ${loader}`);
    }
  }
  return authorization;
}

export function sanitizeInvocationTelemetry(record) {
  const config = SUBAGENT_BUDGET.telemetry;
  for (const forbidden of config.forbidden_fields) if (forbidden in record) throw new Error(`forbidden telemetry field ${forbidden}`);
  const allowed = new Set(config.allowed_fields);
  const safe = Object.fromEntries(Object.entries(record).filter(([key, value]) => allowed.has(key) && value !== undefined));
  return safe;
}

export function appendInvocationTelemetry(record) {
  const safe = sanitizeInvocationTelemetry(record);
  const config = SUBAGENT_BUDGET.telemetry;
  const path = resolve(PROJECT_ROOT, config.path);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(safe)}\n`, { encoding: "utf8", mode: 0o600 });
  return safe;
}
