#!/usr/bin/env node
/**
 * detect-matrix-format.js — Auto-detección de formato de matriz Excel.
 *
 * Lee el .xlsx, inspecciona los encabezados de la primera hoja con datos y
 * sugiere el formato más probable: "gnp" | "fogafin" | "generic".
 *
 * Reemplaza la decisión manual del QA en `appweb.yaml -> test_run.matrix_format`.
 *
 * Filosofía: doctrina prosa-vs-código.
 *   El LLM no decide nada — el script inspecciona encabezados y aplica reglas
 *   determinísticas conocidas de cada formato.
 *
 * Uso:
 *   node detect-matrix-format.js --xlsx "docs/testing/atf-web/requirements/MatrizCPs_OrangeHRM.xlsx"
 *   node detect-matrix-format.js --xlsx "docs/testing/atf-web/requirements/" (auto-detecta primer .xlsx en folder)
 *
 * Output JSON:
 *   {
 *     ok: true,
 *     xlsx_path: "...",
 *     detected_format: "gnp" | "fogafin" | "generic",
 *     confidence: "high" | "medium" | "low",
 *     headers_seen: ["...", "..."],
 *     reasoning: "..."
 *   }
 *
 * Exit codes:
 *   0 — detectado con confianza alta o media
 *   1 — error fatal (xlsx no existe, no se puede parsear)
 *   2 — confianza baja o ambigua → el QA debe confirmar manualmente
 */
'use strict';

const fs = require('fs');
const path = require('path');

function die(msg, code = 1) {
  process.stderr.write(`[detect-matrix-format] FATAL: ${msg}\n`);
  process.exit(code);
}

function parseArgs() {
  const out = { xlsxPath: null };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--xlsx') out.xlsxPath = args[++i];
  }
  if (!out.xlsxPath) die('--xlsx es obligatorio');
  return out;
}

function resolveXlsxPath(p) {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) die(`Path no existe: ${abs}`);
  if (fs.statSync(abs).isFile()) return abs;
  // Si es directorio, buscar primer .xlsx que no esté en procesados/
  const candidates = fs.readdirSync(abs)
    .filter(n => /\.xlsx$/i.test(n))
    .map(n => path.join(abs, n));
  if (candidates.length === 0) die(`No hay archivos .xlsx en: ${abs}`);
  return candidates[0];
}

function readHeadersWithExcelJs(xlsxPath) {
  // Carga lazy para evitar error si exceljs no está instalado.
  let ExcelJS;
  try { ExcelJS = require('exceljs'); }
  catch (_) {
    die('exceljs no instalado. Ejecuta: npm install exceljs');
  }
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.readFile(xlsxPath).then(() => {
    // Buscar la primera hoja con encabezados reconocibles.
    // Los formatos GNP y Fogafin suelen tener un preámbulo en filas 1-3.
    // Probamos hasta 5 filas hasta encontrar headers no vacíos.
    const headerCandidates = [];
    workbook.eachSheet((sheet, sheetId) => {
      for (let row = 1; row <= 8 && row <= sheet.rowCount; row++) {
        const r = sheet.getRow(row);
        const cells = [];
        r.eachCell({ includeEmpty: false }, (cell) => {
          cells.push(String(cell.value || '').trim());
        });
        if (cells.length >= 3) {
          headerCandidates.push({ sheet: sheet.name, row, cells });
        }
      }
    });
    return headerCandidates;
  });
}

function classifyHeaders(candidates) {
  // Reglas determinísticas conocidas:
  // - GNP: 19 columnas, encabezados con "CA", "GNP_ID", "Description GNP", "Test Type", "Funcional Ref"
  // - Fogafin: 9 columnas, encabezados con "Dado", "Cuando", "Entonces" (Gherkin)
  // - Generic: cualquier otro formato (cp_id, gherkin, steps_raw, expected_result)

  const fogafinSignals = ['dado', 'cuando', 'entonces', 'pre-condición', 'precondicion', 'criterio'];
  const gnpSignals     = ['ca', 'gnp_id', 'description gnp', 'test type', 'funcional ref', 'expected result text'];
  const genericSignals = ['cp_id', 'gherkin', 'steps_raw', 'expected_result', 'caso de prueba'];

  let bestMatch = { format: 'generic', score: 0, headers: [], reasoning: 'Default fallback' };

  for (const cand of candidates) {
    const lower = cand.cells.map(c => c.toLowerCase());
    const joined = lower.join(' | ');

    const fogafinHits = fogafinSignals.filter(s => joined.includes(s)).length;
    const gnpHits     = gnpSignals.filter(s => joined.includes(s)).length;
    const genericHits = genericSignals.filter(s => joined.includes(s)).length;

    const colCount = cand.cells.length;

    // Reglas de decisión
    if (fogafinHits >= 2 && colCount >= 7 && colCount <= 12) {
      if (fogafinHits > bestMatch.score) {
        bestMatch = {
          format: 'fogafin',
          score: fogafinHits,
          headers: cand.cells,
          reasoning: `Detectado Gherkin preformateado (${fogafinHits} matches: ${fogafinSignals.filter(s => joined.includes(s)).join(', ')}) en hoja "${cand.sheet}" fila ${cand.row}, ${colCount} columnas.`,
          row: cand.row,
          sheet: cand.sheet,
        };
      }
    } else if (gnpHits >= 2 && colCount >= 15) {
      if (gnpHits > bestMatch.score) {
        bestMatch = {
          format: 'gnp',
          score: gnpHits,
          headers: cand.cells,
          reasoning: `Detectado formato GNP/tabular extendido (${gnpHits} matches: ${gnpSignals.filter(s => joined.includes(s)).join(', ')}) en hoja "${cand.sheet}" fila ${cand.row}, ${colCount} columnas.`,
          row: cand.row,
          sheet: cand.sheet,
        };
      }
    } else if (genericHits >= 1) {
      if (genericHits > bestMatch.score) {
        bestMatch = {
          format: 'generic',
          score: genericHits,
          headers: cand.cells,
          reasoning: `Detectado formato genérico (${genericHits} matches: ${genericSignals.filter(s => joined.includes(s)).join(', ')}) en hoja "${cand.sheet}" fila ${cand.row}.`,
          row: cand.row,
          sheet: cand.sheet,
        };
      }
    }
  }

  // Determinar confianza
  let confidence = 'low';
  if (bestMatch.score >= 3) confidence = 'high';
  else if (bestMatch.score >= 2) confidence = 'medium';
  else if (bestMatch.score === 0) {
    bestMatch.reasoning = 'Sin matches en signals conocidos. Asumiendo "generic" como fallback. El QA debe confirmar manualmente.';
  }

  return { ...bestMatch, confidence };
}

async function main() {
  const args = parseArgs();
  const xlsxPath = resolveXlsxPath(args.xlsxPath);

  let candidates;
  try {
    candidates = await readHeadersWithExcelJs(xlsxPath);
  } catch (e) {
    die(`Error leyendo xlsx: ${e.message}`);
  }

  if (candidates.length === 0) {
    die(`No se encontraron filas con encabezados en ${xlsxPath}`);
  }

  const result = classifyHeaders(candidates);

  const summary = {
    ok: true,
    xlsx_path: xlsxPath.replace(/\\/g, '/'),
    detected_format: result.format,
    confidence: result.confidence,
    sheet: result.sheet || candidates[0].sheet,
    header_row: result.row || candidates[0].row,
    headers_seen: result.headers,
    reasoning: result.reasoning,
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(result.confidence === 'low' ? 2 : 0);
}

main().catch(err => {
  process.stderr.write(`[detect-matrix-format] UNCAUGHT: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
