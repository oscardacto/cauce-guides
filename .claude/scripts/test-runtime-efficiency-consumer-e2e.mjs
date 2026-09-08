#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const isolatedHome = mkdtempSync(join(tmpdir(), "asdd b9 consumer home "));
const suites = [
  ["yaml-and-context", "test-frontmatter-parser.mjs"],
  ["context-layers", "test-context-budget.mjs"],
  ["phase-reconciliation", "test-reconcile-run-state.mjs"],
  ["dispatcher-contract-paths", "test-pretool-dispatcher-contract.mjs"],
  ["dispatcher-differential", "test-pretool-dispatcher.mjs"],
  ["dispatcher-multi-deny", "test-dispatcher-dfx-001.mjs"],
  ["dispatcher-registration", "test-pretool-dispatcher-registration.mjs"],
  ["collector-pre-post", "test-dispatcher-collector-coexistence.mjs"],
  ["conditional-orc", "test-conditional-orc-injection.mjs"],
  ["conditional-rules", "test-conditional-rule-loading.mjs"],
  ["lazy-capabilities", "test-lazy-capability-loading.mjs"],
  ["thin-coordinators", "test-thin-coordinator-loading.mjs"],
  ["budgeted-routing", "test-subagent-budget-routing.mjs"],
  ["operation-scope-symlink", "test-plan-authorization-operation-hook.mjs"],
  ["nested-git-repositories", "test-runtime-efficiency-nested-git-consumer.mjs"],
  ["security-fail-closed", "test-security-hooks-fail-closed.mjs"],
];

const results = [];
try {
  for (const [id, script] of suites) {
    const started = performance.now();
    try {
      const output = execFileSync(process.execPath, [resolve(root, ".claude/scripts", script)], {
        cwd: root,
        encoding: "utf8",
        timeout: 180_000,
        env: {
          ...process.env,
          HOME: isolatedHome,
          CLAUDE_PROJECT_DIR: root,
          ASDD_E2E_CONSUMER: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      results.push({ id, pass: true, duration_ms: +(performance.now() - started).toFixed(2) });
    } catch (error) {
      results.push({
        id,
        pass: false,
        duration_ms: +(performance.now() - started).toFixed(2),
        failure: String(error.stderr || error.message).trim().slice(0, 500),
      });
    }
  }
} finally {
  rmSync(isolatedHome, { recursive: true, force: true });
}

const failed = results.filter((item) => !item.pass).map((item) => item.id);
process.stdout.write(`${JSON.stringify({
  schema_version: 1,
  execution: "independent Node consumer processes with isolated HOME and per-suite temporary fixtures",
  platform_semantics: {
    posix: "native",
    windows_paths: "dispatcher contract fixtures",
    spaces: "isolated HOME plus dispatcher fixtures",
    symlinks: "operation scope escape fixture",
    nested_and_multiple_repositories: "git guard fixtures",
  },
  suites: results.length,
  passed: results.length - failed.length,
  failed,
  results,
}, null, 2)}\n`);
if (failed.length) process.exit(1);
