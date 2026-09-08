#!/usr/bin/env node
/**
 * ATF — Convierte Matriz de Pruebas Fogafin (.xlsx) al formato cp_modulo_*.json
 * Uso: node .claude/tools/convert-xlsx-fogafin.js <xlsx_path> <design_dir> <run_id>
 *
 * Formato esperado (9 columnas, header en fila 1 o 2):
 *   0: Caso de Prueba    (ignorable — checkbox/numeración)
 *   1: ID                (ej: CP_001)
 *   2: HU/Funcionalidad  (ej: HU40)
 *   3: Título            (descripción de la HU / feature name)
 *   4: (sin header)      (título específico del CP)
 *   5: Precondiciones    (Gherkin Given, preformateado con "Dado que...")
 *   6: Secuencia de Pasos (Gherkin When, preformateado con "Cuando...")
 *   7: Resultado Esperado (Gherkin Then, preformateado con "Entonces...")
 *   8: Tipo de Funcion   (Positivo / Negativo / Flujo Alterno)
 *
 * Genera cp_modulo_{moduleShort}.json — ej: hoja M_3 → cp_modulo_M3.json
 * cp_id canónico: CP-{moduleShort}-{idNumeric} — ej: CP-M3-001
 */

const fs   = require('fs');
const path = require('path');
const { addBdTagIfNeeded, diagnose: diagnoseBdTag } = require('./lib/bd-tag-inference');

function loadXlsx() {
  try { return require('xlsx'); }
  catch {
    console.error('❌ xlsx no instalado. Ejecuta: npm install --save-dev xlsx');
    process.exit(1);
  }
}

// ─── Mapeos ──────────────────────────────────────────────────────────────────

const RISK_MAP = {
  'positivo':      'high',
  'negativo':      'medium',
  'flujo alterno': 'medium',
  'flujo_alterno': 'medium',
  'alternativo':   'medium',
  'migracion':     'low',
  'no funcional':  'low',
};

// Layout A (9 cols con checkbox inicial): SEQ | ID | FUNCIONAL | HU_TITLE | CP_TITLE | PRECOND | STEPS | EXPECTED | TYPE
// Layout B (9 cols sin checkbox):         ID  | FUNCIONAL | HU_TITLE | CP_TITLE | PRECOND | STEPS | EXPECTED | TYPE | STATUS
const COL_LAYOUTS = {
  A: { SEQ: 0, ID: 1, FUNCIONAL: 2, HU_TITLE: 3, CP_TITLE: 4, PRECOND: 5, STEPS: 6, EXPECTED: 7, TYPE: 8 },
  B: { SEQ: -1, ID: 0, FUNCIONAL: 1, HU_TITLE: 2, CP_TITLE: 3, PRECOND: 4, STEPS: 5, EXPECTED: 6, TYPE: 7 },
};

function detectLayout(rows, headerIdx) {
  // Cuenta CPs en col 0 vs col 1 de las filas de datos
  let col0 = 0, col1 = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (/^CP[_-]?\d+$/i.test(String(r[0] || '').trim())) col0++;
    if (/^CP[_-]?\d+$/i.test(String(r[1] || '').trim())) col1++;
  }
  return col1 >= col0 ? COL_LAYOUTS.A : COL_LAYOUTS.B;
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function normalize(s) {
  return String(s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function clean(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function getRisk(tipo) {
  return RISK_MAP[normalize(tipo)] || 'medium';
}

function extractHuId(raw) {
  if (!raw) return 'HU-UNKNOWN';
  const m = String(raw).match(/HU\s*(\d+)/i);
  return m ? `HU${m[1]}` : String(raw).trim().split(/\s/)[0];
}

function extractIdNumeric(idStr) {
  const m = String(idStr).match(/(\d+)/);
  return m ? m[1].padStart(3, '0') : '000';
}

function normalizeModuleShort(sheetName) {
  // "M_3" → "M3" | "Matriz_1" → "Matriz1"
  return sheetName.replace(/_/g, '');
}

/**
 * Detecta si el texto ya empieza con un keyword Gherkin en español/inglés.
 * Evita duplicar "Dado Dado que..." cuando el Excel ya trae Gherkin preformateado.
 */
function detectGherkinPrefix(text) {
  const t = normalize(text);
  return /^(dado|cuando|entonces|y que|y el|y la|y se|pero|and |given|when|then)\b/.test(t);
}

/**
 * Construye Gherkin respetando texto pre-formateado.
 * Si la celda ya empieza con "Dado/Cuando/Entonces..." → literal.
 * Si no → prefija con el keyword correcto en español.
 */
function buildGherkin(cp) {
  const lines = [
    `Feature: ${cp.feature_name}`,
    '',
    `  Scenario: ${cp.title}`,
  ];

  const addStep = (text, keyword) => {
    const t = clean(text);
    if (!t) return;
    if (detectGherkinPrefix(t)) {
      lines.push(`    ${t}`);
    } else {
      lines.push(`    ${keyword} ${t}`);
    }
  };

  addStep(cp.preconditions, 'Dado');
  addStep(cp.steps,         'Cuando');
  addStep(cp.expected,      'Entonces');

  return lines.join('\n');
}

// ─── Procesamiento de una hoja ───────────────────────────────────────────────

function processSheet(sheetName, ws, runId) {
  const xlsx = loadXlsx();
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return null;

  // Header puede estar en fila 0 o fila 1 — buscar hasta 3 filas
  let headerIdx = -1;
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const rowNorm = rows[i].map(c => normalize(c));
    const hasId = rowNorm.includes('id');
    const hasHu = rowNorm.some(c => c.includes('hu') || c.includes('funcional'));
    if (hasId && hasHu) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return null;

  const COL = detectLayout(rows, headerIdx);

  // Filas de datos: ID del tipo CP_001, CP-001, CP001
  const dataRows = rows.slice(headerIdx + 1).filter(r => {
    const id = String(r[COL.ID] || '').trim();
    return /^CP[_-]?\d+$/i.test(id);
  });
  if (dataRows.length === 0) return null;

  const moduleShort = normalizeModuleShort(sheetName);
  const featureName = clean(dataRows[0][COL.HU_TITLE]) || sheetName;
  const huSet = new Set();

  const testCases = dataRows.map(row => {
    const idRaw    = clean(row[COL.ID]);
    const idNum    = extractIdNumeric(idRaw);
    const huId     = extractHuId(row[COL.FUNCIONAL]);
    const huTitle  = clean(row[COL.HU_TITLE]);
    const cpTitle  = clean(row[COL.CP_TITLE]) || `CP ${idNum}`;
    const precond  = clean(row[COL.PRECOND]);
    const steps    = clean(row[COL.STEPS]);
    const expected = clean(row[COL.EXPECTED]);
    const tipo     = clean(row[COL.TYPE]);
    const risk     = getRisk(tipo);

    huSet.add(huId);

    const baseTags = [`@${moduleShort.toLowerCase()}`, `@${risk}`];
    if (risk === 'high') baseTags.push('@smoke');

    // Auto-inferencia de @bd — REGLA 7 doble opt-in).
    // Evalúa expected_result + steps_raw + preconditions contra patrones de
    // persistencia. Ver `.claude/tools/lib/bd-tag-inference.js` para detalle.
    const gherkinPreview = buildGherkin({ feature_name: huTitle || featureName, title: cpTitle, preconditions: precond, steps, expected });
    const tags = addBdTagIfNeeded(baseTags, {
      expected_result: expected,
      steps_raw: steps,
      preconditions: precond,
      gherkin: gherkinPreview,
    });

    return {
      cp_id:         `CP-${moduleShort}-${idNum}`,
      source_id:     idRaw,
      hu_id:         huId,
      funcional_ref: huId,
      description_func:   huTitle || null,
      title:              cpTitle,
      preconditions:      precond || null,
      steps_raw:          steps || null,
      description_verify: null,
      risk_level:    risk,
      technique:     'EXCEL_IMPORT',
      tags,
      gherkin: gherkinPreview,
      test_data_ref:        null,
      expected_result:      expected || 'Según criterio de aceptación',
      responsive_viewports: [],
      type:           tipo || null,
      source_status:  'Pendiente',
      assignee:       null,
      plan_date:      null,
      rerun_count:    0,
      defect_id:      null,
      evidence_link:  null,
      notes:          null,
    };
  });

  const byRisk = { critical: 0, high: 0, medium: 0, low: 0 };
  testCases.forEach(tc => { byRisk[tc.risk_level] = (byRisk[tc.risk_level] || 0) + 1; });

  // Reporte de inferencia @bd
  const bdCps = testCases.filter(tc => (tc.tags || []).some(t => String(t).toLowerCase() === '@bd'));
  const bdInference = {
    cps_with_bd_tag: bdCps.length,
    cps_without_bd_tag: testCases.length - bdCps.length,
    bd_cp_ids: bdCps.map(tc => tc.cp_id),
  };

  return {
    module_id:     moduleShort,
    module_name:   featureName,
    source:        'excel_import_fogafin',
    run_id:        runId,
    generated_at:  new Date().toISOString(),
    total_cases:   testCases.length,
    cases_by_risk: byRisk,
    bd_inference:  bdInference,
    test_cases:    testCases,
    test_datasets: [],
    hu_traceability: Array.from(huSet).map(hu => ({
      hu_id:    hu,
      cp_count: testCases.filter(tc => tc.hu_id === hu).length,
    })),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const [,, xlsxPath, designDir, runId = 'unknown'] = process.argv;

  if (!xlsxPath || !designDir) {
    console.error(
      '❌ Uso: node .claude/tools/convert-xlsx-fogafin.js <xlsx_path> <design_dir> <run_id>\n' +
      '   Ejemplo:\n' +
      '   node .claude/tools/convert-xlsx-fogafin.js \\\n' +
      '     requirements/hu-bajo-prueba/Matriz.xlsx \\\n' +
      '     output/FogafinSIO-v1.0-20260423-1700/design \\\n' +
      '     FogafinSIO-v1.0-20260423-1700'
    );
    process.exit(1);
  }

  const resolvedXlsx   = path.resolve(xlsxPath);
  const resolvedDesign = path.resolve(designDir);

  if (!fs.existsSync(resolvedXlsx)) {
    console.error(`❌ Archivo no encontrado: ${resolvedXlsx}`);
    process.exit(1);
  }
  if (!fs.existsSync(resolvedDesign)) {
    fs.mkdirSync(resolvedDesign, { recursive: true });
    console.log(`📁 Carpeta design creada: ${resolvedDesign}`);
  }

  const xlsx = loadXlsx();
  console.log(`📊 Leyendo (formato Fogafin): ${path.basename(resolvedXlsx)}\n`);

  const wb = xlsx.readFile(resolvedXlsx);
  const moduleSheets = wb.SheetNames.filter(n => /^(M|Matriz)_\d+$/i.test(n));

  if (moduleSheets.length === 0) {
    console.error('❌ No se encontraron hojas con patrón M_N o Matriz_N.');
    console.error('   Hojas disponibles:', wb.SheetNames.join(', '));
    process.exit(1);
  }

  let converted = 0, skipped = 0, totalCPs = 0;
  const moduleFiles = [];

  for (const sheetName of moduleSheets) {
    const result = processSheet(sheetName, wb.Sheets[sheetName], runId);
    if (!result) {
      console.log(`   ⏭️  ${sheetName} → sin datos (hoja vacía o sin IDs válidos)`);
      skipped++;
      continue;
    }

    const outFile = path.join(resolvedDesign, `cp_modulo_${result.module_id}.json`);
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf-8');

    const riskSummary = Object.entries(result.cases_by_risk)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`).join(' ');

    console.log(`   ✅ ${sheetName} → cp_modulo_${result.module_id}.json | CPs: ${result.total_cases} | [${riskSummary}]`);
    if (result.module_name) console.log(`      📋 ${result.module_name.substring(0, 80)}`);

    moduleFiles.push(`cp_modulo_${result.module_id}.json`);
    converted++;
    totalCPs += result.total_cases;
  }

  console.log(`\n✅ Resultado: ${converted} módulo(s) generado(s), ${skipped} omitido(s) | Total CPs: ${totalCPs}`);

  const summaryPath = path.join(resolvedDesign, 'xlsx_import_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    source_file:       path.basename(resolvedXlsx),
    format:            'fogafin',
    run_id:            runId,
    converted_at:      new Date().toISOString(),
    modules_generated: converted,
    modules_skipped:   skipped,
    total_cps:         totalCPs,
    module_files:      moduleFiles,
  }, null, 2), 'utf-8');
  console.log(`\n📄 Resumen escrito: ${summaryPath}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
