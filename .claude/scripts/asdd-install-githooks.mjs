#!/usr/bin/env node
// -----------------------------------------------------------------------------
// asdd-install-githooks.mjs — instala la capa de enforcement git nativa.
//
// Implementa la Fase 2 / Opción D del ADR-007: los guards PreToolUse deben
// adivinar el repo efectivo parseando shell (fixes R3..R3d, cuatro auditorías
// adversariales, un bypass nuevo en cada una). Un git hook nativo no adivina:
// corre después de que git resolvió repo, rama, índice y mensaje. Esta capa NO
// reemplaza a la PreToolUse — la complementa dando feedback antes del push.
//
// Uso:
//   node .claude/scripts/asdd-install-githooks.mjs            # instala en este repo
//   node .claude/scripts/asdd-install-githooks.mjs --check    # solo reporta estado
//   node .claude/scripts/asdd-install-githooks.mjs --recurse  # + repos anidados
//   node .claude/scripts/asdd-install-githooks.mjs --uninstall
// -----------------------------------------------------------------------------

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const HOOKS_REL = ".asdd/githooks";
const HOOKS = [
  "pre-commit",
  "commit-msg",
  "pre-merge-commit",
  "pre-push",
  "pre-rebase",
  "reference-transaction",
];
const MIN_GIT = [2, 28]; // reference-transaction existe desde 2.28

const args = new Set(process.argv.slice(2));
const modo = args.has("--uninstall")
  ? "uninstall"
  : args.has("--check")
    ? "check"
    : "install";
const recurse = args.has("--recurse");

const out = (m) => process.stdout.write(`${m}\n`);
const warn = (m) => process.stderr.write(`${m}\n`);

function gitIn(cwd, gitArgs) {
  try {
    return execFileSync("git", gitArgs, {
      cwd,
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function gitVersion() {
  const raw = gitIn(process.cwd(), ["--version"]) || "";
  const m = raw.match(/(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

function repoRoot(cwd) {
  return gitIn(cwd, ["rev-parse", "--show-toplevel"]);
}

/** Repos git anidados bajo la raíz, sin entrar en node_modules ni en .git. */
function nestedRepos(root, depth = 3) {
  const found = [];
  const skip = new Set(["node_modules", ".git", "dist", "build", ".venv", "__pycache__"]);
  const walk = (dir, nivel) => {
    if (nivel > depth) return;
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || skip.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (existsSync(path.join(abs, ".git"))) {
        found.push(abs);
        continue; // no bajamos dentro de otro repo
      }
      walk(abs, nivel + 1);
    }
  };
  walk(root, 1);
  return found;
}

/** Ruta de hooks a configurar: absoluta si el repo no es el que trae la carpeta. */
function hooksPathFor(repo, plantilla) {
  const propia = path.join(repo, HOOKS_REL);
  if (existsSync(propia)) return HOOKS_REL; // relativa: portable entre máquinas
  return path.join(plantilla, HOOKS_REL).replace(/\\/g, "/");
}

function verificarShims(dir) {
  const faltan = HOOKS.filter((h) => !existsSync(path.join(dir, h)));
  return faltan;
}

function procesar(repo, plantilla) {
  const actual = gitIn(repo, ["config", "--get", "core.hooksPath"]);
  const objetivo = hooksPathFor(repo, plantilla);

  if (modo === "check") {
    const estado = actual === objetivo ? "OK" : actual ? `otro (${actual})` : "sin configurar";
    out(`  ${estado.padEnd(22)} ${repo}`);
    return estado === "OK";
  }

  if (modo === "uninstall") {
    if (!actual) {
      out(`  ya estaba sin configurar   ${repo}`);
      return true;
    }
    gitIn(repo, ["config", "--unset", "core.hooksPath"]);
    out(`  desinstalado               ${repo}`);
    return true;
  }

  if (actual && actual !== objetivo) {
    warn(`  CONFLICTO                 ${repo}`);
    warn(`      core.hooksPath ya apunta a '${actual}'. No se sobrescribe.`);
    warn(`      Integrá los hooks ASDD en esa ruta o quitá la configuración previa.`);
    return false;
  }

  gitIn(repo, ["config", "core.hooksPath", objetivo]);
  out(`  instalado                 ${repo}  →  ${objetivo}`);
  return true;
}

// ---- main -------------------------------------------------------------------

const raiz = repoRoot(process.cwd());
if (!raiz) {
  warn("no estás dentro de un repositorio git.");
  process.exit(1);
}

const plantilla = existsSync(path.join(raiz, HOOKS_REL)) ? raiz : process.cwd();
const dirHooks = path.join(plantilla, HOOKS_REL);

if (!existsSync(dirHooks)) {
  warn(`no encuentro ${HOOKS_REL} a partir de ${plantilla}.`);
  process.exit(1);
}

const faltan = verificarShims(dirHooks);
if (faltan.length) {
  warn(`faltan shims en ${HOOKS_REL}: ${faltan.join(", ")}`);
  process.exit(1);
}

const [maj, min] = gitVersion();
if (maj < MIN_GIT[0] || (maj === MIN_GIT[0] && min < MIN_GIT[1])) {
  warn(`git ${maj}.${min} detectado; se requiere ≥ ${MIN_GIT.join(".")} para reference-transaction.`);
  warn("El resto de los hooks funciona igual, pero GS-004/GS-010 no se evaluarán.");
}

if (process.platform !== "win32") {
  for (const h of HOOKS) {
    try {
      chmodSync(path.join(dirHooks, h), 0o755);
    } catch {
      /* no crítico */
    }
  }
}

const repos = [raiz, ...(recurse ? nestedRepos(raiz) : [])];
out(`${modo === "check" ? "Estado" : modo === "uninstall" ? "Desinstalando" : "Instalando"} hooks nativos ASDD en ${repos.length} repo(s):`);

let okAll = true;
for (const r of repos) okAll = procesar(r, plantilla) && okAll;

if (modo === "install") {
  out("");
  out("Reglas que esta capa enforza, sin parsear shell:");
  out("  pre-commit             GS-001 rama protegida · ART-001 naming de artefactos nuevos");
  out("  commit-msg             GS-005 conventional commits · CORE-009 sin atribución de IA");
  out("  pre-merge-commit       GS-001 sobre merges");
  out("  pre-rebase             GS-007 merge sí, rebase no");
  out("  pre-push               GS-002 sin reescritura de historia · GS-008 gate atado al commit · integridad de reglas");
  out("  reference-transaction  GS-004 naming de rama · GS-010 borrado verificado (avisa; bloquea con ASDD_GITHOOKS_STRICT_REFS=1)");
  out("");
  out("Los escape hatch siguen siendo los documentados y ahora quedan en un log durable:");
  out("  .claude/.runtime/git-audit.jsonl");
  out("");
  out("Recordatorio: esta capa es local. La barrera contra evasión deliberada son los");
  out("protected branches del remoto (ADR-007 Opción E) — configurarlos sigue siendo obligatorio.");
}

process.exit(okAll ? 0 : 1);
