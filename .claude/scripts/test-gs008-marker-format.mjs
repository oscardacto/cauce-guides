#!/usr/bin/env node
// -----------------------------------------------------------------------------
// GS-008: el marcador pre-push y el fast-track config-only.
//
// Tres defectos que hacían que validar bien NO habilitara el push:
//
//   F3  `readMarker` hacía solo `parseInt`. El skill `tech-lead-pre-push` y el
//       githook nativo usan JSON `{ ts, head }`, así que sobre el formato
//       vigente devolvía NaN y el gate concluía "no existe .prepush-validated":
//       correr build y tests (minutos) no habilitaba nada y la única salida
//       mecánica era el escape hatch.
//   F6  Cada capa tenía su lista de extensiones hardcodeada. Al PreToolUse le
//       faltaban sql, sh, ps1, php, rs, swift, scala y svelte, así que las dos
//       capas discrepaban sobre si un mismo push necesitaba marcador.
//   F7  `isConfigOnly` caía a `HEAD~1` cuando no había upstream —el caso normal
//       antes del primer push— y decidía el fast-track mirando SOLO el último
//       commit.
//
// La suite levanta un repo git temporal para que el diff sea determinista y no
// dependa del estado de trabajo de quien la corra.
// -----------------------------------------------------------------------------
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPrePushDecision } from "../hooks/asdd-pre-push-gate.mjs";

let failures = 0;
const assert = (name, condition) => {
  if (condition) console.log(`✅ ${name}`);
  else { failures += 1; console.error(`❌ ${name}`); }
};

const root = mkdtempSync(join(tmpdir(), "asdd-gs008-"));
const origin = join(root, "origin.git");
const work = join(root, "work");
const configRoot = join(root, "config");
const marker = join(configRoot, ".claude", ".prepush-validated");
const previousProjectDir = process.env.CLAUDE_PROJECT_DIR;

const git = (args, cwd = work) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const decide = (cwd = work) => getPrePushDecision(
  { tool_name: "Bash", tool_input: { command: "git push -u origin HEAD" }, cwd },
  { ...process.env },
);
const reasonOf = (result) => String(result?.reason ?? "").split("\n")[0];
const writeMarker = (content) => writeFileSync(marker, content);
const now = () => Math.floor(Date.now() / 1000);

try {
  mkdirSync(join(configRoot, ".claude"), { recursive: true });
  process.env.CLAUDE_PROJECT_DIR = configRoot;

  execFileSync("git", ["init", "--bare", "-b", "dev", origin], { stdio: "ignore" });
  mkdirSync(work, { recursive: true });
  git(["init", "-b", "dev"]);
  git(["config", "user.email", "suite@example.test"]);
  git(["config", "user.name", "suite"]);
  git(["config", "commit.gpgsign", "false"]);
  // Los githooks nativos del template no aplican a este repo desechable.
  git(["config", "core.hooksPath", join(root, "no-hooks")]);

  writeFileSync(join(work, "readme.md"), "base\n");
  git(["add", "readme.md"]);
  git(["commit", "-m", "docs: base"]);
  git(["remote", "add", "origin", origin]);
  git(["push", "-u", "origin", "dev"]);

  // Rama de trabajo: primero código, después documentación. Es la forma exacta
  // que engañaba al fallback de HEAD~1.
  git(["checkout", "-b", "feature/gs008"]);
  writeFileSync(join(work, "a.ts"), "export const a = 1;\n");
  git(["add", "a.ts"]);
  git(["commit", "-m", "feat: codigo"]);
  writeFileSync(join(work, "notas.md"), "notas\n");
  git(["add", "notas.md"]);
  git(["commit", "-m", "docs: notas"]);
  const head = git(["rev-parse", "HEAD"]);

  console.log("\nF7: el fast-track mira toda la rama, no el último commit");
  rmSync(marker, { force: true });
  const sinMarcador = decide();
  assert("con código en un commit anterior, el push exige marcador",
    sinMarcador?.decision === "deny");
  assert("y el motivo es la ausencia del marcador, no otra cosa",
    reasonOf(sinMarcador).includes("no existe .claude/.prepush-validated"));

  console.log("\nF3: el gate lee el formato que el skill realmente escribe");
  writeMarker(JSON.stringify({ ts: now(), head }));
  assert("JSON { ts, head } vigente y atado a HEAD → allow", decide()?.decision === "allow");

  writeMarker(JSON.stringify({ ts: now(), head: "0".repeat(40) }));
  const otroCommit = decide();
  assert("marcador de OTRO commit → deny", otroCommit?.decision === "deny");
  assert("y lo dice: validó un commit distinto del que se pushea",
    reasonOf(otroCommit).includes("validó el commit"));

  writeMarker(String(now()));
  assert("formato legado (timestamp suelto) sigue siendo aceptado",
    decide()?.decision === "allow");

  writeMarker(JSON.stringify({ ts: now() - 99_999, head }));
  const vencido = decide();
  assert("vencido → deny", vencido?.decision === "deny");
  assert("y lo dice: vencido, no inexistente", reasonOf(vencido).includes("vencido"));

  writeMarker("no soy json ni un numero");
  assert("marcador ilegible → deny (fail-closed)", decide()?.decision === "deny");

  console.log("\nF6: las extensiones salen del manifiesto compartido");
  git(["checkout", "-b", "feature/gs008-sql"]);
  writeFileSync(join(work, "migracion.sql"), "select 1;\n");
  git(["add", "migracion.sql"]);
  git(["commit", "-m", "feat: migracion"]);
  rmSync(marker, { force: true });
  assert(".sql cuenta como código fuente y exige marcador",
    decide()?.decision === "deny");

  git(["checkout", "-b", "feature/gs008-docs"]);
  writeFileSync(join(work, "guia.md"), "guia\n");
  git(["add", "guia.md"]);
  git(["commit", "-m", "docs: guia"]);
  // Rama que solo agrega documentación sobre la anterior… pero la anterior
  // trajo un .sql, así que la rama COMPLETA sigue teniendo código.
  assert("una rama con código previo no se fast-trackea por un commit de docs",
    decide()?.decision === "deny");

  git(["checkout", "dev"]);
  git(["checkout", "-b", "docs/solo-docs"]);
  writeFileSync(join(work, "otra.md"), "otra\n");
  git(["add", "otra.md"]);
  git(["commit", "-m", "docs: otra"]);
  assert("una rama realmente solo-docs sí entra al fast-track sin marcador",
    decide()?.decision === "allow");
} finally {
  if (previousProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = previousProjectDir;
  rmSync(root, { recursive: true, force: true });
}

if (failures) process.exit(1);
console.log("\nGS-008 marcador y fast-track: OK");
