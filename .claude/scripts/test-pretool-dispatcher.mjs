#!/usr/bin/env node

import { spawn } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { hookEntryRef, hookEntryTokens, isCommandHook } from "./lib/sofka-asdd-hook-entry-lib.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const legacy = JSON.parse(readFileSync(
  resolve(import.meta.dirname, "fixtures", "sofka-asdd-pretool-legacy-hooks.json"),
  "utf8",
));
const corpus = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "fixtures", "sofka-asdd-pretool-dispatcher-s1.json"),
    "utf8",
  ),
);
const rank = { allow: 0, ask: 1, defer: 2, deny: 3 };
const fixtureDir = mkdtempSync(resolve(tmpdir(), "asdd-dispatcher-diff-"));
const projectDir = resolve(fixtureDir, "active-project");
mkdirSync(resolve(projectDir, "docs/specs"), { recursive: true });
writeFileSync(resolve(projectDir, ".asdd-run.json"), JSON.stringify({
  run_id: "2026-07-18-999", status: "in_progress", current_phase: "build",
  phases: { build: { status: "in_progress" } },
}));
let runSeq = 0;

function matchingHooks(toolName) {
  return (legacy.pre_tool_use_groups ?? []).flatMap((group) => {
    const matches = String(group.matcher ?? "").split("|").map((x) => x.trim());
    if (!matches.includes(toolName)) return [];
    return (group.hooks ?? [])
      .filter((hook) => isCommandHook(hook) && /sofka-asdd-/.test(hookEntryRef(hook)));
  });
}

// `hook` es la entrada completa de settings.json: acepta forma shell y forma
// exec (`command` + `args`). El spawn se arma sin partir por whitespace, para
// que una ruta de proyecto con espacios no se trunque.
function run(hook, raw) {
  return new Promise((resolveRun, rejectRun) => {
    const command = hookEntryRef(hook);
    const { file, args } = hookEntryTokens(hook, root);
    const prefix = resolve(fixtureDir, "run-" + runSeq++);
    const stdinPath = prefix + ".stdin";
    const stdoutPath = prefix + ".stdout";
    const stderrPath = prefix + ".stderr";
    writeFileSync(stdinPath, raw);
    const stdinFD = openSync(stdinPath, "r");
    const stdoutFD = openSync(stdoutPath, "w+");
    const stderrFD = openSync(stderrPath, "w+");
    const child = spawn(file, args, {
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      stdio: [stdinFD, stdoutFD, stderrFD],
    });
    child.once("error", rejectRun);
    child.once("close", (exitCode) => {
      closeSync(stdinFD);
      closeSync(stdoutFD);
      closeSync(stderrFD);
      resolveRun({
        command,
        exitCode,
        stdout: readFileSync(stdoutPath, "utf8"),
        stderr: readFileSync(stderrPath, "utf8"),
      });
    });
  });
}

function decisionOf(result) {
  if (result.exitCode === 2) {
    return { decision: "deny", reasons: [result.stderr.trim()].filter(Boolean), source: result.command };
  }
  if (result.exitCode !== 0) return { decision: "allow", reasons: [], source: result.command };
  try {
    const parsed = JSON.parse(result.stdout);
    const output = parsed.hookSpecificOutput ?? {};
    return {
      decision: output.permissionDecision ?? "allow",
      reasons: String(output.permissionDecisionReason ?? "")
        .split("\n---\n")
        .filter(Boolean),
      source: result.command,
    };
  } catch {
    return { decision: "allow", reasons: [], source: result.command };
  }
}

/**
 * Sustituye `token` por `replacement` recorriendo el objeto en memoria (no el
 * texto JSON serializado). Evita que una ruta absoluta de Windows con
 * separadores de backslash — cuyas secuencias no son escapes válidos de
 * JSON — se interprete como una secuencia de escape inválida dentro de un
 * string JSON ya serializado.
 */
function substituteTokenDeep(value, token, replacement) {
  if (typeof value === "string") {
    return value.split(token).join(replacement);
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteTokenDeep(item, token, replacement));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = substituteTokenDeep(val, token, replacement);
    }
    return out;
  }
  return value;
}

function merge(results) {
  const decisions = results.map(decisionOf);
  const highest = Math.max(...decisions.map((item) => rank[item.decision]));
  const selected = decisions.filter((item) => rank[item.decision] === highest);
  return {
    decision: selected[0]?.decision ?? "allow",
    reasons: selected.flatMap((item) => item.reasons),
  };
}

async function current(raw, toolName) {
  return merge(await Promise.all(matchingHooks(toolName).map((hook) => run(hook, raw))));
}

async function dispatcher(raw) {
  const hook = {
    type: "command",
    command: "node",
    args: ["${CLAUDE_PROJECT_DIR}/.claude/hooks/sofka-asdd-pre-tool-dispatcher.mjs"],
  };
  return merge([await run(hook, raw)]);
}

if (corpus.schema_version !== 1 || !Array.isArray(corpus.fixtures)) {
  throw new Error("invalid S1 dispatcher fixture corpus");
}

let failed = 0;
for (const fixture of corpus.fixtures) {
  const event = fixture.event
    ? substituteTokenDeep(fixture.event, corpus.root_token, projectDir)
    : null;
  const raw = fixture.raw ?? JSON.stringify(event);
  const toolName = fixture.tool_name ?? event?.tool_name ?? event?.toolName;
  const before = await current(raw, toolName);
  const after = await dispatcher(raw);
  const missingReasons = before.reasons.filter((reason) => !after.reasons.some((r) => r.includes(reason)));
  const reasonsEquivalent =
    fixture.reason_policy === "stable_schema_error" || missingReasons.length === 0;
  const expected = fixture.expected;
  const ok =
    before.decision === after.decision &&
    before.decision === expected.decision &&
    before.reasons.length >= expected.minimum_winning_reasons &&
    after.reasons.length >= expected.minimum_winning_reasons &&
    reasonsEquivalent;
  process.stdout.write(
    (ok ? "PASS " : "FAIL ") +
      fixture.id +
      ": " +
      before.decision +
      " -> " +
      after.decision +
      ` (reasons ${before.reasons.length}/${after.reasons.length})\n`,
  );
  if (!ok) {
    failed += 1;
    console.error(JSON.stringify({ expected, before, after, missingReasons }, null, 2));
  }
}

rmSync(fixtureDir, { recursive: true, force: true });
if (failed > 0) process.exitCode = 1;
