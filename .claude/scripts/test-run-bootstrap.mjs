#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const root = mkdtempSync(join(tmpdir(), "asdd-bootstrap-"));
cpSync(join(sourceRoot, ".claude"), join(root, ".claude"), { recursive: true });
const script = join(root, ".claude/scripts/asdd-run-bootstrap.mjs");
let pass = 0;
const check = (condition, message) => { if (!condition) throw new Error(message); pass += 1; };
const run = () => spawnSync(process.execPath, [script,
  "--feature", "aid-bancolombia", "--phase", "specify",
  "--artifact-dir", "docs/specs", "--artifact-slug", "brief-aid-bancolombia",
], { cwd: root, env: { ...process.env, ASDD_NOW: "2026-07-18T15:00:00-05:00" }, encoding: "utf8" });

try {
  const first = run();
  check(first.status === 0, `first bootstrap failed: status=${first.status} signal=${first.signal} error=${first.error?.message ?? ""} stderr=${first.stderr}`);
  check(existsSync(join(root, ".asdd-run.json")), "run state missing");
  const state = JSON.parse(readFileSync(join(root, ".asdd-run.json"), "utf8"));
  check(state.run_id === "2026-07-18-001", "unexpected run id");
  const expected = "docs/specs/2026-07-18-001-SPECIFY-001-brief-aid-bancolombia.md";
  check(state.artifact_naming.policy_version === 2 && state.artifact_seq === 1, "naming policy/reservation missing");
  check(state.phases.specify.artifacts[0] === expected, "artifact reservation missing");

  const second = run();
  check(second.status === 0, `idempotent bootstrap failed: ${second.stderr}`);
  const repeatedState = JSON.parse(readFileSync(join(root, ".asdd-run.json"), "utf8"));
  check(repeatedState.phases.specify.artifacts[0] === expected && repeatedState.artifact_seq === 1, "bootstrap burned a second sequence");

  console.log(`✅ run bootstrap: ${pass} assertions`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
