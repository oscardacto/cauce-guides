#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { hookEntryRef, hookEntryTokens, isCommandHook } from "./lib/asdd-hook-entry-lib.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const settings = JSON.parse(
  await readFile(resolve(root, ".claude", "settings.json"), "utf8"),
);
const legacy = JSON.parse(
  await readFile(resolve(root, ".claude", "scripts", "fixtures", "asdd-pretool-legacy-hooks.json"), "utf8"),
);

function numberArg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function stringArg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

const toolName = stringArg("--tool", "Bash");
const mode = stringArg("--mode", "current");
const scenario = stringArg("--scenario", "fast-path");
const warmups = numberArg("--warmups", 5);
const samples = numberArg("--samples", 30);

if (!["Bash", "Edit"].includes(toolName)) {
  throw new Error("--tool must be Bash or Edit");
}
if (!["legacy", "dispatcher", "current", "prototype"].includes(mode)) {
  throw new Error("--mode must be legacy or dispatcher");
}
if (!["fast-path", "deny"].includes(scenario)) {
  throw new Error("--scenario must be fast-path or deny");
}
if (samples === 0) {
  throw new Error("--samples must be greater than zero");
}

const groups = mode === "legacy"
  ? legacy.pre_tool_use_groups
  : settings.hooks?.PreToolUse ?? [];
// Entradas de hook completas: hookEntryRef tolera forma shell y forma exec
// (`command: "node"` + ruta en `args`), ver lib/asdd-hook-entry-lib.mjs.
const currentCommands = groups.flatMap((group) => {
  const alternatives = String(group.matcher ?? "")
    .split("|")
    .map((value) => value.trim());
  if (!alternatives.includes(toolName)) return [];
  return (group.hooks ?? [])
    .filter(
      (hook) =>
        isCommandHook(hook) &&
        /\.claude\/hooks\/asdd-[\w.-]+\.mjs(?:\s|$)/.test(hookEntryRef(hook)),
    );
});
const commands = mode === "prototype"
  ? [{
      type: "command",
      command: "node",
      args: ["${CLAUDE_PROJECT_DIR}/.claude/scripts/asdd-pre-tool-dispatcher-prototype.mjs"],
    }]
  : currentCommands;

if (commands.length === 0) {
  throw new Error(`no ASDD PreToolUse commands matched ${toolName}`);
}

const toolInput =
  toolName === "Bash"
    ? { command: scenario === "deny" ? "git reset --hard" : "git status" }
    : {
        file_path: resolve(
          root,
          "docs",
          "specs",
          "__asdd_parallel_benchmark_nonexistent__.md",
        ),
        old_string: "__missing_old_string__",
        new_string: "__missing_new_string__",
      };

const payload = JSON.stringify({
  hook_event_name: "PreToolUse",
  session_id: "asdd-parallel-benchmark",
  tool_use_id: `asdd-parallel-benchmark-${toolName.toLowerCase()}`,
  cwd: root,
  tool_name: toolName,
  tool_input: toolInput,
});

function percentile(sorted, q) {
  return sorted[Math.ceil(q * sorted.length) - 1];
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min_ms: Number(sorted[0].toFixed(2)),
    p50_ms: Number(percentile(sorted, 0.5).toFixed(2)),
    p95_ms: Number(percentile(sorted, 0.95).toFixed(2)),
    max_ms: Number(sorted.at(-1).toFixed(2)),
    mean_ms: Number(
      (sorted.reduce((total, value) => total + value, 0) / sorted.length).toFixed(2),
    ),
  };
}

function runHandler(hook) {
  return new Promise((resolveChild, rejectChild) => {
    const started = performance.now();
    const command = hookEntryRef(hook);
    // Sin `shell: true`: el spawn directo evita que una ruta de proyecto con
    // espacios se parta por whitespace al tokenizar el comando.
    const { file, args } = hookEntryTokens(hook, root);
    const child = spawn(file, args, {
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.once("error", rejectChild);
    child.once("close", (exitCode, signal) => {
      resolveChild({
        command,
        exit_code: exitCode,
        signal,
        wall_ms: performance.now() - started,
      });
    });
    child.stdin.end(payload);
  });
}

async function runEvent() {
  const started = performance.now();
  // Claude Code runs every matching hook concurrently and merges the results.
  const handlers = await Promise.all(commands.map(runHandler));
  return {
    wall_ms: performance.now() - started,
    aggregate_handler_wall_ms: handlers.reduce(
      (total, handler) => total + handler.wall_ms,
      0,
    ),
    handlers,
  };
}

const measured = [];
for (let i = 0; i < warmups + samples; i += 1) {
  const event = await runEvent();
  if (i >= warmups) measured.push(event);
}

const exitCodeSets = [
  ...new Set(measured.map((event) => event.handlers.map((h) => h.exit_code).join(","))),
];

process.stdout.write(
  `${JSON.stringify(
    {
      schema_version: 1,
      mode,
      scenario,
      execution_model:
        mode === "legacy"
          ? "parallel_all_matching_hooks"
          : "single_process_dispatcher",
      tool_name: toolName,
      warmup_samples: warmups,
      measured_samples: samples,
      asdd_processes_per_event: commands.length,
      wall_clock: summarize(measured.map((event) => event.wall_ms)),
      aggregate_handler_wall: summarize(
        measured.map((event) => event.aggregate_handler_wall_ms),
      ),
      observed_exit_code_sets: exitCodeSets,
      commands,
      caveats: [
        "aggregate_handler_wall is the sum of child wall times, not CPU time",
        "collector and other foreign/global hooks are intentionally excluded",
        "the target tool is not executed",
      ],
    },
    null,
    2,
  )}\n`,
);
