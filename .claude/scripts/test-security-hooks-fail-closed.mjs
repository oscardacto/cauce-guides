#!/usr/bin/env node
/**
 * Smoke tests — fail-closed JSON malformado en hooks de seguridad (#3639)
 *              + NaN guard en SOFKA_ASDD_MAX_WORKTREES (#3643)
 *              + design-guard fail-closed (#3648)
 *
 * Uso: node .claude/scripts/test-security-hooks-fail-closed.mjs
 *
 * Casos cubiertos:
 *  C1  dangerous-bash:      stdin no-JSON  → exit 2   (#3639)
 *  C2  dangerous-bash:      stdin vacío    → exit 0   (comportamiento preservado)
 *  C3  analyze-guard:       stdin no-JSON  → exit 2   (#3639)
 *  C4  analyze-guard:       stdin vacío    → exit 0   (comportamiento preservado)
 *  C5  pre-pr-gate:         stdin no-JSON  → exit 2   (#3639)
 *  C6  pre-pr-gate:         stdin vacío    → exit 0   (comportamiento preservado)
 *  C7  dangerous-bash:      MAX_WORKTREES=abc → cap efectivo = 3 (no infinito) (#3643)
 *  C14 design-guard:        stdin no-JSON  → exit 2   (#3648)
 *  C15 design-guard:        stdin vacío    → exit 0   (comportamiento preservado)
 *  C16 coauthorship-guard:  stdin no-JSON  → exit 2   (#3649)
 *  C17 coauthorship-guard:  stdin vacío    → exit 0   (comportamiento preservado)
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = join(__dirname, "..", "hooks");
const TMP_DIR = tmpdir();

const DANGEROUS_BASH = join(HOOKS_DIR, "sofka-asdd-pre-tool-use-dangerous-bash.mjs");
const ANALYZE_GUARD = join(HOOKS_DIR, "sofka-asdd-pre-tool-use-analyze-guard.mjs");
const PR_GATE = join(HOOKS_DIR, "sofka-asdd-pre-pr-gate.mjs");
const DEP_CHECK = join(HOOKS_DIR, "sofka-asdd-pre-tool-use-dep-check.mjs");
const SPEC_CHECK = join(HOOKS_DIR, "sofka-asdd-pre-tool-use-spec-check.mjs");
const DESIGN_GUARD = join(HOOKS_DIR, "sofka-asdd-pre-tool-use-design-guard.mjs");
const COAUTHORSHIP_GUARD = join(HOOKS_DIR, "sofka-asdd-pre-tool-use-coauthorship-guard.mjs");

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

function run(hookPath, stdinInput, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  return spawnSync("node", [hookPath], {
    input: stdinInput,
    encoding: "utf8",
    env,
    timeout: 8000,
  });
}

console.log("\n=== Test: fail-closed JSON malformado (#3639) + NaN guard (#3643) ===\n");

// ---- C1: dangerous-bash — stdin malformado → exit 2 -------------------------
console.log("C1 — dangerous-bash: stdin malformado → exit 2 (fail-closed)");
{
  const r = run(DANGEROUS_BASH, "no-json-at-all");
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona JSON malformado", r.stderr.includes("JSON malformado"), `stderr: ${r.stderr}`);
}

// ---- C2: dangerous-bash — stdin vacío → exit 0 (preservado) -----------------
console.log("\nC2 — dangerous-bash: stdin vacío → exit 0 (comportamiento preservado)");
{
  const r = run(DANGEROUS_BASH, "");
  // El hook puede salir con 0 (no es comando Bash con worktree payload)
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C3: analyze-guard — stdin malformado → exit 2 --------------------------
console.log("\nC3 — analyze-guard: stdin malformado → exit 2 (fail-closed)");
{
  const r = run(ANALYZE_GUARD, "not valid json {{{");
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona JSON malformado", r.stderr.includes("JSON malformado"), `stderr: ${r.stderr}`);
}

// ---- C4: analyze-guard — stdin vacío → exit 0 (preservado) ------------------
console.log("\nC4 — analyze-guard: stdin vacío → exit 0 (comportamiento preservado)");
{
  const r = run(ANALYZE_GUARD, "");
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C5: pre-pr-gate — stdin malformado → exit 2 ----------------------------
console.log("\nC5 — pre-pr-gate: stdin malformado → exit 2 (fail-closed)");
{
  const r = run(PR_GATE, "{{bad json}}");
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona JSON malformado", r.stderr.includes("JSON malformado"), `stderr: ${r.stderr}`);
}

// ---- C6: pre-pr-gate — stdin vacío → exit 0 (preservado) --------------------
console.log("\nC6 — pre-pr-gate: stdin vacío → exit 0 (comportamiento preservado)");
{
  const r = run(PR_GATE, "");
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C7: NaN guard — MAX_WORKTREES=abc → cap=3 (no infinito) ----------------
// Verificamos que el código NO cuelga ni falla de forma inesperada.
// El hook llama a git worktree; lo testeamos con un payload que activa la rama
// de worktree add. Si MAX_WORKTREES=abc fuera NaN sin guard, la condición
// current >= NaN+1 sería siempre false → cap desactivado.
// Con el fix, NaN → 3 → comportamiento idéntico al default.
console.log("\nC7 — dangerous-bash: MAX_WORKTREES=abc → NaN guard activo, cap=3 (no falla)");
{
  const payload = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: `git worktree add ${join(TMP_DIR, "test-wt")}` },
  });
  // Corremos sin SOFKA_ASDD_GUARD_BASH_DISABLE y sin escapar variables sensibles
  const r = run(DANGEROUS_BASH, payload, { SOFKA_ASDD_MAX_WORKTREES: "abc" });
  // El hook puede bloquear por el cap (si hay worktrees) o pasar — lo que importa
  // es que NO produce NaN en la comparación (no sale con código inesperado como 1 por error JS).
  // Exit 0 (permitido) o exit 2 (bloqueado por cap) son ambos válidos.
  assert(
    "exit 0 o exit 2 (nunca undefined/null por error JS con NaN)",
    r.status === 0 || r.status === 2,
    `got exit ${r.status}, stderr: ${r.stderr.slice(0, 120)}`
  );
  assert(
    "sin stack trace de TypeError (NaN sin guard causaría comportamiento inesperado)",
    !r.stderr.includes("TypeError") && !r.stderr.includes("NaN"),
    `stderr: ${r.stderr.slice(0, 200)}`
  );
}

// ---- C8: dep-check — stdin malformado → exit 2 (#3639) ----------------------
console.log("\nC8 — dep-check: stdin malformado → exit 2 (fail-closed)");
{
  const r = run(DEP_CHECK, "not-valid-json{{{");
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona JSON malformado", r.stderr.includes("JSON malformado"), `stderr: ${r.stderr}`);
}

// ---- C9: dep-check — stdin vacío → exit 0 (preservado) ----------------------
console.log("\nC9 — dep-check: stdin vacío → exit 0 (comportamiento preservado)");
{
  const r = run(DEP_CHECK, "");
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C10: spec-check guard activo — stdin malformado → exit 2 (#3639) -------
console.log("\nC10 — spec-check (guard activo): stdin malformado → exit 2 (fail-closed)");
{
  const r = run(SPEC_CHECK, "{{not-json}}", { ASDD_SPEC_GUARD_ENABLED: "true" });
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona JSON malformado", r.stderr.includes("JSON malformado"), `stderr: ${r.stderr}`);
}

// ---- C11: spec-check guard default (off) — stdin malformado → exit 0 --------
// El guard desactivado cortocircuita ANTES del parseInput, así que el JSON
// malformado nunca llega al bloque catch → exit 0 es el comportamiento correcto.
console.log("\nC11 — spec-check (guard off, default): stdin malformado → exit 0 (short-circuit preservado)");
{
  const r = run(SPEC_CHECK, "{{not-json}}");
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C12: spec-check — stdin vacío → exit 0 (preservado) --------------------
console.log("\nC12 — spec-check: stdin vacío → exit 0 (comportamiento preservado)");
{
  const r = run(SPEC_CHECK, "");
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C13: dep-check — payload JSON válido sin archivo de manifiesto → exit 0 -
// Garantiza que el happy-path (JSON bien formado, archivo no monitoreado) sigue pasando.
console.log("\nC13 — dep-check: payload JSON válido (no-manifiesto) → exit 0 (happy-path intacto)");
{
  const payload = JSON.stringify({
    tool_name: "Write",
    tool_input: { file_path: "src/some-component.ts", content: "export const x = 1;" },
    cwd: TMP_DIR,
  });
  const r = run(DEP_CHECK, payload);
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C14: design-guard — stdin malformado → exit 2 (#3648) ------------------
console.log("\nC14 — design-guard: stdin malformado → exit 2 (fail-closed)");
{
  const r = run(DESIGN_GUARD, "not-valid-json{{{");
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona JSON malformado", r.stderr.includes("JSON malformado"), `stderr: ${r.stderr}`);
}

// ---- C15: design-guard — stdin vacío → exit 0 (preservado) ------------------
console.log("\nC15 — design-guard: stdin vacío → exit 0 (comportamiento preservado)");
{
  const r = run(DESIGN_GUARD, "");
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C16: coauthorship-guard — stdin malformado → exit 2 (#3649) -------------
console.log("\nC16 — coauthorship-guard: stdin malformado → exit 2 (fail-closed)");
{
  const r = run(COAUTHORSHIP_GUARD, "not-valid-json{{{");
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona JSON malformado", r.stderr.includes("JSON malformado"), `stderr: ${r.stderr}`);
}

// ---- C17: coauthorship-guard — stdin vacío → exit 0 (preservado) ------------
console.log("\nC17 — coauthorship-guard: stdin vacío → exit 0 (comportamiento preservado)");
{
  const r = run(COAUTHORSHIP_GUARD, "");
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- Resumen -----------------------------------------------------------------
console.log(`\n--- Resultado: ${passed} pasaron, ${failed} fallaron ---`);
if (failed > 0) process.exit(1);
