#!/usr/bin/env node
/**
 * Tests funcionales del hook asdd-pre-tool-use-coauthorship-guard.mjs (#3649)
 * Uso: node .claude/scripts/test-coauthorship-guard-hook.mjs
 */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = join(__dirname, "..", "hooks");
const HOOK = join(HOOKS_DIR, "asdd-pre-tool-use-coauthorship-guard.mjs");

let passed = 0;
let failed = 0;

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
  return spawnSync("node", [HOOK], {
    input: stdinInput,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    timeout: 8000,
  });
}

function makePayload(command) {
  return JSON.stringify({ tool_name: "Bash", tool_input: { command } });
}

console.log("\n=== Tests: asdd-pre-tool-use-coauthorship-guard.mjs (#3649) ===\n");

// ---- C1: git commit con Co-Authored-By Claude → exit 2 ----------------------
console.log('C1 — git commit con Co-Authored-By Claude → exit 2');
{
  const cmd = 'git commit -m "feat: add feature\\n\\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"';
  const r = run(makePayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona Coautoría de IA", r.stderr.includes("Coautoría de IA"), `stderr: ${r.stderr}`);
}

// ---- C2: git commit con Co-Authored-By Anthropic → exit 2 -------------------
console.log('\nC2 — git commit con Co-Authored-By Anthropic → exit 2');
{
  const cmd = 'git commit -m "fix: bugfix\\n\\nCo-Authored-By: Anthropic AI <ai@anthropic.com>"';
  const r = run(makePayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona Coautoría de IA", r.stderr.includes("Coautoría de IA"), `stderr: ${r.stderr}`);
}

// ---- C3: git commit sin Co-Authored-By → exit 0 -----------------------------
console.log('\nC3 — git commit sin Co-Authored-By → exit 0');
{
  const cmd = 'git commit -m "chore: cleanup"';
  const r = run(makePayload(cmd));
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C4: git commit con co-autor humano → exit 0 ----------------------------
console.log('\nC4 — git commit con co-autor humano → exit 0');
{
  const cmd = 'git commit -m "feat: new\\n\\nCo-Authored-By: Pedro Gómez <pedro@sofka.com.co>"';
  const r = run(makePayload(cmd));
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C5: glab mr create con Co-Authored-By Claude → exit 2 ------------------
console.log('\nC5 — glab mr create con Co-Authored-By Claude → exit 2');
{
  const cmd = 'glab mr create --title "feat" --description "context\\n\\nCo-Authored-By: Claude Haiku <noreply@anthropic.com>"';
  const r = run(makePayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona Coautoría de IA", r.stderr.includes("Coautoría de IA"), `stderr: ${r.stderr}`);
}

// ---- C6: gh pr create con Co-Authored-By ChatGPT → exit 2 -------------------
console.log('\nC6 — gh pr create con Co-Authored-By ChatGPT → exit 2');
{
  const cmd = 'gh pr create --title "feat" --body "description\\n\\nCo-Authored-By: ChatGPT <gpt@openai.com>"';
  const r = run(makePayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona Coautoría de IA", r.stderr.includes("Coautoría de IA"), `stderr: ${r.stderr}`);
}

// ---- C7: JSON malformado → exit 2 (fail-closed) -----------------------------
console.log('\nC7 — JSON malformado → exit 2 (fail-closed)');
{
  const r = run("not-valid-json{{{");
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona JSON malformado", r.stderr.includes("JSON malformado"), `stderr: ${r.stderr}`);
}

// ---- C8: stdin vacío → exit 0 -----------------------------------------------
console.log('\nC8 — stdin vacío → exit 0');
{
  const r = run("");
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C9: ASDD_COAUTHORSHIP_GUARD_ENABLED=false + IA → exit 0 ----------------
console.log('\nC9 — guard desactivado + Co-Authored-By Claude → exit 0');
{
  const cmd = 'git commit -m "feat: test\\n\\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"';
  const r = run(makePayload(cmd), { ASDD_COAUTHORSHIP_GUARD_ENABLED: "false" });
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C10: ls -la (no es git commit ni mr create) → exit 0 -------------------
console.log('\nC10 — ls -la (no es git commit) → exit 0');
{
  const r = run(makePayload("ls -la"));
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C11: git status → exit 0 -----------------------------------------------
console.log('\nC11 — git status → exit 0');
{
  const r = run(makePayload("git status"));
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C12: variante lowercase claude → exit 2 --------------------------------
console.log('\nC12 — variante lowercase claude-code → exit 2');
{
  const cmd = 'git commit -m "feat: add\\n\\nCo-Authored-By: claude-code <noreply@anthropic.com>"';
  const r = run(makePayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona Coautoría de IA", r.stderr.includes("Coautoría de IA"), `stderr: ${r.stderr}`);
}

// ---- Resumen -----------------------------------------------------------------
console.log(`\n--- Resultado: ${passed} pasaron, ${failed} fallaron ---`);
if (failed > 0) process.exit(1);
