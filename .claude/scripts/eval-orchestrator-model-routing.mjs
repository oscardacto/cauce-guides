#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const systemPrompt = resolve(root, ".claude/evals/prompts/system-orchestrator.txt");
const modelsFlag = process.argv.indexOf("--models");
const modelsArg = modelsFlag >= 0 ? process.argv[modelsFlag + 1] : "claude-opus-4-8,claude-sonnet-4-6";
const models = modelsArg.split(",").map((value) => value.trim()).filter(Boolean);
const cases = [
  { id: "trivial_local_query", request: "¿En qué archivo se define el health endpoint?", expected: { route: "TRIVIAL", minAgents: 0, maxAgents: 0 } },
  { id: "light_atomic_change", request: "Actualiza el texto del botón en src/home.ts.", expected: { route: "LIGHT", minAgents: 1, maxAgents: 1, minTurns: 10, maxTurns: 20 } },
  { id: "full_feature", request: "Implementa una nueva API de reportes con spec, diseño, código y verificación.", expected: { route: "FULL", minAgents: 1, maxAgents: 3, minTurns: 30, maxTurns: 50 } },
  { id: "high_risk_authorization", request: "Cambia el flujo OAuth y los permisos administrativos para autorizar nuevos comandos.", expected: { route: "FULL", minAgents: 1, maxAgents: 3, minTurns: 30, maxTurns: 50, highRisk: true, agentModel: "opus" } },
];
const schema = JSON.stringify({
  type: "object",
  properties: {
    route: { type: "string", enum: ["TRIVIAL", "LIGHT", "MEDIUM", "FULL"] },
    concurrent_subagents: { type: "integer", minimum: 0, maximum: 10 },
    agent_model: { type: "string" },
    max_turns: { type: "integer", minimum: 0, maximum: 200 },
    high_risk: { type: "boolean" },
  },
  required: ["route", "concurrent_subagents", "agent_model", "max_turns", "high_risk"],
  additionalProperties: false,
});

function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * q) - 1];
}

function run(model, fixture) {
  const prompt = `Clasifica este request sin ejecutar tools: ${fixture.request} Devuelve únicamente route, concurrent_subagents (simultáneos, no el total del workflow), agent_model, max_turns y high_risk.`;
  const args = [
    "-p", prompt,
    "--system-prompt-file", systemPrompt,
    "--model", model,
    "--output-format", "json",
    "--json-schema", schema,
    "--tools", "",
    "--no-session-persistence",
    "--safe-mode",
    "--max-budget-usd", "0.15",
  ];
  return new Promise((resolveRun, rejectRun) => {
    let stdout = "", stderr = "";
    const child = spawn("claude", args, { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("close", (status) => {
      if (status !== 0) return rejectRun(new Error(`${model}/${fixture.id}: ${stderr || `exit ${status}`}`));
      try { resolveRun(JSON.parse(stdout)); } catch (error) { rejectRun(new Error(`${model}/${fixture.id}: invalid JSON: ${error.message}`)); }
    });
  });
}

function score(actual, expected) {
  const checks = {
    route: actual.route === expected.route,
    fan_out: Number.isInteger(actual.concurrent_subagents) && actual.concurrent_subagents >= expected.minAgents && actual.concurrent_subagents <= expected.maxAgents,
    turns: expected.minTurns === undefined || (Number.isInteger(actual.max_turns) && actual.max_turns >= expected.minTurns && actual.max_turns <= expected.maxTurns),
    high_risk: expected.highRisk === undefined || actual.high_risk === expected.highRisk,
    model_escalation: expected.agentModel === undefined || String(actual.agent_model).toLowerCase().includes(expected.agentModel),
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

if (models.length === 0) throw new Error("--models requires at least one model");
readFileSync(systemPrompt, "utf8");
const report = {};
for (const model of models) {
  const rows = [];
  for (const fixture of cases) {
    const result = await run(model, fixture);
    const actual = result.structured_output ?? JSON.parse(result.result);
    const quality = score(actual, fixture.expected);
    rows.push({
      id: fixture.id,
      pass: quality.pass,
      checks: quality.checks,
      actual,
      duration_ms: result.duration_ms,
      duration_api_ms: result.duration_api_ms,
      ttft_ms: result.ttft_ms,
      cost_usd: result.total_cost_usd,
      usage: {
        output_tokens: result.usage?.output_tokens ?? 0,
        cache_creation_input_tokens: result.usage?.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: result.usage?.cache_read_input_tokens ?? 0,
      },
      resolved_models: Object.keys(result.modelUsage ?? {}),
    });
  }
  report[model] = {
    cases: rows.length,
    passed: rows.filter((row) => row.pass).length,
    pass_rate: rows.filter((row) => row.pass).length / rows.length,
    total_cost_usd: +rows.reduce((sum, row) => sum + row.cost_usd, 0).toFixed(6),
    total_output_tokens: rows.reduce((sum, row) => sum + row.usage.output_tokens, 0),
    latency: {
      p50_ms: percentile(rows.map((row) => row.duration_ms), 0.5),
      p95_ms: percentile(rows.map((row) => row.duration_ms), 0.95),
      ttft_p50_ms: percentile(rows.map((row) => row.ttft_ms), 0.5),
      ttft_p95_ms: percentile(rows.map((row) => row.ttft_ms), 0.95),
    },
    results: rows,
  };
}

const values = Object.values(report);
const failures = values.flatMap((entry) => entry.results.filter((row) => !row.pass).map((row) => row.id));
process.stdout.write(`${JSON.stringify({
  schema_version: 1,
  execution: "claude -p safe-mode, tools disabled, structured output",
  system_prompt_sha256_note: "hash recorded by integral benchmark; prompt content excluded",
  cases: cases.map((fixture) => fixture.id),
  models: report,
  failures,
}, null, 2)}\n`);
if (failures.length) process.exit(1);
