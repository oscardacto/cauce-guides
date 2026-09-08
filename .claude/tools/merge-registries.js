#!/usr/bin/env node
/**
 * ATF — Merge/actualización incremental de registros JSON.
 *
 * Uso:
 *   node .claude/tools/merge-registries.js \
 *     --base    <archivo_existente>   (puede no existir → se inicializa vacío) \
 *     --new     <archivo_nuevo>       (datos a incorporar) \
 *     --mode    <modo>                (ver abajo) \
 *     --output  <archivo_salida>      (puede ser igual al --base para actualizar in-place) \
 *     [--field  <campo>]              (solo para modos map_merge y array_append)
 *
 * Modos disponibles:
 *
 *   map_merge      — Merge de dos mapas clave→objeto.
 *                    Si --field está indicado, opera sobre base[field] vs new[field].
 *                    Por cada clave en new: si existe en base → deepMerge (preserva campos
 *                    no presentes en new, como execution_history); si nueva → insertar.
 *                    Metadata del base (updated_at, last_run_id, etc.) se preserva;
 *                    la del new sobreescribe si está presente.
 *                    Uso típico: cp_registry.json
 *
 *   array_append   — Append de array.
 *                    Si --field está indicado, opera sobre base[field] vs new[field].
 *                    Sin --field: los archivos raíz deben ser arrays.
 *                    Uso típico: module_verdicts.json → field "verdicts"
 *
 *   shallow_merge  — Merge superficial de objetos raíz (new sobreescribe keys de base).
 *                    Uso típico: session_context.json, parcheado de campos top-level
 *
 * Ejemplos de uso desde agentes:
 *
 *   # Actualizar cp_registry.json con nuevos CPs del módulo
 *   node .claude/tools/merge-registries.js \
 *     --base   .claude/agent-memory/{APP}/cp_registry.json \
 *     --new    /tmp/new_cps_registry_fragment.json \
 *     --mode   map_merge \
 *     --field  cps \
 *     --output .claude/agent-memory/{APP}/cp_registry.json
 *
 *   # Append de veredicto a module_verdicts.json
 *   node .claude/tools/merge-registries.js \
 *     --base   .claude/agent-memory/{APP}/module_verdicts.json \
 *     --new    /tmp/new_verdict.json \
 *     --mode   array_append \
 *     --field  verdicts \
 *     --output .claude/agent-memory/{APP}/module_verdicts.json
 *
 * Exit codes: 0 = OK | 1 = error
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function die(msg) {
  console.error(`❌ merge-registries: ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--base':   opts.base   = args[++i]; break;
      case '--new':    opts.newFile = args[++i]; break;
      case '--mode':   opts.mode   = args[++i]; break;
      case '--field':  opts.field  = args[++i]; break;
      case '--output': opts.output = args[++i]; break;
      default:
        console.warn(`⚠️  Argumento desconocido ignorado: ${args[i]}`);
    }
  }
  return opts;
}

/**
 * Deep merge de dos objetos planos.
 * Las claves de `incoming` sobreescriben las de `base` salvo cuando AMBAS son
 * objetos no-array: en ese caso se fusionan recursivamente.
 * Arrays se tratan como valores atómicos (incoming reemplaza base).
 */
function deepMerge(base, incoming) {
  const result = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    const bv = result[k];
    if (
      v !== null && typeof v === 'object' && !Array.isArray(v) &&
      bv !== null && typeof bv === 'object' && !Array.isArray(bv)
    ) {
      result[k] = deepMerge(bv, v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    die(`Error al leer ${filePath}: ${e.message}`);
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/* ─── Modos ───────────────────────────────────────────────────────────────── */

/**
 * map_merge: Fusiona dos mapas {key → object}.
 * Para cada entrada en incomingMap:
 *   - Si existe en baseMap → deepMerge (preserva campos como execution_history)
 *   - Si no existe         → insertar como nueva
 * Retorna stats { added, updated, total }.
 */
function mergeMap(baseMap, incomingMap) {
  const result = { ...baseMap };
  let added = 0, updated = 0;

  for (const [key, val] of Object.entries(incomingMap)) {
    if (result[key] !== undefined) {
      result[key] = deepMerge(result[key], val);
      updated++;
    } else {
      result[key] = val;
      added++;
    }
  }

  return { map: result, stats: { added, updated, total: Object.keys(result).length } };
}

/* ─── Main ────────────────────────────────────────────────────────────────── */

function main() {
  const opts = parseArgs();

  if (!opts.newFile || !opts.output || !opts.mode) {
    die('Argumentos requeridos: --new <file> --mode <mode> --output <file>\n' +
        'Modos: map_merge | array_append | shallow_merge');
  }

  const VALID_MODES = ['map_merge', 'array_append', 'shallow_merge'];
  if (!VALID_MODES.includes(opts.mode)) {
    die(`Modo "${opts.mode}" inválido. Usar: ${VALID_MODES.join(' | ')}`);
  }

  // Leer base (puede no existir en primera ejecución → objeto vacío)
  let base = {};
  if (opts.base && fs.existsSync(opts.base)) {
    base = readJSON(opts.base);
  } else if (opts.base) {
    console.log(`ℹ️  Base no encontrada (${opts.base}) → inicializando vacío`);
  }

  const incoming = readJSON(opts.newFile);
  let result;
  let stats = { added: 0, updated: 0, total: 0 };

  /* ── map_merge ──────────────────────────────────────────────────────────── */
  if (opts.mode === 'map_merge') {
    if (opts.field) {
      // Operar sobre base[field] y incoming[field]
      const baseMap     = (base[opts.field] && typeof base[opts.field] === 'object' && !Array.isArray(base[opts.field]))
                          ? base[opts.field] : {};
      const incomingMap = (incoming[opts.field] && typeof incoming[opts.field] === 'object' && !Array.isArray(incoming[opts.field]))
                          ? incoming[opts.field] : {};

      const { map, stats: s } = mergeMap(baseMap, incomingMap);

      // Merge metadata + el campo
      result = deepMerge(base, incoming);  // propaga updated_at, last_run_id, etc. de incoming
      result[opts.field] = map;
      stats = s;
    } else {
      // Los archivos raíz son mapas directos
      const { map, stats: s } = mergeMap(
        typeof base === 'object' && !Array.isArray(base) ? base : {},
        typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {}
      );
      result = map;
      stats  = s;
    }
  }

  /* ── array_append ───────────────────────────────────────────────────────── */
  else if (opts.mode === 'array_append') {
    if (opts.field) {
      const baseArr     = Array.isArray(base[opts.field])     ? base[opts.field]     : [];
      const incomingArr = Array.isArray(incoming[opts.field]) ? incoming[opts.field] : [incoming];

      result = { ...base, ...incoming, [opts.field]: [...baseArr, ...incomingArr] };
      stats  = { added: incomingArr.length, updated: 0, total: result[opts.field].length };
    } else {
      const baseArr     = Array.isArray(base)     ? base     : [];
      const incomingArr = Array.isArray(incoming) ? incoming : [incoming];
      result = [...baseArr, ...incomingArr];
      stats  = { added: incomingArr.length, updated: 0, total: result.length };
    }
  }

  /* ── shallow_merge ──────────────────────────────────────────────────────── */
  else if (opts.mode === 'shallow_merge') {
    result = { ...base, ...incoming };
    stats  = {
      added:   Object.keys(incoming).filter(k => !(k in base)).length,
      updated: Object.keys(incoming).filter(k => k in base).length,
      total:   Object.keys(result).length,
    };
  }

  writeJSON(opts.output, result);

  console.log(`✅ merge-registries — modo: ${opts.mode}${opts.field ? ` (campo: ${opts.field})` : ''}`);
  console.log(`   agregados  : ${stats.added}`);
  console.log(`   actualizados: ${stats.updated}`);
  console.log(`   total      : ${stats.total}`);
  console.log(`   output     : ${opts.output}`);
}

main();
