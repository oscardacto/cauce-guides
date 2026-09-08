#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { resolve } from "node:path";
import { readNormalized } from "./lib/asdd-hash-normalize-lib.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const scripts = resolve(root, ".claude/scripts");
const providerFlag = process.argv.indexOf("--provider-eval");
const providerPath = providerFlag >= 0 ? resolve(process.argv[providerFlag + 1]) : null;
const runJson = (name, args = []) => JSON.parse(execFileSync(process.execPath, [resolve(scripts, name), ...args], {
  cwd: root, encoding: "utf8", timeout: 300_000,
  env: { ...process.env, CLAUDE_PROJECT_DIR: root },
}));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const change = (before, after) => +(((after - before) / before) * 100).toFixed(2);

const hooks = {};
for (const tool of ["Bash", "Edit"]) {
  hooks[tool.toLowerCase()] = {};
  for (const mode of ["legacy", "current"]) {
    hooks[tool.toLowerCase()][mode] = runJson("benchmark-pretool-hooks.mjs", [
      "--tool", tool, "--mode", mode, "--scenario", "fast-path", "--warmups", "5", "--samples", "30",
    ]);
  }
  hooks[tool.toLowerCase()].deny = runJson("benchmark-pretool-hooks.mjs", [
    "--tool", tool, "--mode", "current", "--scenario", "deny", "--warmups", "5", "--samples", "30",
  ]);
}

const prompt = runJson("benchmark-prompt-injection.mjs", ["--warmups", "5", "--samples", "30"]);
const budget = runJson("benchmark-subagent-budget.mjs", ["1000"]);
const context = runJson("asdd-runtime-metrics.mjs");
const consumer = runJson("test-runtime-efficiency-consumer-e2e.mjs");
const original = JSON.parse(readFileSync(resolve(root, "docs/baselines/asdd-runtime-baseline-v2.json"), "utf8"));
const provider = providerPath ? JSON.parse(readFileSync(providerPath, "utf8")) : null;
// readNormalized (BOM + CRLF->LF) para que system_prompt_sha256 sea estable cross-OS:
// hashear bytes crudos da huellas distintas en Windows vs Linux/CI para el mismo blob.
const promptHash = createHash("sha256").update(readNormalized(resolve(root, ".claude/evals/prompts/system-orchestrator.txt"))).digest("hex");
const local = {
  bash_fast_path: {
    legacy: hooks.bash.legacy.wall_clock,
    current: hooks.bash.current.wall_clock,
    p95_change_percent: change(hooks.bash.legacy.wall_clock.p95_ms, hooks.bash.current.wall_clock.p95_ms),
    processes_before: hooks.bash.legacy.asdd_processes_per_event,
    processes_after: hooks.bash.current.asdd_processes_per_event,
  },
  edit_fast_path: {
    legacy: hooks.edit.legacy.wall_clock,
    current: hooks.edit.current.wall_clock,
    p95_change_percent: change(hooks.edit.legacy.wall_clock.p95_ms, hooks.edit.current.wall_clock.p95_ms),
    processes_before: hooks.edit.legacy.asdd_processes_per_event,
    processes_after: hooks.edit.current.asdd_processes_per_event,
  },
  deny_p95_ms: { bash: hooks.bash.deny.wall_clock.p95_ms, edit: hooks.edit.deny.wall_clock.p95_ms },
  prompt_injection: prompt,
  routing_and_budget_microbenchmark: budget,
  context: context.metrics,
};
const gates = {
  always_on_words: context.metrics.always_on_words <= original.provisional_targets.always_on_words_max,
  normal_prompt_words: prompt.results.normal.injected_words <= original.provisional_targets.normal_prompt_injected_words_max,
  one_pretool_process: [hooks.bash.current, hooks.edit.current].every((item) => item.asdd_processes_per_event === 1),
  hook_p95_no_regression: [local.bash_fast_path, local.edit_fast_path].every((item) => item.p95_change_percent <= 5),
  consumer_e2e: consumer.failed.length === 0,
  provider_quality: provider ? Object.values(provider.models).every((item) => item.pass_rate === 1) : false,
};

process.stdout.write(`${JSON.stringify({
  schema_version: 1,
  run_id: "2026-07-18-001",
  slice: "B9",
  captured_at: new Date().toISOString(),
  source: { branch: git("branch", "--show-current"), commit: git("rev-parse", "HEAD") },
  environment: {
    platform: platform(), release: release(), architecture: arch(), node: process.version,
    classification: /microsoft/i.test(release()) ? "Linux WSL2" : platform(),
  },
  method: {
    local: "5 warm-ups + 30 measured isolated processes; p50/p95 wall clock",
    provider: "one diagnostic structured-output sample per model and scenario; not a latency SLO",
    separation: "provider results are not included in local hook/filesystem/process distributions",
    privacy: "fixture ids and aggregate usage only; prompts, outputs, commands and tool inputs excluded",
    system_prompt_sha256: promptHash,
  },
  results: {
    local,
    consumer,
    provider,
    original_to_final: {
      always_on_words: { before: original.observed.always_on_words, after: context.metrics.always_on_words, change_percent: change(original.observed.always_on_words, context.metrics.always_on_words) },
      normal_prompt_words: { before: original.observed.normal_prompt_injected_words, after: prompt.results.normal.injected_words, change_percent: -100 },
      bash_processes: { before: original.observed.bash_pre_tool_processes, after: hooks.bash.current.asdd_processes_per_event },
      edit_processes: { before: original.observed.write_edit_pre_tool_processes, after: hooks.edit.current.asdd_processes_per_event },
    },
  },
  gates,
  external_release_checks: [
    "Repeat native performance distributions on macOS.",
    "Repeat native performance distributions on Windows; Windows path semantics are covered here, native timing is not.",
  ],
  limitations: [
    "Provider comparison has one sample per heterogeneous scenario; its latency is diagnostic, not statistically robust.",
    "Provider token counts include Claude CLI/runtime overhead and are not equivalent to local context word counts.",
    "Tool, MCP and provider-internal schemas remain unobservable from this runtime.",
  ],
}, null, 2)}\n`);
if (Object.values(gates).some((pass) => !pass)) process.exit(1);
