#!/usr/bin/env node
/**
 * ATF — tag-bd-cps.js
 *
 * Aplica el heurístico determinístico `addBdTagIfNeeded()` (de
 * `lib/bd-tag-inference.js`) sobre todos los CPs de un `cp_modulo_*.json`
 * y mete `bd_inference: { cps_tagged, cps_total }` en el documento.
 *
 * Reemplaza el `node -e` inline que vivía en `agent_design-team` PASO 3.8
 * — antipatrón prosa-vs-código (escapes Windows + drift potencial entre
 * la prosa del agente y la utilidad real). Caso canónico documentado en
 * CLAUDE.md (P25, P33, P43 de Olas previas).
 *
 * Uso:
 *   node .claude/tools/tag-bd-cps.js --cp-file <ruta-cp_modulo>
 *
 * Stdout (JSON consolidado): { ok, cp_file, module_id, cps_total, cps_tagged }
 *
 * Exit codes:
 *   0 = OK (siempre que el archivo exista y sea JSON válido).
 *   1 = error fatal (archivo ausente, JSON corrupto, sin permisos, etc.).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { addBdTagIfNeeded } = require('./lib/bd-tag-inference');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cp-file') out.cpFile = argv[++i];
    else if (a.startsWith('--cp-file=')) out.cpFile = a.slice('--cp-file='.length);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function die(msg) {
  process.stderr.write(`tag-bd-cps: ${msg}\n`);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write('Uso: node tag-bd-cps.js --cp-file <ruta-cp_modulo_*.json>\n');
    process.exit(0);
  }

  if (!args.cpFile) die('--cp-file es obligatorio');

  const cpFile = path.resolve(args.cpFile);
  if (!fs.existsSync(cpFile)) die(`archivo no encontrado: ${cpFile}`);

  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(cpFile, 'utf8'));
  } catch (e) {
    die(`JSON inválido en ${cpFile}: ${e.message}`);
  }

  const cps = Array.isArray(doc.test_cases) ? doc.test_cases : [];
  let tagged = 0;

  for (const cp of cps) {
    const before = Array.isArray(cp.tags) ? cp.tags.length : 0;
    cp.tags = addBdTagIfNeeded(cp.tags || [], cp);
    if ((cp.tags.length || 0) > before) tagged++;
  }

  doc.bd_inference = { cps_tagged: tagged, cps_total: cps.length };

  fs.writeFileSync(cpFile, JSON.stringify(doc, null, 2));

  process.stdout.write(JSON.stringify({
    ok: true,
    cp_file: cpFile,
    module_id: doc.module_id || null,
    cps_total: cps.length,
    cps_tagged: tagged,
  }, null, 2) + '\n');

  process.exit(0);
}

main();
