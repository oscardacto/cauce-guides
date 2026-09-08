// -----------------------------------------------------------------------------
// .claude/scripts/lib/asdd-approval-intent-lib.mjs
//
// Clasificador determinista de la respuesta del usuario ante un plan ORC-010.
//
// DISEÑO: no se enumeran palabras. Una lista cerrada de afirmativas reproduce el
// bug original con una lista más larga ("obvio", "de una", "joya", "va" quedan
// afuera igual). Se reconoce por RAÍZ morfológica — una raíz cubre todas sus
// flexiones — y la cola larga se resuelve con `eligible` (el orquestador juzga,
// el hook restringe), nunca agrandando la lista.
//
// ASIMETRÍA QUE GOBIERNA EL DISEÑO: un falso negativo cuesta un turno de
// fricción; un falso positivo ejecuta un plan que el usuario no aprobó. Por eso
// el reconocimiento es generoso ante afirmaciones cortas y puras, y estricto
// apenas aparece negación, condición o instrucción nueva.
//
// Referencia: ORC-010 / ORC-010-E (asdd-orchestration-plan-gate.md).
// -----------------------------------------------------------------------------

// Máximo de tokens significativos que puede tener una afirmación pura. Por
// encima, el prompt trae instrucciones nuevas y nunca aprueba.
const MAX_APPROVAL_TOKENS = 8;
// Techo más bajo para la cola larga: solo un prompt muy corto puede quedar
// elegible para que el orquestador lo interprete.
const MAX_ELIGIBLE_TOKENS = 4;
const MAX_PROMPT_CHARS = 200;

// Raíces afirmativas. Cada entrada matchea el token COMPLETO ya normalizado.
export const AFFIRMATIVE_STEMS = [
  /^aprob(ado|ada|o|as|a|e|ar|emos|ala|alo)?$/,
  /^apruebo$/,
  /^autoriz(o|ado|ada|a|ar|alo)?$/,
  /^confirm(o|ado|ada|a|ar|alo|ed)?$/,
  /^proced(e|er|emos|amos|a|an|elo)?$/,
  /^proceed$/,
  /^continu(a|ar|emos|o|e)?$/,
  /^continue$/,
  /^avanz(a|ar|amos|o|emos)?$/,
  /^ejecut(a|ar|alo|amos|o)?$/,
  /^sig(ue|uelo|amos|an)$/,
  /^seg(ui|uimos|uilo)$/,
  /^adelante$/,
  /^dale$/,
  /^ok(ay|as|is)?$/,
  /^vale$/,
  /^si$/,
  /^claro$/,
  /^obvio$/,
  /^correcto$/,
  /^exacto$/,
  /^perfecto$/,
  /^genial$/,
  /^joya$/,
  /^barbaro$/,
  /^buenisimo$/,
  /^listo$/,
  /^bien$/,
  /^bueno$/,
  /^acuerdo$/,
  /^ha(z|ce)lo$/,
  /^andale$/,
  /^una$/,
  /^yes$/,
  /^yep$/,
  /^yeah$/,
  /^sure$/,
  /^go$/,
  /^approv(e|ed)$/,
  /^lgtm$/,
  /^ship$/,
];

// Muletillas y conectores que acompañan una afirmación sin agregar intención.
export const FILLER_STEMS = [
  /^por$/, /^favor$/, /^please$/, /^gracias$/, /^thanks$/, /^ya$/, /^entonces$/,
  /^then$/, /^pues$/, /^y$/, /^de$/, /^esta$/, /^todo$/, /^me$/, /^parece$/,
  /^ahead$/, /^it$/, /^lets$/, /^nomas$/, /^eso$/, /^asi$/, /^tal$/, /^cual$/,
];

// Rechazos explícitos. Solo cuentan en posición inicial (ver clasificador).
export const REJECTION_STEMS = [
  /^no$/, /^nel$/, /^nope$/, /^nunca$/, /^negativo$/,
  /^cancel(a|ar|alo|o|emos)?$/, /^abort(a|ar|o|alo)?$/,
  /^deten(e|te|ete|er|elo)?$/, /^par(a|ale|emos)$/, /^stop$/,
  /^olvidalo$/, /^dejalo$/,
];

// Marcadores de corrección: el usuario acepta pero cambia algo. Ganan sobre
// cualquier afirmación presente en el mismo prompt.
export const MODIFICATION_MARKERS = [
  /^pero$/, /^aunque$/, /^antes$/, /^primero$/, /^salvo$/, /^excepto$/,
  /^mejor$/, /^cambi(a|ar|alo|o|ale|emos)$/, /^corrig(e|elo|iendo)$/,
  /^correg(i|ilo|ir)$/, /^sac(a|alo|ar|ale)$/, /^quit(a|alo|ar|ale)$/,
  /^agreg(a|alo|ar|ale|ame)$/, /^sum(a|alo|ar|ale|ame)$/,
  /^ajust(a|alo|ar|ale)$/, /^reemplaz(a|ar|alo)$/, /^evit(a|ar|alo)$/,
];

// Frases de dos palabras que sí o sí cambian la intención y no sobreviven a la
// tokenización simple.
// Afirmaciones que solo existen como frase: tokenizadas colisionan con otras
// listas ("cual" es interrogativo, pero "tal cual" es un sí).
export const AFFIRMATIVE_PHRASES = [
  /^tal cual$/, /^de una$/, /^me parece bien$/, /^todo bien$/,
  /^asi esta bien$/, /^asi va$/, /^esta bien$/, /^como digas$/,
];

// Un pulgar arriba solo es una aprobación: la normalización borra el emoji y
// dejaría el prompt vacío, así que se evalúa sobre el texto crudo.
export const AFFIRMATIVE_EMOJI = /[\u{1F44D}\u{1F44C}\u{2705}\u{1F197}\u{1F4AF}\u{1F64C}\u{1F44F}\u{1F919}]/u;

// Rechazos de dos palabras que la tokenización simple clasificaría como
// corrección ("mejor" es marcador de modificación, pero "mejor no" es un no).
const REJECTION_PHRASES = [/\bmejor no\b/, /\btodavia no\b/, /\baun no\b/, /\bpor ahora no\b/];

const MODIFICATION_PHRASES = [
  /\ben vez\b/, /\ben lugar\b/, /\bsin el\b/, /\bsin la\b/, /\bsin los\b/,
  /\bsin las\b/, /\bno hagas\b/, /\bno uses\b/,
];

// Un prompt corto puede ser una petición ("contame algo", "qué hace X") y no
// una respuesta al plan. Cualquier interrogativo o verbo de petición cancela la
// elegibilidad: la cola larga son interjecciones ("brutal", "va"), no pedidos.
const REQUEST_STEMS = [
  /^que$/, /^como$/, /^donde$/, /^cual(es)?$/, /^cuando$/, /^cuanto(s|a|as)?$/,
  /^quien(es)?$/, /^porque$/, /^what$/, /^how$/, /^why$/, /^where$/, /^which$/,
  /^cont(a|ame|anos|alo|ar)$/, /^explic(a|ame|anos|ar|alo)$/,
  /^dec(i|ime|inos|ir|ilo)$/, /^mostr(a|ame|anos|ar|alo)$/, /^dame$/, /^damelo$/,
  /^hac(e|eme|elo|er)$/, /^haz(me|lo)?$/, /^revis(a|ame|alo|ar)$/,
  /^mir(a|ame|alo|ar)$/, /^busc(a|ame|alo|ar)$/, /^le(e|eme|elo|er)$/,
  /^analiz(a|ame|alo|ar)$/, /^ayud(a|ame|ar)$/, /^pod(es|rias)$/, /^quiero$/,
  /^necesito$/, /^tell$/, /^show$/, /^explain$/,
];

// Señales de que el prompt trae trabajo nuevo, no una respuesta al plan.
const INSTRUCTION_SIGNALS = [
  /(?:^|\s)(?:[\w.-]+\/)+[\w.-]+/,          // rutas
  /\b[\w.-]+\.(?:js|mjs|ts|tsx|jsx|py|java|go|md|json|ya?ml)\b/i, // archivos
  /`[^`]+`/,                                  // código citado
  /\$\s*\w/,                                  // comandos
  /\?/,                                       // preguntas
];

const matchesAny = (patterns, token) => patterns.some((pattern) => pattern.test(token));

// NFD + strip de diacríticos, minúsculas, strip de emoji y puntuación.
// "Sí, procedé!! 👍" → "si procede"
export function normalizeApprovalPrompt(prompt) {
  return String(prompt ?? "")
    .slice(0, MAX_PROMPT_CHARS)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NONE = Object.freeze({ intent: "none", eligible: false, affirmativePrefix: false });

/**
 * Clasifica la respuesta del usuario ante un plan presentado.
 *
 * @returns {{ intent: "approval"|"rejection"|"modification"|"none",
 *             eligible: boolean, affirmativePrefix: boolean }}
 *   - `eligible` marca la cola larga: prompt corto, sin negación ni corrección
 *     ni instrucción, que el orquestador puede interpretar como aprobación
 *     ejecutando `plan-authorization.mjs approve --challenge-id`.
 *   - `affirmativePrefix` distingue "ok pero X" (aprobó con corrección) de
 *     "cambiá el paso 2" (solo corrección).
 */
export function classifyApprovalIntent(prompt) {
  const raw = String(prompt ?? "");
  const normalized = normalizeApprovalPrompt(raw);
  if (!normalized) {
    return AFFIRMATIVE_EMOJI.test(raw)
      ? { intent: "approval", eligible: false, affirmativePrefix: true }
      : NONE;
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const affirmativePrefix = matchesAny(AFFIRMATIVE_STEMS, tokens[0]);

  if (REJECTION_PHRASES.some((phrase) => phrase.test(normalized))) {
    return { intent: "rejection", eligible: false, affirmativePrefix: false };
  }

  // Una corrección gana sobre cualquier afirmación del mismo prompt:
  // "ok pero sacá el paso 2" NO aprueba.
  if (MODIFICATION_PHRASES.some((phrase) => phrase.test(normalized))
    || tokens.some((token) => matchesAny(MODIFICATION_MARKERS, token))) {
    return { intent: "modification", eligible: false, affirmativePrefix };
  }

  // El rechazo solo cuenta al inicio: "no" abre la respuesta, no la decora.
  if (matchesAny(REJECTION_STEMS, tokens[0])) {
    return { intent: "rejection", eligible: false, affirmativePrefix: false };
  }

  if (matchesAny(AFFIRMATIVE_PHRASES, normalized)) {
    return { intent: "approval", eligible: false, affirmativePrefix: true };
  }

  // Prompt largo: trae instrucciones nuevas aunque empiece con "ok".
  if (tokens.length > MAX_APPROVAL_TOKENS) return NONE;

  const affirmatives = tokens.filter((token) => matchesAny(AFFIRMATIVE_STEMS, token));
  const known = tokens.every((token) =>
    matchesAny(AFFIRMATIVE_STEMS, token) || matchesAny(FILLER_STEMS, token));
  if (affirmatives.length > 0 && known) {
    return { intent: "approval", eligible: false, affirmativePrefix: true };
  }

  // Cola larga: corto, limpio y sin señales de trabajo nuevo. El hook no lo
  // aprueba — solo habilita que el orquestador lo interprete (ORC-010-E).
  const eligible = tokens.length <= MAX_ELIGIBLE_TOKENS
    && !tokens.some((token) => matchesAny(REQUEST_STEMS, token))
    && !INSTRUCTION_SIGNALS.some((signal) => signal.test(raw));
  return { intent: "none", eligible, affirmativePrefix };
}
