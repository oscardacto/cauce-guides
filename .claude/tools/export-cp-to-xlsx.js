#!/usr/bin/env node
/**
 * ATF — Exporta cp_modulo_*.json al formato Matriz Excel tabular extendido (matrix_format=gnp)
 *
 * Uso:
 *   node .claude/tools/export-cp-to-xlsx.js <design_dir> <output_file>
 *   node .claude/tools/export-cp-to-xlsx.js <design_dir> <output_file> --modulo M_1
 *
 * Ejemplos:
 *   # Exportar todos los módulos a un solo Excel (una hoja por módulo)
 *   node .claude/tools/export-cp-to-xlsx.js \
 *     output/{run_id}/sofka-asdd:qa-web-design \
 *     output/{run_id}/reports/Matriz_CPs.xlsx
 *
 *   # Exportar solo un módulo
 *   node .claude/tools/export-cp-to-xlsx.js \
 *     output/{run_id}/sofka-asdd:qa-web-design \
 *     output/{run_id}/reports/Matriz_emision.xlsx \
 *     --modulo emision
 *
 * El Excel generado sigue la estructura de columnas de la matriz tabular extendida
 * para que los QAs puedan copiar-pegar directamente.
 */

const fs   = require('fs');
const path = require('path');

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

// ─── Mapeo de estados ATF → vocabulario del export tabular ──────────────────

const STATUS_MAP_TO_GNP = {
  'PASS':       'Exitoso',
  'FAIL':       'Fallido',
  'BLOCKED':    'Bloqueado',
  'SKIPPED':    'Diferido',
  'N/A':        'N/A',
  // Preservar valores que ya vienen en formato de entrega
  'Exitoso':    'Exitoso',
  'Fallido':    'Fallido',
  'Bloqueado':  'Bloqueado',
  'Diferido':   'Diferido',
  'Pendiente':  '',  // Pendiente en ATF = vacío en la matriz (aún no ejecutado)
};

/** Traduce estado ATF interno al vocabulario de entrega del export tabular */
function toGnpStatus(status) {
  if (!status) return '';  // CPs nuevos sin ejecutar → vacío
  const mapped = STATUS_MAP_TO_GNP[status];
  return mapped !== undefined ? mapped : status;  // Preservar si no está en el mapa
}

// ─── Mapeo inverso: risk_level → Tipo de Funcional ─────────────────────────

const RISK_TO_TYPE = {
  critical: 'Positivo',
  high:     'Positivo',
  medium:   'Negativo',
  low:      'Migración',
};

function riskToType(riskLevel, cpType) {
  // Si el CP ya tiene un type explícito (del diseño), usarlo
  if (cpType) return cpType;
  return RISK_TO_TYPE[riskLevel] || 'Positivo';
}

// ─── Formateo de campos para Excel ─────────────────────────────────────────

/** Convierte array de pasos a texto numerado */
function formatSteps(steps) {
  if (!steps) return '';
  if (Array.isArray(steps)) {
    return steps.map((s, i) => {
      const txt = String(s).trim();
      // Si ya tiene número al inicio, no agregar otro
      if (/^\d+[\.\)]/.test(txt)) return txt;
      return `${i + 1}. ${txt}`;
    }).join('\n');
  }
  return String(steps);
}

/** Convierte precondiciones a texto con bullets */
function formatPreconditions(preconditions) {
  if (!preconditions) return '';
  if (Array.isArray(preconditions)) {
    return preconditions.map((p, i) => `${i + 1}. ${String(p).trim()}`).join('\n');
  }
  return String(preconditions);
}

/** Extrae tags relevantes como texto */
function formatTags(tags) {
  if (!tags || !Array.isArray(tags)) return '';
  return tags.filter(t => !t.startsWith('@data-')).join(', ');
}

// ─── Columnas de la Matriz tabular extendida ───────────────────────────────
//
// Coinciden con el formato de convert-xlsx.js (const COL) para round-trip.
// Las columnas de ejecución (J-S) se dejan vacías — las llena el QA.

const HEADERS = [
  'Caso de Prueba',            // A — secuencial
  'ID',                         // B — cp_id
  'Funcional',                  // C — hu_id + referencia
  'Descripción del funcional',  // D — título del módulo / HU
  'Características',            // E — título del CP
  'Precondiciones',             // F
  'Secuencia de Pruebas',       // G — pasos
  'Descripción / Qué verificar',// H — detalle de verificación
  'Resultado Esperado',         // I
  'Tipo de Funcional',          // J — Positivo/Negativo/Alterno/Migración
  'Fecha Plan',                 // K — vacío (lo llena el QA)
  'Ing. de pruebas',            // L — vacío
  'Status',                     // M — vacío (ejecución)
  'Re ejecuciones',             // N — vacío
  'Link de evidencia',          // O — vacío
  'ID Defecto',                 // P — vacío
  'Notas',                      // Q — notas del diseño si existen
  'Regresión',                  // R — booleano
  'Prb. Automatizada',          // S — booleano
];

// ─── Anchos de columna sugeridos (en caracteres) ───────────────────────────

const COL_WIDTHS = [
  { wch: 6 },   // A  Caso de Prueba
  { wch: 16 },  // B  ID
  { wch: 18 },  // C  Funcional
  { wch: 30 },  // D  Descripción funcional
  { wch: 50 },  // E  Características
  { wch: 45 },  // F  Precondiciones
  { wch: 55 },  // G  Secuencia de Pruebas
  { wch: 40 },  // H  Descripción / Qué verificar
  { wch: 45 },  // I  Resultado Esperado
  { wch: 16 },  // J  Tipo de Funcional
  { wch: 12 },  // K  Fecha Plan
  { wch: 20 },  // L  Ing. de pruebas
  { wch: 12 },  // M  Status
  { wch: 12 },  // N  Re ejecuciones
  { wch: 25 },  // O  Link de evidencia
  { wch: 14 },  // P  ID Defecto
  { wch: 30 },  // Q  Notas
  { wch: 10 },  // R  Regresión
  { wch: 10 },  // S  Prb. Automatizada
];

// ─── Construir filas de una hoja a partir de un cp_modulo_*.json ───────────

function buildSheetRows(moduleData) {
  const rows = [];

  // Fila 1: metadata del módulo (info contextual)
  rows.push([
    'Título Matriz:',
    moduleData.module_name || moduleData.module_id || '',
    '',
    `HUs: ${Array.isArray(moduleData.hu_traceability) ? moduleData.hu_traceability.map(h => h.hu_id).join(', ') : (moduleData.hu_traceability ? Object.keys(moduleData.hu_traceability).join(', ') : '')}`,
    '',
    `Total CPs: ${moduleData.total_cases || moduleData.test_cases.length}`,
    '',
    `Generado: ${moduleData.generated_at || new Date().toISOString()}`,
  ]);

  // Fila 2: vacía (separador)
  rows.push([]);

  // Fila 3: headers
  rows.push(HEADERS);

  // Fila 4: zona Parte 1 / Parte 2 (demarcación visual para el Excel)
  rows.push([
    '◀── PARTE 1 — DISEÑO (No modificar) ──▶', '', '', '', '', '', '', '', '', '',
    '◀── PARTE 2 — EJECUCIÓN (Modificable) ──▶', '', '', '', '', '', '', '', ''
  ]);

  // Filas de datos
  const cases = moduleData.test_cases || [];
  cases.forEach((cp, idx) => {
    const tags = cp.tags || [];
    const isRegression = tags.includes('@regression');
    const isAutomated  = tags.includes('@automated');

    // Calcular gnp_id como fallback si no está en el CP
    const caNum = cp.ca_number || (cp.ca_ref ? parseInt(String(cp.ca_ref).replace(/\D/g, ''), 10) : 0);
    const cpSeq = cp.cp_sequence || (idx + 1);
    const gnpId = cp.gnp_id || (caNum ? `${caNum}.${cpSeq}` : `${idx + 1}`);
    const funcRef = cp.funcional_ref || (cp.hu_id && caNum ? `${cp.hu_id.replace(/-/g, '')} - CA${caNum}` : (cp.hu_id || ''));

    rows.push([
      idx + 1,                                                // A  Caso de Prueba (secuencial)
      gnpId,                                                  // B  ID (formato CA.CP: "2.1")
      funcRef,                                                // C  Funcional (HU1252 - CA2)
      cp.description_func || cp.description_gnp || cp.description || '',  // D  Descripción del funcional
      cp.title || '',                                         // E  Características
      formatPreconditions(cp.preconditions),                  // F  Precondiciones
      formatSteps(cp.steps_raw || cp.steps),                  // G  Secuencia de Pruebas
      cp.description_verify || cp.description_gnp || cp.description || '',  // H  Descripción / Qué verificar
      cp.expected_result_text || cp.expected_result || '',    // I  Resultado Esperado
      cp.test_type || riskToType(cp.risk_level, cp.type),     // J  Tipo de Funcional
      cp.plan_date || '',                                     // K  Fecha Plan
      cp.assignee || '',                                      // L  Ing. de pruebas
      toGnpStatus(cp.source_status || cp.execution_status || ''), // M  Status (mapeado a vocabulario de entrega)
      cp.rerun_count || '',                                   // N  Re ejecuciones
      cp.evidence_link || '',                                 // O  Link de evidencia
      cp.defect_id || '',                                     // P  ID Defecto
      cp.notes || '',                                         // Q  Notas
      isRegression,                                           // R  Regresión
      isAutomated,                                            // S  Prb. Automatizada
    ]);
  });

  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Parsear argumentos
  let designDir  = null;
  let outputFile = null;
  let filterModule = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--modulo' || args[i] === '--module') {
      filterModule = args[++i];
    } else if (!designDir) {
      designDir = args[i];
    } else if (!outputFile) {
      outputFile = args[i];
    }
  }

  if (!designDir || !outputFile) {
    console.error(
      '❌ Uso: node .claude/tools/export-cp-to-xlsx.js <design_dir> <output_file> [--modulo <nombre>]\n\n' +
      '  Ejemplos:\n' +
      '    # Todos los módulos\n' +
      '    node .claude/tools/export-cp-to-xlsx.js \\\n' +
      '      output/{run_id}/sofka-asdd:qa-web-design \\\n' +
      '      ./Matriz_CPs.xlsx\n\n' +
      '    # Solo un módulo\n' +
      '    node .claude/tools/export-cp-to-xlsx.js \\\n' +
      '      output/{run_id}/sofka-asdd:qa-web-design \\\n' +
      '      ./Matriz_auth.xlsx \\\n' +
      '      --modulo auth'
    );
    process.exit(1);
  }

  const resolvedDesign = path.resolve(designDir);
  const resolvedOutput = path.resolve(outputFile);

  if (!fs.existsSync(resolvedDesign)) {
    console.error(`❌ Directorio no encontrado: ${resolvedDesign}`);
    process.exit(1);
  }

  // Asegurar directorio de salida
  const outDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Buscar archivos cp_modulo_*.json
  let cpFiles = fs.readdirSync(resolvedDesign)
    .filter(f => f.startsWith('cp_modulo_') && f.endsWith('.json'))
    .sort();

  if (filterModule) {
    const pattern = filterModule.toLowerCase();
    cpFiles = cpFiles.filter(f => f.toLowerCase().includes(pattern));
  }

  if (cpFiles.length === 0) {
    console.error('❌ No se encontraron archivos cp_modulo_*.json en:', resolvedDesign);
    if (filterModule) console.error(`   Filtro activo: --modulo ${filterModule}`);
    process.exit(1);
  }

  const xlsx = loadXlsx();

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   ATF — Exportar CPs a Matriz tabular (Excel)      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  Origen:  ${resolvedDesign}`);
  console.log(`  Destino: ${resolvedOutput}`);
  console.log(`  Módulos: ${cpFiles.length}\n`);

  const wb = xlsx.utils.book_new();
  let totalCPs = 0;
  let modulesExported = 0;

  for (const cpFile of cpFiles) {
    const filePath = path.join(resolvedDesign, cpFile);
    let moduleData;

    try {
      moduleData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.log(`   ⚠️  ${cpFile} → error al leer: ${err.message}`);
      continue;
    }

    const cases = moduleData.test_cases || [];
    if (cases.length === 0) {
      console.log(`   ⏭️  ${cpFile} → sin casos de prueba`);
      continue;
    }

    // Nombre de la hoja: module_id o derivado del nombre de archivo
    let sheetName = moduleData.module_id || cpFile.replace('cp_modulo_', '').replace('.json', '');
    // Excel limita nombres de hoja a 31 caracteres
    if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);

    const rows = buildSheetRows(moduleData);
    const ws = xlsx.utils.aoa_to_sheet(rows);

    // Aplicar anchos de columna
    ws['!cols'] = COL_WIDTHS;

    // Habilitar wrap text en columnas de texto largo (F, G, H, I)
    // xlsx-js no soporta estilos completos sin xlsx-style, pero los anchos ayudan

    xlsx.utils.book_append_sheet(wb, ws, sheetName);

    const riskSummary = Object.entries(moduleData.cases_by_risk || {})
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');

    console.log(`   ✅ ${sheetName} → ${cases.length} CPs | [${riskSummary}]`);
    if (moduleData.module_name) {
      console.log(`      📋 ${moduleData.module_name.substring(0, 70)}`);
    }

    totalCPs += cases.length;
    modulesExported++;
  }

  if (modulesExported === 0) {
    console.error('\n❌ No se exportaron módulos — todos estaban vacíos.');
    process.exit(1);
  }

  // Escribir archivo Excel
  xlsx.writeFile(wb, resolvedOutput);

  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`  Resumen de exportación`);
  console.log(`══════════════════════════════════════════════════════`);
  console.log(`  Módulos exportados : ${modulesExported}`);
  console.log(`  Total CPs          : ${totalCPs}`);
  console.log(`  Archivo generado   : ${path.basename(resolvedOutput)}`);
  console.log(`\n  ✅ Matriz tabular lista para copiar-pegar.`);

  // Escribir resumen JSON junto al Excel
  const summaryPath = resolvedOutput.replace(/\.xlsx$/i, '_export_summary.json');
  const summary = {
    source_dir:        resolvedDesign,
    output_file:       resolvedOutput,
    exported_at:       new Date().toISOString(),
    modules_exported:  modulesExported,
    total_cps:         totalCPs,
    module_sheets:     cpFiles.map(f => f.replace('cp_modulo_', '').replace('.json', '')),
    filter_module:     filterModule || null,
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`  📄 Resumen: ${path.basename(summaryPath)}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
