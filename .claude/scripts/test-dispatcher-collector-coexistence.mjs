#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "asdd-collector-coexist-"));
const eventsPath = resolve(dir, "events.jsonl");
const fakeCollector = resolve(dir, "fake-collector.mjs");
let runSeq = 0;

writeFileSync(
  fakeCollector,
  `import { readFileSync, appendFileSync } from "node:fs";
const event = JSON.parse(readFileSync(0, "utf8"));
appendFileSync(process.env.EVENTS_PATH, JSON.stringify({
  hook_event_name: event.hook_event_name,
  tool_use_id: event.tool_use_id
}) + "\\n");
`,
);

function run(file, args, raw, env = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const prefix = resolve(dir, "io-" + runSeq++);
    const stdinPath = prefix + ".stdin";
    const stdoutPath = prefix + ".stdout";
    const stderrPath = prefix + ".stderr";
    writeFileSync(stdinPath, raw);
    const stdinFD = openSync(stdinPath, "r");
    const stdoutFD = openSync(stdoutPath, "w+");
    const stderrFD = openSync(stderrPath, "w+");
    const child = spawn(file, args, {
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
      stdio: [stdinFD, stdoutFD, stderrFD],
    });
    child.once("error", rejectRun);
    child.once("close", (exitCode) => {
      closeSync(stdinFD);
      closeSync(stdoutFD);
      closeSync(stderrFD);
      resolveRun({
        exitCode,
        stdout: readFileSync(stdoutPath, "utf8"),
        stderr: readFileSync(stderrPath, "utf8"),
      });
    });
  });
}

async function pre(command, toolUseID) {
  const event = {
    hook_event_name: "PreToolUse",
    session_id: "collector-coexistence",
    tool_use_id: toolUseID,
    tool_name: "Bash",
    tool_input: { command },
    cwd: root,
  };
  const raw = JSON.stringify(event);
  const [dispatcher] = await Promise.all([
    run(process.execPath, [
      ".claude/hooks/asdd-pre-tool-dispatcher.mjs",
    ], raw),
    run(process.execPath, [fakeCollector], raw, { EVENTS_PATH: eventsPath }),
  ]);
  return dispatcher;
}

async function post(toolUseID) {
  const event = {
    hook_event_name: "PostToolUse",
    session_id: "collector-coexistence",
    tool_use_id: toolUseID,
    tool_name: "Bash",
    tool_input: { command: "git status" },
    tool_response: { stdout: "", stderr: "" },
    duration_ms: 1,
    cwd: root,
  };
  await run(process.execPath, [fakeCollector], JSON.stringify(event), {
    EVENTS_PATH: eventsPath,
  });
}

const allowed = await pre("git status", "tool-allowed");
await post("tool-allowed");
if (allowed.exitCode !== 0 || allowed.stdout.trim() !== "") {
  throw new Error("allowed dispatcher result changed");
}

const denied = await pre("git reset --hard", "tool-denied");
const deniedJSON = JSON.parse(denied.stdout);
if (deniedJSON.hookSpecificOutput?.permissionDecision !== "deny") {
  throw new Error("dangerous command was not denied");
}

const events = readFileSync(eventsPath, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse);

const allowedEvents = events.filter((event) => event.tool_use_id === "tool-allowed");
const deniedEvents = events.filter((event) => event.tool_use_id === "tool-denied");

if (
  allowedEvents.length !== 2 ||
  allowedEvents[0].hook_event_name !== "PreToolUse" ||
  allowedEvents[1].hook_event_name !== "PostToolUse"
) {
  throw new Error("allowed call did not preserve one correlated Pre/Post pair");
}
if (
  deniedEvents.length !== 1 ||
  deniedEvents[0].hook_event_name !== "PreToolUse"
) {
  throw new Error("denied call did not preserve exactly one unmatched Pre event");
}

console.log("PASS allowed: one correlated collector Pre/Post pair");
console.log("PASS denied: collector Pre preserved and Post absent");
rmSync(dir, { recursive: true, force: true });
