#!/usr/bin/env node
/**
 * Mide el piso de contexto always-on del template ASDD contando bytes en disco.
 *
 * El framework declaraba `always_on_words: 8000` con stage `error` y no medía
 * nada contra él: `hook_injection_words` valía 0 (falso) y las descripciones de
 * skills, agents y commands —el rubro más caro— no figuraban ni en
 * `measured_components` ni en `unmeasured_components`. Esta herramienta cierra
 * ese hueco.
 *
 * Uso:
 *   node .claude/tools/measure-context-footprint.mjs            tabla
 *   node .claude/tools/measure-context-footprint.mjs --json     para CI
 *   node .claude/tools/measure-context-footprint.mjs --strict   exit 1 si excede
 *
 * La medición autoritativa de lo que el runtime carga sigue siendo `/context`
 * dentro del proyecto; acá se cuentan bytes de disco, que es lo reproducible.
 */
import { readdirSync, readFileSync, existsSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EOL } from "node:os";

// `| head` cierra el pipe antes de que terminemos de escribir: salir limpio, no crashear.
process.stdout.on("error", (error) => { if (error.code === "EPIPE") process.exit(0); throw error; });

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const p = (...parts) => join(ROOT, ...parts);
const read = (file) => readFileSync(file, "utf8");
const words = (text) => String(text).trim().split(/\s+/u).filter(Boolean).length;
const tokens = (chars) => Math.round(chars / 4);

const listFiles = (dir, filter) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, filter));
    else if (filter(entry.name)) out.push(full);
  }
  return out.sort();
};

/** Valor de `description:` del frontmatter. Sin dependencias: el frontmatter de
 *  este repo usa siempre una línea por clave y valor escalar. */
const frontmatterDescription = (text) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text);
  if (!match) return "";
  const line = /^description:\s*(.*)$/mu.exec(match[1]);
  if (!line) return "";
  return line[1].trim().replace(/^["'](.*)["']$/su, "$1");
};

const measureDescriptions = (files, { includeName = false } = {}) => {
  let chars = 0;
  let count = 0;
  const over = [];
  for (const file of files) {
    const description = frontmatterDescription(read(file));
    if (!description) continue;
    // Skills viven en `{slug}/SKILL.md` -- el nombre util es el directorio padre.
    // Agents y commands son archivos sueltos -- el nombre util es el propio archivo.
    // `slice(-2)[0]` daba el directorio padre siempre, que para agents/commands es
    // "agents" o "sofka-asdd": un ofensor sin nombrar en modo --strict (M2).
    const base = basename(file, ".md");
    const name = base === "SKILL" ? relative(ROOT, file).split(sep).slice(-2)[0] : base;
    chars += description.length + (includeName ? name.length : 0);
    count += 1;
    over.push({ name, chars: description.length });
  }
  return { chars, count, items: over };
};

const skillFiles = existsSync(p(".claude/skills"))
  ? readdirSync(p(".claude/skills"), { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(p(".claude/skills", e.name, "SKILL.md")))
      .map((e) => p(".claude/skills", e.name, "SKILL.md")).sort()
  : [];
const agentFiles = listFiles(p(".claude/agents"), (n) => n.endsWith(".md"));
const commandFiles = listFiles(p(".claude/commands"), (n) => n.endsWith(".md"));
const ruleFiles = listFiles(p(".claude/rules"), (n) => n.endsWith(".md"));

const literalChars = (source) => {
  let chars = 0;
  for (const literal of source.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*)\1/gu)) chars += literal[2].length;
  return chars;
};

/** Cuerpo de un bloque abierto en `start` y cerrado por el primer `}` a su misma sangría. */
const blockBody = (lines, start, indent = "  ") => {
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === `${indent}}` || line.startsWith(`${indent}} `)) break;
    body.push(line);
  }
  return body.join("\n");
};

/** Guardas de rama por señal, incluida la continuación `} else if`. */
const SIGNAL_BLOCK_RE = /^ {2}(?:\} else )?if \(profile\.signals\.includes\("([\w-]+)"\)\) \{$/u;

/** Señales que no pueden coincidir en un mismo turno: se cobra la mayor, no la suma. */
const EXCLUSIVE_SIGNAL_GROUPS = [
  // `classifyApprovalIntent` devuelve un solo intent, y la elegibilidad solo
  // aplica cuando no hubo ninguno.
  ["plan-approved", "plan-rejected", "plan-amended", "plan-approval-eligible"],
  // Cadena `if / else if / else if` en el propio inyector.
  ["data", "software", "data-software-ambiguity"],
];

/**
 * Inyección de los hooks, medida por rama y no por suma.
 *
 * El conteo anterior recorría solo `push(` con literales y sumaba todas las ramas de
 * `sofka-asdd-user-prompt-submit.mjs` como si dispararan en el mismo turno. Erraba en
 * las dos direcciones: sobrecontaba ramas mutuamente excluyentes, y no veía `nucleoOrc`
 * ni `getDeterministicRouteReminder` —los dos bloques que SÍ entran en todo turno
 * no-TRIVIAL— porque viven en un `const [...]` y se inyectan por `unshift`.
 *
 * No se mide ejecutando el hook: `issueDirectLightAuthorization` escribe una autorización
 * en disco, y una herramienta de medición no puede acuñar autorizaciones. El análisis es
 * estático, y `unclassified` es la guarda contra deriva: si el hook consulta una señal que
 * este medidor no ubicó, el número deja de ser confiable y hay que decirlo, no callarlo.
 */
const measureHookInjection = ({
  sessionStart = p(".claude/hooks/sofka-asdd-session-start-dispatcher.mjs"),
  promptSubmit = p(".claude/hooks/sofka-asdd-user-prompt-submit.mjs"),
} = {}) => {
  const empty = { session: 0, perTurn: 0, conditional: 0, unclassified: [] };

  if (existsSync(sessionStart)) {
    for (const call of read(sessionStart).matchAll(/(?:lines|reminders)\.push\(([\s\S]*?)\);/gu)) {
      empty.session += literalChars(call[1]);
    }
  }
  if (!existsSync(promptSubmit)) {
    return { chars: empty.session, count: existsSync(sessionStart) ? 1 : 0, breakdown: empty };
  }

  const source = read(promptSubmit);
  const lines = source.split("\n");

  // Incondicional por turno no-TRIVIAL: solo `getDeterministicRouteReminder`. `nucleoOrc`
  // NO entra acá — el hook lo inyecta bajo `if (profile.mode === "full")` (reinyección
  // explícita, no cada turno), así que se cuenta aparte, del lado condicional, junto al
  // resto de las ramas por señal. Contarlo como incondicional sobreestimaba el costo del
  // turno típico en 315 de 613 palabras.
  //
  // Detección por forma exacta: si el nombre o la forma del bloque cambia (ej. `nucleoOrc`
  // → `orcCore`), el regex deja de matchear y ese bloque cae en silencio a 0 — sin la
  // guarda de abajo, nada lo avisa.
  const routeFn = /export function getDeterministicRouteReminder\(prompt\) \{([\s\S]*?)\n\}/u.exec(source);
  const nucleo = /const nucleoOrc = \[([\s\S]*?)\n {2}\];/u.exec(source);
  const perTurn = routeFn ? literalChars(routeFn[1]) : 0;
  const modeFullReinjection = nucleo ? literalChars(nucleo[1]) : 0;
  const unmatchedPatterns = [];
  if (!routeFn) unmatchedPatterns.push("getDeterministicRouteReminder");
  if (!nucleo) unmatchedPatterns.push("nucleoOrc");

  // Condicionales, una entrada por señal.
  const bySignal = new Map();
  for (const [index, line] of lines.entries()) {
    const match = SIGNAL_BLOCK_RE.exec(line);
    if (match) bySignal.set(match[1], (bySignal.get(match[1]) ?? 0) + literalChars(blockBody(lines, index)));
  }
  const consulted = new Set([...source.matchAll(/signals\.includes\("([\w-]+)"\)/gu)].map((m) => m[1]));
  const unclassified = [...consulted].filter((signal) => !bySignal.has(signal)).sort();

  let conditional = 0;
  const grouped = new Set();
  for (const group of EXCLUSIVE_SIGNAL_GROUPS) {
    let worst = 0;
    for (const signal of group) {
      grouped.add(signal);
      worst = Math.max(worst, bySignal.get(signal) ?? 0);
    }
    conditional += worst;
  }
  for (const [signal, chars] of bySignal) if (!grouped.has(signal)) conditional += chars;

  // No es una señal del profile, pero se inyecta por el mismo camino.
  const directLight = lines.indexOf("  if (directLightAuthorization) {");
  if (directLight !== -1) conditional += literalChars(blockBody(lines, directLight));

  // `nucleoOrc` es condicional a `profile.mode === "full"`, no a una señal — se suma acá
  // como su propia rama, igual que directLight arriba.
  conditional += modeFullReinjection;

  return {
    chars: empty.session + perTurn + conditional,
    count: 2,
    breakdown: { session: empty.session, perTurn, conditional, unclassified, unmatchedPatterns },
  };
};

/**
 * El cuerpo del reporte vive en `main()` para que el archivo se pueda importar sin
 * ejecutarse: `test-context-footprint.mjs` importa `measureHookInjection` y la corre
 * contra fixtures propios. Sin esta guarda, importarlo imprimiria la tabla.
 */
function main() {
  const skills = measureDescriptions(skillFiles, { includeName: true });
  const agents = measureDescriptions(agentFiles);
  const commands = measureDescriptions(commandFiles);
  const rulesChars = ruleFiles.reduce((sum, file) => sum + read(file).length, 0);
  const rulesWords = ruleFiles.reduce((sum, file) => sum + words(read(file)), 0);
  const claudeMd = existsSync(p("CLAUDE.md")) ? read(p("CLAUDE.md")) : "";
  const hooks = measureHookInjection();

  const components = [
    { id: "claude_md", label: "CLAUDE.md", count: claudeMd ? 1 : 0, chars: claudeMd.length, words: words(claudeMd) },
    { id: "always_on_rules", label: ".claude/rules/", count: ruleFiles.length, chars: rulesChars, words: rulesWords },
    { id: "skill_descriptions", label: "descripciones de skills", count: skills.count, chars: skills.chars, words: words(skillFiles.map((f) => frontmatterDescription(read(f))).join(" ")) + skills.count },
    { id: "agent_descriptions", label: "descripciones de agents", count: agents.count, chars: agents.chars, words: words(agentFiles.map((f) => frontmatterDescription(read(f))).join(" ")) },
    { id: "command_descriptions", label: "descripciones de commands", count: commands.count, chars: commands.chars, words: words(commandFiles.map((f) => frontmatterDescription(read(f))).join(" ")) },
    { id: "hook_injection", label: "inyección de hooks (peor turno)", count: hooks.count, chars: hooks.chars, words: Math.round(hooks.chars / 6) },
  ];

  const totalWords = components.reduce((sum, c) => sum + c.words, 0);
  const totalChars = components.reduce((sum, c) => sum + c.chars, 0);

  const budget = (() => {
    try { return JSON.parse(read(p(".sofka-asdd/context-budget.json"))); } catch { return null; }
  })();
  // El piso completo se mide y se reporta, pero NO tiene techo declarado, y es deliberado:
  // esto es un marco agentico, y cuanto piso es aceptable depende del alcance que el proyecto
  // instale. Un numero inventado obliga a justificar cada palabra sin haber decidido nada.
  // El unico target con limite es `always_on_core_words` (CLAUDE.md + .claude/rules/**), que
  // enforza el validador via el check `context-budget`. Si algun dia se decide un techo para
  // el piso, alcanza con agregar `always_on_floor_words` a `targets` y esto lo toma solo.
  const limit = budget?.targets?.always_on_floor_words?.limit ?? null;
  const stage = budget?.targets?.always_on_floor_words?.stage ?? "warning";
  const ratio = limit ? totalWords / limit : null;

  const descriptionTargets = [
    ["skill_description_chars", skills.items],
    ["agent_description_chars", agents.items],
    ["command_description_chars", commands.items],
  ];
  const violations = [];
  for (const [key, items] of descriptionTargets) {
    const target = budget?.targets?.[key];
    if (!target || typeof target.limit !== "number") continue;
    for (const item of items) {
      if (item.chars > target.limit) violations.push({ target: key, name: item.name, chars: item.chars, limit: target.limit });
    }
  }
  if (limit && totalWords > limit) violations.push({ target: "always_on_floor_words", words: totalWords, limit, stage });
  // Una señal que el hook consulta y el medidor no ubicó invalida el número: es un hallazgo,
  // no una nota al pie.
  for (const signal of hooks.breakdown.unclassified) {
    violations.push({ target: "hook_injection_unclassified", name: signal, chars: 0, limit: 0 });
  }
  // Guarda contra deriva de forma: un patrón que dejó de matchear socava el número tanto
  // como una señal no clasificada — mismo tratamiento, mismo exit code en --strict.
  for (const pattern of hooks.breakdown.unmatchedPatterns ?? []) {
    violations.push({ target: "hook_injection_pattern_not_found", name: pattern, chars: 0, limit: 0 });
  }

  const args = new Set(process.argv.slice(2));
  if (args.has("--json")) {
    process.stdout.write(`${JSON.stringify({ components, total: { words: totalWords, chars: totalChars, tokens: tokens(totalChars) }, limit, ratio, violations }, null, 2)}${EOL}`);
  } else {
    const pad = (value, width) => String(value).padStart(width);
    const rows = [
      ["componente", "n", "palabras", "~tokens"],
      ...components.map((c) => [c.label, c.count, c.words, tokens(c.chars)]),
      ["TOTAL", "", totalWords, tokens(totalChars)],
    ];
    const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => String(r[i]).length)));
    for (const [index, row] of rows.entries()) {
      process.stdout.write(`${String(row[0]).padEnd(widths[0])}  ${pad(row[1], widths[1])}  ${pad(row[2], widths[2])}  ${pad(row[3], widths[3])}${EOL}`);
      if (index === 0) process.stdout.write(`${"-".repeat(widths.reduce((a, b) => a + b, 0) + 6)}${EOL}`);
    }
    if (limit) {
      process.stdout.write(`${EOL}Límite declarado: ${limit} palabras (stage ${stage}) — actual ${totalWords} (${ratio.toFixed(2)}x)${EOL}`);
    } else {
      process.stdout.write(`${EOL}Piso completo: ${totalWords} palabras. Sin techo declarado, a propósito — cuánto piso es aceptable depende del alcance que el proyecto instale.${EOL}`);
      process.stdout.write(`El único límite vigente es \`always_on_core_words\` (CLAUDE.md + .claude/rules/**), que enforza el validador.${EOL}`);
    }
    for (const violation of violations) {
      process.stdout.write(`  · ${violation.target}: ${violation.name ?? ""} ${violation.chars ?? violation.words} > ${violation.limit}${EOL}`);
    }
    const { session, perTurn, conditional, unclassified, unmatchedPatterns } = hooks.breakdown;
    const w = (chars) => Math.round(chars / 6);
    process.stdout.write(`${EOL}Inyección de hooks, desglosada — SessionStart ${w(session)} (una vez por sesión) · incondicional por turno no-TRIVIAL ${w(perTurn)} · peor combinación condicional ${w(conditional)}.${EOL}`);
    process.stdout.write(`Las ramas mutuamente excluyentes se cobran por la mayor, no sumadas: ningún turno las recibe todas.${EOL}`);
    if (unclassified.length) {
      process.stdout.write(`AVISO: señales consultadas por el hook que este medidor no ubicó: ${unclassified.join(", ")}. El total quedó corto.${EOL}`);
    }
    if (unmatchedPatterns?.length) {
      process.stdout.write(`AVISO: patrones incondicionales que este medidor no encontró en el hook (renombre o cambio de forma): ${unmatchedPatterns.join(", ")}. El total quedó corto.${EOL}`);
    }
    process.stdout.write(`${EOL}Medición autoritativa de lo que carga el runtime: /context dentro del proyecto.${EOL}`);
  }

  if (args.has("--strict") && violations.length) process.exit(1);
}

// `import.meta.url` ya viene con los symlinks resueltos; `argv[1]` no. En macOS el temp
// vive bajo /var -> /private/var y la comparacion cruda falla en silencio.
const invoked = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : null;
if (invoked === import.meta.url) main();

export { measureHookInjection, literalChars, blockBody, EXCLUSIVE_SIGNAL_GROUPS };
