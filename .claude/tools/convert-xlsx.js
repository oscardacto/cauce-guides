#!/usr/bin/env node
/**
 * ATF — Convierte una Matriz de Pruebas .xlsx al formato cp_modulo_*.json
 * Uso: node .claude/tools/convert-xlsx.js <xlsx_path> <design_dir> <run_id>
 *
 * - Lee cada hoja M_* que tenga filas de datos
 * - Genera design/cp_modulo_M{N}.json por hoja
 * - Construye Gherkin simplificado desde: Precondiciones + Secuencia + Resultado Esperado
 * - Mapea risk_level desde Tipo de Funcional
 * - Preserva Status original del Excel en campo `source_status`
 * - Los CPs con Status "Bloqueado" se incluyen pero con tag @blocked
 */

const fs   = require('fs');
const path = require('path');
const { addBdTagIfNeeded } = require('./lib/bd-tag-inference');

// ─── Dependencia ────────────────────────────────────────────────────────────

function loadXlsx() {
  try {
    return require('xlsx');
  } catch {
    console.error(
      '❌ xlsx no instalado. Ejecuta:\n' +
      '   npm install --save-dev xlsx\n' +
      '   (desde la raíz del proyecto)'
    );
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
  'migración':     'low',
  'no_funcional':  'low',
  'no funcional':  'low',
};

const STATUS_TAG_MAP = {
  'bloqueado': '@blocked',
  'diferido':  '@deferred',
};

/** Deriva risk_level del campo Tipo de Funcional */
function getRisk(tipoFuncional) {
  if (!tipoFuncional) return 'medium';
  const key = String(tipoFuncional).toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');  // quita tildes
  return RISK_MAP[key] || 'medium';
}

/** Extrae HU ID del campo Funcional (ej: "HU1083 - CA1" → "HU1083") */
function extractHuId(funcional) {
  if (!funcional) return 'HU-UNKNOWN';
  const str = String(funcional).trim();
  // Intenta capturar patrón HU\d+ o \d{4}
  const m = str.match(/(?:HU)?(\d{4,})/i);
  return m ? `HU${m[1]}` : str.split(/\s/)[0];
}

/** Extrae nombre del módulo del campo funcional o del título de la hoja */
function extractModuleName(rows, headerIdx) {
  // Fila 1 suele tener "Título Matriz N: <nombre>"
  for (let i = 0; i < Math.min(headerIdx, 5); i++) {
    const row = rows[i];
    const titleCell = row.find(c => typeof c === 'string' && c.includes('Título Matriz'));
    if (titleCell) {
      const idx = row.indexOf(titleCell);
      // El título suele estar una o dos celdas después
      for (let j = idx + 1; j < Math.min(idx + 4, row.length); j++) {
        if (row[j] && String(row[j]).trim()) return String(row[j]).trim();
      }
    }
    // Segunda fila: buscar el nombre del HU (celda con "1083 -" o similar)
    if (i === 1) {
      const hu = row.find(c => typeof c === 'string' && /\d{4}/.test(c));
      if (hu) return String(hu).trim();
    }
  }
  return null;
}

/** Limpia texto de celdas (elimina espacios redundantes, normaliza saltos de línea) */
function clean(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Convierte número de serie Excel a fecha ISO */
function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel epoch: 1 enero 1900 = día 1 (con bug del año bisiesto 1900)
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return isNaN(d) ? null : d.toISOString().split('T')[0];
}

/**
 * Construye un Gherkin simple a partir de los campos del CP.
 * No inventa datos — usa solo lo que está en el Excel.
 */
function buildGherkin(cp) {
  const lines = [`Feature: ${cp.module_name || cp.hu_id}`, '', `  Scenario: ${cp.title}`];

  // Given — precondiciones
  const prec = cp.preconditions;
  if (prec) {
    const precLines = prec.split(/\*|\n|•/).map(s => s.trim()).filter(Boolean);
    if (precLines.length === 1) {
      lines.push(`    Given ${precLines[0]}`);
    } else {
      lines.push(`    Given ${precLines[0]}`);
      for (let i = 1; i < precLines.length; i++) {
        lines.push(`    And ${precLines[i]}`);
      }
    }
  } else {
    lines.push('    Given las precondiciones del sistema están establecidas');
  }

  // When — secuencia de pasos
  const steps = cp.steps;
  if (steps) {
    const stepLines = steps
      .split(/\d+\.\s+|\n|•/)
      .map(s => s.trim())
      .filter(Boolean);
    if (stepLines.length === 1) {
      lines.push(`    When ${stepLines[0]}`);
    } else {
      lines.push(`    When ${stepLines[0]}`);
      for (let i = 1; i < stepLines.length; i++) {
        lines.push(`    And ${stepLines[i]}`);
      }
    }
  } else {
    lines.push(`    When se ejecuta el caso de prueba "${cp.title}"`);
  }

  // Then — resultado esperado
  const res = cp.result_description;
  if (res) {
    const resLines = res
      .split(/\n|•|\*/)
      .map(s => s.trim())
      .filter(Boolean);
    if (resLines.length === 1) {
      lines.push(`    Then ${resLines[0]}`);
    } else {
      lines.push(`    Then ${resLines[0]}`);
      for (let i = 1; i < resLines.length; i++) {
        lines.push(`    And ${resLines[i]}`);
      }
    }
  } else {
    lines.push('    Then el resultado es el esperado');
  }

  return lines.join('\n');
}

// ─── Columnas esperadas (fila header) ────────────────────────────────────────
// Índice 0-based tal como aparece en el Excel de Vital 
const COL = {
  SEQ:         0,   // Caso de Prueba (número secuencial)
  ID:          1,   // ID (ej: 1.1, 2.1 ...)
  FUNCIONAL:   2,   // HU/CA de referencia (ej: "HU1083 - CA1")
  DESC_FUNC:   3,   // Descripción del funcional
  TITLE:       4,   // Características del caso de prueba
  PRECOND:     5,   // Precondiciones
  STEPS:       6,   // Secuencia de Pruebas
  DESCRIPTION: 7,   // Descripción / Qué verificar
  EXPECTED:    8,   // Resultado Esperado
  TYPE:        9,   // Tipo de Funcional
  DATE_PLAN:   10,  // Fecha Plan de Pruebas
  ASSIGNEE:    11,  // Ing. de pruebas responsable
  STATUS:      12,  // Status (Exitoso, Bloqueado, Fallido, N/A …)
  RERUN:       13,  // Re ejecuciones
  EVIDENCE:    14,  // Link de evidencia
  DEFECT_ID:   15,  // ID Defecto
  NOTES:       16,  // Notas
  REGRESSION:  17,  // Regresión (boolean)
  AUTOMATED:   18,  // Prb. Automatizada (boolean)
};

// ─── Procesamiento de una hoja ────────────────────────────────────────────────

function processSheet(sheetName, ws, runId) {
  const xlsx = loadXlsx();
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Encontrar fila de encabezado (contiene "Caso de Prueba" en cualquier columna)
  let colOffset = 0;
  const headerIdx = rows.findIndex(r => {
    const idx = r.findIndex(c => String(c).trim() === 'Caso de Prueba');
    if (idx >= 0) { colOffset = idx - COL.SEQ; return true; }
    return false;
  });
  if (headerIdx < 0) return null;

  // Función helper para acceder a columnas con offset
  const col = (row, colIdx) => row[colIdx + colOffset];

  const moduleName = extractModuleName(rows, headerIdx);
  const dataRows   = rows.slice(headerIdx + 1).filter(r => {
    const v = col(r, COL.SEQ);
    if (v === '' || v === null || v === undefined) return false;
    if (typeof v === 'number') return true;
    // Accept string patterns like "1,01", "2,01", "29.1" (CP sequence numbers)
    return /^\d+[,\.]\d+$/.test(String(v).trim());
  });
  if (dataRows.length === 0) return null;

  // Recopilar HU IDs únicos para traceability
  const huSet = new Set();
  dataRows.forEach(r => {
    const hu = extractHuId(col(r, COL.FUNCIONAL));
    if (hu) huSet.add(hu);
  });

  const testCases = dataRows.map((row, idx) => {
    const seqNum   = col(row, COL.SEQ);
    const idRaw    = String(col(row, COL.ID) || '').trim();
    const funcRaw  = String(col(row, COL.FUNCIONAL) || '').trim();
    const descFunc = clean(col(row, COL.DESC_FUNC));
    const huId     = extractHuId(funcRaw);
    const title    = clean(col(row, COL.TITLE)) || clean(col(row, COL.DESCRIPTION)) || `CP ${seqNum}`;
    const tipo     = clean(col(row, COL.TYPE));
    const status   = clean(col(row, COL.STATUS));
    const riskLvl  = getRisk(tipo);
    const isRegr   = col(row, COL.REGRESSION) === true || col(row, COL.REGRESSION) === 1;
    const isAuto   = col(row, COL.AUTOMATED)  === true || col(row, COL.AUTOMATED)  === 1;
    const defectId = clean(col(row, COL.DEFECT_ID));
    const notes    = clean(col(row, COL.NOTES));

    // Tags base
    const tags = [`@${sheetName.toLowerCase()}`, `@${riskLvl}`];
    if (riskLvl === 'high')     tags.push('@smoke');
    if (isRegr)                  tags.push('@regression');
    if (isAuto)                  tags.push('@automated');
    const statusTag = STATUS_TAG_MAP[status.toLowerCase()];
    if (statusTag) tags.push(statusTag);
    if (defectId)  tags.push('@has_defect');

    // Datos para Gherkin
    const cpData = {
      hu_id:          huId,
      module_name:    moduleName || sheetName,
      title,
      preconditions:  clean(col(row, COL.PRECOND)),
      steps:          clean(col(row, COL.STEPS)),
      result_description: clean(col(row, COL.EXPECTED)) || clean(col(row, COL.DESCRIPTION)),
    };
    const gherkinText = buildGherkin(cpData);

    // Auto-inferencia de @bd — REGLA 7 doble opt-in).
    // Ver `.claude/tools/lib/bd-tag-inference.js`.
    const tagsWithBd = addBdTagIfNeeded(tags, {
      expected_result: clean(col(row, COL.EXPECTED)),
      steps_raw: clean(col(row, COL.STEPS)),
      preconditions: clean(col(row, COL.PRECOND)),
      description_verify: clean(col(row, COL.DESCRIPTION)),
      gherkin: gherkinText,
    });

    return {
      cp_id:         `CP-${sheetName}-${idRaw || String(seqNum).padStart(3, '0')}`,
      source_id:     idRaw,
      hu_id:         huId,
      funcional_ref: funcRaw,
      description_func:   descFunc || null,
      title,
      preconditions:      clean(col(row, COL.PRECOND)) || null,
      steps_raw:          clean(col(row, COL.STEPS)) || null,
      description_verify: clean(col(row, COL.DESCRIPTION)) || null,
      risk_level:    riskLvl,
      technique:     'EXCEL_IMPORT',
      tags:          tagsWithBd,
      gherkin:       gherkinText,
      test_data_ref: null,
      expected_result: clean(col(row, COL.EXPECTED)) || 'Según criterio de aceptación',
      responsive_viewports: [],
      type:          clean(col(row, COL.TYPE)) || null,
      source_status: status || 'Pendiente',
      assignee:      clean(col(row, COL.ASSIGNEE)),
      plan_date:     excelDateToISO(col(row, COL.DATE_PLAN)),
      rerun_count:   parseInt(col(row, COL.RERUN)) || 0,
      defect_id:     defectId || null,
      evidence_link: clean(col(row, COL.EVIDENCE)) || null,
      notes:         notes || null,
    };
  });

  // Resumen por risk
  const byRisk = { critical: 0, high: 0, medium: 0, low: 0 };
  testCases.forEach(tc => { byRisk[tc.risk_level] = (byRisk[tc.risk_level] || 0) + 1; });

  return {
    module_id:       sheetName,
    module_name:     moduleName || sheetName,
    source:          'excel_import',
    run_id:          runId,
    generated_at:    new Date().toISOString(),
    total_cases:     testCases.length,
    cases_by_risk:   byRisk,
    test_cases:      testCases,
    test_datasets:   [],
    hu_traceability: Array.from(huSet).map(hu => ({ hu_id: hu, cp_count: testCases.filter(tc => tc.hu_id === hu).length })),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [,, xlsxPath, designDir, runId = 'unknown'] = process.argv;

  if (!xlsxPath || !designDir) {
    console.error(
      '❌ Uso: node .claude/tools/convert-xlsx.js <xlsx_path> <design_dir> <run_id>\n' +
      '   Ejemplo:\n' +
      '   node .claude/tools/convert-xlsx.js \\\n' +
      '     requirements/Matriz.xlsx \\\n' +
      '     output/MiApp-v1.0-20260310-0900/design \\\n' +
      '     MiApp-v1.0-20260310-0900'
    );
    process.exit(1);
  }

  const resolvedXlsx  = path.resolve(xlsxPath);
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
  console.log(`📊 Leyendo: ${path.basename(resolvedXlsx)}\n`);

  const wb = xlsx.readFile(resolvedXlsx);

  // Procesar solo hojas M_* o Matriz_* (módulos de prueba)
  const moduleSheets = wb.SheetNames.filter(n => /^(M|Matriz)_\d+$/i.test(n));

  if (moduleSheets.length === 0) {
    console.error('❌ No se encontraron hojas con patrón M_N en el archivo Excel.');
    console.error('   Hojas disponibles:', wb.SheetNames.join(', '));
    process.exit(1);
  }

  let converted = 0;
  let skipped   = 0;
  let totalCPs  = 0;

  for (const sheetName of moduleSheets) {
    const ws     = wb.Sheets[sheetName];
    const result = processSheet(sheetName, ws, runId);

    if (!result) {
      console.log(`   ⏭️  ${sheetName} → sin datos (hoja vacía o sin header)`);
      skipped++;
      continue;
    }

    const outFile = path.join(resolvedDesign, `cp_modulo_${sheetName}.json`);
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf-8');

    const riskSummary = Object.entries(result.cases_by_risk)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');

    console.log(`   ✅ ${sheetName} → cp_modulo_${sheetName}.json | CPs: ${result.total_cases} | [${riskSummary}]`);
    if (result.module_name) console.log(`      📋 Módulo: ${result.module_name.substring(0, 80)}`);

    converted++;
    totalCPs += result.total_cases;
  }

  console.log(`\n✅ Resultado: ${converted} módulo(s) generado(s), ${skipped} omitido(s) | Total CPs: ${totalCPs}`);

  // Resumen JSON para que el orquestador lo lea
  const summaryPath = path.join(resolvedDesign, 'xlsx_import_summary.json');
  const summary = {
    source_file:    path.basename(resolvedXlsx),
    run_id:         runId,
    converted_at:   new Date().toISOString(),
    modules_generated: converted,
    modules_skipped:   skipped,
    total_cps:         totalCPs,
    module_files: moduleSheets
      .filter((_, i) => i < converted + skipped)
      .map(s => `cp_modulo_${s}.json`),
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`\n📄 Resumen escrito: ${summaryPath}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
