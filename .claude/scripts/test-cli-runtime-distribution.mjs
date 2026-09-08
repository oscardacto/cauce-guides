#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { closeSync, cpSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..", "..");
// realpathSync es obligatorio: en macOS os.tmpdir() devuelve /var/folders/…,
// un symlink a /private/var/folders/…. Los scripts distribuidos solo ejecutan
// main() si `import.meta.url === pathToFileURL(process.argv[1]).href`, y
// import.meta.url ya viene resuelto. Sin resolver el symlink acá, los procesos
// hijos salen con status 0 y stdout vacío — un falso "no hizo nada".
const consumer = realpathSync(mkdtempSync(resolve(tmpdir(), "asdd-cli-runtime-consumer-")));
const contract = JSON.parse(readFileSync(resolve(root, ".sofka-asdd/cli-contract.json"), "utf8"));
let runSeq = 0;

function copyDistribution() {
  for (const relative of contract.distribution) {
    const source = resolve(root, relative);
    const target = resolve(consumer, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }
}

function run(relative, { input = "", args = [] } = {}) {
  const inputPath = resolve(consumer, `.stdin-${runSeq++}`);
  const stdoutPath = `${inputPath}.stdout`;
  const stderrPath = `${inputPath}.stderr`;
  writeFileSync(inputPath, input);
  const stdin = openSync(inputPath, "r");
  const stdout = openSync(stdoutPath, "w+");
  const stderr = openSync(stderrPath, "w+");
  const child = spawn(process.execPath, [resolve(consumer, relative), ...args], {
    cwd: consumer,
    stdio: [stdin, stdout, stderr],
    env: { ...process.env, CLAUDE_PROJECT_DIR: consumer },
  });
  return new Promise((resolveRun, reject) => {
    child.once("error", reject);
    child.once("close", (status) => {
      closeSync(stdin); closeSync(stdout); closeSync(stderr);
      const result = {
        status,
        stdout: readFileSync(stdoutPath, "utf8"),
        stderr: readFileSync(stderrPath, "utf8"),
      };
      unlinkSync(inputPath); unlinkSync(stdoutPath); unlinkSync(stderrPath);
      resolveRun(result);
    });
  });
}

try {
  copyDistribution();

  const validateImports = await run(".claude/scripts/validate-template.mjs", { args: ["--help"] });
  assert.equal(validateImports.status, 0, validateImports.stderr);

  const route = await run(".claude/scripts/sofka-asdd-route-request.mjs", {
    input: JSON.stringify({ request: "¿dónde está health?" }),
  });
  assert.equal(route.status, 0, route.stderr);
  assert.equal(JSON.parse(route.stdout).depth, "TRIVIAL");

  const routeFile = resolve(consumer, "prompt-audit.md");
  writeFileSync(routeFile, "Trabaja READ-ONLY. Audita todos los ADR sin modificar archivos.");
  const routedFile = await run(".claude/scripts/sofka-asdd-route-request.mjs", { args: ["--file", "prompt-audit.md"] });
  assert.equal(routedFile.status, 0, routedFile.stderr);
  assert.equal(JSON.parse(routedFile.stdout).depth, "LIGHT");

  const rule = await run(".claude/scripts/sofka-asdd-resolve-rule.mjs", {
    args: ["sofka-asdd-routing-heuristics"],
  });
  assert.equal(rule.status, 0, rule.stderr);

  const capability = await run(".claude/scripts/sofka-asdd-load-capability.mjs", {
    args: ["sofka-asdd-developer-bug-fix"],
  });
  assert.equal(capability.status, 0, capability.stderr);
  assert.match(capability.stdout, /ASDD capability loaded/u);

  const dispatcher = await run(".claude/hooks/sofka-asdd-pre-tool-dispatcher.mjs", {
    input: JSON.stringify({
      hook_event_name: "PreToolUse", session_id: "cli-consumer", tool_use_id: "deny",
      cwd: consumer, tool_name: "Bash", tool_input: { command: "git reset --hard" },
    }),
  });
  assert.equal(dispatcher.status, 0, dispatcher.stderr);
  assert.equal(JSON.parse(dispatcher.stdout).hookSpecificOutput.permissionDecision, "deny");

  console.log("PASS CLI distribution consumer: validator imports, routing, rule/capability loading and dispatcher deny");
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
