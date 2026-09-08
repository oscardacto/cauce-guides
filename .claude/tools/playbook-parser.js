#!/usr/bin/env node
/**
 * ATF — playbook-parser.js
 *
 * Parser deterministico para el catalogo de playbooks de precondicion
 * declarado en navigation-recipes.md (via convencion <!-- enricher-trigger -->).
 *
 * Lee el MD, strip code-fences, extrae bloques, parsea cada uno con un YAML
 * minimal (no requiere js-yaml — el formato es acotado y conocido). Exit 0 con
 * JSON valido en stdout, exit 1 con errores de parseo en stderr.
 *
 * Uso:
 *   node .claude/tools/playbook-parser.js <path-al-navigation-recipes.md>
 *   node .claude/tools/playbook-parser.js <path-al-md> --validate-only
 *
 * Consumidores:
 *   - cp-enricher-worker   (PASO 2e.2 — detectar playbooks aplicables a cada CP)
 *   - executor        (PASO R2.1.5 — resolver setup_steps en runtime)
 *
 * Schema del JSON de salida:
 *   [
 *     {
 *       id: "P1",                         // obligatorio, unico
 *       phase: "at_creation",              // obligatorio: at_creation|before_validation|after_validation
 *       confidence: "high",                // opcional, default "high": high|medium|low
 *       replaces: ["P1"],                  // opcional, default []
 *       extends: "P1",                     // opcional, default null
 *       specificity: 10,                   // opcional, default null (para resolver conflictos)
 *       action: "execute",                 // opcional, default "execute": execute|block
 *       patterns: ["texto 1", "texto 2"],  // obligatorio, >=1
 *       applies_when: "descripcion",        // opcional
 *       setup_steps: ["paso 1", ...],      // obligatorio si action=execute; ignorado si action=block
 *       verification: "criterio",           // opcional
 *       blocked_reason: "razon",            // solo si action=block
 *       variables: [{ name: "desc" }],     // opcional
 *       notes: ["nota 1", ...]             // opcional
 *     },
 *     ...
 *   ]
 *
 * Exit codes:
 *   0 — parse OK, catalogo valido en stdout
 *   1 — error de parseo, mensaje en stderr
 *   2 — argumentos invalidos
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* -- CLI -------------------------------------------------------------- */

function main(argv) {
  if (argv.length < 1) {
    console.error('Uso: node playbook-parser.js <path.md> [--validate-only]');
    process.exit(2);
  }

  const mdPath = argv[0];
  const validateOnly = argv.includes('--validate-only');

  if (!fs.existsSync(mdPath)) {
    console.error(`Archivo no encontrado: ${mdPath}`);
    process.exit(1);
  }

  let content;
  try {
    content = fs.readFileSync(mdPath, 'utf-8');
  } catch (e) {
    console.error(`Error leyendo ${mdPath}: ${e.message}`);
    process.exit(1);
  }

  const result = parsePlaybooks(content);

  if (result.errors.length > 0) {
    console.error('Errores de parseo:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.error(`WARN: ${w}`);
    }
  }

  if (validateOnly) {
    console.error(`OK: ${result.playbooks.length} playbooks valido(s)`);
    process.exit(0);
  }

  process.stdout.write(JSON.stringify(result.playbooks, null, 2) + '\n');
  process.exit(0);
}

/* -- Parseo principal ------------------------------------------------- */

function parsePlaybooks(content) {
  const errors = [];
  const warnings = [];

  // 1. Normalizar line endings (CRLF → LF) — CRITICO en Windows.
  const normalized = content.replace(/\r\n/g, '\n');

  // 2. Strip triple-backtick code fences (para ignorar ejemplos de la doc).
  //    Un fence es: ```...``` (multilinea). Reemplazamos con string vacio.
  const stripped = normalized.replace(/```[\s\S]*?```/g, '');

  // 3. Extraer bloques <!-- enricher-trigger ... -->.
  const blockRegex = /<!-- enricher-trigger\s*\n([\s\S]*?)\n-->/g;
  const blocks = [];
  let match;
  while ((match = blockRegex.exec(stripped)) !== null) {
    blocks.push(match[1]);
  }

  if (blocks.length === 0) {
    warnings.push('No se encontraron bloques enricher-trigger en el archivo');
    return { playbooks: [], errors, warnings };
  }

  // 4. Parsear cada bloque con parser YAML minimal.
  const playbooks = [];
  const seenIds = new Set();

  for (let i = 0; i < blocks.length; i++) {
    const blockIdx = i + 1;
    const parsed = parseBlock(blocks[i]);

    if (parsed.errors.length > 0) {
      for (const e of parsed.errors) {
        errors.push(`Bloque #${blockIdx}: ${e}`);
      }
      continue;
    }

    const pb = parsed.playbook;

    // Validar campos obligatorios.
    if (!pb.id) {
      errors.push(`Bloque #${blockIdx}: falta campo 'id'`);
      continue;
    }
    if (seenIds.has(pb.id)) {
      errors.push(`Bloque #${blockIdx}: id '${pb.id}' duplicado`);
      continue;
    }
    seenIds.add(pb.id);

    if (!pb.phase) {
      errors.push(`Playbook ${pb.id}: falta campo 'phase'`);
      continue;
    }
    const validPhases = ['at_creation', 'before_validation', 'after_validation'];
    if (!validPhases.includes(pb.phase)) {
      errors.push(
        `Playbook ${pb.id}: 'phase' invalida '${pb.phase}' (validos: ${validPhases.join(', ')})`
      );
      continue;
    }

    // Defaults.
    if (!pb.action) pb.action = 'execute';
    if (!pb.confidence) pb.confidence = 'high';
    if (!pb.replaces) pb.replaces = [];
    if (!pb.extends) pb.extends = null;
    if (pb.specificity === undefined) pb.specificity = null;

    // Validar action.
    if (!['execute', 'block'].includes(pb.action)) {
      errors.push(
        `Playbook ${pb.id}: 'action' invalida '${pb.action}' (validos: execute, block)`
      );
      continue;
    }

    // Validar confidence.
    if (!['high', 'medium', 'low'].includes(pb.confidence)) {
      errors.push(
        `Playbook ${pb.id}: 'confidence' invalida '${pb.confidence}' (validos: high, medium, low)`
      );
      continue;
    }

    // Validar patterns obligatorios.
    if (!pb.patterns || pb.patterns.length === 0) {
      errors.push(`Playbook ${pb.id}: 'patterns' requerido con al menos 1 entrada`);
      continue;
    }

    // Validar que setup_steps exista si action=execute (no si action=block).
    if (pb.action === 'execute' && (!pb.setup_steps || pb.setup_steps.length === 0)) {
      errors.push(`Playbook ${pb.id}: 'setup_steps' requerido cuando action=execute`);
      continue;
    }
    if (pb.action === 'block' && !pb.blocked_reason) {
      warnings.push(`Playbook ${pb.id}: action=block sin 'blocked_reason' — se usara string vacio`);
      pb.blocked_reason = '';
    }

    // Warning si confidence=low.
    if (pb.confidence === 'low') {
      warnings.push(`Playbook ${pb.id}: confidence=low — validar antes de ejecutar en masa`);
    }

    // Validar referencias cruzadas: replaces y extends deben apuntar a ids existentes o por existir.
    // (validacion post-parseo al final — permite orden libre en el MD)

    playbooks.push(pb);
  }

  // 5. Validacion cruzada: refs de replaces/extends apuntan a ids existentes.
  const allIds = new Set(playbooks.map(p => p.id));
  for (const pb of playbooks) {
    for (const refId of pb.replaces) {
      if (!allIds.has(refId)) {
        warnings.push(`Playbook ${pb.id}: replaces referencia id desconocido '${refId}'`);
      }
    }
    if (pb.extends && !allIds.has(pb.extends)) {
      warnings.push(`Playbook ${pb.id}: extends referencia id desconocido '${pb.extends}'`);
    }
  }

  return { playbooks, errors, warnings };
}

/* -- Parser YAML minimal por bloque ----------------------------------- */

/**
 * Parsea un bloque de texto con formato YAML simplificado:
 *   - Keys al inicio de linea (sin indentacion): identificador seguido de `:`
 *   - Valores inline: `key: value` o `key: [a, b, c]`
 *   - Valores multilinea con `:` solo → lista o mapa indentado con 2 espacios:
 *       key:
 *         - "item 1"
 *         - "item 2"
 *     o
 *       key:
 *         - name: "desc"
 *
 * Soporta comillas dobles en strings para escapar caracteres especiales.
 * No soporta YAML completo (anchors, multiline flow, etc.) — solo lo necesario
 * para los bloques enricher-trigger.
 */
function parseBlock(blockText) {
  const errors = [];
  const playbook = {};
  const lines = blockText.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Detectar key al inicio de linea (sin indentacion).
    const keyMatch = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!keyMatch) {
      // Linea indentada o invalida — ignorar, el parseo de la key previa ya lo consumio.
      i++;
      continue;
    }

    const key = keyMatch[1];
    const inlineValue = keyMatch[2];

    if (inlineValue !== '') {
      // Valor inline.
      playbook[key] = parseInlineValue(inlineValue);
      i++;
    } else {
      // Valor multilinea — leer lineas indentadas siguientes.
      const items = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim()) { i++; continue; }
        const itemMatch = next.match(/^\s+-\s+(.*)$/);
        if (!itemMatch) break; // termina la lista, proxima key.

        // Dos casos de item:
        //   1. "string entre comillas" → item simple
        //   2. name: "desc" → item como objeto {name, desc}
        const itemValue = itemMatch[1];
        const mapMatch = itemValue.match(/^([a-z_]+):\s*(.*)$/);
        if (mapMatch && !mapMatch[1].startsWith('"')) {
          // Item como objeto clave/valor (ej: variables: - var_name: "desc")
          items.push({ [mapMatch[1]]: parseInlineValue(mapMatch[2]) });
        } else {
          // Item string (quitar comillas si estan).
          items.push(parseInlineValue(itemValue));
        }
        i++;
      }
      playbook[key] = items;
    }
  }

  return { playbook, errors };
}

/**
 * Parsea un valor inline. Soporta:
 *   "texto con comillas"   → texto con comillas
 *   [a, b, c]              → array simple
 *   [P1]                   → array simple con 1 elemento
 *   texto sin comillas     → texto sin comillas
 *   (vacio)                → null
 */
function parseInlineValue(raw) {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  // Array: [a, b, c].
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map(s => stripQuotes(s.trim()));
  }

  // String con comillas dobles.
  return stripQuotes(trimmed);
}

function stripQuotes(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1);
  }
  return s;
}

/* -- Exports (para uso como libreria) --------------------------------- */

module.exports = {
  parsePlaybooks,
  parseBlock,
  parseInlineValue,
};

if (require.main === module) {
  main(process.argv.slice(2));
}
