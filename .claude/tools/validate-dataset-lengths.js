#!/usr/bin/env node
// ATF — validate-dataset-lengths.js //
// Validador determinístico de longitudes BVA en test_datasets[]. Compara el
// número declarado en el label del dataset (ej: "boundary_at_max_255") con la
// longitud real de la cadena más larga en data{}. Reporta mismatches a stderr
// + JSON estructurado a stdout. NO auto-repara — doctrina prosa-vs-código.
//
//  admin-organization. Análisis alterno
// reportó "el LLM falló al generar 255/300 chars exactos" y posteriormente
// "el framework ejecutó Bash con .repeat() para sobrescribir". Auditoría
// posterior confirmó longitudes EXACTAS en disco — pero la pregunta de
// confiabilidad permanece. P85c añade un check determinístico que detecta
// drift sin permitir improvisación.
//
// Patrones de label reconocidos (caso-insensitivo, sufijo del label):
//   boundary_at_max_<N>          → N chars exactos esperados
//   boundary_above_max_<N>       → > N chars (ej: N+1, N*2 dependiendo del schema)
//   boundary_below_min_<N>       → < N chars
//   boundary_<algo>_<N>          → N chars
//   boundary_<algo>_<N>_chars    → N chars
//   _<N>$ (cualquier label que termine en _NNN o _NNN_chars)
//
// Conservador por diseño: solo dispara si el label tiene número extraíble.
// Labels como "happy_path", "navigation_only", "invalid" se ignoran (sin
// pretensión de longitud).
//
// Comparación: la "cadena evaluada" es la más larga de data{} con length > 50
// (filtra valores cortos como ids, nombres simples).
//
// Modos:
//   default (warning) → exit 0 con mismatches en stdout JSON.
//   --enforce         → exit 2 si hay mismatches (gating duro). Diferido por defecto.
//
// Uso:
//   node validate-dataset-lengths.js --cp-file <ruta-cp_modulo>
//   node validate-dataset-lengths.js --cp-file <ruta> --enforce
//
// Stdout JSON:
//   {
//     ok, cp_file, module_id, datasets_total, datasets_with_boundary,
//     mismatches: [
//       { ds_id, label, declared_length, actual_length, drift, key, value_preview }
//     ],
//     mode: "warning"|"enforce"
//   }
//
// Exit codes:
//   0 = OK (o warning con mismatches en modo default)
//   1 = error fatal (archivo ausente, JSON corrupto)
//   2 = mismatches detectados en modo --enforce
//
'use strict';

const fs   = require('fs');
const path = require('path');

function die(msg) { process.stderr.write(`validate-dataset-lengths: ${msg}\n`); process.exit(1); }

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i+1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    }
  }
  return out;
}

// Extrae N esperado del label. Retorna { declared, kind } o null.
//   kind: "exact" | "above" | "below" | "implicit"
function extractDeclaredLength(label) {
  if (!label || typeof label !== 'string') return null;
  const lc = label.toLowerCase();

  // boundary_at_max_<N>  → exact
  let m = lc.match(/boundary_at_max_(\d+)/);
  if (m) return { declared: parseInt(m[1], 10), kind: 'exact' };

  // boundary_above_max_<N>  → above
  m = lc.match(/boundary_above_max_(\d+)/);
  if (m) return { declared: parseInt(m[1], 10), kind: 'above' };

  // boundary_below_min_<N>  → below
  m = lc.match(/boundary_below_min_(\d+)/);
  if (m) return { declared: parseInt(m[1], 10), kind: 'below' };

  // boundary_<algo>_<N>_chars   → exact
  m = lc.match(/boundary_.+?_(\d+)_chars?$/);
  if (m) return { declared: parseInt(m[1], 10), kind: 'exact' };

  // sufijo numérico aislado: _<N>_chars o _<N>$ (al final)
  m = lc.match(/_(\d+)_chars?$/);
  if (m) return { declared: parseInt(m[1], 10), kind: 'exact' };
  m = lc.match(/_(\d+)$/);
  if (m && m[1].length >= 2) return { declared: parseInt(m[1], 10), kind: 'exact' };

  return null;
}

// La "cadena evaluada" es la string más larga de data{} con length > 50.
// Si ningún string supera 50, retorna la más larga de cualquier longitud.
function findLongestString(data) {
  if (!data || typeof data !== 'object') return null;
  let best = null;
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (typeof v !== 'string') continue;
    if (!best || v.length > best.length) best = { key: k, length: v.length, value: v };
  }
  if (!best) return null;
  // Si la mejor candidata tiene length <= 50, no aplica boundary check
  if (best.length < 30) return null;
  return best;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args['cp-file']) die('--cp-file es obligatorio');
  const cpFile = path.resolve(args['cp-file']);
  if (!fs.existsSync(cpFile)) die(`cp_modulo no encontrado: ${cpFile}`);

  let cpDoc;
  try { cpDoc = JSON.parse(fs.readFileSync(cpFile, 'utf8')); }
  catch (e) { die(`JSON inválido en ${cpFile}: ${e.message}`); }

  const moduleId = cpDoc.module_id || '';
  const datasets = Array.isArray(cpDoc.test_datasets) ? cpDoc.test_datasets : [];

  const mismatches = [];
  let datasetsWithBoundary = 0;

  for (const ds of datasets) {
    const declared = extractDeclaredLength(ds.label);
    if (!declared) continue;
    const longest = findLongestString(ds.data);
    if (!longest) continue;
    datasetsWithBoundary++;

    const actual = longest.length;
    const expected = declared.declared;
    let drift = null;

    if (declared.kind === 'exact' && actual !== expected) {
      drift = actual - expected;
    } else if (declared.kind === 'above' && actual <= expected) {
      drift = actual - expected; // negativo o cero → no cumple "above"
    } else if (declared.kind === 'below' && actual >= expected) {
      drift = actual - expected; // positivo o cero → no cumple "below"
    }

    if (drift !== null) {
      mismatches.push({
        ds_id:           ds.ds_id || '',
        label:           ds.label,
        kind:            declared.kind,
        declared_length: expected,
        actual_length:   actual,
        drift,
        key:             longest.key,
        value_preview:   longest.value.slice(0, 30) + '...' + longest.value.slice(-10),
      });
    }
  }

  const mode = args.enforce ? 'enforce' : 'warning';
  const out = {
    ok: true,
    cp_file: cpFile,
    module_id: moduleId,
    datasets_total: datasets.length,
    datasets_with_boundary: datasetsWithBoundary,
    mismatches,
    mode,
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');

  if (mismatches.length > 0) {
    process.stderr.write('\n' + '='.repeat(60) + '\n');
    process.stderr.write(`validate-dataset-lengths: ${mismatches.length} mismatch(es) BVA detectado(s)\n`);
    process.stderr.write('='.repeat(60) + '\n');
    for (const m of mismatches) {
      process.stderr.write(`  · ${m.ds_id}  label="${m.label}"  ${m.kind}: declared=${m.declared_length}  actual=${m.actual_length}  drift=${m.drift > 0 ? '+' : ''}${m.drift}\n`);
    }
    process.stderr.write('\nDoctrina P77b: NO auto-reparar con node -e o sed. Acciones del QA:\n');
    process.stderr.write('  1) Si la longitud del label es la verdad → editar el agente para emitir literal exacto.\n');
    process.stderr.write('  2) Si la longitud actual es la verdad → corregir el label del dataset.\n');
    process.stderr.write('  3) Re-ejecutar /asdd:qa-web-design --module {M} --run-id {RUN} para re-emitir el fragment.\n');
    process.stderr.write('='.repeat(60) + '\n\n');
    if (mode === 'enforce') process.exit(2);
  }

  process.exit(0);
}

main();
