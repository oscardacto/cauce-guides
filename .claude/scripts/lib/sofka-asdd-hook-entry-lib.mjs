// Lectura uniforme de una entrada de hook de settings.json.
//
// Claude Code admite dos formas para `type: "command"`:
//
//   forma shell : { "command": "node ${CLAUDE_PROJECT_DIR}/.claude/hooks/x.mjs" }
//   forma exec  : { "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/x.mjs"] }
//
// La forma exec es la preferida por la documentación oficial ("Handling Paths
// with Spaces"): el programa se lanza directamente, sin pasar por shell, por lo
// que una ruta de proyecto con espacios no se parte por whitespace. Este módulo
// existe para que validador, harness y utilidades acepten AMBAS formas sin
// duplicar lógica y sin reintroducir el split por espacios.

const TOKEN = /\$\{?CLAUDE_PROJECT_DIR\}?/g;

/** true si la entrada es un hook de comando utilizable. */
export function isCommandHook(hook) {
  return Boolean(hook) && hook.type === "command" && typeof hook.command === "string";
}

/**
 * Representación textual de la entrada (`command` + `args`) para matching por
 * regex — registro de hooks, filtros por nombre, asserts de tests. NO usar para
 * ejecutar: para eso está `hookEntryTokens`.
 */
export function hookEntryRef(hook) {
  if (!isCommandHook(hook)) return "";
  const parts = [hook.command];
  if (Array.isArray(hook.args)) {
    for (const arg of hook.args) if (typeof arg === "string") parts.push(arg);
  }
  return parts.filter((part) => part.length > 0).join(" ");
}

/**
 * Tokens listos para `spawn(file, args)` con `CLAUDE_PROJECT_DIR` ya expandido.
 *
 * - Forma exec: se respeta `args` tal cual; no hay tokenización posible que
 *   pueda partir una ruta con espacios.
 * - Forma shell (compatibilidad hacia atrás): se separa únicamente el primer
 *   token (el ejecutable) y el resto se pasa como UN argumento. Así una ruta con
 *   espacios sobrevive, a diferencia de un `split(/\s+/)` completo.
 */
export function hookEntryTokens(hook, projectDir) {
  if (!isCommandHook(hook)) return null;
  const expand = (value) => value.replace(TOKEN, projectDir);
  if (Array.isArray(hook.args)) {
    return { file: expand(hook.command), args: hook.args.map(expand) };
  }
  const expanded = expand(hook.command).trim();
  const split = expanded.search(/\s/);
  if (split < 0) return { file: expanded, args: [] };
  return { file: expanded.slice(0, split), args: [expanded.slice(split).trim()] };
}
