#!/usr/bin/env node
'use strict';

/**
 * ATF — CP Enricher (determinístico)
 *
 * Aplica un enrichment_plan.json sobre un cp_modulo_*.json.
 * No toma decisiones de contenido — solo aplica lo que el plan indica.
 *
 * Uso:
 *   node cp-enricher.js --plan <ruta> --source <ruta> --output <ruta> [--backup]
 *
 * Exit codes: 0 = OK | 1 = error
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const SCRIPT_VERSION = '1.1.0';
const SIGNATURE_TAG  = 'generated-by: cp-enricher.js';

/* ─── Helpers ─────────────────────────────────────────────────────── */

function die(msg) {
  console.error(`❌ cp-enricher: ${msg}`);
  process.exit(1);
}

const { readJSONOrDie, writeJSON } = require('./lib/json-utils');
const { splitStepsRaw }            = require('./lib/step-splitter');
const readJSON = (filePath) => readJSONOrDie(filePath, die);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--plan':   opts.plan   = args[++i]; break;
      case '--source': opts.source = args[++i]; break;
      case '--output': opts.output = args[++i]; break;
      case '--backup': opts.backup = true;      break;
      default:
        console.warn(`⚠️  Argumento desconocido ignorado: ${args[i]}`);
    }
  }
  return opts;
}

function pct(n, total) {
  return total === 0 ? '0.0' : ((n / total) * 100).toFixed(1);
}

/**
 * GATE REGLA 12 — huella auditable de resoluciones NotebookLM.
 *
 * Toda notebooklm_query con resultado != null y != "PENDIENTE" DEBE tener
 * una entrada correspondiente en notebooklm_query_log.json.
 *
 * Nacio de un incidente historico donde ~100 CPs fueron elevados a READY con
 * valores inventados (no consultados contra fuentes) sin invocacion real del MCP.
 *
 * Violacion → die() inmediato. El script NO aplica el plan.
 */
function enforceRegla12(plan, logPath) {
  // Recolectar queries "resueltas" (las que inyectarian valor al CP).
  const resolved = [];
  for (const cp of plan.enriched_cps) {
    const qs = cp.notebooklm_queries || [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (q.resultado !== null && q.resultado !== undefined && q.resultado !== 'PENDIENTE') {
        resolved.push({
          cp_id: cp.cp_id,
          query_index: i,
          archivo: q.archivo || '(sin archivo)',
          dato: q.dato || '(sin dato)',
          resolved_value: q.resultado,
        });
      }
    }
  }

  if (resolved.length === 0) {
    // Nada que verificar — no hubo resoluciones.
    return;
  }

  // Log debe existir.
  if (!fs.existsSync(logPath)) {
    die(
      `REGLA 12 violada — ${resolved.length} query(s) resuelta(s) en el plan pero ` +
      `no existe log auditable: ${logPath}\n` +
      `  Primera query sospechosa: CP ${resolved[0].cp_id}, archivo=${resolved[0].archivo}, ` +
      `valor="${String(resolved[0].resolved_value).substring(0, 80)}"\n` +
      `  Accion: el orchestrator debe consultar las fuentes REALES y escribir el log, ` +
      `NO inyectar valores inventados.`
    );
  }

  // Parsear log (debe ser array JSON).
  let logEntries;
  try {
    const raw = fs.readFileSync(logPath, 'utf-8');
    logEntries = JSON.parse(raw);
  } catch (e) {
    die(`REGLA 12 — no se pudo parsear ${logPath}: ${e.message}`);
  }

  if (!Array.isArray(logEntries)) {
    die(`REGLA 12 — ${logPath} debe ser un array JSON, encontrado: ${typeof logEntries}`);
  }

  // Para cada query resuelta, buscar entrada en log que la cubra.
  // Criterio: mismo source_file Y cp_id en propagated_to_cp_ids.
  const missing = [];
  for (const r of resolved) {
    const hasLog = logEntries.some(entry => {
      if (!entry || typeof entry !== 'object') return false;
      const sourceMatches = entry.source_file === r.archivo;
      const propagated = Array.isArray(entry.propagated_to_cp_ids) ? entry.propagated_to_cp_ids : [];
      const cpCovered = propagated.includes(r.cp_id);
      return sourceMatches && cpCovered;
    });
    if (!hasLog) {
      missing.push(r);
    }
  }

  if (missing.length > 0) {
    const preview = missing.slice(0, 3).map(m =>
      `  - CP ${m.cp_id} | archivo=${m.archivo} | dato=${m.dato} | valor="${String(m.resolved_value).substring(0, 60)}"`
    ).join('\n');

    die(
      `REGLA 12 violada — ${missing.length} query(s) sin huella en ${logPath}:\n` +
      `${preview}\n` +
      (missing.length > 3 ? `  ... y ${missing.length - 3} mas\n` : '') +
      `  Accion: cada resolved_value debe tener entrada en notebooklm_query_log.json ` +
      `con source_file y propagated_to_cp_ids coincidentes.`
    );
  }

  console.log(`   ✓ REGLA 12 OK — ${resolved.length} query(s) con huella auditable verificada`);
}

/* ─── Main ────────────────────────────────────────────────────────── */

function main() {
  const opts = parseArgs();

  // --- Validar argumentos requeridos ---
  if (!opts.plan || !opts.source || !opts.output) {
    die(
      'Uso: node cp-enricher.js --plan <ruta> --source <ruta> --output <ruta> [--backup]\n' +
      '  --plan    enrichment_plan.json generado por el agente\n' +
      '  --source  cp_modulo_*.json original\n' +
      '  --output  ruta donde escribir el archivo enriquecido\n' +
      '  --backup  crear copia _original antes de escribir'
    );
  }

  if (!fs.existsSync(opts.plan))   die(`Plan no encontrado: ${opts.plan}`);
  if (!fs.existsSync(opts.source)) die(`Source no encontrado: ${opts.source}`);

  // --- Leer inputs ---
  const plan   = readJSON(opts.plan);
  const source = readJSON(opts.source);

  if (!Array.isArray(plan.enriched_cps)) {
    die('El plan no contiene el campo "enriched_cps" (array esperado)');
  }
  if (!Array.isArray(source.test_cases)) {
    die('El source no contiene el campo "test_cases" (array esperado)');
  }

  // --- GATE REGLA 12 — Verificacion cruzada de huella auditable ---
  // Toda notebooklm_query con resultado ≠ null y ≠ "PENDIENTE" DEBE tener
  // entrada correspondiente en notebooklm_query_log.json. Si no → plan invalido.
  // Protege contra el patron historico donde CPs eran elevados a READY con
  // valores inventados sin invocacion real de NotebookLM.
  const planDir = path.dirname(opts.plan);
  const logPath = path.join(planDir, 'notebooklm_query_log.json');
  enforceRegla12(plan, logPath);

  // --- Indexar plan por cp_id ---
  const planMap = new Map();
  for (const entry of plan.enriched_cps) {
    if (!entry.cp_id) {
      die('Entrada en enriched_cps sin campo "cp_id"');
    }
    planMap.set(entry.cp_id, entry);
  }

  // --- Backup ---
  if (opts.backup) {
    const ext        = path.extname(opts.source);
    const base       = opts.source.slice(0, -ext.length);
    const backupPath = `${base}_original${ext}`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(opts.source, backupPath);
      console.log(`📂 Backup creado: ${backupPath}`);
    } else {
      console.log(`ℹ️  Backup ya existe, no se sobreescribe: ${backupPath}`);
    }
  }

  // --- Aplicar enriquecimiento ---
  const stats = { ready: 0, partial: 0, review: 0, untouched: 0, flattened: 0, setup_steps_total: 0, steps_split_cps: 0, steps_split_total: 0 };
  const enrichedDetails = [];

  const enrichedCases = source.test_cases.map(cp => {
    const entry = planMap.get(cp.cp_id);
    if (!entry) {
      stats.untouched++;
      return cp; // Sin modificar
    }

    // Clonar CP para no mutar el original en memoria
    const enriched = { ...cp };

    // Aplicar campos del plan
    // REGLA 13 — fragmentación agnóstica de pasos compuestos.
    // El splitter es determinista y NO inventa contenido: sólo explicita la
    // sintaxis compuesta (" Y ", ", luego ") cuando el segundo lado empieza
    // con verbo acción. Ver `.claude/tools/lib/step-splitter.js`.
    let splitResult = null;
    if (entry.steps_raw_enriched !== undefined) {
      splitResult = splitStepsRaw(entry.steps_raw_enriched);
      enriched.steps_raw = splitResult.result;
      if (splitResult.splits_applied > 0) {
        stats.steps_split_cps++;
        stats.steps_split_total += splitResult.splits_applied;
      }
    }
    if (entry.gherkin_enriched !== undefined) {
      enriched.gherkin = entry.gherkin_enriched;
    }
    enriched.preconditions      = '';
    enriched.enrichment_status  = entry.enrichment_status  || 'NEEDS_REVIEW';
    enriched.enrichment_notes   = entry.enrichment_notes   || '';

    // Propagar auto_inferred si existe (heurísticas v2 del worker).
    // Debe ocurrir ANTES de inyectar steps_split para no sobrescribirlo.
    if (entry.auto_inferred !== undefined) {
      enriched.auto_inferred = entry.auto_inferred;
    }

    // Inyectar steps_split DESPUÉS del auto_inferred del plan (evita sobrescritura).
    if (splitResult && splitResult.splits_applied > 0) {
      enriched.auto_inferred = enriched.auto_inferred || {};
      enriched.auto_inferred.steps_split = {
        applied: true,
        input_lines: splitResult.input_lines,
        output_lines: splitResult.output_lines,
        splits_applied: splitResult.splits_applied,
      };
    }

    // Propagar setup_steps_count si existe (FASE 2 enricher v2 — full flatten)
    if (entry.setup_steps_count !== undefined) {
      enriched.setup_steps_count = entry.setup_steps_count;
      stats.flattened++;
      stats.setup_steps_total += entry.setup_steps_count;
    }

    // Contadores
    switch (enriched.enrichment_status) {
      case 'READY':             stats.ready++;   break;
      case 'ENRICHED_PARTIAL':  stats.partial++; break;
      default:                  stats.review++;  break;
    }

    enrichedDetails.push({
      cp_id:  enriched.cp_id,
      title:  enriched.title || '',
      status: enriched.enrichment_status,
      notes:  enriched.enrichment_notes
    });

    return enriched;
  });

  // --- Escribir output ---
  const output = { ...source, test_cases: enrichedCases };
  writeJSON(opts.output, output);

  // --- Generar enrichment_report.md ---
  const reportDir  = path.dirname(opts.output);
  const reportPath = path.join(reportDir, 'enrichment_report.md');
  const totalEnriched = stats.ready + stats.partial + stats.review;
  const totalAll      = totalEnriched + stats.untouched;
  const now           = new Date().toISOString().slice(0, 16).replace('T', ' ');

  // Fuentes consultadas (unique)
  const sources = new Set();
  for (const entry of plan.enriched_cps) {
    if (Array.isArray(entry.notebooklm_queries)) {
      for (const q of entry.notebooklm_queries) {
        if (q.archivo) sources.add(q.archivo);
      }
    }
  }

  // Huella auditable: permite al agente verificar que el reporte fue producido
  // por este script y no inventado por el sub-agente (violación de REGLA 9/10).
  // Se normaliza antes de hashear (BOM + CRLF->LF) para que el mismo cp_modulo_*.json
  // produzca el mismo sourceSha en Windows y en Linux/CI. Con core.autocrlf=true el
  // working tree materializa CRLF en Windows, y hashear bytes crudos daría dos huellas
  // distintas para el mismo blob de Git. Criterio idéntico a
  // scripts/lib/asdd-hash-normalize-lib.mjs (ESM, no importable desde este .js CJS).
  const sourceText = fs
    .readFileSync(opts.source, 'utf8')
    .replace(/^﻿/, '')
    .replaceAll('\r\n', '\n');
  const sourceSha = crypto
    .createHash('sha256')
    .update(sourceText)
    .digest('hex')
    .slice(0, 16);
  const runTimestamp = new Date().toISOString();
  const signature =
    `<!-- ${SIGNATURE_TAG} | version: ${SCRIPT_VERSION} | run: ${runTimestamp} | source-sha: ${sourceSha} -->`;

  let md = `${signature}\n\n`;
  md += `# Reporte de Enriquecimiento — ${now}\n\n`;
  md += `## Resumen\n\n`;
  md += `| Estado | Cantidad | % |\n`;
  md += `|--------|----------|---|\n`;
  md += `| READY | ${stats.ready} | ${pct(stats.ready, totalEnriched)}% |\n`;
  md += `| ENRICHED_PARTIAL | ${stats.partial} | ${pct(stats.partial, totalEnriched)}% |\n`;
  md += `| NEEDS_REVIEW | ${stats.review} | ${pct(stats.review, totalEnriched)}% |\n`;
  md += `| Sin modificar | ${stats.untouched} | — |\n`;
  md += `| **Total CPs** | **${totalAll}** | |\n\n`;

  // Flatten stats (enricher v2).
  if (stats.flattened > 0) {
    const avgSetup = (stats.setup_steps_total / stats.flattened).toFixed(1);
    md += `## Determinismo (Full Flatten)\n\n`;
    md += `| Métrica | Valor |\n`;
    md += `|---------|-------|\n`;
    md += `| CPs con pasos [SETUP] inline | ${stats.flattened} (${pct(stats.flattened, totalEnriched)}%) |\n`;
    md += `| Total pasos [SETUP] | ${stats.setup_steps_total} |\n`;
    md += `| Promedio [SETUP] por CP | ${avgSetup} |\n`;
    md += `| Decisiones runtime executor | 0 |\n\n`;
  }

  // Step-splitter stats (REGLA 13 — fragmentación agnóstica de pasos compuestos).
  if (stats.steps_split_cps > 0) {
    md += `## Fragmentación de pasos compuestos (REGLA 13)\n\n`;
    md += `| Métrica | Valor |\n`;
    md += `|---------|-------|\n`;
    md += `| CPs con steps_raw fragmentado | ${stats.steps_split_cps} (${pct(stats.steps_split_cps, totalEnriched)}%) |\n`;
    md += `| Total nuevos steps generados por splits | ${stats.steps_split_total} |\n`;
    md += `| Fuente de verdad | \`.claude/tools/lib/step-splitter.js\` |\n\n`;
    md += `> Los pasos compuestos con conjunciones explícitas ( \` Y \`, \`, luego \`, \`, después \`) donde el segundo lado inicia con verbo acción fueron fragmentados en entradas separadas de \`steps_raw[]\`. Ver \`auto_inferred.steps_split\` en cada CP afectado.\n\n`;
  }

  if (enrichedDetails.length > 0) {
    md += `## CPs procesados\n\n`;
    md += `| cp_id | title | status | notes |\n`;
    md += `|-------|-------|--------|-------|\n`;
    for (const d of enrichedDetails) {
      const safeNotes = (d.notes || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const safeTitle = (d.title || '').replace(/\|/g, '\\|');
      md += `| ${d.cp_id} | ${safeTitle} | ${d.status} | ${safeNotes} |\n`;
    }
    md += '\n';
  }

  if (stats.untouched > 0) {
    md += `## CPs sin modificar\n\n`;
    md += `${stats.untouched} CPs no estaban incluidos en el plan y se copiaron sin cambios.\n\n`;
  }

  if (sources.size > 0) {
    md += `## Fuentes consultadas (NotebookLM)\n\n`;
    for (const s of sources) {
      md += `- ${s}\n`;
    }
    md += '\n';
  }

  fs.writeFileSync(reportPath, md, 'utf-8');

  // --- Resumen stdout ---
  console.log(`✅ cp-enricher — enriquecimiento aplicado`);
  console.log(`   📋 CPs procesados   : ${totalEnriched}`);
  console.log(`   ✅ READY            : ${stats.ready}`);
  console.log(`   ⚠️  ENRICHED_PARTIAL : ${stats.partial}`);
  console.log(`   ❌ NEEDS_REVIEW     : ${stats.review}`);
  console.log(`   —  Sin modificar    : ${stats.untouched}`);
  console.log(`   output              : ${opts.output}`);
  console.log(`   reporte             : ${reportPath}`);
  if (stats.flattened > 0) {
    const avgSetup = (stats.setup_steps_total / stats.flattened).toFixed(1);
    console.log(`   🔧 [SETUP] inline   : ${stats.flattened} CPs (avg ${avgSetup} pasos/CP)`);
  }
  if (stats.steps_split_cps > 0) {
    console.log(`   ✂️  Steps fragmentados: ${stats.steps_split_cps} CPs · +${stats.steps_split_total} entradas nuevas (REGLA 13)`);
  }
  console.log(`   signature           : ${SIGNATURE_TAG} v${SCRIPT_VERSION} (source-sha: ${sourceSha})`);
}

main();
