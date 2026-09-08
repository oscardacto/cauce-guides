#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { getSpecGuardDecision } from "../hooks/asdd-pre-tool-use-spec-check.mjs";
import { getDependencyGuardDecision } from "../hooks/asdd-pre-tool-use-dep-check.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const fixture = mkdtempSync(join(tmpdir(), "asdd-dfx-001-"));
mkdirSync(join(fixture, "src"), { recursive: true });
writeFileSync(join(fixture, "package.json"), "{}\n");

function assertStandardDeny(hook, event, env) {
  const result = spawnSync("node", [resolve(root, hook)], {
    cwd: fixture,
    env: { ...process.env, ...env },
    input: JSON.stringify(event),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput?.permissionDecision, "deny");
  assert.ok(output.hookSpecificOutput?.permissionDecisionReason);
  return output.hookSpecificOutput.permissionDecisionReason;
}

try {
  const specEvent = { tool_name: "Write", tool_input: { file_path: "src/new.mjs", content: "x" }, cwd: fixture };
  const depEvent = {
    tool_name: "Write",
    tool_input: { file_path: "package.json", content: '{"dependencies":{"new-package":"1.0.0"}}' },
    cwd: fixture,
  };
  assert.equal(getSpecGuardDecision(specEvent, { ...process.env, ASDD_SPEC_GUARD_ENABLED: "true" })?.decision, "deny");
  assert.equal(getDependencyGuardDecision(depEvent, process.env)?.decision, "deny");
  assertStandardDeny(".claude/hooks/asdd-pre-tool-use-spec-check.mjs", specEvent, { ASDD_SPEC_GUARD_ENABLED: "true" });
  assertStandardDeny(".claude/hooks/asdd-pre-tool-use-dep-check.mjs", depEvent, {});
  assert.match(assertStandardDeny(".claude/hooks/asdd-pre-tool-dispatcher.mjs", specEvent, {
    ASDD_SPEC_GUARD_ENABLED: "true",
  }), /CORE-001/);
  assert.match(assertStandardDeny(".claude/hooks/asdd-pre-tool-dispatcher.mjs", depEvent, {}), /DEP-AUDIT/);
  console.log("PASS DFX-001 spec-check: explicit deny + standard hook protocol");
  console.log("PASS DFX-001 dep-check: explicit deny + standard hook protocol");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
