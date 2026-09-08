// -----------------------------------------------------------------------------
// facts.mjs — hechos del repositorio para los git hooks nativos ASDD.
//
// Por qué existe: los hooks PreToolUse de Claude Code deben adivinar el repo
// efectivo parseando el string del comando (ver ADR-007 y los fixes R3..R3d).
// Un git hook nativo no adivina nada: git ya resolvió el repo, la rama y el
// índice antes de invocarlo. Este módulo expone esos hechos sin parsear shell.
// -----------------------------------------------------------------------------

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_PROTECTED = "main,master,qa,dev,develop";

/** Ejecuta git y devuelve stdout recortado, o null si falla. */
export function git(args, cwd = process.cwd()) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Raíz del working tree sobre el que git invocó el hook. */
export function repoRoot() {
  return git(["rev-parse", "--show-toplevel"]) || process.cwd();
}

/** Rama actual, o null en detached HEAD. */
export function currentBranch(cwd = repoRoot()) {
  return git(["symbolic-ref", "--short", "HEAD"], cwd);
}

/** Lista de ramas protegidas, configurable por entorno (GS-001). */
export function protectedBranches(env = process.env) {
  return String(env.ASDD_PROTECTED_BRANCHES || DEFAULT_PROTECTED)
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Prefijos GitFlow válidos, configurables por entorno (GS-004). */
export function gitflowPrefixes(env = process.env) {
  const raw = env.ASDD_GITFLOW_PREFIXES ||
    "feature/,feat/,fix/,hotfix/,chore/,refactor/,test/,docs/,perf/,ci/,wt/";
  return raw.split(",").map((p) => p.trim()).filter(Boolean);
}

/**
 * Archivos del índice a punto de commitearse, con su estado.
 * Devuelve [{ status, file }] donde status es el código de --name-status
 * (A=added, M=modified, D=deleted, R=renamed, C=copied).
 * Para renombres/copias se reporta la ruta DESTINO, que es la que interesa
 * para validar el nombre de un artefacto nuevo.
 */
export function stagedFiles(cwd = repoRoot()) {
  const out = git(["diff", "--cached", "--name-status", "--diff-filter=ACMRD"], cwd);
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t/);
      const status = (parts[0] || "").charAt(0);
      const file = (status === "R" || status === "C" ? parts[2] : parts[1]) || "";
      return { status, file: file.replace(/\\/g, "/") };
    })
    .filter((e) => e.file);
}

/** ¿El repo declara un run ASDD activo? Devuelve el objeto o null. */
export function activeRun(cwd = repoRoot()) {
  const p = path.join(cwd, ".asdd-run.json");
  if (!existsSync(p)) return null;
  try {
    const run = JSON.parse(readFileSync(p, "utf8"));
    if (!run || !run.run_id) return null;
    return run;
  } catch {
    return null;
  }
}

/**
 * ¿Hay un merge en curso? Durante un merge, un archivo que ya existía en el
 * otro padre (MERGE_HEAD) puede aparecer como "added" en el diff contra HEAD
 * sin ser contenido nuevo de este commit — ART-001 necesita distinguir ambos
 * casos y por eso consulta este hecho antes de decidir qué es "nuevo".
 */
export function isMergeInProgress(cwd = repoRoot()) {
  return git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], cwd) !== null;
}

/**
 * ¿El archivo ya existía en el árbol de MERGE_HEAD? Si es así, el merge lo
 * trae de historia legítima (ya commiteado en la otra rama) y no es un
 * artefacto "nuevo generado por un agente" a efectos de ART-001, aunque el
 * diff contra HEAD lo reporte como "added".
 */
export function mergeHeadHasPath(cwd, file) {
  return git(["cat-file", "-e", `MERGE_HEAD:${file}`], cwd) !== null;
}

/** Escape hatch: por variable de entorno de sesión, nunca por string de comando. */
export function hatchActive(varName, env = process.env) {
  return env[varName] === "1" || env[varName] === "true" ||
    env.ASDD_GITHOOKS_DISABLE === "1";
}
