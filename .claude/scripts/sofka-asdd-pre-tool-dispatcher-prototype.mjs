#!/usr/bin/env node

// SPIKE-1R-B only. Intentionally NOT registered in settings.json.
// Adapts current standalone guards into one Node process for measurement.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getOperationAuthorizationDecision } from "../hooks/sofka-asdd-plan-authorization-operation.mjs";
import { getOrchestratorGuardDecision } from "../hooks/sofka-asdd-orchestrator-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const raw = readFileSync(0, "utf8");
let event;
try {
  event = JSON.parse(raw);
} catch {
  process.stderr.write("[dispatcher-prototype] malformed JSON\n");
  process.exit(2);
}

class HookExit extends Error {
  constructor(code) {
    super("hook exit " + code);
    this.code = code;
  }
}

globalThis.__ASDD_EXIT__ = (code = 0) => {
  throw new HookExit(code);
};

function rewriteRelativeImports(source, sourcePath) {
  return source.replace(
    /(from\s+["'])(\.[^"']+)(["'])/g,
    (_, prefix, specifier, suffix) =>
      prefix + pathToFileURL(resolve(dirname(sourcePath), specifier)).href + suffix,
  );
}

async function loadLegacyGuard(file) {
  const sourcePath = resolve(root, ".claude", "hooks", file);
  let source = readFileSync(sourcePath, "utf8");
  source = rewriteRelativeImports(source, sourcePath);
  source = source.replace(
    /readFileSync\(\s*0\s*,\s*["']utf8["']\s*\)/g,
    "globalThis.__ASDD_PAYLOAD__",
  );
  source = source.replace(/\bprocess\.exit\(/g, "globalThis.__ASDD_EXIT__(");
  const mainCall = /\nmain\(\);\s*$/;
  if (!mainCall.test(source)) {
    throw new Error("prototype adapter cannot find unconditional main() in " + file);
  }
  source = source.replace(mainCall, "\nexport { main as __asddMain };\n");
  const url = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
  const module = await import(url);
  return { file, run: module.__asddMain };
}

const legacyFiles = [
  "sofka-asdd-pre-tool-use-dangerous-bash.mjs",
  "sofka-asdd-guard-branch.mjs",
  "sofka-asdd-pre-push-gate.mjs",
  "sofka-asdd-pre-pr-gate.mjs",
  "sofka-asdd-pre-tool-use-spec-check.mjs",
  "sofka-asdd-pre-tool-use-dep-check.mjs",
  "sofka-asdd-pre-tool-use-analyze-guard.mjs",
  "sofka-asdd-pre-tool-use-artifact-name-guard.mjs",
  "sofka-asdd-pre-tool-use-design-guard.mjs",
  "sofka-asdd-pre-tool-use-coauthorship-guard.mjs",
];

const legacy = await Promise.all(legacyFiles.map(loadLegacyGuard));

function captureLegacy(guard, raw) {
  const stdout = [];
  const stderr = [];
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  const consoleLog = console.log;
  const consoleError = console.error;

  globalThis.__ASDD_PAYLOAD__ = raw;
  process.stdout.write = (chunk) => {
    stdout.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };
  console.log = (...args) => stdout.push(args.join(" ") + "\n");
  console.error = (...args) => stderr.push(args.join(" ") + "\n");

  let exitCode = 0;
  try {
    guard.run();
  } catch (error) {
    if (error instanceof HookExit) {
      exitCode = error.code;
    } else {
      throw error;
    }
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
    console.log = consoleLog;
    console.error = consoleError;
  }
  return {
    guard: guard.file,
    exit_code: exitCode,
    stdout: stdout.join(""),
    stderr: stderr.join(""),
  };
}

function selectDecision(decisions) {
  const rank = { allow: 0, ask: 1, defer: 2, deny: 3 };
  const highest = decisions.reduce(
    (value, candidate) => Math.max(value, rank[candidate.decision]),
    -1,
  );
  if (highest < 0) return null;
  const selected = decisions.filter(
    (candidate) => rank[candidate.decision] === highest,
  );
  return {
    source: selected.map((candidate) => candidate.source).join(","),
    decision: selected[0].decision,
    reason: selected
      .map((candidate) => candidate.reason)
      .filter(Boolean)
      .join("\n---\n"),
  };
}

const toolName = event.tool_name ?? event.toolName ?? "";
const applicableLegacy = legacy.filter(({ file }) => {
  if (toolName === "Bash") {
    return [
      "sofka-asdd-pre-tool-use-dangerous-bash.mjs",
      "sofka-asdd-guard-branch.mjs",
      "sofka-asdd-pre-push-gate.mjs",
      "sofka-asdd-pre-pr-gate.mjs",
      "sofka-asdd-pre-tool-use-coauthorship-guard.mjs",
    ].includes(file);
  }
  if (toolName === "Write" || toolName === "Edit") {
    return ![
      "sofka-asdd-pre-tool-use-dangerous-bash.mjs",
      "sofka-asdd-guard-branch.mjs",
      "sofka-asdd-pre-push-gate.mjs",
      "sofka-asdd-pre-pr-gate.mjs",
    ].includes(file);
  }
  return false;
});

const results = applicableLegacy.map((guard) => captureLegacy(guard, raw));
const decisions = results
  .filter((result) => result.exit_code === 2)
  .map((result) => ({
    source: result.guard,
    decision: "deny",
    reason: result.stderr.trim(),
  }));

const operation = getOperationAuthorizationDecision(event);
if (operation) {
  decisions.push({ source: "operation-authorization", ...operation });
}
const orchestrator = getOrchestratorGuardDecision(event);
if (orchestrator) {
  decisions.push({ source: "orchestrator", ...orchestrator });
}

const selected = selectDecision(decisions);
if (!selected) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: selected.decision,
      permissionDecisionReason: selected.reason,
    },
  }),
);
