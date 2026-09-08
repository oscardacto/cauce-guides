#!/usr/bin/env node
/**
 * ATF — split-cp-steps.js
 *
 * Aplica el splitter determinístico `splitStepsRaw()` (de
 * `lib/step-splitter.js`) sobre el `steps_raw` de cada CP en un
 * `cp_modulo_*.json`. Garantiza la portabilidad de REGLA 13
 * (fragmentación agnóstica de pasos compuestos) FUERA del flujo
 * de enricher — útil cuando design-team genera pasos compuestos
 * desde HUs sin pasar por la matriz Excel.
 *
 * Idempotente: si un step ya está atomizado, el splitter no hace
 * nada. Conservador: solo fragmenta cuando hay conjunción
 * explícita ("Y", ", luego", ", después", etc.) seguida de un
 * verbo acción del lexicon.
 *
 * Uso:
 *   node .claude/tools/split-cp-steps.js --cp-file <ruta-cp_modulo>
 *
 * Stdout (JSON consolidado):
 *   { ok, cp_file, module_id, cps_total, cps_split, total_splits,
 *     input_lines_total, output_lines_total }
 *
 * Exit codes:
 *   0 = OK
 *   1 = error fatal (archivo ausente, JSON corrupto)
 *
 * Side-effects:
 *   - Reemplaza `steps_raw` de cada CP afectado con su versión atomizada.
 *   - Agrega `auto_inferred.steps_split = { applied, input_lines,
 *     output_lines, splits_applied }` por CP cuando aplica (REGLA 13).
 *   - Agrega `step_split_inference = { cps_split, total_splits, ... }`
 *     al raíz del documento.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { splitStepsRaw } = require('./lib/step-splitter');

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
  process.stderr.write(`split-cp-steps: ${msg}\n`);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write('Uso: node split-cp-steps.js --cp-file <ruta-cp_modulo_*.json>\n');
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
  let cpsSplit       = 0;
  let totalSplits    = 0;
  let inputLinesAll  = 0;
  let outputLinesAll = 0;

  for (const cp of cps) {
    if (!cp || typeof cp.steps_raw !== 'string' || cp.steps_raw.trim() === '') continue;

    const r = splitStepsRaw(cp.steps_raw);
    inputLinesAll  += r.input_lines  || 0;
    outputLinesAll += r.output_lines || 0;

    if (r.splits_applied > 0) {
      cp.steps_raw = r.result;
      cp.auto_inferred = cp.auto_inferred || {};
      cp.auto_inferred.steps_split = {
        applied:        true,
        input_lines:    r.input_lines,
        output_lines:   r.output_lines,
        splits_applied: r.splits_applied,
      };
      cpsSplit++;
      totalSplits += r.splits_applied;
    }
  }

  doc.step_split_inference = {
    cps_total:          cps.length,
    cps_split:          cpsSplit,
    total_splits:       totalSplits,
    input_lines_total:  inputLinesAll,
    output_lines_total: outputLinesAll,
  };

  fs.writeFileSync(cpFile, JSON.stringify(doc, null, 2));

  process.stdout.write(JSON.stringify({
    ok:                 true,
    cp_file:            cpFile,
    module_id:          doc.module_id || null,
    cps_total:          cps.length,
    cps_split:          cpsSplit,
    total_splits:       totalSplits,
    input_lines_total:  inputLinesAll,
    output_lines_total: outputLinesAll,
  }, null, 2) + '\n');

  process.exit(0);
}

main();
