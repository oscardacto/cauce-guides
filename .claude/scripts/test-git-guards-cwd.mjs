#!/usr/bin/env node
/**
 * test-git-guards-cwd.mjs
 *
 * Red de regresión de los 3 guards de git (Bug B,
 * 2026-07-07-001-BUILD-006, resolución en R3 v2.28.0).
 *
 * FASE F0 (baseline — precondición de R3): captura el comportamiento
 * ACTUAL de guard-branch.mjs, pre-push-gate.mjs y pre-pr-gate.mjs en un
 * escenario de mono-repo (sin `cd X &&` ni `git -C X` en el comando bajo
 * prueba). Estos casos deben pasar en verde ANTES de tocar los guards —
 * son el golden net que detecta cualquier cambio accidental de
 * comportamiento al introducir B1-B7.
 *
 * FASE B6 (repos anidados — se agrega en el commit de implementación,
 * después de F0 verde): reproduce el escenario de campo del bug —
 * root-config-repo + sub-repo anidado, cada uno con su propia rama.
 *
 * Ejecutar: node .claude/scripts/test-git-guards-cwd.mjs
 */

import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname, resolve as pathResolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolveEffectiveCwd, parseInlineEnvVar } from "../hooks/_lib/git-command-cwd.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = join(__dirname, "..", "hooks");
const GUARD_BRANCH = join(HOOKS_DIR, "sofka-asdd-guard-branch.mjs");
const PRE_PUSH_GATE = join(HOOKS_DIR, "sofka-asdd-pre-push-gate.mjs");
const PRE_PR_GATE = join(HOOKS_DIR, "sofka-asdd-pre-pr-gate.mjs");

let passed = 0;
let failed = 0;

const tempDirs = [];
process.on("exit", () => {
  for (const d of tempDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function assert(label, ok, detail = "") {
  if (ok) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function makeTmpDir(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

/** Inicializa un repo git aislado en `dir`, con identidad de test. */
function gitInit(dir) {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@sofka.local"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Sofka Test"], { cwd: dir });
}

/** Crea/actualiza un archivo (creando subdirectorios si hace falta) y lo commitea en `dir`. */
function commitFile(dir, filename, content, message) {
  const target = join(dir, filename);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  execFileSync("git", ["add", filename], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd: dir });
}

/** Renombra HEAD a `branchName` (repo recién iniciado, sin checkout previo). */
function renameCurrentBranch(dir, branchName) {
  execFileSync("git", ["branch", "-m", branchName], { cwd: dir });
}

/** Crea y cambia a una nueva rama desde el commit actual. */
function checkoutNewBranch(dir, branchName) {
  execFileSync("git", ["checkout", "-q", "-b", branchName], { cwd: dir });
}

function runHook(hookPath, cwd, payload, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  return spawnSync("node", [hookPath], {
    cwd,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env,
    timeout: 8000,
  });
}

console.log("\n=== FASE F0 — Baseline de regresión (mono-repo, pre-Bug-B) ===\n");

// ---------------------------------------------------------------------------
// guard-branch.mjs
// ---------------------------------------------------------------------------
console.log("guard-branch.mjs");
{
  const repo = makeTmpDir("guard-branch-mono-");
  gitInit(repo);
  commitFile(repo, "README.md", "init", "chore: init");
  renameCurrentBranch(repo, "dev");

  // F0.1 — commit en rama protegida (dev) → BLOQUEA (exit 2)
  {
    const r = runHook(GUARD_BRANCH, repo, {
      tool_name: "Bash",
      tool_input: { command: "git commit -m 'wip'" },
    });
    assert("F0.1 rama protegida (dev) bloquea commit", r.status === 2, `exit ${r.status}, stderr: ${r.stderr}`);
  }

  checkoutNewBranch(repo, "feature/algo");

  // F0.2 — commit en feature branch → PERMITE (exit 0)
  {
    const r = runHook(GUARD_BRANCH, repo, {
      tool_name: "Bash",
      tool_input: { command: "git commit -m 'wip'" },
    });
    assert("F0.2 feature branch permite commit", r.status === 0, `exit ${r.status}, stderr: ${r.stderr}`);
  }

  // F0.3 — escape hatch por env (sesión) permite en rama protegida
  {
    execFileSync("git", ["checkout", "-q", "dev"], { cwd: repo });
    const r = runHook(
      GUARD_BRANCH,
      repo,
      { tool_name: "Bash", tool_input: { command: "git commit -m 'wip'" } },
      { SOFKA_ASDD_GUARD_BRANCH_DISABLE: "1" }
    );
    assert("F0.3 escape hatch de sesión permite en rama protegida", r.status === 0, `exit ${r.status}`);
  }
}

// ---------------------------------------------------------------------------
// pre-pr-gate.mjs
// ---------------------------------------------------------------------------
console.log("\npre-pr-gate.mjs");
{
  const repo = makeTmpDir("pre-pr-gate-mono-");
  gitInit(repo);
  commitFile(repo, "README.md", "init", "chore: init");
  renameCurrentBranch(repo, "dev");

  // F0.4 — MR desde rama protegida (dev == dev, sin fast-track de promoción) → BLOQUEA
  {
    const r = runHook(PRE_PR_GATE, repo, {
      tool_name: "Bash",
      tool_input: { command: "gh pr create --title x --body y" },
    });
    assert("F0.4 rama protegida (dev) bloquea creación de MR", r.status === 2, `exit ${r.status}, stderr: ${r.stderr}`);
  }

  // F0.5 — naming inválido (sin prefijo GitFlow) → BLOQUEA
  checkoutNewBranch(repo, "mi-rama-sin-prefijo");
  commitFile(repo, "a.txt", "a", "feat: a");
  {
    const r = runHook(PRE_PR_GATE, repo, {
      tool_name: "Bash",
      tool_input: { command: "gh pr create --title x --body y" },
    });
    assert("F0.5 naming inválido bloquea creación de MR", r.status === 2, `exit ${r.status}, stderr: ${r.stderr}`);
    assert("F0.5 stderr menciona naming GitFlow", r.stderr.includes("GitFlow"), r.stderr);
  }

  // F0.6 — rama con naming válido pero sin commits nuevos respecto a la base → BLOQUEA
  execFileSync("git", ["checkout", "-q", "dev"], { cwd: repo });
  checkoutNewBranch(repo, "feature/sin-commits");
  {
    const r = runHook(PRE_PR_GATE, repo, {
      tool_name: "Bash",
      tool_input: { command: "gh pr create --title x --body y" },
    });
    assert("F0.6 sin commits nuevos respecto a la base bloquea MR", r.status === 2, `exit ${r.status}, stderr: ${r.stderr}`);
    assert("F0.6 stderr menciona commits nuevos", r.stderr.includes("commits nuevos"), r.stderr);
  }

  // F0.7 — escape hatch de sesión permite
  {
    const r = runHook(
      PRE_PR_GATE,
      repo,
      { tool_name: "Bash", tool_input: { command: "gh pr create --title x --body y" } },
      { SOFKA_ASDD_GUARD_PR_DISABLE: "1" }
    );
    assert("F0.7 escape hatch de sesión permite creación de MR", r.status === 0, `exit ${r.status}`);
  }
}

// ---------------------------------------------------------------------------
// pre-push-gate.mjs
// ---------------------------------------------------------------------------
console.log("\npre-push-gate.mjs");
{
  const repo = makeTmpDir("pre-push-gate-mono-");
  gitInit(repo);
  commitFile(repo, "README.md", "init", "chore: init");
  renameCurrentBranch(repo, "dev");
  checkoutNewBranch(repo, "feature/push-test");

  // F0.8 — cambio de código fuente sin marcador → BLOQUEA
  commitFile(repo, "src/a.ts", "export const x = 1;", "feat: agrega a.ts");
  {
    const r = runHook(PRE_PUSH_GATE, repo, {
      tool_name: "Bash",
      tool_input: { command: "git push -u origin feature/push-test" },
    });
    assert("F0.8 código fuente sin marcador bloquea push", r.status === 2, `exit ${r.status}, stderr: ${r.stderr}`);
  }

  // F0.9 — fast-track: solo archivos de config/docs → PERMITE sin marcador
  const repoDocs = makeTmpDir("pre-push-gate-docs-");
  gitInit(repoDocs);
  commitFile(repoDocs, "README.md", "init", "chore: init");
  renameCurrentBranch(repoDocs, "dev");
  checkoutNewBranch(repoDocs, "docs/actualiza-readme");
  commitFile(repoDocs, "docs/nota.md", "nota", "docs: agrega nota");
  {
    const r = runHook(PRE_PUSH_GATE, repoDocs, {
      tool_name: "Bash",
      tool_input: { command: "git push -u origin docs/actualiza-readme" },
    });
    assert("F0.9 fast-track config/docs permite push sin marcador", r.status === 0, `exit ${r.status}, stderr: ${r.stderr}`);
  }

  // F0.10 — escape hatch de sesión permite push de código fuente sin marcador
  {
    const r = runHook(
      PRE_PUSH_GATE,
      repo,
      { tool_name: "Bash", tool_input: { command: "git push -u origin feature/push-test" } },
      { SOFKA_ASDD_GUARD_PUSH_DISABLE: "1" }
    );
    assert("F0.10 escape hatch de sesión permite push de código fuente", r.status === 0, `exit ${r.status}`);
  }
}

// ---------------------------------------------------------------------------
// B1 — Tests unitarios del helper .claude/hooks/_lib/git-command-cwd.mjs
// ---------------------------------------------------------------------------
console.log("\n=== B1 — Helper resolveEffectiveCwd / parseInlineEnvVar ===\n");
{
  const base = "/repo/root";

  // Sin cd ni -C — fallback al cwd base (comportamiento mono-repo).
  {
    const r = resolveEffectiveCwd("git commit -m 'wip'", base);
    assert("B1.1 sin cd/-C → resolved = base, no ambiguo", !r.ambiguous && r.resolved === base, JSON.stringify(r));
  }

  // Un único `cd X &&` — inequívoco.
  {
    const r = resolveEffectiveCwd("cd projects/iac && git commit -m x", base);
    assert(
      "B1.2 cd único → resolved = base/projects/iac, no ambiguo",
      !r.ambiguous && r.resolved === pathResolve(base, "projects/iac"),
      JSON.stringify(r)
    );
  }

  // `git -C X` — inequívoco, y con prioridad sobre `cd` si ambos aparecen.
  {
    const r = resolveEffectiveCwd("git -C projects/iac commit -m x", base);
    assert(
      "B1.3 git -C único → resolved = base/projects/iac, no ambiguo",
      !r.ambiguous && r.resolved === pathResolve(base, "projects/iac"),
      JSON.stringify(r)
    );
  }

  {
    const r = resolveEffectiveCwd("cd otra/ruta && git -C projects/iac commit -m x", base);
    assert(
      "B1.4 -C tiene prioridad sobre cd",
      !r.ambiguous && r.resolved === pathResolve(base, "projects/iac"),
      JSON.stringify(r)
    );
  }

  // Múltiples `cd` encadenados — ambiguo, candidates incluye base + best-guess.
  {
    const r = resolveEffectiveCwd("cd a && cd b && git commit -m x", base);
    assert("B1.5 múltiples cd → ambiguous = true", r.ambiguous === true, JSON.stringify(r));
    assert("B1.5 candidates incluye el base (repo raíz)", r.candidates.includes(base), JSON.stringify(r));
  }

  // Variable de shell sin resolver — ambiguo, fail-closed.
  {
    const r = resolveEffectiveCwd("cd $UNRESOLVED && git commit -m x", base);
    assert("B1.6 variable sin resolver → ambiguous = true", r.ambiguous === true, JSON.stringify(r));
    assert("B1.6 candidates incluye el base (repo raíz)", r.candidates.includes(base), JSON.stringify(r));
  }

  // Sin inputCwd — cae a process.cwd().
  {
    const r = resolveEffectiveCwd("git commit -m x", undefined);
    assert("B1.7 sin inputCwd → resolved = process.cwd()", !r.ambiguous && r.resolved === process.cwd(), JSON.stringify(r));
  }

  // parseInlineEnvVar — detecta el prefijo VAR=1/true al inicio o tras && / ;
  {
    assert(
      "B1.8 parseInlineEnvVar detecta prefijo al inicio",
      parseInlineEnvVar("SOFKA_ASDD_GUARD_BRANCH_DISABLE=1 git commit -m x", "SOFKA_ASDD_GUARD_BRANCH_DISABLE") === true
    );
  }
  {
    assert(
      "B1.9 parseInlineEnvVar detecta prefijo tras &&",
      parseInlineEnvVar(
        "cd nested && SOFKA_ASDD_GUARD_BRANCH_DISABLE=true git commit -m x",
        "SOFKA_ASDD_GUARD_BRANCH_DISABLE"
      ) === true
    );
  }
  {
    assert(
      "B1.10 parseInlineEnvVar false cuando no está el prefijo",
      parseInlineEnvVar("git commit -m x", "SOFKA_ASDD_GUARD_BRANCH_DISABLE") === false
    );
  }
}

// ---------------------------------------------------------------------------
// B6 — Repos anidados (escenario de campo del Bug B)
// ---------------------------------------------------------------------------
console.log("\n=== B6 — Repos anidados (root-config + sub-repo) ===\n");

/** Crea un root protegido (rama `dev`) con un sub-repo anidado en su propia rama. */
function makeNestedFixture(rootBranch, nestedBranch) {
  const root = makeTmpDir("nested-root-");
  gitInit(root);
  commitFile(root, "README.md", "root init", "chore: init root");
  renameCurrentBranch(root, rootBranch);

  const nestedDir = join(root, "nested");
  mkdirSync(nestedDir, { recursive: true });
  gitInit(nestedDir);
  commitFile(nestedDir, "README.md", "nested init", "chore: init nested");
  renameCurrentBranch(nestedDir, nestedBranch);

  return { root, nestedDir };
}

{
  const { root } = makeNestedFixture("dev", "feature/algo");

  // B6.1 — `cd nested && git commit`, raíz protegida, nested en feature → PERMITE
  {
    const r = runHook(GUARD_BRANCH, root, {
      tool_name: "Bash",
      tool_input: { command: "cd nested && git commit -m 'wip'" },
    });
    assert("B6.1 cd nested && git commit (raíz dev, nested feature) → permite", r.status === 0, `exit ${r.status}, stderr: ${r.stderr}`);
  }

  // B6.2 — `git -C nested commit`, mismo escenario → PERMITE
  {
    const r = runHook(GUARD_BRANCH, root, {
      tool_name: "Bash",
      tool_input: { command: "git -C nested commit -m 'wip'" },
    });
    assert("B6.2 git -C nested commit (raíz dev, nested feature) → permite", r.status === 0, `exit ${r.status}, stderr: ${r.stderr}`);
  }
}

{
  // B6.3 — escape hatch inline (prefijo VAR=1 en el comando) → PERMITE + advertencia
  const { root } = makeNestedFixture("dev", "dev"); // ambos en rama protegida — solo el inline debe salvarlo
  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "SOFKA_ASDD_GUARD_BRANCH_DISABLE=1 git commit -m 'wip'" },
  });
  assert("B6.3 escape hatch inline permite en rama protegida", r.status === 0, `exit ${r.status}, stderr: ${r.stderr}`);
  assert("B6.3 stdout registra la advertencia del escape hatch", r.stdout.includes("ADVERTENCIA"), r.stdout);
}

{
  // B6.4 — parseo ambiguo (múltiples cd), raíz protegida → BLOQUEA (fail-closed)
  const { root } = makeNestedFixture("dev", "feature/algo");
  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "cd nested && cd . && git commit -m 'wip'" },
  });
  assert("B6.4 parseo ambiguo con raíz protegida → bloquea (fail-closed)", r.status === 2, `exit ${r.status}, stderr: ${r.stderr}`);
}

{
  // B6.5 — caso mono-repo actual (sin cd/-C) en rama protegida → sigue BLOQUEANDO
  const repo = makeTmpDir("mono-regresion-");
  gitInit(repo);
  commitFile(repo, "README.md", "init", "chore: init");
  renameCurrentBranch(repo, "dev");
  const r = runHook(GUARD_BRANCH, repo, {
    tool_name: "Bash",
    tool_input: { command: "git commit -m 'wip'" },
  });
  assert("B6.5 mono-repo sin cd/-C en rama protegida → sigue bloqueando (no regresión)", r.status === 2, `exit ${r.status}`);
}

// ---------------------------------------------------------------------------
// R3b — Bypass multi-git confirmado por auditoría adversarial (fail-closed)
//
// El algoritmo B1-B7 correlacionaba mal el `-C`/`cd` cuando el comando
// contenía MÁS DE UNA invocación git/gh/glab: el `-C` de una invocación NO
// relacionada con la acción validada (commit/push/mr create) se tomaba como
// candidato único, saltándose el fail-closed. Fix: resolveEffectiveCwd
// segmenta el comando y resuelve el CWD del segmento que matchea la acción
// real (targetRe), no de cualquier `-C` en el comando compuesto.
// ---------------------------------------------------------------------------
console.log("\n=== R3b — Bypass multi-git (fail-closed por invocación) ===\n");

{
  // R3b.1 — EXPLOIT: cd nested && git commit && git -C other push
  // nested (protegida) + other (feature). El commit ocurre en nested; antes
  // del fix, el `-C other` (de OTRA invocación) hacía resolver a `other`
  // (no protegido) y el guard permitía el commit en la rama protegida.
  const root = makeTmpDir("r3b1-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");

  const nested = join(root, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev"); // protegida

  const other = join(root, "other");
  mkdirSync(other, { recursive: true });
  gitInit(other);
  commitFile(other, "README.md", "x", "chore: init other");
  renameCurrentBranch(other, "dev");
  checkoutNewBranch(other, "feature/algo"); // no protegida

  {
    const r = runHook(GUARD_BRANCH, root, {
      tool_name: "Bash",
      tool_input: { command: "cd nested && git commit -m x && git -C other push" },
    });
    assert(
      "R3b.1 EXPLOIT commit en nested protegida (con -C other de otra invocación) → bloquea",
      r.status === 2,
      `exit ${r.status}, stderr: ${r.stderr}`
    );
  }

  // R3b.1b — LEGÍTIMO: mismo comando pero AMBOS repos en feature → permite
  checkoutNewBranch(nested, "feature/algo-nested");
  {
    const r = runHook(GUARD_BRANCH, root, {
      tool_name: "Bash",
      tool_input: { command: "cd nested && git commit -m x && git -C other push" },
    });
    assert(
      "R3b.1b legítimo — ambos repos en feature (ninguno protegido) → permite",
      r.status === 0,
      `exit ${r.status}, stderr: ${r.stderr}`
    );
  }
}

{
  // R3b.2 — EXPLOIT: git -C confdir log -1 && cd targetdir && git push
  // confdir (config-only) + targetdir (código fuente sin marcador). El push
  // ocurre en targetdir; antes del fix, el `-C confdir` (de OTRA invocación,
  // solo un `log`) hacía fast-track por error.
  const root = makeTmpDir("r3b2-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");

  const confdir = join(root, "confdir");
  mkdirSync(confdir, { recursive: true });
  gitInit(confdir);
  commitFile(confdir, "docs/nota.md", "x", "docs: nota");
  renameCurrentBranch(confdir, "dev");
  checkoutNewBranch(confdir, "docs/algo");
  commitFile(confdir, "docs/nota2.md", "y", "docs: nota2");

  const targetdir = join(root, "targetdir");
  mkdirSync(targetdir, { recursive: true });
  gitInit(targetdir);
  commitFile(targetdir, "README.md", "x", "chore: init");
  renameCurrentBranch(targetdir, "dev");
  checkoutNewBranch(targetdir, "feature/algo");
  commitFile(targetdir, "src/a.ts", "export const x = 1;", "feat: a");

  {
    const r = runHook(PRE_PUSH_GATE, root, {
      tool_name: "Bash",
      tool_input: { command: "git -C confdir log -1 && cd targetdir && git push" },
    });
    assert(
      "R3b.2 EXPLOIT push de código en targetdir (con -C confdir de otra invocación) → exige marcador",
      r.status === 2,
      `exit ${r.status}, stdout: ${r.stdout}, stderr: ${r.stderr}`
    );
  }
}

{
  // R3b.3 — EXPLOIT: git -C nested log -1 && cd root2 && glab mr create
  // nested (naming válido, con commits) + root2 (naming inválido). El MR se
  // crea desde root2; antes del fix, el `-C nested` (de OTRA invocación,
  // solo un `log`) hacía resolver mal y root2 nunca se validaba.
  const base = makeTmpDir("r3b3-base-");
  gitInit(base);
  commitFile(base, "README.md", "x", "chore: init");
  renameCurrentBranch(base, "dev");

  const nested = join(base, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev");
  checkoutNewBranch(nested, "feature/nested-ok");
  commitFile(nested, "a.txt", "a", "feat: a");

  const root2 = join(base, "root2");
  mkdirSync(root2, { recursive: true });
  gitInit(root2);
  commitFile(root2, "README.md", "x", "chore: init root2");
  checkoutNewBranch(root2, "mi-rama-sin-prefijo");
  commitFile(root2, "b.txt", "b", "feat: b");

  {
    const r = runHook(PRE_PR_GATE, base, {
      tool_name: "Bash",
      tool_input: {
        command: "git -C nested log -1 && cd root2 && glab mr create --title x --body y",
      },
    });
    assert(
      "R3b.3 EXPLOIT MR desde root2 con naming inválido (con -C nested de otra invocación) → bloquea",
      r.status === 2,
      `exit ${r.status}, stderr: ${r.stderr}`
    );
    assert("R3b.3 stderr menciona naming GitFlow", r.stderr.includes("GitFlow"), r.stderr);
  }
}

{
  // R3b.4 — LEGÍTIMO: cd nested && git commit (un solo git) → permite
  const root = makeTmpDir("r3b4-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init");
  renameCurrentBranch(root, "dev");
  const nested = join(root, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev");
  checkoutNewBranch(nested, "feature/algo");

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "cd nested && git commit -m x" },
  });
  assert("R3b.4 legítimo — cd nested && git commit (un solo git) → permite", r.status === 0, `exit ${r.status}`);
}

{
  // R3b.5 — legítimo residual: mono-repo en protegida sigue bloqueando
  // (no-regresión del algoritmo por segmentos).
  const repo = makeTmpDir("r3b5-");
  gitInit(repo);
  commitFile(repo, "README.md", "x", "chore: init");
  renameCurrentBranch(repo, "dev");
  const r = runHook(GUARD_BRANCH, repo, {
    tool_name: "Bash",
    tool_input: { command: "git commit -m x" },
  });
  assert("R3b.5 mono-repo en protegida sigue bloqueando (no regresión)", r.status === 2, `exit ${r.status}`);
}

// ---------------------------------------------------------------------------
// R3c — Bypass vía newline y subshell confirmado por auditoría adversarial
// post-R3b (fail-closed ante construcciones de shell no parseables)
//
// R3b solo cortaba segmentos por `&&`/`;`. Dos vectores lo evadían:
//   1. Salto de línea (`cd nested\ngit commit`) — bash lo ejecuta en
//      `nested`, pero el parser no veía el `cd` sin `&&`/`;`.
//   2. Subshell (`(cd nested && git commit)`) — bash aplica el `cd` dentro
//      del subshell y el `git commit` corre allí también, pero el parser
//      tampoco entendía `()`.
// Fix: `\n`/`\r\n` se suman como separador de nivel superior (camino
// preciso); subshell/brace-group/command-substitution/backtick/eval/pipe
// activan el camino fail-closed (candidatos globales + bloqueo si
// cualquiera protegido; bloqueo incondicional si no se extrae ningún
// cd/-C).
// ---------------------------------------------------------------------------
console.log("\n=== R3c — Bypass newline/subshell (fail-closed ante shell no parseable) ===\n");

// --- Newline: camino preciso (splitTopLevelSegments ahora corta por \n) ---

{
  // R3c.1 — EXPLOIT: cd nested\ngit commit (nested protegida) → bloquea
  const root = makeTmpDir("r3c1-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const nested = join(root, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev"); // protegida

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "cd nested\ngit commit -m 'wip'" },
  });
  assert(
    "R3c.1 EXPLOIT newline: cd nested\\ngit commit (nested protegida) → bloquea",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3c.2 — pre-push-gate: cd targetdir\ngit push (targetdir código sin marcador) → bloquea
  const root = makeTmpDir("r3c2-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const targetdir = join(root, "targetdir");
  mkdirSync(targetdir, { recursive: true });
  gitInit(targetdir);
  commitFile(targetdir, "README.md", "x", "chore: init");
  renameCurrentBranch(targetdir, "dev");
  checkoutNewBranch(targetdir, "feature/algo");
  commitFile(targetdir, "src/a.ts", "export const x = 1;", "feat: a");

  const r = runHook(PRE_PUSH_GATE, root, {
    tool_name: "Bash",
    tool_input: { command: "cd targetdir\ngit push" },
  });
  assert(
    "R3c.2 EXPLOIT newline: cd targetdir\\ngit push (código sin marcador) → exige marcador",
    r.status === 2,
    `exit ${r.status}, stdout: ${r.stdout}, stderr: ${r.stderr}`
  );
}

{
  // R3c.3 — pre-pr-gate: cd root2\nglab mr create (root2 naming inválido) → bloquea
  const base = makeTmpDir("r3c3-base-");
  gitInit(base);
  commitFile(base, "README.md", "x", "chore: init");
  renameCurrentBranch(base, "dev");
  const root2 = join(base, "root2");
  mkdirSync(root2, { recursive: true });
  gitInit(root2);
  commitFile(root2, "README.md", "x", "chore: init root2");
  checkoutNewBranch(root2, "mi-rama-sin-prefijo");
  commitFile(root2, "b.txt", "b", "feat: b");

  const r = runHook(PRE_PR_GATE, base, {
    tool_name: "Bash",
    tool_input: { command: "cd root2\nglab mr create --title x --body y" },
  });
  assert(
    "R3c.3 EXPLOIT newline: cd root2\\nglab mr create (naming inválido) → bloquea",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
  assert("R3c.3 stderr menciona naming GitFlow", r.stderr.includes("GitFlow"), r.stderr);
}

// --- Subshell: camino fail-closed (candidatos globales + bloqueo) ---

{
  // R3c.4 — EXPLOIT: (cd nested && git commit) (nested protegida) → bloquea
  const root = makeTmpDir("r3c4-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const nested = join(root, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev"); // protegida

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "(cd nested && git commit -m 'wip')" },
  });
  assert(
    "R3c.4 EXPLOIT subshell: (cd nested && git commit) (nested protegida) → bloquea",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3c.5 — pre-push-gate: (cd targetdir && git push) (código sin marcador) → bloquea
  const root = makeTmpDir("r3c5-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const targetdir = join(root, "targetdir");
  mkdirSync(targetdir, { recursive: true });
  gitInit(targetdir);
  commitFile(targetdir, "README.md", "x", "chore: init");
  renameCurrentBranch(targetdir, "dev");
  checkoutNewBranch(targetdir, "feature/algo");
  commitFile(targetdir, "src/a.ts", "export const x = 1;", "feat: a");

  const r = runHook(PRE_PUSH_GATE, root, {
    tool_name: "Bash",
    tool_input: { command: "(cd targetdir && git push)" },
  });
  assert(
    "R3c.5 EXPLOIT subshell: (cd targetdir && git push) (código sin marcador) → exige marcador",
    r.status === 2,
    `exit ${r.status}, stdout: ${r.stdout}, stderr: ${r.stderr}`
  );
}

{
  // R3c.6 — pre-pr-gate: (cd root2 && glab mr create) (root2 naming inválido) → bloquea
  const base = makeTmpDir("r3c6-base-");
  gitInit(base);
  commitFile(base, "README.md", "x", "chore: init");
  renameCurrentBranch(base, "dev");
  const root2 = join(base, "root2");
  mkdirSync(root2, { recursive: true });
  gitInit(root2);
  commitFile(root2, "README.md", "x", "chore: init root2");
  checkoutNewBranch(root2, "mi-rama-sin-prefijo");
  commitFile(root2, "b.txt", "b", "feat: b");

  const r = runHook(PRE_PR_GATE, base, {
    tool_name: "Bash",
    tool_input: { command: "(cd root2 && glab mr create --title x --body y)" },
  });
  assert(
    "R3c.6 EXPLOIT subshell: (cd root2 && glab mr create) (naming inválido) → bloquea",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

// --- Construcciones extra fail-closed (brace group, command substitution, eval, pipe) ---

{
  // R3c.7 — brace group: { cd nested && git commit; } (nested protegida) → bloquea
  const root = makeTmpDir("r3c7-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const nested = join(root, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev"); // protegida

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "{ cd nested && git commit -m 'wip'; }" },
  });
  assert(
    "R3c.7 brace group: { cd nested && git commit; } (nested protegida) → bloquea",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3c.8 — command substitution oculta el cd dentro de un argumento de commit
  // (nested protegida). Requisito flexible del diseño: "bloquea o resuelve
  // seguro" — nuestro fail-closed agrega 'nested' como candidato y bloquea.
  const root = makeTmpDir("r3c8-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const nested = join(root, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev"); // protegida

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: `git commit -m "$(cd nested && pwd)"` },
  });
  assert(
    "R3c.8 command substitution oculta cd hacia nested protegida → bloquea (fail-closed)",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3c.9 — eval sin cd/-C extraíble textualmente → forceBlock, bloquea
  // SIEMPRE aunque la rama actual (feature) no esté protegida.
  const repo = makeTmpDir("r3c9-");
  gitInit(repo);
  commitFile(repo, "README.md", "x", "chore: init");
  renameCurrentBranch(repo, "dev");
  checkoutNewBranch(repo, "feature/algo"); // NO protegida

  const r = runHook(GUARD_BRANCH, repo, {
    tool_name: "Bash",
    tool_input: { command: 'eval "$UNKNOWN_CMD" && git commit -m x' },
  });
  assert(
    "R3c.9 eval sin cd/-C extraíble → forceBlock bloquea aunque la rama actual no esté protegida",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
  assert("R3c.9 stderr menciona fail-closed/no parseable", r.stderr.includes("no parseable"), r.stderr);
}

{
  // R3c.10 — pipe con git involucrado, sin cd/-C extraíble → forceBlock, bloquea.
  const repo = makeTmpDir("r3c10-");
  gitInit(repo);
  commitFile(repo, "README.md", "x", "chore: init");
  renameCurrentBranch(repo, "dev");
  checkoutNewBranch(repo, "feature/algo"); // NO protegida

  const r = runHook(GUARD_BRANCH, repo, {
    tool_name: "Bash",
    tool_input: { command: "git log | grep x && git commit -m y" },
  });
  assert(
    "R3c.10 pipe con git, sin cd/-C extraíble → forceBlock bloquea",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

// --- No-regresión / no-sobre-bloqueo de comandos legítimos ---

{
  // R3c.11 — legítimo: cd feature && git commit (simple, un solo git) → permite
  const root = makeTmpDir("r3c11-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init");
  renameCurrentBranch(root, "dev");
  const feature = join(root, "feature");
  mkdirSync(feature, { recursive: true });
  gitInit(feature);
  commitFile(feature, "README.md", "x", "chore: init feature");
  renameCurrentBranch(feature, "dev");
  checkoutNewBranch(feature, "feature/algo");

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "cd feature && git commit -m x" },
  });
  assert("R3c.11 legítimo simple: cd feature && git commit → permite", r.status === 0, `exit ${r.status}, stderr: ${r.stderr}`);
}

{
  // R3c.12 — legítimo: cd feature && git commit && git -C otherfeature push
  // (ambos repos en feature, ninguno protegido) → permite.
  const root = makeTmpDir("r3c12-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init");
  renameCurrentBranch(root, "dev");

  const feature = join(root, "feature");
  mkdirSync(feature, { recursive: true });
  gitInit(feature);
  commitFile(feature, "README.md", "x", "chore: init feature");
  renameCurrentBranch(feature, "dev");
  checkoutNewBranch(feature, "feature/algo");

  const otherfeature = join(root, "otherfeature");
  mkdirSync(otherfeature, { recursive: true });
  gitInit(otherfeature);
  commitFile(otherfeature, "README.md", "x", "chore: init other");
  renameCurrentBranch(otherfeature, "dev");
  checkoutNewBranch(otherfeature, "feature/otro");

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "cd feature && git commit -m x && git -C otherfeature push" },
  });
  assert(
    "R3c.12 legítimo: cd feature && git commit && git -C otherfeature push (ambos feature) → permite",
    r.status === 0,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3c.13 — legítimo: mono-repo en feature branch → permite (no regresión).
  const repo = makeTmpDir("r3c13-");
  gitInit(repo);
  commitFile(repo, "README.md", "x", "chore: init");
  renameCurrentBranch(repo, "dev");
  checkoutNewBranch(repo, "feature/algo");
  const r = runHook(GUARD_BRANCH, repo, {
    tool_name: "Bash",
    tool_input: { command: "git commit -m x" },
  });
  assert("R3c.13 legítimo: mono-repo en feature → permite", r.status === 0, `exit ${r.status}, stderr: ${r.stderr}`);
}

{
  // R3c.14 — legítimo: mono-repo en rama protegida sigue bloqueando (no regresión).
  const repo = makeTmpDir("r3c14-");
  gitInit(repo);
  commitFile(repo, "README.md", "x", "chore: init");
  renameCurrentBranch(repo, "dev");
  const r = runHook(GUARD_BRANCH, repo, {
    tool_name: "Bash",
    tool_input: { command: "git commit -m x" },
  });
  assert("R3c.14 mono-repo en protegida sigue bloqueando (no regresión)", r.status === 2, `exit ${r.status}`);
}

{
  // R3c.15 — no sobre-bloquea: mensaje de commit con paréntesis/pipe en
  // comillas (texto literal, no sintaxis de shell) → permite.
  const repo = makeTmpDir("r3c15-");
  gitInit(repo);
  commitFile(repo, "README.md", "x", "chore: init");
  renameCurrentBranch(repo, "dev");
  checkoutNewBranch(repo, "feature/algo");
  const r = runHook(GUARD_BRANCH, repo, {
    tool_name: "Bash",
    tool_input: { command: `git commit -m "fix (bug) | related"` },
  });
  assert(
    "R3c.15 no sobre-bloquea: paréntesis/pipe dentro de comillas dobles (texto literal) → permite",
    r.status === 0,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

// ---------------------------------------------------------------------------
// R3d — Auditoría adversarial #3: bypass por comillas y por pushd
// (fail-closed ante fallo de resolución de rama)
//
// La auditoría #3 confirmó 2 bypasses con exploits reales:
//   1. Comillas en el path (`cd "nested"`, `git -C "nested"`): el path
//      capturado incluía las comillas literales, resolvía a un directorio
//      inexistente, currentBranch() fallaba (ENOENT) → los guards hacían
//      `if (!branch) process.exit(0)` → bypass silencioso.
//   2. `pushd nested`: no estaba reconocido como relocalización de cwd
//      (solo `cd`), el guard resolvía sobre `base` con confianza alta →
//      bypass.
// Fix: (a) strip de comillas envolventes en el helper; (b) `pushd`
// reconocido como equivalente a `cd`; (c) `popd` enruta por el camino
// fail-closed (destino no determinable estáticamente); (d) los 3 guards
// ahora fallan CERRADO cuando el cwd fue relocalizado (cd/-C/pushd) hacia
// un destino que no resuelve a ninguna rama git — antes fallaban abierto.
// ---------------------------------------------------------------------------
console.log("\n=== R3d — Bypass comillas/pushd (fail-closed ante fallo de resolución) ===\n");

// --- Comillas: dobles y simples, en cd y en -C ---

{
  // R3d.1 — EXPLOIT: cd "nested" && git commit (nested protegida) → bloquea
  const root = makeTmpDir("r3d1-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const nested = join(root, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev"); // protegida

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: 'cd "nested" && git commit -m wip' },
  });
  assert(
    'R3d.1 EXPLOIT comillas dobles: cd "nested" && git commit (protegida) → bloquea',
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3d.2 — EXPLOIT: cd 'nested' && git commit (comillas simples, protegida) → bloquea
  const root = makeTmpDir("r3d2-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const nested = join(root, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev"); // protegida

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "cd 'nested' && git commit -m wip" },
  });
  assert(
    "R3d.2 EXPLOIT comillas simples: cd 'nested' && git commit (protegida) → bloquea",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3d.3 — EXPLOIT: git -C "nested" commit (comillas dobles en -C, protegida) → bloquea
  const root = makeTmpDir("r3d3-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const nested = join(root, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev"); // protegida

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: 'git -C "nested" commit -m wip' },
  });
  assert(
    'R3d.3 EXPLOIT comillas dobles en -C: git -C "nested" commit (protegida) → bloquea',
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3d.4 — EXPLOIT pre-pr-gate: cd "nested" && glab mr create (naming inválido) → bloquea
  const base = makeTmpDir("r3d4-base-");
  gitInit(base);
  commitFile(base, "README.md", "x", "chore: init");
  renameCurrentBranch(base, "dev");
  const nested = join(base, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  checkoutNewBranch(nested, "mi-rama-sin-prefijo");
  commitFile(nested, "a.txt", "a", "feat: a");

  const r = runHook(PRE_PR_GATE, base, {
    tool_name: "Bash",
    tool_input: { command: 'cd "nested" && glab mr create --title x --body y' },
  });
  assert(
    'R3d.4 EXPLOIT pre-pr-gate: cd "nested" && glab mr create (naming inválido) → bloquea',
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
  assert("R3d.4 stderr menciona naming GitFlow", r.stderr.includes("GitFlow"), r.stderr);
}

// --- pushd ---

{
  // R3d.5 — EXPLOIT: pushd nested && git commit (nested protegida) → bloquea
  const root = makeTmpDir("r3d5-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const nested = join(root, "nested");
  mkdirSync(nested, { recursive: true });
  gitInit(nested);
  commitFile(nested, "README.md", "x", "chore: init nested");
  renameCurrentBranch(nested, "dev"); // protegida

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "pushd nested && git commit -m wip" },
  });
  assert(
    "R3d.5 EXPLOIT pushd: pushd nested && git commit (protegida) → bloquea",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3d.6 — legítimo: pushd feature && git commit (feature no protegida) → permite
  const root = makeTmpDir("r3d6-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const feature = join(root, "feature");
  mkdirSync(feature, { recursive: true });
  gitInit(feature);
  commitFile(feature, "README.md", "x", "chore: init feature");
  renameCurrentBranch(feature, "dev");
  checkoutNewBranch(feature, "feature/algo");

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "pushd feature && git commit -m wip" },
  });
  assert(
    "R3d.6 legítimo: pushd feature && git commit (no protegida) → permite",
    r.status === 0,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3d.7 — popd sin cd/-C extraíble → forceBlock, bloquea (destino no
  // determinable estáticamente), aunque la rama actual sea feature.
  const repo = makeTmpDir("r3d7-");
  gitInit(repo);
  commitFile(repo, "README.md", "x", "chore: init");
  renameCurrentBranch(repo, "dev");
  checkoutNewBranch(repo, "feature/algo"); // NO protegida

  const r = runHook(GUARD_BRANCH, repo, {
    tool_name: "Bash",
    tool_input: { command: "popd && git commit -m x" },
  });
  assert(
    "R3d.7 popd sin cd/-C extraíble → forceBlock bloquea",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

// --- Fail-closed ante fallo de resolución de rama (path malformado/inexistente) ---

{
  // R3d.8 — cd apuntando a un directorio que NO existe (no repo git) → bloquea
  // (fail-closed: el cwd fue relocalizado y no resuelve a ninguna rama).
  const root = makeTmpDir("r3d8-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "feature/algo"); // raíz NO protegida

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: "cd no-existe && git commit -m wip" },
  });
  assert(
    "R3d.8 cd hacia directorio inexistente (relocalizado) → bloquea (fail-closed, no exit 0)",
    r.status === 2,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

{
  // R3d.9 — no-regresión: sin cd/-C, en un directorio que NO es repo git
  // (resolved === base) → sigue permitiendo (comportamiento histórico,
  // nada que proteger).
  const notARepo = makeTmpDir("r3d9-not-a-repo-");
  const r = runHook(GUARD_BRANCH, notARepo, {
    tool_name: "Bash",
    tool_input: { command: "git commit -m wip" },
  });
  assert(
    "R3d.9 no-regresión: sin cd/-C y no es repo git (resolved === base) → permite",
    r.status === 0,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

// --- No-regresión: todos los vectores previos (F0/B1/B6/R3b/R3c) siguen cubiertos arriba ---

{
  // R3d.10 — legítimo residual: comillas dobles en feature real existente,
  // no protegida → permite (confirma que el strip de comillas no rompe el
  // caso legítimo).
  const root = makeTmpDir("r3d10-root-");
  gitInit(root);
  commitFile(root, "README.md", "x", "chore: init root");
  renameCurrentBranch(root, "dev");
  const feature = join(root, "feature");
  mkdirSync(feature, { recursive: true });
  gitInit(feature);
  commitFile(feature, "README.md", "x", "chore: init feature");
  renameCurrentBranch(feature, "dev");
  checkoutNewBranch(feature, "feature/algo");

  const r = runHook(GUARD_BRANCH, root, {
    tool_name: "Bash",
    tool_input: { command: 'cd "feature" && git commit -m wip' },
  });
  assert(
    'R3d.10 legítimo: cd "feature" (comillas, feature real no protegida) → permite',
    r.status === 0,
    `exit ${r.status}, stderr: ${r.stderr}`
  );
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
console.log(`\n--- Resultado: ${passed} pasaron, ${failed} fallaron ---`);
if (failed > 0) process.exit(1);
