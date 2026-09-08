import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBudgetedLaunch, normalizeBudgetEnvelope } from "./sofka-asdd-subagent-budget-lib.mjs";
// El motor de comandos (parser, gramática de shell y léxico de lectura) es único y
// vive en hooks/_lib/: lo comparten esta librería y el guard del orquestador.
import {
  isReadOnlyPipelineStage,
  isReadOnlySegment,
  SHELL_CONTROL_RE,
  splitBenignCommand,
} from "../../hooks/_lib/sofka-asdd-command-plane.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, "..", "..", "..");
export const RUNTIME_DIR = resolve(HERE, "..", "..", ".runtime", "plan-authorization");
export const CHALLENGE_PATH = join(RUNTIME_DIR, "challenge.json");
export const AUTHORIZATIONS_PATH = join(RUNTIME_DIR, "authorizations.json");
export const ELIGIBILITY_PATH = join(RUNTIME_DIR, "approval-eligible.json");
const DEFAULT_TTL_SECONDS = 900;
// Scripts del framework que las reglas obligan a ejecutar y que no escriben nada
// (verificado: cero writeFileSync/renameSync/mkdirSync/appendFileSync/unlinkSync).
// `resolve-rule` lo exigen las 9 reglas always-on en su bloque "Carga condicional
// obligatoria"; `validate-template` lo exige sofka-asdd-system-integrity antes de
// declarar trabajo completo. `resolve-workspace` NO entra: escribe estado y ninguna
// regla se lo manda a un agente. `plan-authorization` tampoco: un subagente no
// aprueba ni consulta su propia autorización (ORC-010-A).
const FRAMEWORK_READ_SCRIPTS = new Set([
  ".claude/scripts/sofka-asdd-resolve-rule.mjs",
  ".claude/scripts/sofka-asdd-resolve-capability.mjs",
  ".claude/scripts/validate-template.mjs",
]);
const NODE_INVOCATION_RE = /^node\s+([^\s]+)(?:\s|$)/;
// sofka-asdd-system-integrity obliga a cerrar con el runner de tests y el validador
// del proyecto antes de declarar trabajo completo, y la invocación exacta no se conoce
// al planificar. Se admite solo la forma canónica sin argumentos extra, y solo si el
// script está declarado en el package.json del proyecto y su nombre es de verificación:
// `setup`, `hash:regen` o cualquier script de entrega quedan afuera.
const NPM_VERIFICATION_RE = /^npm\s+(?:test|run\s+([a-z][a-z0-9:_-]*))$/;
const VERIFICATION_SCRIPT_NAME_RE = /^(?:test|tests|build|lint|typecheck|type-check|validate|check|format|coverage|verify)(?::[a-z0-9:_-]+)?$/;
const CAPABILITY_LOADER_RE = /^node\s+([^\s]+)\s+(sofka-asdd-[a-z0-9-]+)$/;
const CAPABILITY_MANIFEST_PATH = join(PROJECT_ROOT, ".sofka-asdd", "capability-loading.json");

function readCapabilityManifest() {
  const manifest = readJson(CAPABILITY_MANIFEST_PATH);
  if (manifest.schema_version !== 1 || !manifest.agents || typeof manifest.agents !== "object") {
    throw new Error("capability-loading manifest must be schema v1 with agents");
  }
  return manifest;
}

export const CAPABILITY_LOADING = Object.freeze(readCapabilityManifest().agents);
export const ON_DEMAND_CAPABILITIES = Object.freeze(Object.fromEntries(
  Object.entries(CAPABILITY_LOADING).map(([agent, config]) => [agent, Object.freeze([...config.capabilities])]),
));

function authorizationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function isAuthorizationError(error, code) {
  return Boolean(error && typeof error === "object" && error.code === code);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// En Windows `renameSync` sobre un destino existente devuelve EPERM/EBUSY de
// forma transitoria cuando otro proceso todavía tiene el archivo abierto — el
// antivirus o el indexador, típicamente, justo después de una escritura previa.
// No es una condición de permisos real: reintentar con una espera breve la
// resuelve. Sin esto, el store de autorizaciones fallaba de forma intermitente
// bajo carga y el error crudo se filtraba a los guards, que lo reportaban como
// si fuera una denegación (lo detectó `test-runtime-efficiency-consumer-e2e`).
const RENAME_RETRIES = 5;
const RENAME_TRANSIENT = new Set(["EPERM", "EBUSY", "EACCES"]);

function renameWithRetry(tmp, path) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(tmp, path);
      return;
    } catch (error) {
      if (attempt >= RENAME_RETRIES || !RENAME_TRANSIENT.has(error?.code)) {
        try { unlinkSync(tmp); } catch { /* el temporal ya no importa */ }
        throw error;
      }
      // Espera activa y acotada: este código corre dentro de un hook síncrono,
      // no hay bucle de eventos disponible para dormir.
      const until = Date.now() + 20 * (attempt + 1);
      while (Date.now() < until) { /* backoff */ }
    }
  }
}

function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameWithRetry(tmp, path);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeCommand(value) {
  const command = String(value ?? "")
    .trim()
    .replace(/^\[[RWD]\]\s*/i, "")
    .replace(/^\$\s*/, "")
    .replace(/\s+/g, " ");
  if (!command) throw new Error("authorized commands cannot be empty");
  if (SHELL_CONTROL_RE.test(command)) {
    throw new Error("authorized commands must be a single canonical command without shell control operators");
  }
  return command;
}

function normalizeScope(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("authorized scopes cannot be empty");
  if (raw.includes("\0") || isAbsolute(raw)) {
    throw new Error("authorized scopes must be relative paths inside the project");
  }
  const directory = /[\\/]$/.test(raw) || raw === ".";
  const parts = raw.replaceAll("\\", "/").split("/").filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new Error("authorized scopes cannot contain '..'");
  }
  return { path: parts.join("/"), directory };
}

function scopeKey(scope) {
  const normalized = normalizeScope(scope);
  const path = normalized.path || ".";
  return `${path}${normalized.directory ? "/" : ""}`;
}

function normalizeCapability(agent, value) {
  const requested = String(value ?? "").trim();
  const allowed = ON_DEMAND_CAPABILITIES[agent];
  if (!allowed) {
    if (requested) throw new Error(`agent ${agent} does not support a plan capability`);
    return null;
  }
  if (!requested) throw new Error(`agent ${agent} requires one declared capability`);
  const aliasMatches = requested.startsWith("sofka-asdd-")
    ? []
    : allowed.filter((candidate) => candidate.endsWith(`-${requested}`));
  const capability = aliasMatches.length === 1 ? aliasMatches[0] : requested;
  if (!allowed.includes(capability)) {
    throw new Error(`capability ${capability} is not allowed for agent ${agent}`);
  }
  if (!existsSync(join(PROJECT_ROOT, ".claude", "skills", capability, "SKILL.md"))) {
    throw new Error(`capability ${capability} is not installed`);
  }
  return capability;
}

function normalizeDependencies(agent, primary, values) {
  const config = CAPABILITY_LOADING[agent];
  if (values !== undefined && !Array.isArray(values)) {
    throw new Error("capability dependencies must be a list");
  }
  if (!config) {
    if (Array.isArray(values) && values.length > 0) throw new Error(`agent ${agent} does not support capability dependencies`);
    return [];
  }
  const requested = Array.isArray(values) ? values : [];
  const max = Number(config.max_dependencies ?? 0);
  if (requested.length > max) throw new Error(`agent ${agent} allows at most ${max} capability dependencies`);
  const dependencies = requested.map((value) => normalizeCapability(agent, value));
  if (dependencies.includes(primary)) throw new Error("primary capability cannot also be a dependency");
  if (new Set(dependencies).size !== dependencies.length) throw new Error("capability dependencies must be unique");
  return dependencies.sort();
}

export function normalizePlan(input) {
  if (!input || typeof input !== "object") throw new Error("plan must be an object");
  const agents = Array.isArray(input.agents) ? input.agents : [];
  if (!input.request_id || agents.length === 0) throw new Error("request_id and at least one agent are required");
  const normalizedAgents = agents.map((entry) => {
    const agent = String(entry.agent ?? "");
    const capability = normalizeCapability(agent, entry.capability);
    return {
      agent,
      capability,
      dependencies: normalizeDependencies(agent, capability, entry.dependencies),
      scope: [...new Set((entry.scope ?? []).map(scopeKey))].sort(),
      commands: [...new Set((entry.commands ?? []).map(normalizeCommand))].sort(),
    };
  }).sort((a, b) => a.agent.localeCompare(b.agent));
  if (normalizedAgents.some((entry) => !entry.agent)) throw new Error("every plan entry requires agent");
  if (new Set(normalizedAgents.map((entry) => entry.agent)).size !== normalizedAgents.length) {
    throw new Error("every plan entry requires a unique agent type");
  }
  const budget = normalizeBudgetEnvelope(input, normalizedAgents);
  return {
    request_id: String(input.request_id),
    task: String(input.task ?? ""),
    budget_policy_version: input.budget_policy_version,
    route: budget.route,
    phase: budget.phase,
    risk: budget.risk,
    confidence: budget.confidence,
    max_concurrent: budget.max_concurrent,
    agents: budget.agents,
  };
}

export function issueChallenge(input, now = new Date()) {
  const plan = normalizePlan(input);
  if (plan.agents.some((entry) => entry.commands.some((command) => /(^|\s)git\s+commit(?:\s|$)/i.test(command)))) {
    throw new Error("git commit cannot be included in a batch authorization (GS-003)");
  }
  const ttl = Number(input.ttl_seconds ?? DEFAULT_TTL_SECONDS);
  const ttlSeconds = Number.isFinite(ttl) && ttl > 0 ? Math.min(ttl, DEFAULT_TTL_SECONDS) : DEFAULT_TTL_SECONDS;
  const issuedAt = now.toISOString();
  const challenge = {
    schema_version: 1,
    challenge_id: randomUUID(),
    request_id: plan.request_id,
    plan,
    plan_hash: createHash("sha256").update(canonical(plan)).digest("hex"),
    nonce: randomBytes(24).toString("base64url"),
    issued_at: issuedAt,
    // El TTL acota la deliberación del humano. Se persiste para que la
    // aprobación abra una ventana NUEVA en vez de heredar el remanente
    // (VERIFY-003 Hueco 1): leer el plan no puede descontar tiempo de ejecución.
    ttl_seconds: ttlSeconds,
    expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
  };
  writeAtomic(CHALLENGE_PATH, challenge);
  // A new challenge is only a proposal until the user approves it.  Do not
  // erase the currently effective batch here: doing so turns every operation
  // from an already launched ASDD agent into `no-active-authorization`, which
  // the operation hook deliberately treats as an unmanaged/native agent.
  // Keeping the old store preserves its exact agent/scope/command binding
  // until approveActiveChallenge() atomically replaces it with the new batch.
  return challenge;
}

function readActiveChallenge(now) {
  const challenge = readJson(CHALLENGE_PATH);
  if (challenge.schema_version !== 1 || Date.parse(challenge.expires_at) <= now.getTime()) {
    throw new Error("active plan challenge is missing, invalid, or expired");
  }
  return challenge;
}

function grantChallenge(challenge, now) {
  // La autorización NO hereda el `expires_at` del challenge: el tiempo que el
  // humano tarda en leer el plan no puede descontarse del tiempo de ejecución
  // de los agentes (VERIFY-003 Hueco 1). Ventana nueva desde la aprobación.
  const ttlSeconds = Number(challenge.ttl_seconds) > 0
    ? Number(challenge.ttl_seconds)
    : DEFAULT_TTL_SECONDS;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const authorizations = challenge.plan.agents.map((entry) => ({
    schema_version: 3,
    authorization_id: randomUUID(),
    request_id: challenge.request_id,
    plan_hash: challenge.plan_hash,
    route: challenge.plan.route,
    phase: challenge.plan.phase,
    risk: challenge.plan.risk,
    confidence: challenge.plan.confidence,
    max_concurrent: challenge.plan.max_concurrent,
    agent: entry.agent,
    capability: entry.capability,
    dependencies: entry.dependencies,
    scope: entry.scope,
    commands: entry.commands,
    model: entry.model,
    model_source: entry.model_source,
    max_turns: entry.max_turns,
    retries: entry.retries,
    escalation_reason: entry.escalation_reason,
    issued_at: now.toISOString(),
    expires_at: expiresAt,
    nonce: randomBytes(24).toString("base64url"),
    launch_used_at: null,
    runtime_agent_id: null,
    loaded_capabilities: [],
    capability_loads: {},
    // Retained during the migration so older status readers do not misread a
    // launched authorization as unused. It mirrors launch_used_at.
    used_at: null,
  }));
  // Un agente YA LANZADO de un lote anterior conserva su autorización: el humano
  // la aprobó y su binding agente/scope/commands no cambia. Aprobar un lote nuevo
  // no puede revocarla, igual que emitir un challenge tampoco lo hace (ver
  // issueChallenge). Solo la reemplaza el lote nuevo si vuelve a declarar ese
  // agente, y su propio expires_at la sigue acotando.
  const declared = new Set(authorizations.map((item) => item.agent));
  let inflight = [];
  try {
    inflight = readAuthorizationStore().authorizations.filter((item) => (
      (item.launch_used_at ?? item.used_at)
      && !isExpired(item, now)
      && !declared.has(item.agent)
    ));
  } catch { inflight = []; }
  writeAtomic(AUTHORIZATIONS_PATH, { schema_version: 3, authorizations: [...authorizations, ...inflight] });
  try { unlinkSync(CHALLENGE_PATH); } catch {}
  clearApprovalEligibility();
  return authorizations;
}

export function approveActiveChallenge(now = new Date()) {
  const challenge = readActiveChallenge(now);
  // Un challenge enmendado refleja un plan que el usuario corrigió: la vía
  // normal no puede aprobarlo por accidente. Solo approveAmendedChallenge(),
  // con el challenge_id exacto, lo destraba (ORC-010-E).
  if (challenge.amended_at) {
    throw new Error("plan challenge was amended by the user and needs an explicit amendment decision");
  }
  return grantChallenge(challenge, now);
}

// ORC-010-E: el usuario aprobó con una corrección que NO cambia agentes,
// scope[], commands[] ni budget. Aprueba el lote ORIGINAL tal cual — el
// orquestador propaga la corrección en el prompt del agente. Si la corrección
// sí cambia el envelope, el camino correcto es emitir un challenge nuevo.
export function approveAmendedChallenge(challengeId, now = new Date()) {
  const challenge = readActiveChallenge(now);
  if (!challenge.amended_at) {
    throw new Error("plan challenge is not marked as amended");
  }
  if (!challengeId || challenge.challenge_id !== challengeId) {
    throw new Error("amendment approval requires the exact active challenge id");
  }
  return grantChallenge(challenge, now);
}

// Marca el challenge como enmendado sin destruirlo: el plan sigue disponible
// para ejecutarse tal cual una vez que el orquestador resuelve la corrección.
export function markChallengeAmended(now = new Date()) {
  const challenge = readActiveChallenge(now);
  if (challenge.amended_at) return challenge;
  challenge.amended_at = now.toISOString();
  writeAtomic(CHALLENGE_PATH, challenge);
  clearApprovalEligibility();
  return challenge;
}

// Solo un rechazo explícito borra el challenge. Sin esto queda un plan
// pendiente que un `ok` posterior y descontextualizado podría aprobar.
export function revokeActiveChallenge() {
  clearApprovalEligibility();
  try {
    unlinkSync(CHALLENGE_PATH);
    return true;
  } catch {
    return false;
  }
}

// ---- ORC-010-E: elegibilidad de aprobación ---------------------------------
// La cola larga de afirmaciones ("joya", "va", "brutal") no se resuelve
// agrandando un léxico. El hook no aprueba: marca el turno como elegible y el
// orquestador decide, pero solo puede aprobar ESE challenge y una sola vez.
const ELIGIBILITY_TTL_SECONDS = 120;

export function markApprovalEligible(now = new Date()) {
  const challenge = readActiveChallenge(now);
  if (challenge.amended_at) return null;
  const marker = {
    schema_version: 1,
    challenge_id: challenge.challenge_id,
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ELIGIBILITY_TTL_SECONDS * 1000).toISOString(),
  };
  writeAtomic(ELIGIBILITY_PATH, marker);
  return marker;
}

export function consumeApprovalEligibility(challengeId, now = new Date()) {
  let marker;
  try {
    marker = readJson(ELIGIBILITY_PATH);
  } catch {
    throw authorizationError("approval-not-eligible", "this turn was not marked eligible for approval");
  }
  clearApprovalEligibility();
  if (marker.schema_version !== 1 || Date.parse(marker.expires_at) <= now.getTime()) {
    throw authorizationError("approval-not-eligible", "approval eligibility is missing or expired");
  }
  if (!challengeId || marker.challenge_id !== challengeId) {
    throw authorizationError("approval-not-eligible", "approval eligibility does not match the requested challenge");
  }
  return marker;
}

export function clearApprovalEligibility() {
  try { unlinkSync(ELIGIBILITY_PATH); } catch {}
}

function readAuthorizationStore() {
  let store;
  try {
    store = readJson(AUTHORIZATIONS_PATH);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw authorizationError("no-active-authorization", "no active ASDD authorization store");
    }
    throw authorizationError("authorization-store-invalid", "authorization store cannot be read");
  }
  if (store.schema_version !== 1 && store.schema_version !== 2 && store.schema_version !== 3) {
    throw authorizationError("authorization-store-invalid", "invalid authorization store schema");
  }
  if (!Array.isArray(store.authorizations)) {
    throw authorizationError("authorization-store-invalid", "invalid authorization store entries");
  }
  return store;
}

function isExpired(authorization, now) {
  return !Number.isFinite(Date.parse(authorization.expires_at)) || Date.parse(authorization.expires_at) <= now.getTime();
}

function hasLiveAuthorization(store, now) {
  return store.authorizations.some((item) => !isExpired(item, now));
}

function findAuthorization(store, agent, now) {
  const entries = store.authorizations.filter((item) => item.agent === agent);
  if (entries.length === 0) {
    if (hasLiveAuthorization(store, now)) {
      throw authorizationError("agent-mismatch", `agent is not authorized by the active plan: ${agent}`);
    }
    throw authorizationError("no-active-authorization", `no active ASDD authorization for agent ${agent}`);
  }
  const authorization = entries[0];
  if (isExpired(authorization, now)) {
    throw authorizationError("authorization-expired", `authorization expired for agent ${agent}`);
  }
  return authorization;
}

/**
 * `fastLane` sella la vía rápida EN LA MISMA escritura que consume el
 * lanzamiento. Sellarlo por separado costaba un segundo `writeAtomic` sobre
 * `authorizations.json` inmediatamente después del primero, y en Windows dos
 * renames seguidos al mismo destino dan `EPERM` cuando algo todavía tiene el
 * archivo abierto — lo detectó `test-runtime-efficiency-consumer-e2e`.
 *
 * No viaja por `normalizePlan` a propósito: si el sello pudiera declararse en un
 * `--plan-json`, el orquestador se auto-otorgaría la habilitación de comandos
 * git. Solo lo pasa el plan-gate, desde su rama direct-light.
 */
export function consumeLaunchAuthorization(agent, now = new Date(), { fastLane = null } = {}) {
  const agentType = String(agent ?? "");
  if (!agentType) throw authorizationError("missing-agent", "agent identity is required");
  const store = readAuthorizationStore();
  const authorization = findAuthorization(store, agentType, now);
  if (authorization.launch_used_at ?? authorization.used_at) {
    throw authorizationError("authorization-replay", `authorization already consumed for agent ${agentType}`);
  }
  const consumedAt = now.toISOString();
  authorization.launch_used_at = consumedAt;
  authorization.used_at = consumedAt;
  if (fastLane === "git_ops" || fastLane === "atomic") authorization.fast_lane = fastLane;
  writeAtomic(AUTHORIZATIONS_PATH, store);
  return authorization;
}

// Comandos git de ESCRITURA que la vía rápida ORC-010-F habilita. No es una
// segunda política: cada uno sigue pasando, en la MISMA pasada del dispatcher,
// por su gate propio — guard-branch (GS-001/GS-003), pre-push-gate (GS-008) y
// pre-pr-gate (GS-009). Acá solo se deja de bloquear por partida doble.
// `restore` queda deliberadamente afuera: descarta cambios del working tree por
// defecto, igual que `checkout -- <path>` (GS-002). Crear y cambiar de rama sí
// entra, porque es el paso normal de GitFlow (GS-004).
const GIT_OPS_WRITE_RE =
  /^git\s+(?:-C\s+\S+\s+)?(?:commit|add|push|fetch|pull|merge|checkout|switch|branch|tag|stash)\b/;
const MR_CREATE_WRITE_RE = /^(?:glab\s+mr\s+(?:create|update)|gh\s+pr\s+(?:create|edit))\b/;
// Nunca por la vía rápida, ni con el fast_lane puesto: reescritura de historia,
// descarte del working tree, borrado forzado y salteo de hooks quedan fuera por
// diseño. El router ya los excluye vía DANGEROUS_GIT; esto es la segunda barrera.
const GIT_OPS_FORBIDDEN_RE =
  /--force|--force-with-lease|(?:^|\s)-f(?:\s|$)|reset\s+--hard|filter-branch|filter-repo|--no-verify|--delete|branch\s+-D|checkout\s+--(?:\s|$)|checkout\s+\.(?:\s|$)/;

function isGitOpsCommand(command) {
  if (GIT_OPS_FORBIDDEN_RE.test(command)) return false;
  return GIT_OPS_WRITE_RE.test(command) || MR_CREATE_WRITE_RE.test(command);
}

// Compatibility export for callers migrated incrementally. New consumers must
// use the explicit launch/operation names above and below.
export function consumeAuthorization(agent, now = new Date()) {
  return consumeLaunchAuthorization(agent, now);
}

export function consumeBudgetedLaunchAuthorization(agent, toolInput, now = new Date(), options = {}) {
  const authorization = consumeLaunchAuthorization(agent, now, options);
  try {
    return assertBudgetedLaunch(authorization, toolInput);
  } catch (error) {
    throw authorizationError("launch-budget-mismatch", error.message);
  }
}

function assertNoSymlinkInPath(absolutePath) {
  const rel = relative(PROJECT_ROOT, absolutePath);
  if (rel === "" || rel === ".") return;
  let cursor = PROJECT_ROOT;
  for (const segment of rel.split(sep)) {
    cursor = join(cursor, segment);
    try {
      if (lstatSync(cursor).isSymbolicLink()) {
        throw authorizationError("scope-mismatch", "symlink paths are not authorized by a plan scope");
      }
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

function resolveOperationPath(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.includes("\0")) {
    throw authorizationError("missing-operation-path", "Write/Edit requires a file path");
  }
  const absolute = isAbsolute(raw) ? resolve(raw) : resolve(PROJECT_ROOT, raw);
  const rel = relative(PROJECT_ROOT, absolute);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw authorizationError("scope-mismatch", "operation path is outside the project root");
  }
  assertNoSymlinkInPath(absolute);
  return absolute;
}

function scopeAllowsPath(scope, operationPath) {
  let normalized;
  try {
    normalized = normalizeScope(scope);
  } catch (error) {
    throw authorizationError("authorization-store-invalid", error.message);
  }
  const scopePath = resolve(PROJECT_ROOT, normalized.path || ".");
  assertNoSymlinkInPath(scopePath);
  if (normalized.directory) {
    return operationPath === scopePath || operationPath.startsWith(`${scopePath}${sep}`);
  }
  return operationPath === scopePath;
}

// El lexico de lectura ya no es propio: es el unico de _lib/, con sus predicados
// de escritura. Lo que esta libreria agrega es su propia lista de scripts del
// framework, que P4 tambien absorbe en el manifiesto.
function isSafeReadOnlyCommand(command, isFirst = true) {
  if (!command || SHELL_CONTROL_RE.test(command)) return false;
  // cdPolicy "any": la politica de `cd` de los subagentes no la cambia este plan.
  return isReadOnlySegment(command, { root: PROJECT_ROOT, isFirst, cdPolicy: "any" })    || Boolean(frameworkReadScript(command));
}

let declaredScriptsCache;

function declaredPackageScripts() {
  if (declaredScriptsCache !== undefined) return declaredScriptsCache;
  try {
    const manifest = readJson(join(PROJECT_ROOT, "package.json"));
    declaredScriptsCache = manifest && typeof manifest.scripts === "object" && manifest.scripts
      ? manifest.scripts
      : {};
  } catch {
    declaredScriptsCache = {};
  }
  return declaredScriptsCache;
}

function isDeclaredVerificationScript(command) {
  const match = NPM_VERIFICATION_RE.exec(command);
  if (!match) return false;
  const name = match[1] ?? "test";
  if (!VERIFICATION_SCRIPT_NAME_RE.test(name)) return false;
  return typeof declaredPackageScripts()[name] === "string";
}

// Lo que un agente puede ejecutar sin declararlo en `commands[]`.
function isPermittedWithoutDeclaration(part, index = 0) {
  return isSafeReadOnlyCommand(part, index === 0)
    || isReadOnlyPipelineStage(part)
    || isDeclaredVerificationScript(part);
}

function frameworkReadScript(command) {
  const match = NODE_INVOCATION_RE.exec(command);
  if (!match) return null;
  const token = match[1].replaceAll("\\", "/");
  for (const script of FRAMEWORK_READ_SCRIPTS) {
    if (token === script) return script;
    if (token === join(PROJECT_ROOT, script).replaceAll("\\", "/")) return script;
  }
  return null;
}

function loadedCapabilityName(command) {
  const match = CAPABILITY_LOADER_RE.exec(command);
  if (!match) return null;
  const script = match[1].replaceAll("\\", "/");
  const relativeLoader = ".claude/scripts/sofka-asdd-load-capability.mjs";
  const absoluteLoader = join(PROJECT_ROOT, relativeLoader).replaceAll("\\", "/");
  return script === relativeLoader || script === absoluteLoader ? match[2] : null;
}

// Rutas que el propio framework le ordena escribir a todo agente y que ningún
// `scope[]` de plan declara: su memoria (sofka-asdd-memory-hygiene) y el checkpoint
// del run (ORC-007). Es un conjunto fijo, no configurable desde el plan, y un agente
// solo alcanza SU propio directorio de memoria, nunca el de otro.
function isFrameworkManagedPath(authorization, operationPath) {
  if (operationPath === resolve(PROJECT_ROOT, ".asdd-run.json")) return true;
  // `.tmp/` es la zona de scratch que sofka-asdd-ephemeral-artifacts le designa a TODO
  // agente, y está gitignoreada. Sin esto la regla es inaplicable: la alternativa que
  // deja al agente es ensuciar la raíz del repo, que es justo lo que la regla prohíbe.
  const scratchRoot = resolve(PROJECT_ROOT, ".tmp");
  if (operationPath.startsWith(`${scratchRoot}${sep}`)) return true;
  const agent = String(authorization.agent ?? "");
  if (!/^[a-z0-9-]+$/.test(agent)) return false;
  const memoryRoot = resolve(PROJECT_ROOT, ".claude", "agent-memory", agent);
  return operationPath === memoryRoot || operationPath.startsWith(`${memoryRoot}${sep}`);
}

function assertAuthorizedOperation(authorization, toolName, toolInput) {
  if (toolName === "Write" || toolName === "Edit") {
    const path = resolveOperationPath(toolInput.file_path ?? toolInput.filePath ?? toolInput.path);
    if (isFrameworkManagedPath(authorization, path)) return null;
    if (!authorization.scope.some((scope) => scopeAllowsPath(scope, path))) {
      throw authorizationError("scope-mismatch", `operation path is outside the authorized scope for ${authorization.agent}`);
    }
    return null;
  }
  if (toolName === "Bash") {
    // A benign composition of read-only work keeps the existing escape hatches.
    // It never feeds the `commands[]` match below: a declared command runs verbatim
    // or not at all, so nothing becomes executable that was not already allow-listed.
    const parts = splitBenignCommand(toolInput.command);
    if (parts) {
      // Una CADENA de loaders al frente, no uno solo. Un plan con `dependencies[]`
      // le pide al agente dos capabilities y ninguna regla le dice que van en dos
      // llamadas separadas: con la tolerancia acotada a la primera posición, el
      // idioma natural —`load A && load B`— no tenía forma legal de escribirse y
      // el agente moría en `command-mismatch` sin salida. Aceptar la cadena no
      // amplía autoridad: cada eslabón se valida igual, por ruta exacta del loader,
      // y cada capability se contrasta después contra el lote aprobado. Dos loaders
      // aprobados encadenados no son más autoridad que los mismos dos, uno por
      // llamada. La tolerancia sigue sin alcanzar a `commands[]`.
      const composed = [];
      let index = 0;
      while (index < parts.length) {
        const name = loadedCapabilityName(parts[index]);
        if (!name) break;
        composed.push(name);
        index += 1;
      }
      const rest = parts.slice(index);
      if (rest.every(isPermittedWithoutDeclaration)) {
        if (composed.length) return { capabilities: composed };
        return { safeRead: true };
      }
    }
    let command;
    try {
      command = normalizeCommand(toolInput.command);
    } catch (error) {
      throw authorizationError("command-mismatch", error.message);
    }
    const capability = loadedCapabilityName(command);
    if (capability) return { capabilities: [capability] };
    if (isSafeReadOnlyCommand(command)) return { safeRead: true };
    // Vía rápida ORC-010-F. El token de una operación git se emite con
    // `commands: []` a propósito (ADR-020 §4): la política del comando la
    // aplican GS-001/GS-003, GS-008 y GS-009, no el lote. Pero `commands[]` es
    // una allow-list cerrada, así que ese arreglo vacío bloqueaba justamente el
    // `git commit` / `git push` / `glab mr create` que la vía rápida venía a
    // habilitar — y el camino normal tampoco servía, porque `issueChallenge`
    // rechaza declarar `git commit` dentro de un lote por GS-003. Era un
    // deadlock cerrado, y este hook no tiene escape hatch. Acá se reconoce el
    // fast_lane y se deja que decidan los guards git, que corren en la misma
    // pasada del dispatcher. El chequeo de capability cargada sigue aplicando
    // más abajo: el agente igual tiene que haber cargado su skill aprobada.
    if (authorization.fast_lane === "git_ops" && isGitOpsCommand(command)) {
      return { gitOps: true };
    }
    if (!authorization.commands.includes(command)) {
      throw authorizationError("command-mismatch", `command is not authorized for agent ${authorization.agent}`);
    }
    return null;
  }
  return null;
}

export function authorizeAgentOperation(context, now = new Date()) {
  if (!context || typeof context !== "object") {
    throw authorizationError("missing-runtime-identity", "operation authorization requires hook context");
  }
  const agentId = String(context.agent_id ?? context.agentId ?? "");
  const agentType = String(context.agent_type ?? context.agentType ?? "");
  const toolName = String(context.tool_name ?? context.toolName ?? "");
  const toolInput = context.tool_input ?? context.toolInput ?? {};
  if (!agentId || !agentType) {
    throw authorizationError("missing-runtime-identity", "subagent operations require agent_id and agent_type");
  }
  if (!["Write", "Edit", "Bash"].includes(toolName)) return null;

  const store = readAuthorizationStore();
  const authorization = findAuthorization(store, agentType, now);
  if (!(authorization.launch_used_at ?? authorization.used_at)) {
    throw authorizationError("launch-not-authorized", `agent ${agentType} has not consumed its launch authorization`);
  }
  const operation = assertAuthorizedOperation(authorization, toolName, toolInput);
  const approvedCapabilities = [authorization.capability, ...(authorization.dependencies ?? [])].filter(Boolean);
  const loadedNow = operation?.capabilities ?? [];
  if (loadedNow.some((name) => !approvedCapabilities.includes(name))) {
    throw authorizationError("capability-mismatch", `loaded capability does not match the approved plan for ${authorization.agent}`);
  }
  if (authorization.runtime_agent_id && authorization.runtime_agent_id !== agentId) {
    throw authorizationError("runtime-identity-mismatch", `authorization for ${agentType} is already bound to another runtime agent`);
  }
  if (!authorization.runtime_agent_id) {
    authorization.runtime_agent_id = agentId;
  }
  if (loadedNow.length) {
    const loaded = new Set(authorization.loaded_capabilities ?? (authorization.loaded_capability ? [authorization.loaded_capability] : []));
    authorization.capability_loads ??= {};
    for (const name of loadedNow) {
      loaded.add(name);
      authorization.capability_loads[name] = now.toISOString();
      if (name === authorization.capability) {
        authorization.loaded_capability = name;
        authorization.capability_loaded_at = now.toISOString();
      }
    }
    authorization.loaded_capabilities = [...loaded].sort();
    writeAtomic(AUTHORIZATIONS_PATH, store);
    return authorization;
  }
  if (operation?.safeRead) {
    writeAtomic(AUTHORIZATIONS_PATH, store);
    return authorization;
  }
  const loaded = authorization.loaded_capabilities ?? (authorization.loaded_capability ? [authorization.loaded_capability] : []);
  if (authorization.capability && !loaded.includes(authorization.capability)) {
    throw authorizationError("capability-not-loaded", `approved capability ${authorization.capability} must be loaded before ${toolName}`);
  }
  writeAtomic(AUTHORIZATIONS_PATH, store);
  return authorization;
}
