#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const fixture = mkdtempSync(join(tmpdir(), "asdd b9 nested repos "));
const nested = resolve(fixture, "nested repo");
const sibling = resolve(fixture, "other repo");
const init = (path, branch) => {
  mkdirSync(path, { recursive: true });
  execFileSync("git", ["init", "-q", path]);
  execFileSync("git", ["-C", path, "checkout", "-q", "-b", branch]);
};
const dispatch = (command) => spawnSync(process.execPath, [resolve(root, ".claude/hooks/sofka-asdd-pre-tool-dispatcher.mjs")], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  input: JSON.stringify({
    hook_event_name: "PreToolUse", session_id: "b9-nested", tool_use_id: "b9-nested",
    cwd: fixture, tool_name: "Bash", tool_input: { command },
  }),
});

try {
  init(fixture, "feature/root");
  init(nested, "dev");
  init(sibling, "feature/other");
  const protectedCommit = dispatch('cd "nested repo" && git commit -m x');
  assert.equal(protectedCommit.status, 0, protectedCommit.stderr);
  const denial = JSON.parse(protectedCommit.stdout);
  assert.equal(denial.hookSpecificOutput.permissionDecision, "deny");
  assert.match(denial.hookSpecificOutput.permissionDecisionReason, /protected|protegida|GS-003/iu);

  for (const command of ['git -C "nested repo" status', 'git -C "other repo" status']) {
    const readOnly = dispatch(command);
    assert.equal(readOnly.status, 0, readOnly.stderr);
    // Contrato del dispatcher: solo escribe cuando NO permite — `emit()` retorna
    // temprano en "allow". Envolver el assert en `if (stdout.trim())` hacía que la
    // prueba se salteara sola en el camino feliz, que es justo el que hay que medir.
    const salida = readOnly.stdout.trim();
    const decision = salida
      ? JSON.parse(salida).hookSpecificOutput?.permissionDecision
      : "allow";
    assert.notEqual(decision, "deny", `${command}: read-only path must not be denied`);
    // Fija el contrato en vez de asumirlo: una lectura se permite EN SILENCIO. Si
    // el dispatcher pasara a emitir un `allow` explícito, esto lo hace visible.
    assert.equal(salida, "", `${command}: se esperaba permiso en silencio, llegó: ${salida}`);
  }
  console.log("PASS nested/multiple Git repositories and paths with spaces");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
