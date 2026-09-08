#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { hookEntryRef } from "./lib/sofka-asdd-hook-entry-lib.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const settingsPath = resolve(root, ".claude/settings.json");
const settings = JSON.parse(readFileSync(settingsPath, "utf8"));

// Referencia textual de cada entrada de hook — tolera forma shell y forma exec
// (`command: "node"` + ruta en `args`), ver lib/sofka-asdd-hook-entry-lib.mjs.
// La sintaxis del token de proyecto (`$VAR` vs `${VAR}`) se normaliza: la
// aserción es sobre QUÉ hook está registrado, no sobre su forma sintáctica.
function asddCommands(value) {
  return (value.hooks?.PreToolUse ?? []).flatMap((group) =>
    (group.hooks ?? [])
      .map((hook) => hookEntryRef(hook).replaceAll("${CLAUDE_PROJECT_DIR}", "$CLAUDE_PROJECT_DIR"))
      .filter((ref) => /sofka-asdd-/.test(ref)));
}

const commands = asddCommands(settings).filter((command) => !/plan-gate/.test(command));
assert.deepEqual(commands, [
  "node $CLAUDE_PROJECT_DIR/.claude/hooks/sofka-asdd-pre-tool-dispatcher.mjs",
]);
assert.ok(!JSON.stringify(settings).includes("dispatcher-prototype"));

const source = readFileSync(resolve(root, ".claude/hooks/sofka-asdd-pre-tool-dispatcher.mjs"), "utf8");
assert.equal((source.match(/\["[^"]+", get\w+\]/g) ?? []).length, 12);
assert.ok(!/from\s+["']node:child_process["']/.test(source));

const dir = mkdtempSync(join(tmpdir(), "asdd-dispatcher-rollback-"));
const tempSettings = join(dir, "settings.json");
copyFileSync(settingsPath, tempSettings);
const postBefore = JSON.stringify(settings.hooks?.PostToolUse ?? null);
for (const flag of ["--legacy", "--dispatcher"]) {
  const result = spawnSync(process.execPath, [
    resolve(root, ".claude/scripts/sofka-asdd-pretool-mode.mjs"), flag, "--settings", tempSettings,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
const restored = JSON.parse(readFileSync(tempSettings, "utf8"));
assert.deepEqual(asddCommands(restored).filter((command) => !/plan-gate/.test(command)), commands);
assert.equal(JSON.stringify(restored.hooks?.PostToolUse ?? null), postBefore);
rmSync(dir, { recursive: true, force: true });

console.log("PASS registration: exactly one production ASDD dispatcher process");
console.log("PASS implementation: 12 explicit imports and no dispatcher child_process");
console.log("PASS rollback: legacy -> dispatcher round-trip preserves PostToolUse");
