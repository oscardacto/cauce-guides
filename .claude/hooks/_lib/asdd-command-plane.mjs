// -----------------------------------------------------------------------------
// .claude/hooks/_lib/asdd-command-plane.mjs
//
// Fuente ÚNICA del motor de comandos del framework: el parser, la gramática de
// control de shell y el léxico de lectura. Antes vivía duplicado y ya divergente
// entre `hooks/asdd-orchestrator-guard.mjs` (parser propio, léxico de 10
// comandos) y `scripts/lib/asdd-plan-authorization-lib.mjs` (parser propio,
// léxico de 24): dos gramáticas para el mismo concepto, con lo cual `pwd` era
// lectura para un subagente y `ask` para el orquestador.
//
// Vive en `hooks/_lib/` a propósito y no como JSON en `references/`: la autoridad
// de ejecución tiene que ser código. Un `.json` ahí no lo cubre `rule-loading.json`
// ni `permissions.deny`, y ningún hook valida hashes en runtime.
//
// P1 del plan «Clasificar por plano»: extracción SIN cambio de comportamiento.
// Las piezas se movieron tal cual desde `asdd-plan-authorization-lib.mjs`
// —mismas expresiones, mismos límites— y esa librería las importa desde acá.
//
// P2: el guard del orquestador trae acá SUS versiones de los mismos conceptos,
// también sin tocarlas. Las dos gramáticas quedan una al lado de la otra —que es
// lo que hace visible la divergencia— y ambos consumidores importan de acá. La
// unificación de los dos léxicos es P3, no P2: separar «cambié de dónde viene el
// código» de «cambié qué decide» es lo que permite culpar al paso correcto si
// algo se mueve.
// -----------------------------------------------------------------------------

import { resolve as resolvePath } from "node:path";

export const SHELL_CONTROL_RE = /[\r\n\u0000`<>]|\$\(|(?:^|[^\\])[;&|]/;
// SHELL_CONTROL_RE minus the separators, for a command already split into parts.
export const PART_CONTROL_RE = /[\r\n\u0000`<>]|\$\(/;
// Redirections that route output nowhere. Stripped before the command is scanned so
// their own `>` and `&` are not mistaken for a redirect or a separator.
export const NULL_REDIRECT_RE = /\s+(?:2>&1|2>\/dev\/null|>\/dev\/null)(?=[\s;|&]|$)/g;

// Runtime-only decomposition. Declaration normalisation (normalizeCommand) stays
// strict, so `commands[]` is still matched verbatim. This only decides whether a
// command still qualifies for the read-only escape hatches after the agent appended
// a benign `2>/dev/null` or piped the output through `head`. Returns the atomic
// parts, or null when anything is not decomposable safely.
export function splitBenignCommand(value) {
  const raw = String(value ?? "")
    .trim()
    .replace(/^\[[RWD]\]\s*/i, "")
    .replace(/^\$\s*/, "");
  if (!raw || /[\r\n\u0000]/.test(raw)) return null;
  const command = stripNullRedirects(raw.replace(/\s+/g, " "));
  const parts = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "\\" && index + 1 < command.length) {
      current += char + command[index + 1];
      index += 1;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";" || char === "|" || char === "&") {
      // `&&`/`||` are separators; a lone `&` backgrounds the command, which we refuse.
      if (char === "&" && command[index + 1] !== "&") return null;
      if (command[index + 1] === char) index += 1;
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (quote) return null;
  parts.push(current);
  const cleaned = parts.map((part) => part.trim());
  if (!cleaned.length || cleaned.some((part) => !part || PART_CONTROL_RE.test(part))) return null;
  return cleaned;
}

export function stripNullRedirects(command) {
  let current = command;
  let previous;
  do {
    previous = current;
    current = current.replace(NULL_REDIRECT_RE, "");
  } while (current !== previous);
  return current.trim();
}

// ---- Léxico ÚNICO de lectura, con sus predicados de escritura (P3) ----------
//
// Acá termina la duplicación: los dos léxicos divergentes que P2 dejó uno al lado
// del otro se funden en un solo conjunto, unión de ambos, más los comandos que la
// sesión medida usó y ninguno de los dos tenía (`sed` se bloqueó dos veces y no
// estaba en ninguna lista).
//
// REGLA DURA: cada comando entra CON su predicado de escritura. Sin eso `sed` es
// una primitiva de escritura con nombre de lectura. Las expresiones son las del
// prototipo v2 (`pruebas/prototipo-v2/_lib/asdd-command-plane.mjs`), donde
// están implementadas y probadas.
export const READ_COMMANDS = new Set([
  "rg", "grep", "ls", "find", "cat", "head", "tail", "wc", "tree", "echo",
  "pwd", "true", "false", "basename", "dirname", "realpath", "stat", "file",
  "diff", "printenv", "which", "type", "date", "sed", "awk", "cut", "tr",
  "nl", "sort", "uniq", "jq", "xargs", "column", "comm", "od", "cmp",
  // `test` es el predicado de existencia del shell: consulta el filesystem y no
  // tiene forma de escritura. Estaba fuera del léxico, así que un `test -f ruta`
  // del orquestador caía en `unknown` y el guard lo denunciaba como hueco del
  // manifiesto en vez de resolverlo como la lectura que es.
  "test",
]);
// Comandos admitidos como etapa NO inicial de una tubería de lectura.
export const READ_STAGES = new Set([
  "head", "tail", "sort", "uniq", "wc", "cat", "grep", "rg", "cut", "tr",
  "nl", "jq", "sed", "awk", "xargs", "column", "basename", "dirname", "comm",
]);
// Subcomandos de git que solo consultan. Es un mapa y no un conjunto porque en
// cuatro de ellos el subcomando NO alcanza para decidir: `config` lee con `--get`
// y escribe sin él, `worktree` lista o borra, `stash` lista o muta el árbol, y
// `remote` consulta con `-v` y agrega remotos con `add`. El valor es la expresión
// que debe matchear el resto de argumentos, o `null` cuando no hay resto que
// restringir. La forma de conjunto suelto del prototipo dejaba pasar
// `git config user.email …` y `git worktree remove --force`: lo cazó
// `test-plan-authorization-operation-hook.mjs` al aplicar este paso.
export const GIT_READ = new Map([
  ["status", null], ["log", null], ["diff", null], ["branch", null], ["show", null],
  ["rev-parse", null], ["rev-list", null], ["ls-files", null], ["describe", null],
  ["remote", /^(?:-v)?$/],
  ["config", /^--get\b/],
  ["worktree", /^list\b/],
  ["stash", /^list\b/],
]);
export const VERSION_PROBE_RE =
  /^(?:node|npm|npx|pnpm|yarn|bun|deno|python3?|pip3?|git|java|mvn|gradle|go|cargo|docker|k6|ruff|mypy|pytest)\s+(?:--version|-v|version)$/;
export const SAFE_JSON_FILTER_RE = /^python3?\s+-m\s+json\.tool\s*$/;

// Predicados que convierten un comando de lectura en uno de escritura o de
// ejecución. `find`, `sort` y `tree` ya existían dispersos entre el guard y la
// librería; `sed`, `awk` y `xargs` son los que faltaban y sin los cuales el
// léxico ampliado sería un agujero.
export const WRITE_PREDICATES = {
  find: /(?:^|\s)-(?:exec|execdir|ok|okdir|delete|fprint|fprintf|fls)(?:\s|$)/,
  sort: /(?:^|\s)(?:-o|--output)(?:\s|=)/,
  tree: /(?:^|\s)(?:-o|--output)(?:\s|=)/,
  sed: /(?:^|\s)(?:-i|--in-place)\b|(?:^|\s)-[a-zA-Z]*i[a-zA-Z]*(?:\s|$)|s\/[^/]*\/[^/]*\/[a-z]*[we]|(?:^|;|\{)\s*[wW]\s/,
  awk: />|system\s*\(|\|\s*"|(?:^|\s)-i\b/,
  xargs: /(?:^|\s)(?:rm|mv|cp|tee|sh|bash|node|python3?)\b/,
  git: /(?:^|\s)--(?:ext-diff|textconv|output)(?:\s|=|$)/,
};
export const GIT_BRANCH_MUTATION_RE =
  /(?:^|\s)(?:-m|-M|-c|-C|-d|-D|-f|--(?:move|copy|delete|force|create-reflog|edit-description|set-upstream-to|unset-upstream|track|no-track|recurse-submodules))(?:\s|=|$)/;

// Gramática peligrosa del hilo principal. `\r` y `\n` YA NO están: el corte del
// parser los consume como separadores, igual que hace el shell, y dejarlos acá
// era lo que convertía todo comando multilínea en un `ask` (22 de la sesión
// medida). Lo que sigue prohibido es la sustitución, la redirección y el `&` solo.
export const ORCHESTRATOR_UNSAFE_SHELL_RE = /`|\$|[<>]|(?:^|[^&])&(?:[^&]|$)/;
export const ORCHESTRATOR_UNSAFE_CONTROL_RE = /`|\$|[<>]|(?:^|[^&])&(?:[^&]|$)/;

// ---- Parser ÚNICO del hilo principal ----------------------------------------
/**
 * Corta por `;` `|` `||` `&&` y por SALTO DE LÍNEA, respetando comillas y
 * escapes. La continuación `\` + salto se une ANTES de cortar, como hace el
 * shell: si no, un comando continuado se parte en dos segmentos que no
 * significan nada por separado.
 */
export function splitSegments(command) {
  command = String(command).replace(/\\[ \t]*\r?\n[ \t]*/g, " ");
  const segments = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === "\\" && quote !== "'") { current += ch; escaped = true; continue; }
    if (quote) { current += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue; }
    const dbl = (ch === "|" || ch === "&") && command[i + 1] === ch;
    if (ch === ";" || ch === "|" || ch === "\n" || ch === "\r" || dbl) {
      const seg = current.trim();
      if (seg) segments.push(seg);
      current = "";
      if (dbl) i += 1;
      continue;
    }
    current += ch;
  }
  if (quote || escaped) return null;
  const last = current.trim();
  if (last) segments.push(last);
  return segments.length ? segments : null;
}

/** Descarta los paréntesis de agrupación y las redirecciones a la nada. */
export function normalizeSegment(segment) {
  return String(segment)
    // Las tres formas que no llevan datos a ningún lado, con el mismo límite que
    // `NULL_REDIRECT_RE` más el `)` de la agrupación, que en este plano se descarta
    // recién en la línea de abajo. Con `\b` a secas, `cat x >/dev/null.txt` se
    // limpiaba a `cat x` y una escritura real pasaba por lectura.
    .replace(/(?:^|\s)(?:2>\/dev\/null|>\/dev\/null|2>&1)(?=[\s;|&)]|$)/g, " ")
    .replace(/^\(+\s*/, "")
    .replace(/\s*\)+$/, "")
    .trim();
}

function firstToken(segment) {
  return segment.trim().split(/\s+/)[0] ?? "";
}

/**
 * `cd` es ESTADO, no un segmento neutral: cambia el significado de todo lo que
 * sigue. Se admite SOLO en primera posición y SOLO hacia la raíz del proyecto,
 * comparada con `resolve()` y sin distinguir mayúsculas en win32. Ni igualdad
 * estricta —rechazaba dos de las tres formas del log— ni `startsWith`, que
 * aceptaría un directorio hermano con la raíz como prefijo.
 */
export function isProjectRoot(target, root) {
  if (!root) return false;
  const a = resolvePath(target).replaceAll("\\", "/").replace(/\/$/, "");
  const b = resolvePath(root).replaceAll("\\", "/").replace(/\/$/, "");
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * ¿Este segmento es lectura pura? Única puerta: léxico + predicado de escritura.
 *
 * `cdPolicy` existe porque los dos consumidores NO tienen la misma política de
 * `cd`, y este plan solo redefine la del orquestador (P3.6): para él `cd` es
 * estado y solo se admite hacia la raíz. La librería de subagentes conserva la
 * que ya tenía —cualquier destino— porque su suite la declara
 * (`test-plan-authorization-operation-hook.mjs:211`) y ninguna decisión de este
 * plan la toca. Anotado como divergencia deliberada, no como olvido.
 *
 * @param {string} rawSegment
 * @param {{root?: string, isFirst?: boolean, cdPolicy?: "project-root"|"any"}} opciones
 */
export function isReadOnlySegment(rawSegment, { root = "", isFirst = false, cdPolicy = "project-root" } = {}) {
  const segment = normalizeSegment(rawSegment);
  if (!segment) return false;
  const exec = firstToken(segment);

  if (exec === "cd") {
    if (cdPolicy === "any") return true;
    if (!isFirst) return false;
    const arg = segment.slice(2).trim().replace(/^["']|["']$/g, "");
    return !arg || arg === "." || isProjectRoot(arg, root);
  }

  if (exec === "git") {
    const stripped = segment.replace(/^git(?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+))*/, "git");
    const parts = stripped.split(/\s+/);
    const sub = parts[1] ?? "";
    if (!GIT_READ.has(sub)) return false;
    const restRe = GIT_READ.get(sub);
    if (restRe && !restRe.test(parts.slice(2).join(" "))) return false;
    if (WRITE_PREDICATES.git.test(segment)) return false;
    if (sub === "branch") {
      const args = stripped.replace(/^git\s+branch\b/, "").trim();
      if (GIT_BRANCH_MUTATION_RE.test(args)) return false;
      if (args && !/(?:^|\s)--list(?:\s|$)/.test(args)) {
        // Un nombre suelto CREA la rama; solo se admiten formas de consulta.
        if (!args.split(/\s+/).every((arg) => arg.startsWith("-"))) return false;
      }
    }
    return true;
  }

  if (READ_COMMANDS.has(exec) || READ_STAGES.has(exec)) {
    const predicate = WRITE_PREDICATES[exec];
    return !(predicate && predicate.test(segment));
  }
  if (VERSION_PROBE_RE.test(segment)) return true;
  return SAFE_JSON_FILTER_RE.test(segment);
}

/** Etapa admitida en posición no inicial de una tubería de lectura. */
export function isReadOnlyPipelineStage(command) {
  const segment = normalizeSegment(command);
  if (!READ_STAGES.has(firstToken(segment))) return false;
  const predicate = WRITE_PREDICATES[firstToken(segment)];
  return !(predicate && predicate.test(segment));
}

// ---- Manifiesto de control-plane, POR SUBCOMANDO (P4) -----------------------
//
// Reemplaza cuatro listas del mismo concepto con cuatro membresías distintas:
// `permissions.allow` de settings.json (5 scripts, sin `resolve-rule` ni
// `resolve-capability`), los seis regex sueltos del guard, `FRAMEWORK_READ_SCRIPTS`
// de la librería (3 entradas) y `authorization.commands[]` por igualdad exacta.
//
// La granularidad es el SUBCOMANDO y no el archivo, porque el plano no se deduce
// del nombre del script: `commit-authorization approve` no toma input —invocarlo
// ES aprobar—, así que por archivo habría quedado permitido.
//
// Es código y no un JSON bajo `references/`: ahí no lo cubre `rule-loading.json`
// ni `permissions.deny`, y ningún hook valida hashes en runtime.

const UUID_RE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const SCOPED_APPROVE_RE = new RegExp(`^approve[ ]+--challenge-id[ ]+${UUID_RE}$`);
const SCOPED_AMEND_RE = new RegExp(`^amend[ ]+--challenge-id[ ]+${UUID_RE}[ ]+--confirm-unchanged$`);

const PLAN_AUTH_DENY =
  "ORC-010-A: `status`, `--help` y `approve` sin challenge no se ejecutan desde el orquestador. " +
  "El hook UserPromptSubmit consume el challenge ante una afirmación inequívoca; para la cola " +
  "larga usá `approve --challenge-id <uuid>` (solo si el hook marcó el turno elegible) y para una " +
  "corrección que no cambia el lote `amend --challenge-id <uuid> --confirm-unchanged` (ORC-010-E). " +
  "En cualquier otro caso invocá el lote aprobado o pedí un plan/challenge nuevo.";

const ORCH = ["orchestrator"];
const BOTH = ["orchestrator", "subagent"];
const entrada = (callers, effects, extra = {}) => ({ callers: new Set(callers), effects, ...extra });

export const CONTROL_PLANE = {
  "asdd-resolve-rule.mjs": { "*": entrada(BOTH, ["read"], { argRe: /^[a-z0-9-]+$/ }) },
  "asdd-load-capability.mjs": { "*": entrada(BOTH, ["read"], { argRe: /^[a-z0-9-]+$/ }) },
  "asdd-resolve-capability.mjs": { "*": entrada(BOTH, ["read"], { argRe: /^[a-z0-9-]+$/ }) },
  "asdd-route-request.mjs": {
    "*": entrada(ORCH, ["read"], {
      flags: ["--file"],
      valueRe: { "--file": /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/ },
    }),
  },
  "validate-template.mjs": { "*": entrada(BOTH, ["read", "spawn"]) },
  "asdd-artifact-name.mjs": {
    "*": entrada(BOTH, ["write-run-state"], {
      flags: ["--phase", "--slug", "--ext", "--dry-run", "--artifact-dir"],
      // D6: el flag no existe y el script lo descarta en silencio. Se conserva el
      // rechazo, pero el mensaje nombra los flags que sí valen.
      rejectFlags: {
        "--artifact-dir": "no existe en artifact-name; el directorio sale del run. Flags válidos: --phase --slug --ext --dry-run",
      },
    }),
  },
  "asdd-run-bootstrap.mjs": {
    "*": entrada(ORCH, ["write-run-state", "spawn"], {
      flags: ["--feature", "--phase", "--artifact-dir", "--artifact-slug", "--ext"],
    }),
  },
  "asdd-plan-authorization.mjs": {
    issue: entrada(ORCH, ["issue-authority"], { requireFlag: "--plan-json" }),
    // ORC-010-E: la forma es EXACTA. `approve` exige UUID y nada más; `amend`
    // exige además `--confirm-unchanged`. Sin esto se cuelan `amend --challenge-id`
    // a secas y `approve --challenge-id not-a-uuid`.
    approve: entrada(ORCH, ["issue-authority"], { exactRe: SCOPED_APPROVE_RE }),
    amend: entrada(ORCH, ["issue-authority"], { exactRe: SCOPED_AMEND_RE }),
    // D5: se conserva el deny de `status` / `--help` / `approve` sin challenge,
    // con su texto literal — la suite verifica que explique el consumo por
    // UserPromptSubmit.
    status: entrada([], ["issue-authority"], { why: PLAN_AUTH_DENY }),
    "*": entrada([], ["issue-authority"], { why: PLAN_AUTH_DENY }),
  },
  "asdd-commit-authorization.mjs": {
    issue: entrada(ORCH, ["issue-authority", "spawn"], { stdin: true }),
    // D2: `approve` no toma input — invocarlo ES aprobar (GS-003).
    approve: entrada([], ["issue-authority"], {
      why: "GS-003: invocar `approve` ES aprobar — no toma input. Solo lo consume el hook UserPromptSubmit ante una afirmación explícita del usuario",
    }),
    "*": entrada([], ["issue-authority"], { why: "GS-003: solo `issue` desde el orquestador" }),
  },
  // D7: los dos quedan con callers vacío.
  "asdd-resolve-workspace.mjs": {
    "*": entrada([], ["write-run-state", "spawn"], {
      why: "el plan gate lo excluye a propósito: escribe estado y ninguna regla se lo manda a un agente (references/rules/asdd-orchestration-plan-gate.md:169). Además no se distribuye a un consumidor",
    }),
  },
  "asdd-regen-hashes.mjs": {
    "*": entrada([], ["write-integrity"], {
      why: "reescribe reference_sha256 de rule-loading.json: neutraliza la detección de reglas alteradas",
    }),
  },
};

// Ejecutable de dominio → agente al que hay que delegarlo. Es lo que le da a cada
// `deny` de dominio su línea de camino en lugar de dejar al orquestador sin salida.
export const DOMAIN_EXEC = new Map([
  ["pytest", "asdd-developer-backend"], ["python", "asdd-developer-backend"],
  ["python3", "asdd-developer-backend"], ["pip", "asdd-developer-backend"],
  ["pip3", "asdd-developer-backend"], ["ruff", "asdd-developer-backend"],
  ["mypy", "asdd-developer-backend"], ["uvicorn", "asdd-developer-backend"],
  ["poetry", "asdd-developer-backend"],
  ["npm", "asdd-developer-frontend"], ["npx", "asdd-developer-frontend"],
  ["pnpm", "asdd-developer-frontend"], ["yarn", "asdd-developer-frontend"],
  ["bun", "asdd-developer-frontend"], ["tsc", "asdd-developer-frontend"],
  ["vitest", "asdd-developer-frontend"], ["jest", "asdd-developer-frontend"],
  ["playwright", "asdd-atf-web-qa-engineer"],
  ["cargo", "asdd-developer-backend"], ["go", "asdd-developer-backend"],
  ["mvn", "asdd-developer-backend"], ["gradle", "asdd-developer-backend"],
  ["docker", "asdd-devops-engineer"], ["make", "asdd-developer-backend"],
  ["mkdir", "el agente dueño del artefacto"], ["touch", "el agente dueño del artefacto"],
  ["cp", "el agente dueño del artefacto"], ["mv", "el agente dueño del artefacto"],
  ["tee", "el agente dueño del artefacto"],
]);

/** Nombre del script tal como lo declara el manifiesto, o "" si no es una invocación de node. */
export function manifestKey(segment, root = "") {
  const parts = segment.trim().split(/\s+/);
  if (parts[0] !== "node") return "";
  const crudo = String(parts[1] ?? "").replaceAll("\\", "/").replace(/^["']|["']$/g, "");
  const raiz = String(root || "").replaceAll("\\", "/").replace(/\/$/, "");
  let token = crudo;
  if (raiz && token.toLowerCase().startsWith(`${raiz.toLowerCase()}/`)) token = token.slice(raiz.length + 1);
  return token.replace(/^\.\//, "").replace(/^\.claude\/scripts\//, "");
}

/**
 * Clasifica un segmento contra el manifiesto de control-plane.
 *
 * @returns {null} si el segmento no invoca un script del proyecto con node;
 *   `{class:"control-allow"|"control-denied"|"unknown", reason}` si sí.
 */
export function classifyControlPlane(rawSegment, { caller = "orchestrator", root = "" } = {}) {
  const segment = normalizeSegment(rawSegment);
  const key = manifestKey(segment, root);
  if (!key) return null;
  const entradas = CONTROL_PLANE[key];
  const rest = segment.split(/\s+/).slice(2);

  if (!entradas) {
    // node sobre un script del proyecto que el manifiesto no declara: ese es el
    // único hueco legítimo, y es lo que P7 registra como incidencia.
    if (/\.(mjs|cjs|js|ts)$/.test(key)) {
      return { class: "unknown", reason: `script no declarado en el manifiesto: ${key}` };
    }
    return null;
  }

  const sub = rest[0] && !rest[0].startsWith("-") ? rest[0] : (rest[0] === "--help" ? "--help" : "*");
  const entry = entradas[sub] ?? entradas["*"];

  // `--help` de un script que no emite autoridad: descubrir los flags válidos no
  // es ejecutar trabajo, y sin eso el orquestador tantea flags que no existen.
  if (sub === "--help" && !entry.effects.includes("issue-authority")) {
    return { class: "control-allow", reason: `--help de ${key}` };
  }
  if (!entry.callers.has(caller)) {
    return { class: "control-denied", effects: entry.effects, reason: entry.why ?? `${key} ${sub === "*" ? "" : sub} no está declarado para ${caller}`.trim() };
  }
  if (entry.requireFlag && !rest.includes(entry.requireFlag)) {
    return { class: "control-denied", effects: entry.effects, reason: `${key} ${sub} requiere ${entry.requireFlag}` };
  }
  if (entry.exactRe && !entry.exactRe.test(rest.join(" ").trim())) {
    return { class: "control-denied", effects: entry.effects, reason: entradas["*"].why ?? `forma no canónica de ${key} ${sub}` };
  }
  if (entry.rejectFlags) {
    for (const [flag, why] of Object.entries(entry.rejectFlags)) {
      if (rest.includes(flag)) return { class: "control-denied", effects: entry.effects, reason: `${flag}: ${why}` };
    }
  }
  if (entry.flags) {
    for (let i = 0; i < rest.length; i += 1) {
      const tok = rest[i];
      if (!tok.startsWith("--")) continue;
      if (tok === "--help" || tok === "--dry-run") continue;
      if (!entry.flags.includes(tok)) {
        return { class: "control-denied", effects: entry.effects, reason: `flag no declarado ${tok}; válidos: ${entry.flags.join(" ")}` };
      }
      const re = entry.valueRe?.[tok];
      if (re && !re.test(String(rest[i + 1] ?? ""))) {
        return { class: "control-denied", effects: entry.effects, reason: `valor inválido para ${tok}: ${rest[i + 1] ?? "(vacío)"}` };
      }
    }
  }
  if (entry.argRe) {
    const args = rest.filter((t) => !t.startsWith("-"));
    if (args.some((a) => !entry.argRe.test(a))) {
      return { class: "control-denied", effects: entry.effects, reason: `argumento fuera de forma para ${key}` };
    }
  }
  return { class: "control-allow", effects: entry.effects, reason: `${key} declarado para ${caller}` };
}

// ---- Peligro y partición (P5) -----------------------------------------------

/**
 * Enmascara SOLO lo que el shell trata como literal, para poder buscar
 * metacaracteres ACTIVOS sin falsos positivos.
 *
 *   'comillas simples'  → todo literal          → se enmascara entero
 *   "comillas dobles"   → ` y $ SIGUEN ACTIVOS  → NO se enmascara; solo se
 *                          descartan los pares escapados \` \$ \"
 *
 * Enmascarar también las dobles sería un agujero: en bash `"…`whoami`…"` ejecuta.
 * Con esto el `--plan-json '{"task":"ba->funcional->po"}'` del log pasa —va entre
 * comillas simples— y la sustitución entre comillas dobles sigue denegada.
 */
export function maskQuoted(command) {
  let out = "";
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote === "'") { if (ch === "'") quote = null; continue; }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < command.length) { i += 1; continue; }
      if (ch === '"') { quote = null; continue; }
      out += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === "\\" && i + 1 < command.length) { i += 1; continue; }
    out += ch;
  }
  return out;
}

export const DANGEROUS_EXEC = new Set([
  "rm", "rmdir", "sudo", "chmod", "chown", "curl", "wget", "sh", "bash", "zsh",
  "powershell", "pwsh", "cmd", "eval", "source", "dd", "mkfs",
]);
// D8: la partición tiene que ser monótona en riesgo. Si la ejecución arbitraria
// recibiera `ask`, el guard preguntaría por lo más peligroso y denegaría un
// `pytest`. Los tres del log leían un JSON, y `cat` ya está permitido.
export const INTERPRETER_INLINE_RE = /^(?:node|python3?|deno|bun|ruby|perl|php)\s+-(?:e|c)\b/;
const LONE_BACKGROUND_RE = /(?:^|[^&])&(?:[^&]|$)/;

// `git add` con rutas explícitas: no toca el working tree ni la historia, y el
// commit sigue exigiendo el challenge GS-003. Se admite para no interrumpir el
// paso previo de una operación que de todos modos se autoriza después. El staging
// amplio (`-A`, `-u`, `.`, `*`) sigue frenado: es el anti-patrón que el propio
// skill de commit veda («preferir `git add` específico»).
//
// PROCEDENCIA: viene de `9ed7c32` (fix/git-enforcement-nativo) y se portó a la
// partición al mergear `dev`. En el guard viejo vivía dentro de
// `isSafeReadOnlyBash`, que es del hilo principal, así que sigue acotado al
// orquestador: la librería de subagentes tiene su propio camino y este merge no
// lo cambia. La clase `read` es la celda de ALLOW de la partición — no una
// afirmación de que `git add` lea.
const GIT_ADD_NARROW_RE = /^git(?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+))*\s+add\s+(.+)$/;

export function isNarrowGitAdd(segment) {
  const match = String(segment ?? "").match(GIT_ADD_NARROW_RE);
  if (!match) return false;
  const args = match[1].trim().split(/\s+/).filter(Boolean);
  if (!args.length) return false;
  // Los predicados se evaluan sobre la palabra YA RESUELTA como la resolveria el
  // shell. No alcanza con sacar un par de comillas de los extremos: el shell hace
  // quote removal en CUALQUIER posicion de la palabra, asi que `""-A`, `"-"A` y
  // `".""."/x` llegan a git como `-A`, `-A` y `../x`.
  // Ojo con la semantica: `"'-A'"` resuelve a `'-A'` —las comillas simples son
  // literales dentro de dobles— y eso es un pathspec, no una opcion: sigue valido.
  // `resolveWord` devuelve null cuando encuentra una forma de entrecomillado que
  // NO modela; el llamador lo trata como "no es un add acotado" (falla cerrado).
  const resolveWord = (word) => {
    let out = "";
    let quote = null;
    for (let i = 0; i < word.length; i += 1) {
      const ch = word[i];
      if (quote === "'") { if (ch === "'") { quote = null; continue; } out += ch; continue; }
      if (quote === '"') {
        if (ch === "\\" && i + 1 < word.length && '"\'\$`'.includes(word[i + 1])) { out += word[i + 1]; i += 1; continue; }
        if (ch === '"') { quote = null; continue; }
        out += ch; continue;
      }
      // Fuera de comillas, `$'…'` es ANSI-C quoting y `$"…"` es traduccion por
      // locale: son FORMAS DE ENTRECOMILLADO, no expansiones, y bash entrega
      // `$'-A'` como `-A`. Modelarlas exige decodificar \x2d, \t, \u… — se falla
      // cerrado en vez de fingir que se entiende. Dentro de comillas no aplica:
      // `"$'-A'"` es el literal `$'-A'` y sigue admitido.
      if (ch === "$" && (word[i + 1] === "'" || word[i + 1] === '"')) return null;
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      if (ch === "\\" && i + 1 < word.length) { out += word[i + 1]; i += 1; continue; }
      out += ch;
    }
    return out;
  };
  return args.every((raw) => {
    const arg = resolveWord(raw);
    if (arg === null) return false;
    return !arg.startsWith("-") && arg !== "." && arg !== "*" && !arg.includes("..");
  });
}

/**
 * Clasifica un segmento en EXACTAMENTE una clase. Es la partición de P5.1: `ask`
 * dejó de ser el `else` de todo y solo se alcanza en `unknown`.
 *
 * @returns {{class:"read"|"control-allow"|"control-denied"|"integrity"|"domain"|"dangerous"|"unknown", reason:string, agent?:string}}
 */
export function classifySegment(rawSegment, { caller = "orchestrator", root = "", isFirst = false } = {}) {
  const segment = normalizeSegment(rawSegment);
  if (!segment) return { class: "read", reason: "segmento vacío" };
  const exec = firstToken(segment);
  const activo = maskQuoted(segment);

  // `cd` es ESTADO: cambia el significado de todo lo que sigue.
  if (exec === "cd") {
    if (isReadOnlySegment(segment, { root, isFirst })) return { class: "read", reason: "`cd` hacia la raíz del proyecto" };
    const arg = segment.slice(2).trim().replace(/^["']|["']$/g, "");
    return {
      class: "dangerous",
      reason: isFirst
        ? `\`cd ${arg}\` sale de la raíz del proyecto`
        : "`cd` fuera de la primera posición cambia el significado de todo lo que sigue",
    };
  }

  if (INTERPRETER_INLINE_RE.test(segment)) {
    return { class: "dangerous", reason: "intérprete con programa embebido (-e/-c): es ejecución arbitraria" };
  }
  if (DANGEROUS_EXEC.has(exec)) {
    return { class: "dangerous", reason: `\`${exec}\` no se ejecuta desde el orquestador` };
  }
  if (/[><]/.test(activo)) return { class: "dangerous", reason: "redirección de escritura" };
  if (/`|\$\(/.test(activo)) return { class: "dangerous", reason: "sustitución de comandos" };
  if (LONE_BACKGROUND_RE.test(activo)) return { class: "dangerous", reason: "`&` deja el comando en segundo plano" };

  const control = classifyControlPlane(segment, { caller, root });
  if (control) {
    // El plano de integridad es su propia clase: lo que reescribe los hashes de
    // referencia no se deniega «porque no está declarado», se deniega porque
    // neutraliza la detección de reglas alteradas (D7).
    if (control.class === "control-denied" && control.effects?.includes("write-integrity")) {
      return { class: "integrity", reason: control.reason };
    }
    return control;
  }

  if (isReadOnlySegment(segment, { root, isFirst })) return { class: "read", reason: `lectura (${exec})` };

  // Un comando del léxico que NO pasó es un comando de lectura con predicado de
  // escritura: `sed -i`, `find -exec`, `tree -o`, `sort -o`, `ls | xargs rm`. Es
  // peligro, no un hueco de clasificación: si cayera en `unknown` el guard
  // preguntaría por una escritura disfrazada de lectura, que es exactamente el
  // defecto que este plan corrige.
  if (READ_COMMANDS.has(exec) || READ_STAGES.has(exec)) {
    return { class: "dangerous", reason: `\`${exec}\` con predicado de escritura o de ejecución` };
  }

  if (caller === "orchestrator" && isNarrowGitAdd(segment)) {
    return { class: "read", reason: "`git add` con rutas explícitas: no toca el working tree ni la historia" };
  }
  if (exec === "git") return { class: "domain", reason: `\`git ${segment.split(/\s+/)[1] ?? ""}\` muta el repositorio`, agent: "el flujo de git-safety (GS-003/GS-008/GS-009)" };
  if (DOMAIN_EXEC.has(exec)) return { class: "domain", reason: `\`${exec}\` es trabajo de dominio`, agent: DOMAIN_EXEC.get(exec) };

  return { class: "unknown", reason: `ejecutable no declarado: ${exec}` };
}
