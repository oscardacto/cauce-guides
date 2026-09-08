#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/scripts/test-orc-tier-c-hooks.mjs
//
// Smoke tests — Ola 2 (WI #3607): 4 hooks Tier-C SessionStart
//
//   T11 — codebase-size: escape hatch desactiva el hook
//   T12 — codebase-size: lock override (maturity=large) toma precedencia
//   T13 — codebase-size: lock override (maturity=small) toma precedencia
//   T14 — codebase-size: auto-detección emite un valor válido (large|small)
//   T15 — model-strategy: escape hatch desactiva el hook
//   T16 — model-strategy: sin lock → no emitir nada
//   T17 — model-strategy: con lock emite tabla de fases
//   T18 — tdd-state: escape hatch desactiva el hook
//   T19 — tdd-state: strict_tdd=false → no emitir nada
//   T20 — tdd-state: strict_tdd=true → emitir instrucción STRICT TDD MODE
//   T21 — state-freshness: escape hatch desactiva el hook
//   T22 — state-freshness: sin .asdd-run.json → no emitir nada
//   T23 — state-freshness: status=complete → no emitir nada
//   T24 — state-freshness: status=in_progress → emitir recordatorio ORC-007
//   T25 — state-freshness: status=rate_limited → emitir recordatorio ORC-007
// -----------------------------------------------------------------------------

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksDir  = join(__dirname, "..", "hooks");

let passed = 0;
let failed = 0;

function assert(condition, id, description) {
  if (condition) {
    console.log(`  PASS [${id}] ${description}`);
    passed++;
  } else {
    console.error(`  FAIL [${id}] ${description}`);
    failed++;
  }
}

function runHook(hookFile, env = {}) {
  const result = spawnSync("node", [hookFile], {
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env, ...env },
    cwd: process.cwd(),
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
}

function runHookInDir(hookFile, workDir, env = {}) {
  const result = spawnSync("node", [hookFile], {
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env, ...env },
    cwd: workDir,
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
}

function makeTmpDir() {
  const tmp = join(tmpdir(), "orc-tier-c-test-" + randomBytes(4).toString("hex"));
  mkdirSync(tmp, { recursive: true });
  return tmp;
}

function initGitRepo(dir) {
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir, encoding: "utf8" });
  // Commit inicial
  writeFileSync(join(dir, "README.md"), "test");
  spawnSync("git", ["add", "."], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["commit", "--no-verify", "-m", "init"], { cwd: dir, encoding: "utf8" });
}

// ============================================================================
// asdd-codebase-size.mjs
// ============================================================================
console.log("\n=== Ola 2 — asdd-codebase-size.mjs ===");
const codesizeHook = join(hooksDir, "asdd-codebase-size.mjs");

{
  // T11: escape hatch
  const r = runHook(codesizeHook, { ASDD_CODEBASE_SIZE_DISABLE: "1" });
  assert(r.status === 0 && r.stdout.trim() === "", "T11", "codebase-size: escape hatch → sin output");
}

{
  // T12: lock override large
  const tmp = makeTmpDir();
  try {
    initGitRepo(tmp);
    mkdirSync(join(tmp, ".asdd"), { recursive: true });
    writeFileSync(join(tmp, ".asdd", "asdd.lock"), JSON.stringify({
      project_context: { maturity: "large" }
    }));
    const r = runHookInDir(codesizeHook, tmp);
    assert(
      r.stdout.includes("codebase_size: large") && r.stdout.includes("override"),
      "T12", "codebase-size: lock override maturity=large toma precedencia"
    );
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

{
  // T13: lock override small
  const tmp = makeTmpDir();
  try {
    initGitRepo(tmp);
    mkdirSync(join(tmp, ".asdd"), { recursive: true });
    writeFileSync(join(tmp, ".asdd", "asdd.lock"), JSON.stringify({
      project_context: { maturity: "small" }
    }));
    const r = runHookInDir(codesizeHook, tmp);
    assert(
      r.stdout.includes("codebase_size: small") && r.stdout.includes("override"),
      "T13", "codebase-size: lock override maturity=small toma precedencia"
    );
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

{
  // T14: auto-detección emite large o small
  const r = runHook(codesizeHook);
  assert(
    r.status === 0 && (r.stdout.includes("codebase_size: large") || r.stdout.includes("codebase_size: small")),
    "T14", "codebase-size: auto-detección emite codebase_size: large|small"
  );
}

// ============================================================================
// asdd-model-strategy.mjs
// ============================================================================
console.log("\n=== Ola 2 — asdd-model-strategy.mjs ===");
const modelHook = join(hooksDir, "asdd-model-strategy.mjs");

{
  // T15: escape hatch
  const r = runHook(modelHook, { ASDD_MODEL_STRATEGY_DISABLE: "1" });
  assert(r.status === 0 && r.stdout.trim() === "", "T15", "model-strategy: escape hatch → sin output");
}

{
  // T16: sin lock → sin output
  const tmp = makeTmpDir();
  try {
    initGitRepo(tmp);
    const r = runHookInDir(modelHook, tmp);
    assert(r.status === 0 && r.stdout.trim() === "", "T16", "model-strategy: sin lock → sin output");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

{
  // T17: con lock con phase_default → tabla de fases
  const tmp = makeTmpDir();
  try {
    initGitRepo(tmp);
    mkdirSync(join(tmp, ".asdd"), { recursive: true });
    writeFileSync(join(tmp, ".asdd", "asdd.lock"), JSON.stringify({
      model_strategy: {
        phase_default: {
          specify: "sonnet", analyze: "sonnet", design: "opus",
          build: "sonnet", verify: "opus", document: "haiku"
        }
      }
    }));
    const r = runHookInDir(modelHook, tmp);
    assert(
      r.stdout.includes("Model Strategy") && r.stdout.includes("specify") && r.stdout.includes("opus"),
      "T17", "model-strategy: con lock emite tabla de fases con modelos"
    );
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ============================================================================
// asdd-tdd-state.mjs
// ============================================================================
console.log("\n=== Ola 2 — asdd-tdd-state.mjs ===");
const tddHook = join(hooksDir, "asdd-tdd-state.mjs");

{
  // T18: escape hatch
  const r = runHook(tddHook, { ASDD_TDD_STATE_DISABLE: "1" });
  assert(r.status === 0 && r.stdout.trim() === "", "T18", "tdd-state: escape hatch → sin output");
}

{
  // T19: strict_tdd=false → sin output
  const tmp = makeTmpDir();
  try {
    initGitRepo(tmp);
    mkdirSync(join(tmp, ".asdd"), { recursive: true });
    writeFileSync(join(tmp, ".asdd", "testing-capabilities.yaml"), "strict_tdd: false\n");
    const r = runHookInDir(tddHook, tmp);
    assert(r.status === 0 && r.stdout.trim() === "", "T19", "tdd-state: strict_tdd=false → sin output");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

{
  // T20: strict_tdd=true → emite STRICT TDD MODE ACTIVO
  const tmp = makeTmpDir();
  try {
    initGitRepo(tmp);
    mkdirSync(join(tmp, ".asdd"), { recursive: true });
    writeFileSync(join(tmp, ".asdd", "testing-capabilities.yaml"),
      "strict_tdd: true\nrunner.command: bun test\n"
    );
    const r = runHookInDir(tddHook, tmp);
    assert(
      r.stdout.includes("STRICT TDD MODE ACTIVO") && r.stdout.includes("bun test"),
      "T20", "tdd-state: strict_tdd=true → emite instrucción STRICT TDD MODE con test runner"
    );
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ============================================================================
// asdd-state-freshness.mjs
// ============================================================================
console.log("\n=== Ola 2 — asdd-state-freshness.mjs ===");
const stateHook = join(hooksDir, "asdd-state-freshness.mjs");

{
  // T21: escape hatch
  const r = runHook(stateHook, { ASDD_STATE_FRESHNESS_DISABLE: "1" });
  assert(r.status === 0 && r.stdout.trim() === "", "T21", "state-freshness: escape hatch → sin output");
}

{
  // T22: sin .asdd-run.json → sin output
  const tmp = makeTmpDir();
  try {
    initGitRepo(tmp);
    const r = runHookInDir(stateHook, tmp);
    assert(r.status === 0 && r.stdout.trim() === "", "T22", "state-freshness: sin .asdd-run.json → sin output");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

{
  // T23: status=complete → sin output
  const tmp = makeTmpDir();
  try {
    initGitRepo(tmp);
    writeFileSync(join(tmp, ".asdd-run.json"), JSON.stringify({
      run_id: "2026-06-18-001", status: "complete", current_phase: "document"
    }));
    const r = runHookInDir(stateHook, tmp);
    assert(r.status === 0 && r.stdout.trim() === "", "T23", "state-freshness: status=complete → sin output");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

{
  // T24: status=in_progress → recordatorio ORC-007
  const tmp = makeTmpDir();
  try {
    initGitRepo(tmp);
    writeFileSync(join(tmp, ".asdd-run.json"), JSON.stringify({
      run_id: "2026-06-18-002", status: "in_progress", current_phase: "build",
      resume_hint: "invocar asdd-developer-backend con scope payments/"
    }));
    const r = runHookInDir(stateHook, tmp);
    assert(
      r.stdout.includes("ORC-007") && r.stdout.includes("in_progress"),
      "T24", "state-freshness: status=in_progress → emite recordatorio ORC-007"
    );
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

{
  // T25: status=rate_limited → recordatorio ORC-007
  const tmp = makeTmpDir();
  try {
    initGitRepo(tmp);
    writeFileSync(join(tmp, ".asdd-run.json"), JSON.stringify({
      run_id: "2026-06-18-003", status: "rate_limited", current_phase: "verify"
    }));
    const r = runHookInDir(stateHook, tmp);
    assert(
      r.stdout.includes("ORC-007") && r.stdout.includes("rate_limited"),
      "T25", "state-freshness: status=rate_limited → emite recordatorio ORC-007"
    );
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ============================================================================
// Resumen
// ============================================================================
console.log(`\n=== Resultado Ola 2: ${passed} PASS / ${failed} FAIL ===`);
if (failed > 0) {
  process.exit(1);
}
