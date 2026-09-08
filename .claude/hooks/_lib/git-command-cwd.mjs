// -----------------------------------------------------------------------------
// .claude/hooks/_lib/git-command-cwd.mjs
//
// Helper compartido para resolver el "repo efectivo" de un comando Bash que
// contiene un `git` (o `gh`/`glab`) potencialmente antecedido por `cd X &&`
// o el flag `git -C X`. Consumido por los 3 guards de git (guard-branch,
// pre-push-gate, pre-pr-gate) para resolver B1-B7 del Bug B
// (docs/tech/2026-07-07-001-BUILD-006-bug-b-git-guards-nested-repos.md).
//
// MITIGACIÓN DE SEGURIDAD OBLIGATORIA (no negociable): cuando el parseo del
// comando es ambiguo (múltiples `cd`/`-C`, o una ruta con variable de shell
// sin resolver como `$VAR`), esta función devuelve `ambiguous: true` y una
// lista de `candidates` que el guard DEBE evaluar TODOS — bloqueando si
// CUALQUIERA de ellos está en rama protegida. Fail-closed siempre; nunca
// fail-open ante ambigüedad.
//
// FIX R3b (bypass multi-git confirmado por auditoría adversarial —
// docs/tech/2026-07-07-001-BUILD-006-bug-b-git-guards-nested-repos.md):
// cuando el comando bajo prueba contiene VARIAS invocaciones `git`/`gh`/`glab`
// (ej. `cd nested && git commit && git -C other push`), el algoritmo legado
// (`cFlagRe`/`cdRe` GLOBALES sobre el string completo) correlaciona mal el
// `-C` de una invocación NO relacionada con la invocación que el guard
// realmente valida (commit/push/mr create), devolviendo un candidato único
// pero INCORRECTO y saltándose el fail-closed. La función acepta ahora un
// 3er parámetro opcional `targetRe`: cuando se provee, el comando se
// segmenta por `&&`/`;` (respetando comillas) y solo se resuelve el CWD del
// segmento que matchea `targetRe` (la acción real que el guard valida),
// considerando el encadenado de `cd` y el propio `-C` de ESE segmento — no
// los de invocaciones `git` no relacionadas en otros segmentos del comando.
// Los 3 guards pasan su propio `targetRe` (GIT_COMMIT_RE / GIT_PUSH_RE /
// MR_CREATE_RE). Sin `targetRe` (2 argumentos) se preserva el algoritmo
// legado sin cambios — retrocompatible con callers existentes.
//
// FIX R3c (auditoría adversarial post-R3b — bypass vía newline y subshell):
// el algoritmo por segmentos de R3b (`splitTopLevelSegments`) solo cortaba
// por `&&` y `;`. Dos vectores lo evadían: (1) el separador de línea `\n`
// (`cd nested\ngit commit` — bash ejecuta cada línea secuencialmente, pero
// el parser no veía el `cd` porque no había `&&`/`;`); (2) el subshell
// `(cd nested && git commit)` — bash aplica el `cd` solo dentro del
// subshell pero el `git commit` corre allí también, y el parser tampoco
// entendía `()`. Ambos hacían que el guard evaluara el repo EQUIVOCADO
// (la base, no `nested`) y permitiera el commit en una rama protegida.
//
// Principio de R3c: no se puede parsear shell arbitrario con certeza total
// — cada separador nuevo que se soporte reabre el hueco con la siguiente
// construcción no soportada. En lugar de perseguir separadores uno por uno,
// se combinan dos caminos:
//   - CAMINO PRECISO: para comandos simples y seguros de parsear, se
//     extiende `splitTopLevelSegments` para tratar también `\n`/`\r\n` como
//     separador de nivel superior (equivalente a `;`), preservando el
//     algoritmo de R3b sin cambios para el resto.
//   - CAMINO FAIL-CLOSED: si el comando contiene CUALQUIERA de estas
//     construcciones que pueden reubicar o esconder el cwd real —
//     subshell `(...)`, brace group `{ ...; }`, command substitution
//     `$(...)`, backticks `` `...` ``, `eval`, pipe `|` (potencialmente con
//     git involucrado) — `resolveEffectiveCwd` NO intenta correlacionar el
//     cwd exacto del segmento objetivo. En cambio, recolecta TODOS los
//     candidatos de `cd`/`-C` que pueda extraer de todo el comando (scan
//     global, sin garantía de orden/anidamiento) más el repo base, marca
//     `unsafe: true` y `ambiguous: true`, y el guard evalúa TODOS
//     bloqueando si CUALQUIERA está en rama protegida (fail-closed). Si el
//     scan global no encuentra NINGÚN `cd`/`-C` (ej. `eval` que oculta el
//     destino real sin dejar rastro textual) → `forceBlock: true`: el guard
//     bloquea SIEMPRE, sin importar si `base` está o no en rama protegida,
//     porque no hay forma de confiar en que el comando corre en `base`.
//
// Trade-off explícito y aceptado: este camino puede sobre-bloquear
// comandos compuestos legítimos pero exóticos (ej. un subshell inofensivo
// sin relación con git). Es intencional — un guard de seguridad evadible es
// peor que uno estricto. El workaround para el usuario es ejecutar la
// acción git de forma simple y directa, sin composición compleja de shell.
// -----------------------------------------------------------------------------

import { resolve } from "node:path";

const UNRESOLVED_VAR_RE = /\$\{?\w+\}?/;
// R3d: `pushd X` reubica el cwd igual que `cd X` a efectos de esta
// resolución (bash empuja X a la pila de directorios y hace chdir a él).
// No modelamos la pila de `popd` — ver POPD_RE más abajo, que fuerza el
// camino fail-closed porque el destino de `popd` no es determinable
// estáticamente sin rastrear toda la pila de `pushd` previos.
const CD_SEGMENT_RE = /^(?:cd|pushd)\s+(\S+)$/;
const CFLAG_SEGMENT_RE =
  /\bgit\s+(?:(?:-c\s+\S+|--git-dir=\S+|--work-tree=\S+)\s+)*-C\s+(\S+)/;
const POPD_RE = /\bpopd\b/;

/** Une `base` + `segment` respetando rutas absolutas. */
function joinPath(base, segment) {
  return resolve(base, segment);
}

/**
 * Quita comillas envolventes simples o dobles de un path capturado
 * (`"nested"` → `nested`, `'nested'` → `nested`). R3d: sin este strip,
 * `cd "nested"` resolvía a un path literal con las comillas incluidas
 * (`base + '/"nested"'`), un path inexistente que hacía fallar
 * `currentBranch()` con ENOENT y, antes del fix de fail-closed en los
 * guards, se traducía en un bypass silencioso (exit 0). Solo se quitan
 * las comillas si AMBOS extremos coinciden — un solo extremo con comilla
 * no se toca (no es un caso de comillas balanceadas real).
 */
function stripQuotes(raw) {
  if (typeof raw !== "string" || raw.length < 2) return raw;
  const first = raw[0];
  const last = raw[raw.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return raw.slice(1, -1);
  }
  return raw;
}

/**
 * Segmenta un comando Bash por `&&`, `;` y salto de línea (`\n`/`\r\n`) de
 * nivel superior (fuera de comillas simples/dobles). El salto de línea se
 * agregó en R3c: bash ejecuta cada línea de un comando multi-línea
 * secuencialmente igual que si estuviera separada por `;`. No maneja
 * subshells `()` ni backticks — esos casos se enrutan por el camino
 * fail-closed de `detectUnsafeConstruct` antes de llegar a esta función.
 */
function splitTopLevelSegments(command) {
  const segments = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const next = command[i + 1];

    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;

    if (!inSingle && !inDouble) {
      if (ch === "&" && next === "&") {
        segments.push(current);
        current = "";
        i++; // saltar el segundo '&'
        continue;
      }
      if (ch === ";") {
        segments.push(current);
        current = "";
        continue;
      }
      if (ch === "\r" && next === "\n") {
        segments.push(current);
        current = "";
        i++; // saltar el '\n' del CRLF
        continue;
      }
      if (ch === "\n") {
        segments.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  segments.push(current);

  return segments.map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// R3c — Detección de construcciones de shell no parseables con certeza
// ---------------------------------------------------------------------------

const CMD_SUBST_RE = /\$\(/;
const BACKTICK_RE = /`/;
// Negative lookbehind: excluye `(`/`{` cuando forman parte de `$(...)` o
// `${...}` — esos casos ya se cubren aparte (command-substitution) o no son
// riesgo real (`${VAR}` es solo interpolación de variable, no agrupación).
const SUBSHELL_RE = /(?<!\$)\(/;
const BRACE_GROUP_RE = /(?<!\$)\{/;
const EVAL_RE = /\beval\b/;
const PIPE_RE = /\|/;

/**
 * Enmascara el contenido de comillas de un comando reemplazándolo por
 * espacios (preserva longitud/posiciones, irrelevante aquí). Comillas
 * simples SIEMPRE se enmascaran (inertes en bash: nada se interpola dentro).
 * Comillas dobles se enmascaran solo si `maskDouble` es true — en bash,
 * `$(...)` y las backticks siguen "vivas" dentro de comillas dobles, por
 * lo que esos dos checks deben correr sobre el string CON las comillas
 * dobles intactas.
 */
function maskQuotes(command, maskDouble) {
  let out = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      out += " ";
      continue;
    }
    if (ch === '"' && !inSingle && maskDouble) {
      inDouble = !inDouble;
      out += " ";
      continue;
    }
    if (inSingle || (inDouble && maskDouble)) {
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Detecta si el comando contiene una construcción de shell que no se puede
 * parsear con certeza para correlacionar el CWD real de la invocación
 * objetivo (R3c). Retorna el nombre de la primera construcción detectada,
 * o `null` si el comando es parseable por el camino preciso.
 */
function detectUnsafeConstruct(command) {
  // $(...) y backticks siguen activos DENTRO de comillas dobles en bash —
  // solo comillas simples los neutralizan. Se evalúan sobre el string con
  // comillas dobles intactas (maskDouble=false).
  const maskedSingleOnly = maskQuotes(command, false);
  if (CMD_SUBST_RE.test(maskedSingleOnly)) return "command-substitution";
  if (BACKTICK_RE.test(maskedSingleOnly)) return "backtick";

  // Subshells, brace groups, eval y pipes solo son sintaxis de shell FUERA
  // de cualquier comilla — dentro de comillas (simples o dobles) son texto
  // literal (ej. un mensaje de commit "fix (bug)"). Se evalúan enmascarando
  // ambos tipos de comillas.
  const maskedAll = maskQuotes(command, true);
  if (SUBSHELL_RE.test(maskedAll)) return "subshell";
  if (BRACE_GROUP_RE.test(maskedAll)) return "brace-group";
  if (EVAL_RE.test(maskedAll)) return "eval";
  if (PIPE_RE.test(maskedAll)) return "pipe";
  // R3d: `popd` reubica el cwd al tope de la pila de directorios empujada
  // por `pushd` previos — un destino que no es determinable estáticamente
  // sin rastrear la pila completa. Se enruta por el camino fail-closed
  // igual que subshell/eval/pipe.
  if (POPD_RE.test(maskedAll)) return "popd";

  return null;
}

const LOOSE_CD_RE = /\b(?:cd|pushd)\s+(\S+)/g;
const LOOSE_CFLAG_RE =
  /\bgit\s+(?:(?:-c\s+\S+|--git-dir=\S+|--work-tree=\S+)\s+)*-C\s+(\S+)/g;

/**
 * Escanea TODO el comando (sin respetar comillas/paréntesis/segmentación)
 * buscando cualquier `cd X` o `git -C X` textual, sin importar en qué
 * construcción de shell estén envueltos. Es intencionalmente laxo: el
 * objetivo no es un parseo correcto sino recolectar TODOS los candidatos
 * posibles de forma fail-closed (mejor sobre-incluir que dejar pasar el
 * destino real). Ignora capturas con variables de shell sin resolver
 * (ya cubiertas por el mecanismo de ambigüedad existente).
 */
function collectLooseCandidates(command, base) {
  const found = [];

  const cdRe = new RegExp(LOOSE_CD_RE.source, "g");
  let m;
  while ((m = cdRe.exec(command))) {
    const raw = stripQuotes(m[1]);
    if (!UNRESOLVED_VAR_RE.test(raw)) found.push(joinPath(base, raw));
  }

  const cRe = new RegExp(LOOSE_CFLAG_RE.source, "g");
  while ((m = cRe.exec(command))) {
    const raw = stripQuotes(m[1]);
    if (!UNRESOLVED_VAR_RE.test(raw)) found.push(joinPath(base, raw));
  }

  return found;
}

/**
 * Resuelve el CWD del segmento cuyo texto matchea `targetRe` (la invocación
 * real que el guard valida), siguiendo el encadenado de `cd` previo y el
 * `-C` propio de ese segmento — sin contaminarse con `-C`/`cd` de otras
 * invocaciones `git` no relacionadas en el mismo comando compuesto.
 */
function resolveForTarget(command, base, targetRe) {
  const segments = splitTopLevelSegments(command);

  let chainCwd = base;
  let chainUnresolved = false;
  let cdCount = 0;
  const matchedCwds = [];

  for (const seg of segments) {
    if (targetRe.test(seg)) {
      const cFlag = seg.match(CFLAG_SEGMENT_RE);
      if (cFlag) {
        const raw = stripQuotes(cFlag[1]);
        if (UNRESOLVED_VAR_RE.test(raw)) {
          matchedCwds.push({ path: null, unresolved: true });
        } else {
          matchedCwds.push({
            path: joinPath(chainUnresolved ? base : chainCwd, raw),
            unresolved: chainUnresolved,
          });
        }
      } else {
        matchedCwds.push({
          path: chainUnresolved ? null : chainCwd,
          unresolved: chainUnresolved,
        });
      }
    }

    const cdMatch = seg.match(CD_SEGMENT_RE);
    if (cdMatch) {
      cdCount++;
      const raw = stripQuotes(cdMatch[1]);
      if (UNRESOLVED_VAR_RE.test(raw)) {
        chainUnresolved = true;
      } else if (!chainUnresolved) {
        chainCwd = joinPath(chainCwd, raw);
      }
    }
  }

  if (matchedCwds.length === 0) {
    // targetRe no matcheó ningún segmento — no debería ocurrir si el guard
    // ya pre-filtró el comando completo, pero fail-closed por seguridad.
    return { resolved: null, ambiguous: true, candidates: [base], unsafe: false };
  }

  const multipleTargets = matchedCwds.length > 1;
  const anyUnresolved = matchedCwds.some((m) => m.unresolved || !m.path);
  const chainAmbiguous = cdCount > 1;

  if (!multipleTargets && !anyUnresolved && !chainAmbiguous) {
    return {
      resolved: matchedCwds[0].path,
      ambiguous: false,
      candidates: [matchedCwds[0].path],
      unsafe: false,
    };
  }

  // Ambiguo — evaluar TODOS los candidatos posibles (fail-closed): el repo
  // raíz, cada CWD de segmento matcheado y el mejor best-effort del chain.
  const candidates = [base];
  for (const m of matchedCwds) {
    if (m.path) candidates.push(m.path);
  }
  if (chainAmbiguous && !chainUnresolved) candidates.push(chainCwd);

  return { resolved: null, ambiguous: true, candidates: [...new Set(candidates)], unsafe: false };
}

/**
 * Resuelve el CWD efectivo de un comando Bash que puede contener
 * `cd X && ...` y/o `git -C X ...`.
 *
 * @param {string} command - comando bajo prueba (tool_input.command)
 * @param {string|undefined} inputCwd - input.cwd del payload PreToolUse, si viene
 * @param {RegExp} [targetRe] - regex que identifica la invocación real a
 *   validar (ej. GIT_COMMIT_RE, GIT_PUSH_RE, MR_CREATE_RE). Cuando se provee,
 *   se usa el algoritmo por segmentos (FIX R3b) que correlaciona el CWD con
 *   la invocación exacta en lugar del algoritmo legado global. Sin este
 *   parámetro se preserva el comportamiento legado sin cambios.
 * @returns {{ resolved: string|null, ambiguous: boolean, candidates: string[], unsafe: boolean, unsafeReason?: string, forceBlock?: boolean, base: string }}
 *   - resolved: ruta única si el parseo es inequívoco, o `null` si es ambiguo
 *   - ambiguous: true si hay más de un candidato válido a evaluar
 *   - candidates: lista de rutas a evaluar (incluye siempre al menos 1)
 *   - unsafe: true si el comando contiene una construcción de shell no
 *     parseable con certeza (subshell, brace group, command substitution,
 *     backtick, eval, pipe, popd) — R3c/R3d
 *   - unsafeReason: nombre de la construcción detectada, solo si unsafe=true
 *   - forceBlock: true si además de `unsafe`, no se pudo extraer NINGÚN
 *     `cd`/`pushd`/`-C` del comando — el guard debe bloquear SIEMPRE, sin
 *     importar si `base` está o no en rama protegida (R3c)
 *   - base: el CWD base resuelto (`inputCwd || process.cwd()`) ANTES de
 *     aplicar cualquier `cd`/`-C`/`pushd` — permite a los guards distinguir
 *     "resolved === base" (mono-repo, sin relocalización) de "resolved fue
 *     relocalizado mediante cd/-C/pushd" para el fail-closed de R3d ante
 *     fallo de resolución de rama
 */
export function resolveEffectiveCwd(command, inputCwd, targetRe) {
  const base = inputCwd || process.cwd();

  if (typeof command !== "string" || !command.trim()) {
    return { resolved: base, ambiguous: false, candidates: [base], unsafe: false, base };
  }

  // ---- R3c: camino fail-closed para construcciones no parseables ----
  const unsafeReason = detectUnsafeConstruct(command);
  if (unsafeReason) {
    const loose = collectLooseCandidates(command, base);
    const candidates = [...new Set([base, ...loose])];
    return {
      resolved: null,
      ambiguous: true,
      candidates,
      unsafe: true,
      unsafeReason,
      // Sin ningún cd/-C extraíble del comando, no hay forma de confiar en
      // que la acción corre en `base` — bloqueo incondicional.
      forceBlock: loose.length === 0,
      base,
    };
  }

  if (targetRe) {
    return { ...resolveForTarget(command, base, targetRe), unsafe: false, base };
  }

  // ---- Algoritmo legado (sin cambios — retrocompatible sin targetRe) ----

  // `git -C X` tiene prioridad sobre `cd X &&` (B1 — la spec del bug lo pide
  // explícitamente: "prioriza -C sobre cd").
  const cFlagRe = /\bgit\s+(?:(?:-c\s+\S+|--git-dir=\S+|--work-tree=\S+)\s+)*-C\s+(\S+)/g;
  const cMatches = [...command.matchAll(cFlagRe)].map((m) => stripQuotes(m[1]));

  if (cMatches.length > 0) {
    return { ...resolveFromSegments(cMatches, base), unsafe: false, base };
  }

  // `cd X && ...` / `cd X; ...` / `pushd X && ...` — soporta múltiples
  // `cd`/`pushd` encadenados (R3d: `pushd` reubica el cwd igual que `cd`).
  const cdRe = /\b(?:cd|pushd)\s+(\S+)\s*(?:&&|;)/g;
  const cdMatches = [...command.matchAll(cdRe)].map((m) => stripQuotes(m[1]));

  if (cdMatches.length > 0) {
    return { ...resolveFromSegments(cdMatches, base, { chain: true }), unsafe: false, base };
  }

  // Sin `cd`/`pushd` ni `-C`: comportamiento mono-repo actual — CWD = base.
  return { resolved: base, ambiguous: false, candidates: [base], unsafe: false, base };
}

/**
 * Resuelve el/los candidato(s) a partir de una lista de segmentos de ruta
 * capturados (de `-C` o de `cd` encadenados).
 *
 * Ambiguo si: hay más de un segmento (múltiples cd/-C — no hay forma
 * estática segura de saber cuál gana sin ejecutar el shell), o si el último
 * segmento contiene una variable de shell sin resolver (`$VAR`, `${VAR}`).
 */
function resolveFromSegments(segments, base, { chain = false } = {}) {
  const last = segments[segments.length - 1];
  const lastUnresolved = UNRESOLVED_VAR_RE.test(last);
  const multiple = segments.length > 1;

  if (!multiple && !lastUnresolved) {
    // Caso simple: un único `cd X &&` o `git -C X` sin variables — inequívoco.
    return { resolved: joinPath(base, last), ambiguous: false, candidates: [joinPath(base, last)] };
  }

  // Ambiguo — construir el mejor candidato posible (best-effort) además del
  // repo raíz (`base`), para que el guard evalúe AMBOS y falle cerrado.
  const candidates = [base];

  if (!lastUnresolved) {
    let guess = base;
    let guessValid = true;
    for (const seg of segments) {
      if (UNRESOLVED_VAR_RE.test(seg)) {
        guessValid = false;
        break;
      }
      guess = chain ? joinPath(guess, seg) : joinPath(base, seg);
    }
    if (guessValid) candidates.push(guess);
  }

  return { resolved: null, ambiguous: true, candidates: [...new Set(candidates)] };
}

/**
 * Detecta si el comando trae un prefijo inline `VAR=1` o `VAR=true` que
 * activaría un escape hatch — aunque ese prefijo NUNCA llega al proceso
 * Node del hook (se aplica al shell del comando bajo prueba, no al
 * proceso que ejecuta el hook). Documentado en el Bug B como gap conocido:
 * el escape hatch inline es detectable pero no debe tratarse como
 * autorización de sesión real — solo sirve para advertir al usuario.
 *
 * @param {string} command
 * @param {string} varName - nombre de la variable de entorno (ej. ASDD_GUARD_BRANCH_DISABLE)
 * @returns {boolean}
 */
export function parseInlineEnvVar(command, varName) {
  if (typeof command !== "string" || !varName) return false;
  const re = new RegExp(`(^|&&\\s*|;\\s*)${varName}=(1|true)\\b`);
  return re.test(command);
}
