function unquote(value, line) {
  if (!value) return "";
  const quote = value[0];
  if (quote !== '"' && quote !== "'") {
    if (/:(?:\s|$)/u.test(value)) {
      throw new Error(`line ${line}: plain scalar contains ": "; quote the value`);
    }
    return value;
  }
  if (value.at(-1) !== quote) throw new Error(`line ${line}: unterminated quoted scalar`);
  if (quote === '"') {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`line ${line}: invalid double-quoted scalar`);
    }
  }
  return value.slice(1, -1).replace(/''/g, "'");
}

function stripComment(value) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? null : quote ?? char;
      continue;
    }
    if (char === "#" && quote === null && (index === 0 || /\s/u.test(value[index - 1]))) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function parseInlineList(value, line) {
  const inner = value.slice(1, -1);
  if (!inner.trim()) return [];
  const items = [];
  let token = "";
  let quote = null;
  let escaped = false;
  for (const char of inner) {
    if (escaped) {
      token += char;
      escaped = false;
      continue;
    }
    if (quote === '"' && char === "\\") {
      token += char;
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? null : quote ?? char;
      token += char;
      continue;
    }
    if (char === "," && quote === null) {
      const item = stripComment(token).trim();
      if (!item) throw new Error(`line ${line}: empty inline-list item`);
      items.push(unquote(item, line));
      token = "";
      continue;
    }
    token += char;
  }
  if (quote !== null) throw new Error(`line ${line}: unterminated quote in inline list`);
  const item = stripComment(token).trim();
  if (!item) throw new Error(`line ${line}: empty inline-list item`);
  items.push(unquote(item, line));
  return items;
}

function parseValue(rawValue, line) {
  const value = stripComment(rawValue).trim();
  if (value === "") return { value: [], opensList: true };
  if (value.startsWith("[") || value.endsWith("]")) {
    if (!(value.startsWith("[") && value.endsWith("]"))) {
      throw new Error(`line ${line}: malformed inline list`);
    }
    return { value: parseInlineList(value, line), opensList: false };
  }
  return { value: unquote(value, line), opensList: false };
}

/**
 * Parser YAML mínimo, deliberadamente flat, para frontmatter ASDD.
 * Soporta scalars, listas inline y listas de bloque. Rechaza nesting y claves
 * duplicadas en vez de interpretar parcialmente una configuración normativa.
 */
export function parseFrontmatter(text) {
  const source = String(text);
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) return { ok: false, error: "missing frontmatter delimiters", data: {} };
  const data = {};
  const errors = [];
  let blockListKey = null;
  const lines = match[1].split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    const line = index + 1;
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (/^\s+-\s+/u.test(raw)) {
      if (blockListKey === null) {
        errors.push(`line ${line}: list item without an open list`);
        continue;
      }
      try {
        const item = stripComment(trimmed.slice(1)).trim();
        if (!item) throw new Error(`line ${line}: empty block-list item`);
        data[blockListKey].push(unquote(item, line));
      } catch (error) {
        errors.push(error.message);
      }
      continue;
    }

    blockListKey = null;
    if (/^\s/u.test(raw)) {
      errors.push(`line ${line}: nested mappings are not supported`);
      continue;
    }
    const keyValue = raw.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/u);
    if (!keyValue) {
      errors.push(`line ${line}: cannot parse "${trimmed}"`);
      continue;
    }
    const [, key, rawValue] = keyValue;
    if (Object.hasOwn(data, key)) {
      errors.push(`line ${line}: duplicate key "${key}"`);
      continue;
    }
    try {
      const parsed = parseValue(rawValue, line);
      data[key] = parsed.value;
      if (parsed.opensList) blockListKey = key;
    } catch (error) {
      errors.push(error.message);
    }
  }

  const content = source.slice(match[0].length);
  return errors.length
    ? { ok: false, error: errors.join("; "), data, content }
    : { ok: true, data, content };
}
