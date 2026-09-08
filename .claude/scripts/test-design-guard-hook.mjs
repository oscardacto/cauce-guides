#!/usr/bin/env node
// Tests funcionales del hook sofka-asdd-pre-tool-use-design-guard.mjs (#3648)
// Uso: node .claude/scripts/test-design-guard-hook.mjs

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, "..", "hooks", "sofka-asdd-pre-tool-use-design-guard.mjs");

let passed = 0;
let failed = 0;

// Cleanup de dirs temporales al salir
const tempDirs = [];
process.on("exit", () => {
  for (const d of tempDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch (_) {}
  }
});

function makeTmpDir() {
  const d = mkdtempSync(join(tmpdir(), "design-guard-test-"));
  tempDirs.push(d);
  return d;
}

function assert(label, ok, detail = "") {
  if (ok) {
    console.log(`    ✅ ${label}`);
    passed++;
  } else {
    console.error(`    ❌ FAIL: ${label}${detail ? `  →  ${detail}` : ""}`);
    failed++;
  }
}

function run(stdinInput, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  return spawnSync("node", [HOOK], {
    input: stdinInput,
    encoding: "utf8",
    env,
    timeout: 8000,
  });
}

function makePayload(toolName, filePath, cwd) {
  return JSON.stringify({
    tool_name: toolName,
    tool_input: { file_path: filePath },
    cwd,
  });
}

console.log("\n=== Tests: sofka-asdd-pre-tool-use-design-guard.mjs (#3648) ===\n");

// ---- C1: Write a docs/architecture/ sin spec → exit 2 (bloquea) -------------
console.log("C1 — Write a docs/architecture/ADR-001.md sin spec en docs/specs/ → exit 2 (WF-003 bloquea)");
{
  const cwd = makeTmpDir();
  mkdirSync(join(cwd, "docs", "architecture"), { recursive: true });
  mkdirSync(join(cwd, "docs", "specs"), { recursive: true });
  // docs/specs existe pero está vacío (no hay spec)
  const payload = makePayload("Write", "docs/architecture/ADR-001.md", cwd);
  const r = run(payload);
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona WF-003", r.stderr.includes("WF-003"), `stderr: ${r.stderr}`);
}

// ---- C2: Write a docs/architecture/ con spec válida → exit 0 (permite) ------
console.log("\nC2 — Write a docs/architecture/ADR-001.md con spec válida (auth-001.md) → exit 0");
{
  const cwd = makeTmpDir();
  mkdirSync(join(cwd, "docs", "architecture"), { recursive: true });
  mkdirSync(join(cwd, "docs", "specs"), { recursive: true });
  writeFileSync(join(cwd, "docs", "specs", "auth-001.md"), "# Spec auth\n");
  const payload = makePayload("Write", "docs/architecture/ADR-001.md", cwd);
  const r = run(payload);
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C3: Write a src/ (fuera de docs/architecture/) → exit 0 ----------------
console.log("\nC3 — Write a src/components/Button.tsx (fuera del path protegido) → exit 0");
{
  const cwd = makeTmpDir();
  const payload = makePayload("Write", "src/components/Button.tsx", cwd);
  const r = run(payload);
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C4: Tool Read (no Write/Edit) → exit 0 ---------------------------------
console.log("\nC4 — tool Read (no Write/Edit) → exit 0");
{
  const cwd = makeTmpDir();
  const payload = JSON.stringify({
    tool_name: "Read",
    tool_input: { file_path: "docs/architecture/ADR-001.md" },
    cwd,
  });
  const r = run(payload);
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C5: JSON malformado → exit 2 (fail-closed) -----------------------------
console.log("\nC5 — JSON malformado → exit 2 (fail-closed)");
{
  const r = run("not-valid-json{{{");
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona JSON malformado", r.stderr.includes("JSON malformado"), `stderr: ${r.stderr}`);
}

// ---- C6: stdin vacío → exit 0 -----------------------------------------------
console.log("\nC6 — stdin vacío → exit 0");
{
  const r = run("");
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C7: ASDD_DESIGN_GUARD_ENABLED=false + sin spec → exit 0 (desactivado) --
console.log("\nC7 — ASDD_DESIGN_GUARD_ENABLED=false + sin spec → exit 0 (guard desactivado)");
{
  const cwd = makeTmpDir();
  mkdirSync(join(cwd, "docs", "architecture"), { recursive: true });
  // Sin spec en docs/specs — pero el guard está desactivado
  const payload = makePayload("Write", "docs/architecture/ADR-001.md", cwd);
  const r = run(payload, { ASDD_DESIGN_GUARD_ENABLED: "false" });
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C8: Solo existe brief-*.md en docs/specs/ (no es spec válida) → exit 2 -
console.log("\nC8 — Solo existe brief-proyecto.md en docs/specs/ (no es spec válida) → exit 2");
{
  const cwd = makeTmpDir();
  mkdirSync(join(cwd, "docs", "architecture"), { recursive: true });
  mkdirSync(join(cwd, "docs", "specs"), { recursive: true });
  writeFileSync(join(cwd, "docs", "specs", "brief-proyecto.md"), "# Brief\n");
  const payload = makePayload("Write", "docs/architecture/decisions/ADR-001.md", cwd);
  const r = run(payload);
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona WF-003", r.stderr.includes("WF-003"), `stderr: ${r.stderr}`);
}

// ---- C9: ASDD_DESIGN_GUARD_PATHS=docs/diseno custom + Write sin spec → exit 2
console.log("\nC9 — ASDD_DESIGN_GUARD_PATHS=docs/diseno custom + Write a docs/diseno/wireframe.md sin spec → exit 2");
{
  const cwd = makeTmpDir();
  mkdirSync(join(cwd, "docs", "diseno"), { recursive: true });
  mkdirSync(join(cwd, "docs", "specs"), { recursive: true });
  // No hay spec válida
  const payload = makePayload("Write", "docs/diseno/wireframe.md", cwd);
  const r = run(payload, { ASDD_DESIGN_GUARD_PATHS: "docs/diseno" });
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona WF-003", r.stderr.includes("WF-003"), `stderr: ${r.stderr}`);
}

// ---- Resumen -----------------------------------------------------------------
console.log(`\n--- Resultado: ${passed} pasaron, ${failed} fallaron ---`);
if (failed > 0) process.exit(1);
