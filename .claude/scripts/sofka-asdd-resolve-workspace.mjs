#!/usr/bin/env node
/**
 * WS-001 — Resolver del workspace ASDD.
 *
 * Fuente de verdad unica sobre DONDE vive el codigo que ASDD implementa.
 * Orquestador, developers y gates consumen esta salida; nunca leen
 * `.sofka-asdd/workspace.json` directamente.
 *
 * POR QUE EXISTE (bug 28-07-2026 — manejo de ramas del agente de desarrollo):
 * el `isolation: worktree` del Agent tool crea el worktree del repo de la
 * SESION (el repo ASDD). Cuando el codigo vive en un repo git anidado o
 * externo, ese worktree es un checkout limpio del ASDD que NO contiene el
 * codigo del proyecto — git nunca versiona un repo anidado. El developer
 * aterrizaba en un directorio sin codigo y quedaba bloqueado. ORC-011 v2
 * traslada la creacion del worktree al repo del proyecto, y este resolver
 * calcula todas las rutas, la rama y los comandos exactos para que el
 * orquestador no los construya a mano.
 *
 * FAIL-CLOSED: cualquier inconsistencia termina en exit 1 con un mensaje
 * accionable. Nunca devuelve un contrato parcial — un contrato a medias
 * reproduce exactamente el bug que este resolver cierra.
 *
 * Uso:
 *   node .claude/scripts/sofka-asdd-resolve-workspace.mjs --check
 *   node .claude/scripts/sofka-asdd-resolve-workspace.mjs \
 *     --slug ado-1321-borradores --area backend --ticket ADO-1321
 *   node .claude/scripts/sofka-asdd-resolve-workspace.mjs --project credit-core --slug x --area backend
 */
import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Ruta canonica real. Imprescindible para comparar rutas: en Windows la misma
 * carpeta se alcanza por su nombre 8.3 (`JEHISO~1.GAL`), por un junction o por
 * un symlink, y `git rev-parse --show-toplevel` siempre responde con la forma
 * larga. Comparar los strings sin canonizar rechazaba project roots validos —
 * un falso bloqueo indistinguible del bug que WS-001 cierra.
 */
function canonical(path) {
  try { return realpathSync.native(path); } catch { return resolve(path); }
}

/** Normaliza para comparar: separadores unix y, en Windows, case-insensitive. */
function comparablePath(path) {
  const normalized = canonical(path).replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

const samePath = (left, right) => comparablePath(left) === comparablePath(right);

const HERE = dirname(fileURLToPath(import.meta.url));
const ASDD_ROOT = canonical(resolve(HERE, "../.."));
const WORKSPACE_PATH = join(ASDD_ROOT, ".sofka-asdd/workspace.json");
const WORKSPACE_LOCAL_PATH = join(ASDD_ROOT, ".sofka-asdd/workspace.local.json");
const RUN_PATH = join(ASDD_ROOT, ".asdd-run.json");
const TESTING_PATH = join(ASDD_ROOT, ".sofka-asdd/testing-capabilities.yaml");
const SETTINGS_LOCAL_PATH = join(ASDD_ROOT, ".claude/settings.local.json");

const WORKTREES_DIRNAME = ".asdd-worktrees";
const DEFAULT_BRANCH_PATTERN = "feature/{slug}-{area}";
const DEFAULT_GITFLOW_PREFIXES = "feature/,feat/,fix/,hotfix/,chore/,refactor/,test/,docs/,perf/,ci/,wt/";
const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// MAX_PATH de Windows es 260. El worktree hospeda el arbol completo del
// proyecto, asi que su raiz necesita margen para las rutas internas.
const WINDOWS_PATH_BUDGET = 150;

class ResolveError extends Error {}
const fail = (message) => { throw new ResolveError(message); };

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) { out[key] = true; continue; }
    out[key] = next;
    index += 1;
  }
  return out;
}

function readJson(path, { required }) {
  if (!existsSync(path)) {
    if (required) fail(`${relative(ASDD_ROOT, path)} no existe. Es el contrato de workspace (WS-001); restauralo desde el template.`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${relative(ASDD_ROOT, path)} no es JSON valido: ${error.message}`);
  }
}

function atomicWriteJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

// ---------------------------------------------------------------------------
// Carga y merge de configuracion
// ---------------------------------------------------------------------------

/**
 * Merge de `workspace.json` con `workspace.local.json`. El local gana clave por
 * clave DENTRO de cada proyecto, y puede agregar proyectos o redefinir
 * `default_project`. Es el mecanismo para que un dev apunte ASDD a su repo ya
 * clonado sin versionar una ruta absoluta de su maquina.
 */
function loadWorkspace() {
  const base = readJson(WORKSPACE_PATH, { required: true });
  const local = readJson(WORKSPACE_LOCAL_PATH, { required: false });

  if (base.schema !== "1.0") fail(`workspace.json declara schema "${base.schema}"; este resolver soporta "1.0".`);
  if (!base.projects || typeof base.projects !== "object") fail("workspace.json no declara el mapa `projects`.");

  const merged = {
    default_project: base.default_project,
    projects: { ...base.projects },
  };

  if (local) {
    if (local.schema && local.schema !== "1.0") fail(`workspace.local.json declara schema "${local.schema}"; este resolver soporta "1.0".`);
    if (local.default_project) merged.default_project = local.default_project;
    for (const [key, override] of Object.entries(local.projects ?? {})) {
      if (!override || typeof override !== "object") fail(`workspace.local.json → projects.${key} debe ser un objeto.`);
      merged.projects[key] = { ...(merged.projects[key] ?? {}), ...override };
    }
  }

  for (const key of Object.keys(merged.projects)) {
    if (!KEY_RE.test(key)) fail(`la clave de proyecto "${key}" debe estar en kebab-case ASCII.`);
  }
  if (!merged.default_project) fail("workspace.json no declara `default_project`.");
  return merged;
}

/** Precedencia del proyecto activo: --project > .asdd-run.json.project > default_project. */
function pickProjectKey(workspace, requested) {
  if (requested && requested !== true) {
    if (!workspace.projects[requested]) {
      fail(`--project "${requested}" no existe en workspace.json. Disponibles: ${Object.keys(workspace.projects).join(", ")}.`);
    }
    return { key: requested, source: "--project" };
  }
  const run = readJson(RUN_PATH, { required: false });
  const fromRun = run?.project;
  if (fromRun) {
    if (!workspace.projects[fromRun]) {
      fail(`.asdd-run.json declara project "${fromRun}", ausente de workspace.json. Corregí uno de los dos antes de construir.`);
    }
    return { key: fromRun, source: ".asdd-run.json" };
  }
  if (!workspace.projects[workspace.default_project]) {
    fail(`default_project "${workspace.default_project}" no existe en el mapa projects.`);
  }
  return { key: workspace.default_project, source: "default_project" };
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitOk(args, cwd) {
  try { git(args, cwd); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Validacion del project root
// ---------------------------------------------------------------------------

function resolveProjectRoot(rawRoot, projectKey) {
  const declared = String(rawRoot ?? "").trim();
  if (!declared) fail(`projects.${projectKey}.root esta vacio. Declará la raiz del repo de desarrollo.`);

  const normalized = declared.replaceAll("\\", "/");
  const candidate = isAbsolute(normalized) ? resolve(normalized) : resolve(ASDD_ROOT, normalized);

  if (!existsSync(candidate)) {
    fail(`projects.${projectKey}.root apunta a "${declared}" y esa ruta no existe (resuelta a ${candidate}). `
      + `Si tu proyecto vive en otro lado, corregí la ruta en .sofka-asdd/workspace.local.json.`);
  }
  if (!statSync(candidate).isDirectory()) fail(`projects.${projectKey}.root ("${declared}") no es un directorio.`);

  // Se trabaja con la forma canonica: git responde siempre en forma larga y
  // todas las rutas derivadas (worktrees, permisos) deben coincidir con ella.
  const absolute = canonical(candidate);

  // Un repo git de verdad, no una subcarpeta que hereda el .git del ASDD.
  if (!gitOk(["rev-parse", "--git-dir"], absolute)) {
    fail(`"${absolute}" no es un repositorio git. Cloná o inicializá el proyecto ahí antes de construir.`);
  }
  const toplevel = git(["rev-parse", "--show-toplevel"], absolute);
  if (!samePath(toplevel, absolute)) {
    fail(`"${absolute}" no es la raiz de su repo git — la raiz real es "${resolve(toplevel)}". `
      + `projects.${projectKey}.root debe apuntar a la raiz del repo.`);
  }
  if (!gitOk(["rev-parse", "--verify", "HEAD"], absolute)) {
    fail(`el repo "${absolute}" no tiene ningun commit. git worktree add exige al menos uno.`);
  }
  return absolute;
}

function resolveBaseBranch(projectRoot, declared) {
  const value = declared === null || declared === undefined ? "" : String(declared).trim();
  if (!value) {
    const current = git(["rev-parse", "--abbrev-ref", "HEAD"], projectRoot);
    if (current === "HEAD") fail(`el repo "${projectRoot}" esta en detached HEAD y base_branch no esta declarada. Declará base_branch en workspace.json.`);
    return { branch: current, source: "current" };
  }
  if (!gitOk(["rev-parse", "--verify", `refs/heads/${value}`], projectRoot)) {
    fail(`base_branch "${value}" no existe en "${projectRoot}". Ramas locales: ${listBranches(projectRoot)}.`);
  }
  return { branch: value, source: "config" };
}

function listBranches(projectRoot) {
  try {
    return git(["for-each-ref", "--format=%(refname:short)", "refs/heads"], projectRoot)
      .split("\n").filter(Boolean).slice(0, 10).join(", ") || "(ninguna)";
  } catch {
    return "(no legibles)";
  }
}

// ---------------------------------------------------------------------------
// Rama de trabajo
// ---------------------------------------------------------------------------

function slugify(value) {
  return String(value ?? "")
    .trim().toLowerCase()
    .replaceAll("\\", "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function gitflowPrefixes() {
  return (process.env.SOFKA_ASDD_GITFLOW_PREFIXES || DEFAULT_GITFLOW_PREFIXES)
    .split(",").map((item) => item.trim()).filter(Boolean);
}

/**
 * Renderiza `branch_pattern`. Un placeholder sin valor es un error: una rama
 * con `{area}` literal o con el segmento colapsado haria que dos developers
 * concurrentes compartan rama, que es justo lo que ORC-011 evita.
 */
function renderBranch(pattern, values, projectRoot) {
  const placeholders = [...pattern.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]);
  const known = new Set(["ticket", "slug", "area", "run_id"]);

  for (const name of placeholders) {
    if (!known.has(name)) fail(`branch_pattern usa el placeholder desconocido "{${name}}". Validos: {ticket}, {slug}, {area}, {run_id}.`);
  }

  let branch = pattern;
  for (const name of placeholders) {
    const rendered = slugify(values[name]);
    if (!rendered) {
      fail(`branch_pattern requiere "{${name}}" y no se recibio valor. Pasá --${name.replace("_", "-")} al resolver.`);
    }
    branch = branch.replaceAll(`{${name}}`, rendered);
  }

  const prefixes = gitflowPrefixes();
  if (!prefixes.some((prefix) => branch.startsWith(prefix))) {
    fail(`la rama resuelta "${branch}" no usa un prefijo GitFlow permitido (GS-004). Permitidos: ${prefixes.join(", ")}.`);
  }
  if (!gitOk(["check-ref-format", `refs/heads/${branch}`], ASDD_ROOT)) {
    fail(`la rama resuelta "${branch}" no es un nombre de rama git valido.`);
  }
  if (gitOk(["rev-parse", "--verify", `refs/heads/${branch}`], projectRoot)) {
    fail(`la rama "${branch}" ya existe en "${projectRoot}". Integrá o eliminá la anterior antes de reusar el slug (GS-006, GS-010).`);
  }
  return branch;
}

/**
 * Un patron sin `{area}` ni `{run_id}` no puede distinguir dos developers
 * concurrentes: ambos resolverian la misma rama y el segundo `worktree add`
 * fallaria. ORC-011-A degrada a lotes secuenciales cuando esto es false.
 */
function isParallelSafe(pattern) {
  return pattern.includes("{area}") || pattern.includes("{run_id}");
}

// ---------------------------------------------------------------------------
// Directorio de worktrees — hermano del project root
// ---------------------------------------------------------------------------

function resolveWorktreesDir(projectRoot) {
  const parent = dirname(projectRoot);
  if (parent === projectRoot) fail(`"${projectRoot}" es una raiz de volumen; no hay directorio hermano donde alojar los worktrees.`);
  try {
    accessSync(parent, constants.W_OK);
  } catch {
    fail(`el directorio "${parent}" no es escribible y ahi debe vivir ${WORKTREES_DIRNAME}/. `
      + `Mové el proyecto a una ruta escribible o ajustá permisos.`);
  }
  return join(parent, WORKTREES_DIRNAME);
}

// ---------------------------------------------------------------------------
// Permisos de directorio para rutas externas al ASDD
// ---------------------------------------------------------------------------

function isInside(root, target) {
  const rel = relative(comparablePath(root), comparablePath(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Los subagentes solo pueden escribir dentro de la raiz del proyecto de la
 * sesion mas lo declarado en `permissions.additionalDirectories`. Si el project
 * root o el directorio de worktrees quedan fuera del ASDD, hay que registrarlos
 * o el developer falla al primer Write — indistinguible del bug original.
 *
 * Claude Code lee additionalDirectories al INICIAR la sesion, asi que agregarlo
 * en caliente no toma efecto hasta reiniciar. Se reporta explicitamente.
 */
function ensureDirectoryPermissions(paths) {
  const needed = paths.filter((path) => !isInside(ASDD_ROOT, path));
  if (needed.length === 0) return { required: [], added: [], restart_required: false };

  const settings = readJson(SETTINGS_LOCAL_PATH, { required: false }) ?? {};
  settings.permissions ??= {};
  const current = Array.isArray(settings.permissions.additionalDirectories)
    ? settings.permissions.additionalDirectories
    : [];

  // comparablePath() ya pliega separadores Y case en win32 (línea 46-49) —
  // reusarlo evita que la misma ruta se re-agregue en cada corrida cuando
  // difiere solo en mayúsculas/minúsculas.
  const registered = new Set(current.map(comparablePath));
  const added = needed.filter((path) => !registered.has(comparablePath(path)));

  if (added.length > 0) {
    settings.permissions.additionalDirectories = [
      ...current,
      ...added.map((path) => path.replaceAll("\\", "/")),
    ];
    atomicWriteJson(SETTINGS_LOCAL_PATH, settings);
  }

  return {
    required: needed.map((path) => path.replaceAll("\\", "/")),
    added: added.map((path) => path.replaceAll("\\", "/")),
    restart_required: added.length > 0,
  };
}

// ---------------------------------------------------------------------------
// testing-capabilities.yaml → comando de test (ORC-011-C)
// ---------------------------------------------------------------------------

/**
 * Lee `testing.runner.command` con un scan por indentacion. El comando se
 * ejecuta EN EL WORKTREE del proyecto, no en la raiz del ASDD — ese cambio de
 * cwd es parte del fix de ORC-011-C.
 */
function readTestCommand() {
  if (!existsSync(TESTING_PATH)) return null;
  const lines = readFileSync(TESTING_PATH, "utf8").split(/\r?\n/);
  const path = [];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(/^(\s*)([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const [, indent, key, rawValue] = match;
    const depth = indent.length;
    while (path.length && path[path.length - 1].depth >= depth) path.pop();
    const value = rawValue.split("#")[0].trim().replace(/^["']|["']$/g, "");

    if (path.map((item) => item.key).join(".") === "testing.runner" && key === "command") {
      return value || null;
    }
    if (!value) path.push({ key, depth });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Contrato de salida
// ---------------------------------------------------------------------------

const quote = (value) => `"${value.replaceAll("\\", "/")}"`;

function buildCommands({ projectRoot, worktreePath, branch, baseBranch, testCommand }) {
  const repo = quote(projectRoot);
  return {
    create: `git -C ${repo} worktree add ${quote(worktreePath)} -b ${branch} ${baseBranch}`,
    validate: testCommand
      ? `git -C ${quote(worktreePath)} rev-parse --abbrev-ref HEAD && (cd ${quote(worktreePath)} && ${testCommand})`
      : null,
    merge: `git -C ${repo} checkout ${baseBranch} && git -C ${repo} merge --no-ff ${branch}`,
    cleanup_worktree: `git -C ${repo} worktree remove ${quote(worktreePath)}`,
    cleanup_branch: `git -C ${repo} branch -d ${branch}`,
    list_worktrees: `git -C ${repo} worktree list`,
  };
}

function main() {
  const args = argsOf(process.argv.slice(2));
  const checkOnly = Boolean(args.check);
  const warnings = [];

  const workspace = loadWorkspace();
  const picked = pickProjectKey(workspace, args.project);
  const project = workspace.projects[picked.key];

  const projectRoot = resolveProjectRoot(project.root, picked.key);
  const monorepo = samePath(projectRoot, ASDD_ROOT);
  const external = !isInside(ASDD_ROOT, projectRoot);
  const base = resolveBaseBranch(projectRoot, project.base_branch);
  if (base.source === "current") {
    warnings.push(`base_branch no esta declarada para "${picked.key}"; se usa la rama actual del proyecto ("${base.branch}"). Declarala en workspace.json para que el merge de ORC-011-D sea deterministico.`);
  }

  const pattern = String(project.branch_pattern ?? DEFAULT_BRANCH_PATTERN).trim() || DEFAULT_BRANCH_PATTERN;
  const parallelSafe = isParallelSafe(pattern);
  if (!parallelSafe) {
    warnings.push(`branch_pattern "${pattern}" no incluye {area} ni {run_id}: dos developers concurrentes resolverian la misma rama. ORC-011-A debe ejecutar en lotes secuenciales.`);
  }

  const worktreesDir = monorepo ? null : resolveWorktreesDir(projectRoot);
  const testCommand = readTestCommand();
  if (!testCommand) {
    warnings.push("testing.runner.command esta vacio en .sofka-asdd/testing-capabilities.yaml; ORC-011-C omite la validacion pre-merge y debe documentarlo en el anuncio del merge.");
  }

  let branch = null;
  let worktreePath = null;
  if (!checkOnly) {
    branch = renderBranch(pattern, {
      ticket: args.ticket, slug: args.slug, area: args.area,
      run_id: args["run-id"] ?? readJson(RUN_PATH, { required: false })?.run_id,
    }, projectRoot);
    if (!monorepo) {
      worktreePath = join(worktreesDir, branch.replaceAll("/", "-"));
      if (existsSync(worktreePath)) {
        fail(`"${worktreePath}" ya existe. Corré \`git -C "${projectRoot}" worktree list\` y limpiá el worktree huerfano (ORC-011-F).`);
      }
      if (process.platform === "win32" && worktreePath.length > WINDOWS_PATH_BUDGET) {
        warnings.push(`la ruta del worktree tiene ${worktreePath.length} caracteres; en Windows deja poco margen frente a MAX_PATH (260). Considerá acortar el slug o mover el proyecto mas cerca de la raiz del volumen.`);
      }
    }
  }

  const permissions = ensureDirectoryPermissions([projectRoot, worktreesDir].filter(Boolean));
  if (permissions.restart_required) {
    warnings.push(`Se registraron rutas nuevas en permissions.additionalDirectories de .claude/settings.local.json: ${permissions.added.join(", ")}. Claude Code lee ese permiso al iniciar la sesion — REINICIÁ la sesion antes de delegar al developer, o su primer Write fallara.`);
  }

  const contract = {
    project: picked.key,
    project_source: picked.source,
    mode: monorepo ? "monorepo" : "nested",
    external,
    asdd_root: ASDD_ROOT.replaceAll("\\", "/"),
    project_root: projectRoot.replaceAll("\\", "/"),
    project_root_declared: project.root,
    base_branch: base.branch,
    base_branch_source: base.source,
    branch_pattern: pattern,
    branch,
    parallel_safe: parallelSafe,
    worktrees_dir: worktreesDir ? worktreesDir.replaceAll("\\", "/") : null,
    worktree_path: worktreePath ? worktreePath.replaceAll("\\", "/") : null,
    test_command: testCommand,
    permissions,
    commands: branch && !monorepo
      ? buildCommands({ projectRoot, worktreePath, branch, baseBranch: base.branch, testCommand })
      : null,
    agent_isolation: monorepo ? "current-branch" : "orchestrator-managed-worktree",
    instruction: monorepo
      ? "Modo mono-repo: el codigo vive en el repo ASDD. El developer trabaja sobre la rama actual (ADR-010). No usar isolation: worktree del Agent tool."
      : "Modo repo anidado/externo: PROHIBIDO isolation: worktree del Agent tool (crearia el worktree del repo ASDD, sin el codigo del proyecto). El orquestador ejecuta commands.create y pasa worktree_path absoluto al developer como WORKTREE_DIR.",
    warnings,
  };

  process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const prefix = error instanceof ResolveError ? "" : `[${error.name}] `;
  process.stderr.write(`resolve-workspace: ${prefix}${error.message}\n`);
  process.exit(1);
}
