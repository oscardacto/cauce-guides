import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { FILE_OP } from "./asdd-proportional-router-lib.mjs";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, "..", "..", "..");
export const DIRECT_LIGHT_AUTHORIZATION_PATH = resolve(
  HERE,
  "..",
  "..",
  ".runtime",
  "plan-authorization",
  "direct-light.json",
);

const DEFAULT_TTL_SECONDS = 300;
// La vía git necesita más aire que la atómica: antes de tocar un comando, la
// regla obliga a resolver y leer COMPLETA la referencia de git-safety, y con
// 300 s el token se vencía en medio de esa lectura obligatoria — el lanzamiento
// moría en un DENY por algo que el propio protocolo mandaba hacer. 900 s alinea
// con el TTL de plan-authorization.
const GIT_OPS_TTL_SECONDS = 900;
// Techo bajo a propósito: la vía rápida cubre cambios acotados, no lotes.
const MAX_ATOMIC_SCOPES = 3;
// Tope de operaciones git que un mismo pedido puede habilitar.
const MAX_GIT_OPS = 3;
// Cada familia de operación necesita su propio agente, porque el tech-lead solo
// carga una capability primaria más una dependencia. Se cuentan familias, no
// menciones: "commiteá y pusheá" son 2, no 2 por cada sinónimo.
const GIT_OP_FAMILIES = [
  /\bcommit|\bcommitea|\bcommiteá/i,
  /\bpush|\bpushea|\bpusheá|\bsub[ei]\s|\bsubir\b/i,
  /\bmr\b|\bpr\b|merge[\s-]?request|pull[\s-]?request/i,
];

function countGitOperations(prompt) {
  const text = String(prompt ?? "");
  const found = GIT_OP_FAMILIES.filter((re) => re.test(text)).length;
  return Math.min(Math.max(found, 1), MAX_GIT_OPS);
}
// El directorio es OPCIONAL: `CLAUDE.md`, `package.json` y `ASDD-MEMORY.md`
// viven en la raíz y son destino legítimo de un cambio atómico. La extensión
// debe EMPEZAR con letra: sin eso, `4.0.0` y `3.5.1` parecen archivos y un
// número de versión en el prompt se lee como ruta inexistente (que abajo falla
// cerrado) y mata la vía rápida. Las dos mitades van juntas a propósito.
//
// La regex se vuelve MÁS PERMISIVA a propósito, y quien acota es `promptScopes`:
// hacer la discriminación acá obligaría a dos regex para el mismo concepto, que
// es el patrón que este framework ya paga caro en otros lados.
const RELATIVE_FILE_RE = /(?:^|[\s`'"(])((?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.[A-Za-z][A-Za-z0-9]*)(?=$|[\s`'"),:;])/g;

function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

function normalizeExistingFile(path) {
  const raw = String(path ?? "").trim().replaceAll("\\", "/");
  if (!raw || raw.includes("\0") || isAbsolute(raw)) return null;
  const absolute = resolve(PROJECT_ROOT, raw);
  const rel = relative(PROJECT_ROOT, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  try {
    if (!statSync(absolute).isFile()) return null;
  } catch {
    return null;
  }
  return rel.replaceAll(sep, "/");
}

// Mover/renombrar/copiar declaran un destino que todavía no existe. Sin esto el
// token autoriza el origen pero no el destino, y la operación muere en el hook
// de autorización. Se admite solo si la carpeta padre ya existe dentro del
// proyecto: no se crean árboles nuevos por la vía rápida.
function normalizeCreatableFile(path) {
  const raw = String(path ?? "").trim().replaceAll("\\", "/");
  if (!raw || raw.includes("\0") || isAbsolute(raw)) return null;
  const absolute = resolve(PROJECT_ROOT, raw);
  const rel = relative(PROJECT_ROOT, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  try {
    if (!statSync(dirname(absolute)).isDirectory()) return null;
  } catch {
    return null;
  }
  return rel.replaceAll(sep, "/");
}

// Devuelve `mentioned` además de `scopes` porque el llamador tiene que
// distinguir dos casos que antes colapsaban en `length === 0`:
//  - el prompt no nombra ninguna ruta  -> el artefacto del run es scope legítimo
//  - nombra rutas y ninguna resuelve   -> el pedido es sobre otra cosa: fallar cerrado
function promptScopes(prompt, { allowCreatable = false } = {}) {
  const scopes = new Set();
  let mentioned = 0;
  for (const match of String(prompt ?? "").matchAll(RELATIVE_FILE_RE)) {
    const raw = match[1];

    // 1. Existe en disco: es una ruta, sin discusión. Incluye los archivos de
    //    raíz, que es la mitad de B16 que hay que ganar.
    const existing = normalizeExistingFile(raw);
    if (existing) {
      mentioned += 1;
      scopes.add(existing);
      continue;
    }

    // 2. No existe y NO tiene directorio: no es una ruta, es prosa. `claude.ai`,
    //    `Node.js`, `Foo.bar`, `Error.captureStackTrace`. Se descarta ENTERO —
    //    ni scope ni mención. Dos cosas a la vez:
    //      - no puede autorizar la creación de un archivo en la raíz;
    //      - no cuenta como mención, así que no mata la vía rápida por (c).
    //    Un destino a crear de verdad viene con carpeta: `docs/nueva-spec.md`.
    if (!raw.includes("/")) continue;

    // 3. No existe pero tiene directorio: es una ruta declarada. Cuenta como
    //    mención — si no resuelve, (c) falla cerrado — y se admite como destino
    //    a crear solo si el prompt es una operación de archivos.
    mentioned += 1;
    const creatable = allowCreatable ? normalizeCreatableFile(raw) : null;
    if (creatable) scopes.add(creatable);
  }
  return { mentioned, scopes: [...scopes] };
}

function activeRunScope() {
  try {
    const run = JSON.parse(readFileSync(resolve(PROJECT_ROOT, ".asdd-run.json"), "utf8"));
    const phase = String(run.current_phase ?? "").toLowerCase();
    const artifacts = run.phases?.[phase]?.artifacts;
    if (!Array.isArray(artifacts)) return null;
    const scopes = [...new Set(artifacts.map(normalizeExistingFile).filter(Boolean))];
    return scopes.length === 1 ? { phase, scope: scopes[0] } : null;
  } catch {
    return null;
  }
}

export function issueDirectLightAuthorization({ prompt, route }, now = new Date()) {
  // Cada prompt invalida cualquier intención directa anterior. Sin esto, un
  // prompt no-LIGHT enviado dentro del TTL podría heredar un scope obsoleto.
  clearDirectLightAuthorization();
  // `fast_lane` lo resuelve el router, pero se deriva de `reasons` cuando el
  // llamador construye la ruta a mano: la vía rápida no puede depender de que
  // un campo nuevo esté presente.
  const reasons = Array.isArray(route?.reasons) ? route.reasons : [];
  const fastLane = route?.fast_lane
    ?? (reasons.includes("git_operation")
      ? "git_ops"
      : reasons.includes("atomic_scoped_change") ? "atomic" : null);
  if (route?.depth !== "LIGHT" || route?.requires_plan || route?.requires_confirmation
    || route?.risk !== "low" || !fastLane) {
    return null;
  }

  const active = activeRunScope();
  let scope;
  if (fastLane === "git_ops") {
    // Vía rápida ORC-010-F: el token habilita SOLO el lanzamiento del agente.
    // Sin scope ni comandos, ni un Write ni un Edit ni un Bash sensible pasan
    // por él. Los comandos git de escritura los sigue gobernando su gate
    // propio (GS-001/GS-003 commit, GS-008 push, GS-009 MR/PR), que muestra el
    // comando exacto antes de pedir confirmación.
    scope = [];
  } else {
    const { mentioned, scopes: explicitScopes } = promptScopes(prompt, {
      allowCreatable: FILE_OP.test(String(prompt ?? "")),
    });
    // El prompt nombró rutas y ninguna resolvió: el pedido NO es sobre el
    // artefacto del run. Heredar ese scope autorizaría escribir la spec de la
    // feature en curso mientras el usuario pidió otra cosa. Fallar cerrado
    // manda el pedido al camino normal, que es reversible; el token no.
    if (explicitScopes.length === 0 && mentioned > 0) return null;
    scope = explicitScopes.length > 0
      ? explicitScopes
      : active?.scope ? [active.scope] : [];
    if (scope.length === 0 || scope.length > MAX_ATOMIC_SCOPES) return null;
  }

  const phase = active?.phase || "build";
  const issuedAt = now.toISOString();
  const authorization = {
    schema_version: 1,
    request_hash: createHash("sha256").update(String(prompt ?? "")).digest("hex"),
    route: "LIGHT",
    fast_lane: fastLane,
    phase,
    risk: "low",
    confidence: Number(route.confidence),
    scope,
    // Un pedido git suele traer varias operaciones en la misma frase
    // ("commiteá, pusheá y creá el MR") y cada una necesita su propio agente.
    // Con un token de uso único el segundo lanzamiento moría en
    // `authorization-replay`, que el plan-gate convierte en DENY duro: el
    // pedido no podía completarse en un turno bajo ninguna combinación. El cupo
    // sale de las operaciones realmente pedidas, con tope 3.
    max_uses: fastLane === "git_ops" ? countGitOperations(prompt) : 1,
    uses: 0,
    issued_at: issuedAt,
    expires_at: new Date(
      now.getTime() + (fastLane === "git_ops" ? GIT_OPS_TTL_SECONDS : DEFAULT_TTL_SECONDS) * 1000,
    ).toISOString(),
    used_at: null,
  };
  writeAtomic(DIRECT_LIGHT_AUTHORIZATION_PATH, authorization);
  return authorization;
}

function parseLaunchMarker(prompt) {
  const match = String(prompt ?? "").match(
    /\[ASDD-BUDGET route=LIGHT phase=([a-z]+) model=(haiku|sonnet|opus) max_turns=(\d+) retries=(\d+)\]/,
  );
  if (!match) throw new Error("direct LIGHT launch requires an exact LIGHT budget marker");
  return { phase: match[1], model: match[2], max_turns: Number(match[3]), retries: Number(match[4]) };
}

function parseCapability(prompt) {
  const matches = [...String(prompt ?? "").matchAll(
    /node\s+(?:[^\s]+\/)?\.claude\/scripts\/asdd-load-capability\.mjs\s+(asdd-[a-z0-9-]+)/g,
  )];
  const capabilities = [...new Set(matches.map((match) => match[1]))];
  if (capabilities.length !== 1) throw new Error("direct LIGHT launch requires exactly one capability loader");
  return capabilities[0];
}

export function consumeDirectLightAuthorization({ agent, toolInput }, now = new Date()) {
  let token;
  try {
    token = JSON.parse(readFileSync(DIRECT_LIGHT_AUTHORIZATION_PATH, "utf8"));
  } catch {
    return null;
  }
  if (token.schema_version !== 1 || token.used_at || Date.parse(token.expires_at) <= now.getTime()) return null;

  const marker = parseLaunchMarker(toolInput?.prompt);
  if (marker.phase !== token.phase) throw new Error(`direct LIGHT phase ${marker.phase} does not match ${token.phase}`);
  const requestedModel = String(toolInput?.model ?? "").toLowerCase();
  if (!requestedModel.includes(marker.model)) throw new Error("direct LIGHT model does not match its budget marker");

  // El cupo se consume de a uno. `used_at` —lo que apaga el token para siempre—
  // se marca recién al agotarlo, para que las operaciones restantes del mismo
  // pedido puedan lanzar su agente. Un token sin `max_uses` (emitido por una
  // versión anterior) se comporta como antes: un solo uso.
  const maxUses = Math.max(Number(token.max_uses) || 1, 1);
  token.uses = Number(token.uses || 0) + 1;
  token.last_used_at = now.toISOString();
  if (token.uses >= maxUses) token.used_at = now.toISOString();
  writeAtomic(DIRECT_LIGHT_AUTHORIZATION_PATH, token);
  return {
    request_id: `direct-light-${token.request_hash.slice(0, 12)}`,
    task: token.fast_lane === "git_ops"
      ? "Git operation authorized by deterministic user routing; write commands stay under GS-003/008/009"
      : "Atomic scoped LIGHT change authorized by deterministic user routing",
    budget_policy_version: 1,
    fast_lane: token.fast_lane,
    route: "LIGHT",
    phase: token.phase,
    risk: token.risk,
    confidence: token.confidence,
    max_concurrent: 1,
    agents: [{
      agent,
      capability: parseCapability(toolInput?.prompt),
      dependencies: [],
      scope: token.scope,
      commands: [],
      model: marker.model,
      max_turns: marker.max_turns,
      retries: marker.retries,
    }],
  };
}

export function clearDirectLightAuthorization() {
  try { unlinkSync(DIRECT_LIGHT_AUTHORIZATION_PATH); } catch {}
}

/**
 * Libera el token SOLO si ya no le queda cupo.
 *
 * El plan-gate borraba el token incondicionalmente después de sintetizar la
 * autorización. Con un cupo mayor a uno eso lo anula: la segunda operación del
 * mismo pedido no encontraría token y moriría en DENY. Un token que todavía
 * tiene usos sigue vivo hasta agotarse o vencer; el prompt siguiente lo
 * invalida igual, porque `issueDirectLightAuthorization` limpia al emitir.
 *
 * Si el token no se puede leer, se borra: nunca se deja un archivo ilegible
 * ocupando el lugar del próximo token.
 */
export function releaseDirectLightAuthorization() {
  let token;
  try {
    token = JSON.parse(readFileSync(DIRECT_LIGHT_AUTHORIZATION_PATH, "utf8"));
  } catch {
    clearDirectLightAuthorization();
    return;
  }
  const maxUses = Math.max(Number(token.max_uses) || 1, 1);
  if (token.used_at || Number(token.uses || 0) >= maxUses) clearDirectLightAuthorization();
}
