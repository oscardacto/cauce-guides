#!/usr/bin/env node
/**
 * ATF — validate-step-fidelity.js
 *
 * Valida la fidelidad 1:1 entre steps_raw del CP (fuente de verdad) y
 * steps[] del result.json (producido por el executor).
 *
 * Detecta de forma determinística cuando el executor consolidó, fusionó
 * u omitió pasos de steps_raw, violando la REGLA DE FIDELIDAD 1:1.
 *
 * Modos de uso:
 *
 *   Modo single (un CP):
 *     node validate-step-fidelity.js \
 *       --cp-file <design/cp_modulo_X.json> \
 *       --result-file <execution/X/cp_folder/result.json> \
 *       --cp-id <CP-Matriz_1-12,01,1>
 *
 *   Modo batch (todos los CPs de un módulo):
 *     node validate-step-fidelity.js \
 *       --cp-file <design/cp_modulo_X.json> \
 *       --execution-dir <execution/X/>
 *
 * Exit codes:
 *   0 — fidelidad OK (todos los CPs validados pasan)
 *   2 — fidelidad ROTA en ≥1 CP (WARNING, no bloqueante — el caller debe pedir
 *       approval al usuario). También: error de entrada (archivos no encontrados,
 *       JSON inválido, args faltantes). El stdout JSON distingue ambos casos vía
 *       el campo `overall_status`: "FIDELITY_BROKEN" vs error de I/O.
 *
 * NOTA: pre-C2, exit 1 indicaba fidelidad rota y el caller detenía
 * el pipeline. Tras C2, fidelidad rota es exit 2 (warning con approval). Los
 * errores de I/O también usan exit 2 — diferenciar por el contenido del stdout.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── PARSE ARGS ──────────────────────────────────────────────────────────────

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) {
    const key = process.argv[i].replace(/^--/, '');
    const val = process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
      ? process.argv[++i]
      : true;
    args[key] = val;
  }
}

const cpFilePath     = args['cp-file'];
const resultFilePath = args['result-file'];
const cpId           = args['cp-id'];
const executionDir   = args['execution-dir'];

if (!cpFilePath) {
  console.error('Error: --cp-file es requerido (ruta al cp_modulo_*.json con steps_raw)');
  console.error('Uso single: node validate-step-fidelity.js --cp-file <cp.json> --result-file <result.json> --cp-id <id>');
  console.error('Uso batch:  node validate-step-fidelity.js --cp-file <cp.json> --execution-dir <dir/>');
  process.exit(2);
}

const isBatchMode  = !!executionDir;
const isSingleMode = !!resultFilePath && !!cpId;

if (!isBatchMode && !isSingleMode) {
  console.error('Error: especificar --result-file + --cp-id (single) o --execution-dir (batch)');
  process.exit(2);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const { readJSON } = require('./lib/json-utils');

/**
 * Parsea steps_raw exactamente como lo hace el executor:
 * 1. Split por \n
 * 2. Strip "- " al inicio
 * 3. Trim whitespace
 * 4. Filtrar líneas vacías
 */
function parseStepsRaw(stepsRaw) {
  if (!stepsRaw || typeof stepsRaw !== 'string') return [];
  return stepsRaw
    .split('\n')
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Deriva steps_raw desde Gherkin cuando steps_raw está ausente.
 * Extrae líneas When/And/Then (acciones y verificaciones), excluyendo
 * las líneas And que siguen a un Given (que son precondiciones).
 */
function deriveStepsRawFromGherkin(gherkin) {
  if (!gherkin || typeof gherkin !== 'string') return null;
  const trimmed = gherkin.split('\n').map(l => l.trim()).filter(Boolean);
  const result = [];
  let inActionZone = false; // true after first When/Then/Cuando/Entonces
  for (const line of trimmed) {
    if (/^(When|Cuando)\s/i.test(line)) {
      inActionZone = true;
      result.push(line.replace(/^(When|Cuando)\s+/i, '').trim());
    } else if (/^(Then|Entonces)\s/i.test(line)) {
      inActionZone = true;
      result.push(line.replace(/^(Then|Entonces)\s+/i, '').trim());
    } else if (/^(And|Y|But|Pero)\s/i.test(line) && inActionZone) {
      result.push(line.replace(/^(And|Y|But|Pero)\s+/i, '').trim());
    } else if (/^(Given|Dado)\s/i.test(line)) {
      inActionZone = false; // reset — subsequent And lines are preconditions
    }
  }
  if (result.length === 0) return null;
  return result.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

/**
 * Busca un CP por cp_id en el archivo de CPs.
 * Soporta ambas estructuras: { test_cases: [...] } y { cases: [...] }
 */
function findCpInFile(cpData, targetCpId) {
  const candidates = cpData.test_cases || cpData.cases || [];
  return candidates.find(c => c.cp_id === targetCpId) || null;
}

/**
 * Valida fidelidad de un solo CP.
 * Retorna objeto con resultado de la validación.
 */
function validateSingleCp(cpSource, resultData, targetCpId) {
  const output = {
    cp_id: targetCpId,
    status: 'OK',
    steps_raw_count: 0,
    result_steps_count: 0,
    result_steps_non_auth_count: 0,
    delta: 0,
    missing_steps: [],
    extra_steps: [],
    nav_learning_warning: null
  };

  // Parsear steps_raw (con fallback desde gherkin)
  let stepsSource = cpSource.steps_raw;
  if (!stepsSource && cpSource.gherkin) {
    stepsSource = deriveStepsRawFromGherkin(cpSource.gherkin);
    if (stepsSource) {
      output.note = 'steps_raw derivado de gherkin (When/And/Then)';
    }
  }
  const stepsParsed = parseStepsRaw(stepsSource);
  output.steps_raw_count = stepsParsed.length;

  if (stepsParsed.length === 0) {
    output.status = 'SKIPPED';
    output.note = 'steps_raw vacío o ausente y gherkin no disponible — nada que validar';
    return output;
  }

  // Leer steps del result.json
  const allSteps = resultData.steps || [];
  output.result_steps_count = allSteps.length;

  // Filtrar steps de tipo AUTH (login inyectado — no cuenta para fidelidad)
  const stepsNonAuth = allSteps.filter(s =>
    s.type !== 'AUTH' && s.type !== 'auth'
  );
  output.result_steps_non_auth_count = stepsNonAuth.length;

  const expected = stepsParsed.length;
  const actual   = stepsNonAuth.length;
  output.delta   = expected - actual;

  if (expected === actual) {
    output.status = 'OK';
  } else {
    output.status = 'FIDELITY_BROKEN';

    if (actual < expected) {
      // Detectar qué pasos de steps_raw no están representados
      for (let i = 0; i < stepsParsed.length; i++) {
        const expectedN = i + 1;
        const matchByN = stepsNonAuth.find(s => s.n === expectedN);
        if (!matchByN) {
          output.missing_steps.push({
            index: expectedN,
            text: stepsParsed[i]
          });
        }
      }

      // Si no se pudieron detectar por n (el executor no usó n posicional),
      // reportar los últimos N pasos como faltantes
      if (output.missing_steps.length === 0 && actual < expected) {
        for (let i = actual; i < expected; i++) {
          output.missing_steps.push({
            index: i + 1,
            text: stepsParsed[i]
          });
        }
      }
    } else {
      // Más steps en result que en steps_raw (steps extra no justificados)
      output.extra_steps = stepsNonAuth
        .filter(s => s.n > expected)
        .map(s => ({ n: s.n, text: s.text }));
    }
  }

  // Warning adicional: nav_learning totals en 0 con muchos pasos
  const nl = resultData.nav_learning;
  if (nl && nl.hits === 0 && nl.misses === 0 && nl.discoveries === 0
      && stepsParsed.length > 3) {
    output.nav_learning_warning =
      `nav_learning totals son 0 con ${stepsParsed.length} pasos en steps_raw`
      + ` — el executor posiblemente no iteró steps_raw individualmente`;
  }

  return output;
}

// ─── CARGAR CP FILE ──────────────────────────────────────────────────────────

const cpData = readJSON(cpFilePath);
if (!cpData) {
  console.error(`Error: no se pudo leer o parsear ${cpFilePath}`);
  process.exit(2);
}

// ─── MODO SINGLE ─────────────────────────────────────────────────────────────

if (isSingleMode) {
  const cpSource = findCpInFile(cpData, cpId);
  if (!cpSource) {
    console.error(`Error: CP "${cpId}" no encontrado en ${cpFilePath}`);
    console.error(`  CPs disponibles (primeros 5): ${
      (cpData.test_cases || cpData.cases || []).slice(0, 5).map(c => c.cp_id).join(', ')
    }`);
    process.exit(2);
  }

  const resultData = readJSON(resultFilePath);
  if (!resultData) {
    console.error(`Error: no se pudo leer o parsear ${resultFilePath}`);
    process.exit(2);
  }

  const result = validateSingleCp(cpSource, resultData, cpId);
  console.log(JSON.stringify(result, null, 2));
  // C2 — fidelity broken es WARNING (exit 2), no bloqueante. El executor pausa para approval.
  process.exit(result.status === 'OK' || result.status === 'SKIPPED' ? 0 : 2);
}

// ─── MODO BATCH ──────────────────────────────────────────────────────────────

if (isBatchMode) {
  if (!fs.existsSync(executionDir)) {
    console.error(`Error: directorio ${executionDir} no existe`);
    process.exit(2);
  }

  // Buscar todos los result.json en subdirectorios del execution dir
  const entries = fs.readdirSync(executionDir, { withFileTypes: true });
  const cpFolders = entries.filter(e => e.isDirectory());

  const results = [];
  let brokenCount = 0;
  let okCount = 0;
  let skippedCount = 0;

  for (const folder of cpFolders) {
    const resultPath = path.join(executionDir, folder.name, 'result.json');
    if (!fs.existsSync(resultPath)) continue;

    const resultData = readJSON(resultPath);
    if (!resultData || !resultData.cp_id) continue;

    const cpSource = findCpInFile(cpData, resultData.cp_id);
    if (!cpSource) {
      results.push({
        cp_id: resultData.cp_id,
        status: 'CP_NOT_FOUND_IN_SOURCE',
        note: `CP no encontrado en ${path.basename(cpFilePath)}`
      });
      continue;
    }

    const validation = validateSingleCp(cpSource, resultData, resultData.cp_id);
    results.push(validation);

    if (validation.status === 'FIDELITY_BROKEN') brokenCount++;
    else if (validation.status === 'OK') okCount++;
    else skippedCount++;
  }

  const batchOutput = {
    mode: 'batch',
    cp_file: path.basename(cpFilePath),
    execution_dir: executionDir,
    total_validated: results.length,
    ok: okCount,
    broken: brokenCount,
    skipped: skippedCount,
    overall_status: brokenCount > 0 ? 'FIDELITY_BROKEN' : 'OK',
    details: results.filter(r => r.status !== 'OK' && r.status !== 'SKIPPED')
  };

  console.log(JSON.stringify(batchOutput, null, 2));
  // C2 — fidelity broken es WARNING (exit 2), no bloqueante. El executor/orchestrator pausa para approval.
  process.exit(brokenCount > 0 ? 2 : 0);
}
