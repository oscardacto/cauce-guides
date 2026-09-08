#!/usr/bin/env node
/**
 * ATF — validate-cp-coverage.js
 *
 * Validador determinístico que reescribe el `coverage_matrix` y `cases_by_risk`
 * de un `cp_modulo_*.json` con la VERDAD MEDIDA contra `base_pruebas.md`.
 *
 * Sin este validador, el agente design-team puede sobrereportar cobertura
 * (declarar 100% cuando la realidad medida es menor) por subreportar CAs
 * documentados de alguna HU. Doctrina: el LLM declara, el script verifica.
 *
 * Doctrina prosa-vs-código: el validador es 100% determinístico. El agente NO
 * necesita auto-contar — emite los CPs y este script normaliza el header.
 *
 * Mecanismo:
 *   1. Parsea `base_pruebas.md` por HU (heading H3) → cuenta bullets bajo
 *      "**Criterios de aceptación:**". Esos son los CAs DOCUMENTADOS.
 *   2. Lee `cp_modulo_*.json` → para cada HU, cuenta CAs únicos cubiertos:
 *      preferir `hu_traceability` (mapping CA → assigned_cps[]); fallback a
 *      `ca_ref` por test_case agrupado por `hu_id`.
 *   3. Reescribe en el archivo:
 *        - `total_cases` = test_cases.length (autocount)
 *        - `cases_by_risk` = group by risk_level (autocount)
 *        - `coverage_matrix.total_cas_in_hu` = sum(documentados)
 *        - `coverage_matrix.cas_covered` = sum(min(cubiertos, documentados))
 *        - `coverage_matrix.gaps[]` = lista descriptiva de HUs sub-cubiertas
 *   4. Modo `--mode warning` (default): emite warning a stderr + escribe gaps
 *      en el JSON. Exit 0.
 *      Modo `--mode enforce` (+): exit 2 si hay gaps. Diferido por ahora.
 *
 * Uso:
 *   node validate-cp-coverage.js --cp-file <ruta> --base-pruebas <ruta> [--mode warning|enforce]
 *
 * Stdout (JSON):
 *   { ok, cp_file, total_cases, cases_by_risk, coverage_matrix, gaps_detected }
 *
 * Exit codes:
 *   0 = OK (sin gaps O modo warning con gaps)
 *   1 = error fatal
 *   2 = (modo enforce) gaps detectados
 */

'use strict';

const fs   = require('fs');
const path = require('path');

function die(msg) {
  process.stderr.write(`validate-cp-coverage: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { mode: 'warning' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = argv[++i];
    }
  }
  return out;
}

function readJSON(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die(`JSON inválido en ${p}: ${e.message}`); }
}

function writeJSONAtomic(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

/**
 * Cuenta bullets bajo "**Criterios de aceptación:**" por HU.
 * Returns: Map<hu_label, count>
 *   hu_label format: 'HU-1' | 'HU001' | etc. — el id que aparece en el heading H3.
 */
function countDocumentedCAs(basePruebasPath) {
  if (!fs.existsSync(basePruebasPath)) {
    return { byHu: {}, total: 0, error: `base_pruebas.md no encontrado: ${basePruebasPath}` };
  }
  const md = fs.readFileSync(basePruebasPath, 'utf8');
  const huHeadings = [...md.matchAll(/^###\s+(HU-?\w+):\s*(.+?)$/gm)];
  const byHu = {};
  for (let i = 0; i < huHeadings.length; i++) {
    const m = huHeadings[i];
    const huLabel = m[1];
    const startIdx = m.index;
    const endIdx = i < huHeadings.length - 1 ? huHeadings[i + 1].index : md.length;
    const block = md.slice(startIdx, endIdx);
    // Buscar sección "**Criterios de aceptación:**"
    const caSection = block.match(/\*\*Criterios de aceptación:\*\*([\s\S]*?)(?=\n\*\*[A-ZÁÉÍÓÚ]|\n###|\n##|$)/);
    if (!caSection) {
      byHu[huLabel] = 0;
      continue;
    }
    // Contar bullets (`-` o `*` al inicio de línea)
    const items = caSection[1].split('\n').filter(l => /^\s*[-*]\s+\S/.test(l));
    byHu[huLabel] = items.length;
  }
  const total = Object.values(byHu).reduce((a, b) => a + b, 0);
  return { byHu, total };
}

/**
 * Cuenta CAs únicos cubiertos por algún CP, agrupado por HU.
 * Estrategia:
 *   - Preferir hu_traceability.{CA-id}.assigned_cps[] (si existe y no está vacío).
 *   - Fallback: agrupar test_cases por hu_id y contar ca_ref únicos.
 * Returns: Map<hu_label, count>
 */
function countCoveredCAs(cpDoc) {
  const byHu = {};

  // Estrategia 1: hu_traceability
  const trace = cpDoc.hu_traceability || {};
  for (const [caId, info] of Object.entries(trace)) {
    if (!info || !Array.isArray(info.assigned_cps) || info.assigned_cps.length === 0) continue;
    // Extraer label HU del CA-id: 'CA-HU-1-...' → 'HU-1', 'CA-HU001-...' → 'HU001'
    const m = caId.match(/^CA-(HU-?\w+)-/);
    if (!m) continue;
    const hu = m[1];
    if (!byHu[hu]) byHu[hu] = new Set();
    byHu[hu].add(caId);
  }

  // Si hu_traceability vacío, fallback a ca_ref por CP
  if (Object.keys(byHu).length === 0) {
    for (const cp of (cpDoc.test_cases || [])) {
      if (!cp.hu_id || !cp.ca_ref) continue;
      // hu_id puede venir como 'HU-1-consultar-job-titles' → extraer prefijo HU-1
      const m = String(cp.hu_id).match(/^(HU-?\w+)/);
      if (!m) continue;
      const hu = m[1];
      if (!byHu[hu]) byHu[hu] = new Set();
      byHu[hu].add(cp.ca_ref);
    }
  }

  // Convertir Sets a counts
  const counts = {};
  for (const [hu, set] of Object.entries(byHu)) counts[hu] = set.size;
  return counts;
}

/** Recalcula cases_by_risk desde el array de test_cases */
function recalcCasesByRisk(testCases) {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const cp of testCases) {
    const r = (cp.risk_level || '').toLowerCase();
    if (r in out) out[r]++;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args['cp-file']) die('--cp-file es obligatorio');
  if (!args['base-pruebas']) die('--base-pruebas es obligatorio');
  if (!['warning', 'enforce'].includes(args.mode)) die(`--mode inválido: ${args.mode}`);

  const cpFile = path.resolve(args['cp-file']);
  const bpFile = path.resolve(args['base-pruebas']);
  if (!fs.existsSync(cpFile)) die(`cp_modulo no encontrado: ${cpFile}`);

  const cpDoc = readJSON(cpFile);
  const testCases = Array.isArray(cpDoc.test_cases) ? cpDoc.test_cases : [];

  // 1) Recalcular total_cases y cases_by_risk
  const totalCases = testCases.length;
  const casesByRisk = recalcCasesByRisk(testCases);

  // 2) Documentados vs cubiertos
  const documented = countDocumentedCAs(bpFile);
  const covered = countCoveredCAs(cpDoc);

  // Solo evaluar HUs que aparecen en el módulo (tienen CPs asignados)
  const huInModule = new Set(
    testCases.map(cp => {
      const m = String(cp.hu_id || '').match(/^(HU-?\w+)/);
      return m ? m[1] : null;
    }).filter(Boolean)
  );

  // Construir lista de CAs cubiertos por HU (para auto-cura P75)
  const coveredCAsByHu = {};
  const trace = cpDoc.hu_traceability || {};
  for (const [caId, info] of Object.entries(trace)) {
    if (!info || !Array.isArray(info.assigned_cps) || info.assigned_cps.length === 0) continue;
    const m = caId.match(/^CA-(HU-?\w+)-/);
    if (!m) continue;
    const hu = m[1];
    if (!coveredCAsByHu[hu]) coveredCAsByHu[hu] = [];
    coveredCAsByHu[hu].push(caId);
  }

  let totalCAsInHu = 0;
  let casCovered = 0;
  const gaps = [];
  for (const hu of huInModule) {
    const docCount = documented.byHu[hu] ?? 0;
    const covCount = covered[hu] ?? 0;
    totalCAsInHu += docCount;
    // No permitir cas_covered > documented (clamp)
    casCovered += Math.min(covCount, docCount);
    if (covCount < docCount) {
      gaps.push({
        hu,
        documented: docCount,
        covered: covCount,
        gap: docCount - covCount,
        message: `HU ${hu}: ${docCount} CAs documentados, ${covCount} cubiertos por CPs (gap=${docCount - covCount})`,
        // P75 — info para auto-cura
        covered_ca_ids: coveredCAsByHu[hu] || [],
        missing_count: docCount - covCount,
      });
    } else if (covCount > docCount) {
      // El agente fragmentó CAs (CA-X-01a, 01b, 01c) — informativo, no es un problema
      gaps.push({
        hu,
        documented: docCount,
        covered: covCount,
        gap: 0,
        message: `HU ${hu}: ${docCount} CAs documentados, ${covCount} sub-CAs cubiertos (fragmentación del agente)`,
        kind: 'fragmentation',
      });
    }
  }

  // 3) Reescribir cp_modulo con valores corregidos
  const prevTotalCases = cpDoc.total_cases;
  const prevCasesByRisk = cpDoc.cases_by_risk;
  const prevCoverageMatrix = cpDoc.coverage_matrix;

  cpDoc.total_cases = totalCases;
  cpDoc.cases_by_risk = casesByRisk;
  cpDoc.coverage_matrix = {
    ...(cpDoc.coverage_matrix || {}),
    total_cas_in_hu: totalCAsInHu,
    cas_covered: casCovered,
    cas_blocked: cpDoc.coverage_matrix?.cas_blocked || 0,
    cas_excluded: cpDoc.coverage_matrix?.cas_excluded || 0,
    coverage_pct: totalCAsInHu > 0 ? Math.round((casCovered / totalCAsInHu) * 1000) / 10 : 100,
    gaps,
    validated_at: new Date().toISOString(),
    validator: 'validate-cp-coverage.js',
  };

  writeJSONAtomic(cpFile, cpDoc);

  // 4) Emitir warnings a stderr si hay gaps reales
  const realGaps = gaps.filter(g => g.gap > 0);
  if (realGaps.length > 0) {
    process.stderr.write('\n⚠️  COVERAGE GAPS DETECTADOS (modo ' + args.mode + '):\n');
    for (const g of realGaps) process.stderr.write('   - ' + g.message + '\n');
    process.stderr.write('   Total: ' + casCovered + '/' + totalCAsInHu + ' CAs cubiertos (' + (cpDoc.coverage_matrix.coverage_pct) + '%)\n');
    if (prevCoverageMatrix?.cas_covered != null && prevCoverageMatrix?.total_cas_in_hu != null) {
      process.stderr.write('   (Agente había declarado: ' + prevCoverageMatrix.cas_covered + '/' + prevCoverageMatrix.total_cas_in_hu + ')\n');
    }
    process.stderr.write('\n');
  }

  // Detectar drift en cases_by_risk si lo había declarado el agente
  if (prevCasesByRisk && JSON.stringify(prevCasesByRisk) !== JSON.stringify(casesByRisk)) {
    process.stderr.write('   ℹ️  cases_by_risk corregido: ' +
      JSON.stringify(prevCasesByRisk) + ' → ' + JSON.stringify(casesByRisk) + '\n');
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    cp_file: cpFile,
    total_cases: totalCases,
    cases_by_risk: casesByRisk,
    coverage_matrix: cpDoc.coverage_matrix,
    gaps_detected: realGaps.length,
    mode: args.mode,
    drift_detected: {
      total_cases: prevTotalCases !== totalCases,
      cases_by_risk: JSON.stringify(prevCasesByRisk) !== JSON.stringify(casesByRisk),
      coverage_pct: prevCoverageMatrix?.cas_covered !== casCovered ||
                    prevCoverageMatrix?.total_cas_in_hu !== totalCAsInHu,
    },
  }, null, 2) + '\n');

  if (args.mode === 'enforce' && realGaps.length > 0) process.exit(2);
  process.exit(0);
}

main();
