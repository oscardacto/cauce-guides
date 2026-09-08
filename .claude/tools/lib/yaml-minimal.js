'use strict';

/**
 * ATF — yaml-minimal.js
 *
 * Parser YAML minimalista para archivos del framework (appweb.yaml, credentials.yaml,
 * config.yaml). Evita dependencia de `js-yaml` en un proyecto sin package-lock
 * trackeado.
 *
 * Soporta:
 *   - keys anidadas por indentación (2-space)
 *   - valores string (con o sin comillas)
 *   - booleans (true/false), null (`null`/`~`)
 *   - números (int/float)
 *   - arrays inline `[a, b, c]` y multilínea (`-` guiones)
 *   - comentarios `# ...`
 *
 * NO soporta: anchors, references, multi-line strings (`|`/`>`), merge keys.
 */

const fs = require('fs');

function coerce(s) {
  if (s === '') return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseYamlMinimal(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  const stack = [{ obj: root, indent: -1 }];
  let currentArrayKey = null;
  let currentArrayParent = null;

  for (const rawLine of lines) {
    let line = rawLine.replace(/(^|\s)#.*$/, '$1').replace(/\s+$/, '');
    if (!line.trim()) { currentArrayKey = null; continue; }
    const indent = line.match(/^ */)[0].length;
    line = line.slice(indent);

    if (line.startsWith('- ')) {
      const value = coerce(line.slice(2).trim());
      if (currentArrayKey && currentArrayParent) {
        if (!Array.isArray(currentArrayParent[currentArrayKey])) {
          currentArrayParent[currentArrayKey] = [];
        }
        currentArrayParent[currentArrayKey].push(value);
      }
      continue;
    }

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;

    const m = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const rest = m[2];

    if (rest === '') {
      const sub = {};
      parent[key] = sub;
      stack.push({ obj: sub, indent });
      currentArrayKey = key;
      currentArrayParent = parent;
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      parent[key] = inner
        ? inner.split(',').map(s => coerce(s.trim().replace(/^["']|["']$/g, '')))
        : [];
    } else {
      parent[key] = coerce(rest);
    }
  }
  return root;
}

function readYaml(fpath) {
  const text = fs.readFileSync(fpath, 'utf8');
  return parseYamlMinimal(text);
}

module.exports = { parseYamlMinimal, readYaml, coerce };
