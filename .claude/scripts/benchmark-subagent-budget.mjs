#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { normalizeBudgetEnvelope } from "./lib/asdd-subagent-budget-lib.mjs";
import { routeRequest } from "./lib/asdd-proportional-router-lib.mjs";

const samples = Number(process.argv[2] ?? 1_000);
if (!Number.isInteger(samples) || samples < 30 || samples > 100_000) throw new Error("samples must be 30..100000");
const rawAgent = { agent: "asdd-developer-backend", capability: "asdd-developer-bug-fix", model: "sonnet", max_turns: 20, retries: 0 };
const normalized = [{ agent: rawAgent.agent, capability: rawAgent.capability, dependencies: [], scope: ["src/x.ts"], commands: [] }];
const input = { budget_policy_version: 1, route: "LIGHT", phase: "build", risk: "low", confidence: 0.9, max_concurrent: 1, agents: [rawAgent] };
const routeTimes = [], budgetTimes = [];
for (let i = 0; i < samples + 10; i += 1) {
  let start = performance.now(); routeRequest("actualiza src/x.ts"); const routeMs = performance.now() - start;
  start = performance.now(); normalizeBudgetEnvelope(input, normalized); const budgetMs = performance.now() - start;
  if (i >= 10) { routeTimes.push(routeMs); budgetTimes.push(budgetMs); }
}
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const stats = (values) => ({ p50_ms: +percentile(values, 0.5).toFixed(4), p95_ms: +percentile(values, 0.95).toFixed(4), max_ms: +Math.max(...values).toFixed(4) });
console.log(JSON.stringify({ schema_version: 1, samples, warmup: 10, router: stats(routeTimes), budget_validation: stats(budgetTimes) }, null, 2));
