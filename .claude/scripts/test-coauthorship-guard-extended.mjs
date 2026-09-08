#!/usr/bin/env node
/**
 * Tests extendidos del hook sofka-asdd-pre-tool-use-coauthorship-guard.mjs (R2 — BUILD-007)
 * Cubre los vectores de escape C1-C5 documentados en
 * docs/tech/2026-07-07-001-BUILD-007-bug-c-co-authored-by-escapes-mr.md
 *
 * Uso: node .claude/scripts/test-coauthorship-guard-extended.mjs
 */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = join(__dirname, "..", "hooks");
const HOOK = join(HOOKS_DIR, "sofka-asdd-pre-tool-use-coauthorship-guard.mjs");

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

function bashPayload(command) {
  return JSON.stringify({ tool_name: "Bash", tool_input: { command } });
}

function writePayload(filePath, content) {
  return JSON.stringify({ tool_name: "Write", tool_input: { file_path: filePath, content } });
}

console.log("\n=== Tests extendidos: sofka-asdd-pre-tool-use-coauthorship-guard.mjs (R2 — BUILD-007) ===\n");

// ---- C1a: glab mr update con Co-Authored-By Claude → exit 2 (vector 1) -------
console.log("C1a — glab mr update con trailer Co-Authored-By Claude → exit 2");
{
  const cmd =
    'glab mr update 42 --description "context\\n\\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"';
  const r = run(bashPayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona Coautoría de IA", r.stderr.includes("Coautoría de IA"), `stderr: ${r.stderr}`);
}

// ---- C1b: glab mr edit con trailer → exit 2 ----------------------------------
console.log("\nC1b — glab mr edit con trailer Co-Authored-By Anthropic → exit 2");
{
  const cmd = 'glab mr edit 42 --description "Co-Authored-By: Anthropic AI <ai@anthropic.com>"';
  const r = run(bashPayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
}

// ---- C1c: gh pr edit con trailer → exit 2 ------------------------------------
console.log("\nC1c — gh pr edit con trailer Co-Authored-By → exit 2");
{
  const cmd = 'gh pr edit 7 --body "context\\n\\nCo-Authored-By: Claude <noreply@anthropic.com>"';
  const r = run(bashPayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
}

// ---- C1d: glab api merge_requests con --method POST + trailer inline → exit 2
console.log("\nC1d — glab api merge_requests --method POST con trailer inline → exit 2");
{
  const cmd =
    'glab api projects/:id/merge_requests --method POST --field "description=Co-Authored-By: Claude <noreply@anthropic.com>"';
  const r = run(bashPayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
}

// ---- C1e: gh api pulls con --method PATCH + trailer inline → exit 2 ---------
console.log("\nC1e — gh api /repos/:o/:r/pulls/1 --method PATCH con trailer inline → exit 2");
{
  const cmd =
    'gh api /repos/org/repo/pulls/1 --method PATCH --field "body=Co-Authored-By: ChatGPT <gpt@openai.com>"';
  const r = run(bashPayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
}

// ---- C1f: glab api merge_requests SOLO lectura (sin --method escritura) → exit 0
console.log("\nC1f — glab api merge_requests de solo lectura (sin --method) → exit 0 (no falso positivo)");
{
  const cmd = 'glab api projects/:id/merge_requests --field "description=Co-Authored-By: Claude"';
  const r = run(bashPayload(cmd));
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C2: git commit con patrón "Generated with Claude Code" sin trailer -----
console.log('\nC2 — git commit con "🤖 Generated with Claude Code" sin trailer → exit 2');
{
  const cmd = 'git commit -m "fix: bugfix\\n\\n🤖 Generated with Claude Code"';
  const r = run(bashPayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert(
    "stderr menciona el patrón matcheado",
    r.stderr.includes("Generated/Assisted/Written by"),
    `stderr: ${r.stderr}`
  );
}

// ---- C2b: variante "Assisted by Anthropic" sin trailer → exit 2 -------------
console.log('\nC2b — git commit con "Assisted by Anthropic" sin trailer → exit 2');
{
  const cmd = 'git commit -m "feat: nueva feature\\n\\nAssisted by Anthropic"';
  const r = run(bashPayload(cmd));
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
}

// ---- C3a: Write de pr-description.md con contenido AI → exit 2 (vector 2) ---
console.log("\nC3a — Write de pr-description.md con Co-Authored-By → exit 2");
{
  const payload = writePayload(
    ".tmp/pr-description.md",
    "## Qué resuelve?\nfix\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  );
  const r = run(payload);
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
  assert("stderr menciona el archivo", r.stderr.includes("pr-description.md"), `stderr: ${r.stderr}`);
}

// ---- C3b: Write de mr-body.txt con "Generated with Claude" → exit 2 ---------
console.log("\nC3b — Write de mr-body.txt con patrón prosa sin trailer → exit 2");
{
  const payload = writePayload(".tmp/mr-body.txt", "Refactor completo.\n\nGenerated with Claude Code");
  const r = run(payload);
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
}

// ---- C3c: Write bajo .claude/scripts/test-* con "Co-Authored-By" → exit 0 ---
console.log("\nC3c — Write bajo .claude/scripts/test-* con fixture Co-Authored-By → exit 0 (filtro de path)");
{
  const payload = writePayload(
    ".claude/scripts/test-coauthorship-guard-fixture.mjs",
    'const cmd = "git commit -m \\"Co-Authored-By: Claude\\"";'
  );
  const r = run(payload);
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C3d: Write de código de producción (.mjs sin hints) con el string → exit 0
console.log("\nC3d — Write de archivo .mjs de producción con el string como comentario → exit 0 (no es path candidato)");
{
  const payload = writePayload(".claude/hooks/some-other-hook.mjs", "// nunca usar Co-Authored-By: Claude aquí");
  const r = run(payload);
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C3e: Edit de pr-body.md con Co-Authored-By en new_string → exit 2 ------
console.log("\nC3e — Edit sobre pr-body.md agregando Co-Authored-By en new_string → exit 2");
{
  const payload = JSON.stringify({
    tool_name: "Edit",
    tool_input: {
      file_path: ".tmp/pr-body.md",
      old_string: "## Cambios",
      new_string: "## Cambios\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
    },
  });
  const r = run(payload);
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
}

// ---- C3f: Write de docs/tech/...BUILD-007...md con Co-Authored-By → exit 0 --
console.log(
  "\nC3f — Write de docs/tech/2026-07-07-001-BUILD-007-*.md (bug report) con Co-Authored-By en el contenido → exit 0"
);
{
  const payload = writePayload(
    "docs/tech/2026-07-07-001-BUILD-007-bug-c-co-authored-by-escapes-mr.md",
    "## Materialización\nMR del consumidor con 'Co-Authored-By: Claude Opus 4.8' ya en producción."
  );
  const r = run(payload);
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C3g: Write de SKILL.md de create-mr con Co-Authored-By → exit 0 --------
console.log(
  "\nC3g — Write de .claude/skills/sofka-asdd-tech-lead-create-mr/SKILL.md con el string en el contenido → exit 0"
);
{
  const payload = writePayload(
    ".claude/skills/sofka-asdd-tech-lead-create-mr/SKILL.md",
    "Nunca incluir un trailer 'Co-Authored-By: Claude' en el cuerpo del MR."
  );
  const r = run(payload);
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C3h: Write de docs/tech/...BUILD-001...md (plan maestro) → exit 0 ------
console.log("\nC3h — Write de docs/tech/2026-07-07-001-BUILD-001-*.md (plan maestro) con el string → exit 0");
{
  const payload = writePayload(
    "docs/tech/2026-07-07-001-BUILD-001-plan-maestro.md",
    "Regla: prohibido 'Co-Authored-By: Claude' en cualquier commit o MR."
  );
  const r = run(payload);
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- C3i: Write de .tmp/mr-body.md con atribución IA → exit 2 (Vector 2) ----
console.log("\nC3i — Write de .tmp/mr-body.md con atribución de IA → exit 2 (Vector 2 preservado)");
{
  const payload = writePayload(
    ".tmp/mr-body.md",
    "## Resumen\nfix: corrige bug\n\n🤖 Generated with Claude Code"
  );
  const r = run(payload);
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
}

// ---- C3j: Write de .tmp/pr-body.md con "🤖 Generated with Claude" → exit 2 --
console.log('\nC3j — Write de .tmp/pr-body.md con "🤖 Generated with Claude" → exit 2 (Vector 2 preservado)');
{
  const payload = writePayload(".tmp/pr-body.md", "Cambios varios.\n\n🤖 Generated with Claude");
  const r = run(payload);
  assert("exit 2", r.status === 2, `got exit ${r.status}`);
}

// ---- Regresión: los 3 comandos originales con trailer siguen bloqueando -----
console.log("\nRegresión — git commit / glab mr create / gh pr create con trailer siguen BLOQUEANDO");
{
  const cmds = [
    'git commit -m "feat: x\\n\\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"',
    'glab mr create --title "feat" --description "ctx\\n\\nCo-Authored-By: Claude Haiku <noreply@anthropic.com>"',
    'gh pr create --title "feat" --body "ctx\\n\\nCo-Authored-By: ChatGPT <gpt@openai.com>"',
  ];
  for (const cmd of cmds) {
    const r = run(bashPayload(cmd));
    assert(`bloqueado: ${cmd.slice(0, 40)}...`, r.status === 2, `got exit ${r.status}`);
  }
}

// ---- Regresión: comando legítimo sin atribución sigue pasando ---------------
console.log("\nRegresión — glab mr update sin atribución de IA → exit 0");
{
  const cmd = 'glab mr update 42 --description "Corrige typo en el README"';
  const r = run(bashPayload(cmd));
  assert("exit 0", r.status === 0, `got exit ${r.status}`);
}

// ---- Resumen -----------------------------------------------------------------
console.log(`\n--- Resultado: ${passed} pasaron, ${failed} fallaron ---`);
if (failed > 0) process.exit(1);
