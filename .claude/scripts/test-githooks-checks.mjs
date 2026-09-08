#!/usr/bin/env node
// Suite de la capa de enforcement git nativa (.sofka-asdd/githooks).
//
// Las funciones de checks son puras respecto de git salvo dos, que se prueban
// contra el repo real (integridad de reglas) y contra un repo fixture temporal
// (naming de artefactos). No se hace ningún commit real.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkArtifactNaming,
  checkBranchNaming,
  checkCommitMessage,
  checkNoAiAttribution,
  checkProtectedBranch,
  checkRuleIntegrity,
} from "../../.sofka-asdd/githooks/lib/checks.mjs";

const repoRaiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let pasaron = 0;
const casos = [];
const test = (nombre, fn) => casos.push([nombre, fn]);

// ---- GS-001 -----------------------------------------------------------------

test("GS-001 bloquea las ramas protegidas por defecto", () => {
  for (const rama of ["main", "master", "qa", "dev", "develop"]) {
    assert.equal(checkProtectedBranch(rama).ok, false, rama);
  }
});

test("GS-001 permite una feature branch", () => {
  assert.equal(checkProtectedBranch("fix/algo-concreto").ok, true);
});

test("GS-001 respeta SOFKA_ASDD_PROTECTED_BRANCHES", () => {
  const env = { SOFKA_ASDD_PROTECTED_BRANCHES: "trunk,release" };
  assert.equal(checkProtectedBranch("trunk", env).ok, false);
  assert.equal(checkProtectedBranch("dev", env).ok, true, "dev deja de estar protegida si no se declara");
});

test("GS-001 no opina en detached HEAD", () => {
  assert.equal(checkProtectedBranch(null).ok, true);
});

// ---- GS-004 -----------------------------------------------------------------

test("GS-004 exige prefijo GitFlow", () => {
  assert.equal(checkBranchNaming("RamaSinPrefijo").ok, false);
  assert.equal(checkBranchNaming("feature/algo").ok, true);
  assert.equal(checkBranchNaming("wt/refund-abc123").ok, true, "los worktrees usan wt/");
});

test("GS-004 rechaza nombres de más de 60 caracteres", () => {
  assert.equal(checkBranchNaming(`fix/${"x".repeat(70)}`).ok, false);
});

test("GS-004 no exige prefijo a las ramas protegidas", () => {
  assert.equal(checkBranchNaming("main").ok, true);
});

// ---- GS-005 -----------------------------------------------------------------

test("GS-005 acepta conventional commits", () => {
  for (const m of [
    "feat: algo",
    "fix(auth): corrige el token",
    "refactor!: cambia el contrato",
    "merge(area): feature — abc1234",
  ]) {
    assert.equal(checkCommitMessage(m).ok, true, m);
  }
});

test("GS-005 rechaza lo que no es conventional", () => {
  for (const m of ["mensaje suelto", "HANDOFF: artefactos", "WIP", ""]) {
    assert.equal(checkCommitMessage(m).ok, false, JSON.stringify(m));
  }
});

test("GS-005 no rompe los merges y reverts que genera git", () => {
  assert.equal(checkCommitMessage("Merge branch 'dev' into 'qa'").ok, true);
  assert.equal(checkCommitMessage('Revert "feat: algo"').ok, true);
});

test("GS-005 ignora las líneas de comentario del editor", () => {
  assert.equal(checkCommitMessage("# comentario\nfeat: real").ok, true);
});

test("GS-005 rechaza asuntos de más de 100 caracteres", () => {
  assert.equal(checkCommitMessage(`feat: ${"x".repeat(120)}`).ok, false);
});

// ---- CORE-009 ---------------------------------------------------------------

test("CORE-009 detecta atribución de IA en el mensaje", () => {
  for (const m of [
    "feat: algo\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
    "feat: algo\n\n🤖 Generated with Claude Code",
    "feat: algo\n\nco-authored-by: anthropic",
  ]) {
    assert.equal(checkNoAiAttribution(m).ok, false, m.slice(0, 40));
  }
});

test("CORE-009 no marca un mensaje limpio", () => {
  assert.equal(checkNoAiAttribution("feat(auth): agrega validación de token").ok, true);
});

// ---- ART-001 ----------------------------------------------------------------

function repoFixture(archivos, run) {
  const dir = mkdtempSync(path.join(tmpdir(), "asdd-githooks-"));
  const g = (args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  g(["init", "-q", "-b", "fix/prueba"]);
  g(["config", "user.email", "t@t.t"]);
  g(["config", "user.name", "t"]);
  if (run) writeFileSync(path.join(dir, ".asdd-run.json"), JSON.stringify(run));
  for (const rel of archivos) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, "x");
  }
  g(["add", "-A"]);
  return dir;
}

test("ART-001 bloquea un artefacto nuevo con nombre libre bajo docs/", () => {
  const dir = repoFixture(["docs/tech/quality-gate-login.md"], {
    run_id: "2026-08-21-001",
    status: "in_progress",
    current_phase: "verify",
  });
  try {
    assert.equal(checkArtifactNaming(dir).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ART-001 acepta el patrón canónico del run activo", () => {
  const dir = repoFixture(["docs/tech/2026-08-21-001-VERIFY-004-quality-gate-login.md"], {
    run_id: "2026-08-21-001",
    status: "in_progress",
    current_phase: "verify",
  });
  try {
    assert.equal(checkArtifactNaming(dir).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ART-001 rechaza un run_id que no es el activo", () => {
  const dir = repoFixture(["docs/tech/2020-01-01-999-VERIFY-004-x.md"], {
    run_id: "2026-08-21-001",
    status: "in_progress",
    current_phase: "verify",
  });
  try {
    assert.equal(checkArtifactNaming(dir).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ART-001 no aplica fuera de docs/", () => {
  const dir = repoFixture(["src/app.ts", "package.json"], null);
  try {
    assert.equal(checkArtifactNaming(dir).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ART-001 exime .gitkeep, README y docs/.example", () => {
  const dir = repoFixture(["docs/specs/.gitkeep", "docs/specs/README.md", "docs/.example/muestra.md"], null);
  try {
    assert.equal(checkArtifactNaming(dir).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ART-001 se desactiva con ASDD_ARTIFACT_NAME_GUARD_ENABLED=false", () => {
  const dir = repoFixture(["docs/tech/libre.md"], null);
  try {
    assert.equal(checkArtifactNaming(dir, { ASDD_ARTIFACT_NAME_GUARD_ENABLED: "false" }).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Repo con un merge en curso: el archivo de nombre libre bajo docs/ ya existía
// en la otra rama (MERGE_HEAD) antes del conflicto, así que no es "nuevo".
function repoFixtureMergeInProgress(legacyDocPath) {
  const dir = mkdtempSync(path.join(tmpdir(), "asdd-githooks-merge-"));
  const g = (args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  g(["init", "-q", "-b", "fix/prueba"]);
  g(["config", "user.email", "t@t.t"]);
  g(["config", "user.name", "t"]);

  writeFileSync(path.join(dir, "base.txt"), "linea original\n");
  g(["add", "-A"]);
  g(["commit", "-q", "-m", "chore: base"]);

  g(["checkout", "-q", "-b", "origin-dev"]);
  const legacyAbs = path.join(dir, legacyDocPath);
  mkdirSync(path.dirname(legacyAbs), { recursive: true });
  writeFileSync(legacyAbs, "ADR legacy\n");
  g(["add", "-A"]);
  g(["commit", "-q", "-m", "docs: adr legacy"]);

  g(["checkout", "-q", "fix/prueba"]);
  writeFileSync(path.join(dir, "base.txt"), "linea modificada\n");
  g(["add", "-A"]);
  g(["commit", "-q", "-m", "chore: conflicto"]);

  try {
    g(["merge", "-q", "--no-ff", "origin-dev"]);
  } catch {
    // esperado: base.txt queda en conflicto y el merge no se completa
  }
  writeFileSync(path.join(dir, "base.txt"), "linea resuelta\n");
  g(["add", "-A"]); // resuelve el conflicto y deja el índice listo para el commit de merge

  return dir;
}

test("ART-001 no bloquea durante un merge un artefacto que ya existía en MERGE_HEAD", () => {
  const dir = repoFixtureMergeInProgress("docs/architecture/decisions/ADR-020-legacy.md");
  try {
    assert.equal(checkArtifactNaming(dir).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ART-001 sigue bloqueando el mismo nombre libre fuera de un merge (regresión)", () => {
  const dir = repoFixture(["docs/architecture/decisions/ADR-020-legacy.md"], null);
  try {
    assert.equal(checkArtifactNaming(dir).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Integridad de reglas ---------------------------------------------------

test("la integridad de las reglas normativas del repo está intacta", () => {
  const r = checkRuleIntegrity(repoRaiz);
  assert.equal(r.ok, true, r.message);
});

// ---- Ejecución --------------------------------------------------------------

for (const [nombre, fn] of casos) {
  try {
    fn();
    pasaron += 1;
    console.log(`✅ ${nombre}`);
  } catch (error) {
    console.log(`❌ ${nombre}\n   ${error.message}`);
  }
}
console.log(`\nGit hooks nativos: ${pasaron} ✅  ${casos.length - pasaron} ❌`);
process.exit(pasaron === casos.length ? 0 : 1);
