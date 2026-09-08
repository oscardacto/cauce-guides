#!/usr/bin/env node
// Temporary ADR-018 rollback switch. It only changes project ASDD PreToolUse
// registration; collector/foreign hooks and PostToolUse remain untouched.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hookEntryRef } from "./lib/asdd-hook-entry-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mode = process.argv.includes("--legacy") ? "legacy"
  : process.argv.includes("--dispatcher") ? "dispatcher" : null;
const pathIndex = process.argv.indexOf("--settings");
const settingsPath = pathIndex >= 0 ? resolve(process.argv[pathIndex + 1]) : resolve(root, ".claude/settings.json");
if (!mode) throw new Error("usage: asdd-pretool-mode.mjs --dispatcher|--legacy [--settings path]");

const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
const legacy = JSON.parse(readFileSync(resolve(root, ".claude/scripts/fixtures/asdd-pretool-legacy-hooks.json"), "utf8"));
const groups = settings.hooks?.PreToolUse ?? [];
const preserved = [];
for (const group of groups) {
  // hookEntryRef tolera forma shell y forma exec (`command` + `args`).
  const hooks = (group.hooks ?? []).filter((hook) => !/\.claude\/(?:hooks|scripts)\/asdd-(?:pre-tool|guard-branch|pre-push|pre-pr|plan-authorization-operation|orchestrator-guard)/.test(hookEntryRef(hook)));
  if (hooks.length) preserved.push({ ...group, hooks });
}
const selected = mode === "legacy" ? legacy.pre_tool_use_groups : [{
  matcher: "Bash|Write|Edit",
  hooks: [{
    type: "command",
    command: "node",
    args: ["${CLAUDE_PROJECT_DIR}/.claude/hooks/asdd-pre-tool-dispatcher.mjs"],
  }],
}];
settings.hooks ??= {};
settings.hooks.PreToolUse = [...preserved, ...selected];
const temp = `${settingsPath}.${process.pid}.tmp`;
writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`);
renameSync(temp, settingsPath);
process.stdout.write(`${mode}\n`);
