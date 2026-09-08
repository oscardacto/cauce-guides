#!/usr/bin/env node
/**
 * ATF — design-merge.js
 *
 * Consolida fragments per-HU producidos por el agente design-team en modo
 * `single_hu` en un único `cp_modulo_{module_id}.json`. Permite procesar HUs
 * de forma aislada (1 invocación del Agent tool por HU) evitando el techo
 * de max_tokens del LLM cuando un módulo tiene 4+ HUs.
 *
 * Doctrina: 1 HU por completion → output dentro del presupuesto del LLM,
 * sin Write failed + retry con cobertura recortada.
 *
 * Fragment shape esperado (por HU):
 *   {
 *     "module_id": "...", "run_id": "...", "target_hu_id": "...",
 *     "test_cases": [...], "test_datasets": [...], "screens": [...],
 *     "hu_traceability": {...}, "design_mode": "..."
 *   }
 *
 * Merge atómico:
 *   - test_cases[]: concat (no dedup; cp_id ya es único por HU)
 *   - test_datasets[]: concat con dedup por ds_id (suelen reutilizarse)
 *   - screens[]: dedup por url_path; merge required_by_cps (union)
 *   - hu_traceability: spread (keys CA-HU-N-XX, no colisionan entre HUs)
 *   - cases_by_risk: recalcular auto desde test_cases (P65 lo reescribe luego)
 *   - coverage_matrix: dejar en estado básico, P65 lo reescribe
 *
 * Uso:
 *   node design-merge.js --module-id <id> --design-dir <path> [--fragments-dir <path>] [--cleanup]
 *
 * Stdout (JSON):
 *   { ok, cp_file, fragments_merged, total_cases, datasets_unique, screens_unique, hu_traceability_entries }
 */

'use strict';

const fs   = require('fs');
const path = require('path');

function die(msg) { process.stderr.write(`design-merge: ${msg}\n`); process.exit(1); }

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

function readJSON(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// P77a — Validación ESTRICTA de fragment antes del merge.
//
// Detecta patrones de expresiones JS que romperían JSON.parse() y emite mensaje
// accionable al QA. Aborta con exit 1 limpio (NO se intenta auto-reparar — la
// doctrina prosa-vs-código prohíbe ad-hoc auto-reparación con node -e replace).
//
// repeat(400) en
// test_datasets[].data → flujo improvisó node -e txt.replace(...) con
// regex frágil. P77a hace el fallo determinístico y la remediación clara.
//
// Patrones detectados (anti-doctrina REGLA 8 de design.md):
//   - .repeat(N), .padEnd(N), .padStart(N) — métodos de String runtime
//   - Array(N).fill(...) — constructor runtime
//   - dollar-brace (template literals)
//   - comentarios de línea // y bloque (no aceptados por JSON)
//
// Si ningún patrón conocido pero JSON.parse falla → mensaje genérico con la
// posición del error de parse + sugerencia de re-ejecutar la HU específica.
function validateFragmentStrict(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const offenders = [];

  const patterns = [
    { re: new RegExp('["\\\']\\s*\\)\\s*\\.repeat\\s*\\(', 'g'), hint: 'cadena.repeat(N) - usar literal expandido' },
    { re: new RegExp('\\.padEnd\\s*\\(', 'g'),                   hint: '.padEnd(N, ...) - usar literal expandido' },
    { re: new RegExp('\\.padStart\\s*\\(', 'g'),                 hint: '.padStart(N, ...) - usar literal expandido' },
    { re: new RegExp('\\bArray\\s*\\(\\s*\\d+\\s*\\)\\s*\\.fill\\s*\\(', 'g'), hint: 'Array(N).fill(X) - usar literal expandido' },
    { re: new RegExp('\\$\\{[^}]+\\}', 'g'),                     hint: 'template literal dollar-brace - usar string concatenado' },
    { re: new RegExp('(^|\\s)//[^\\n]*$', 'gm'),                 hint: 'comentario // - JSON no acepta comentarios' },
    { re: new RegExp('/\\*[\\s\\S]*?\\*/', 'g'),                 hint: 'comentario /* */ - JSON no acepta comentarios' },
  ];

  for (const { re, hint } of patterns) {
    let m;
    while ((m = re.exec(raw)) !== null) {
      const lineNum = raw.substr(0, m.index).split('\n').length;
      const snippet = raw.substr(Math.max(0, m.index - 20), 80).replace(/\n/g, ' ');
      offenders.push({ line: lineNum, snippet, hint });
      if (offenders.length >= 5) break;
    }
    if (offenders.length >= 5) break;
  }

  let parseError = null;
  try { JSON.parse(raw); }
  catch (e) { parseError = e.message; }

  if (offenders.length > 0 || parseError) {
    const fragmentName = path.basename(filePath);
    const huMatch = fragmentName.match(/__hu_([^.]+)\.json$/);
    const huId = huMatch ? huMatch[1] : '<unknown>';

    process.stderr.write('\n' + '='.repeat(70) + '\n');
    process.stderr.write('design-merge: FRAGMENT INVÁLIDO — ABORTANDO MERGE (P77a)\n');
    process.stderr.write('='.repeat(70) + '\n');
    process.stderr.write(`Fragment   : ${filePath}\n`);
    process.stderr.write(`HU         : ${huId}\n`);
    if (parseError) {
      process.stderr.write(`JSON.parse : ${parseError}\n`);
    }
    if (offenders.length > 0) {
      process.stderr.write(`\nPatrones JS detectados (REGLA 8 de design.md):\n`);
      for (const o of offenders) {
        process.stderr.write(`  · L${o.line}: ${o.hint}\n`);
        process.stderr.write(`         …${o.snippet.trim()}…\n`);
      }
    }
    process.stderr.write(`\nDoctrina prosa-vs-código (CLAUDE.md): el merge NO improvisa auto-reparación.\n`);
    process.stderr.write(`PROHIBIDO al caller intentar \`node -e "txt.replace(...)"\` ad-hoc.\n`);
    process.stderr.write(`\nAcción del QA:\n`);
    process.stderr.write(`  1) Eliminar fragment inválido:\n`);
    process.stderr.write(`     rm "${filePath}"\n`);
    process.stderr.write(`  2) Re-ejecutar SOLO esa HU (cuando /asdd:qa-web-design --hu esté disponible) o\n`);
    process.stderr.write(`     re-ejecutar el módulo completo con /asdd:qa-web-design --module {M}.\n`);
    process.stderr.write(`  3) El agente DEBE emitir test_datasets como literales JSON puros\n`);
    process.stderr.write(`     (sin .repeat(), sin \${}, sin comentarios). Ver REGLA 8.\n`);
    process.stderr.write('='.repeat(70) + '\n\n');
    process.exit(1);
  }
}

function writeJSONAtomic(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function main() {
  const args = parseArgs(process.argv);
  const moduleId  = args['module-id'];
  const designDir = args['design-dir'];
  if (!moduleId)  die('--module-id es obligatorio');
  if (!designDir) die('--design-dir es obligatorio');

  const fragmentsDir = path.resolve(args['fragments-dir'] || path.join(designDir, '.tmp', 'design_fragments'));
  if (!fs.existsSync(fragmentsDir)) {
    die(`fragments-dir no existe: ${fragmentsDir}`);
  }

  // Buscar fragments del módulo
  const prefix = `cp_modulo_${moduleId}__hu_`;
  const fragmentFiles = fs.readdirSync(fragmentsDir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .map(f => path.join(fragmentsDir, f))
    .sort();

  if (fragmentFiles.length === 0) {
    die(`Sin fragments en ${fragmentsDir} con prefijo ${prefix}`);
  }

  // P77a — Validación estricta ANTES del merge.
  // Si algún fragment tiene expresiones JS o JSON inválido, abortar limpio
  // con mensaje accionable. NO se intenta auto-reparar (doctrina prosa-vs-código).
  for (const f of fragmentFiles) {
    validateFragmentStrict(f);
  }

  const fragments = fragmentFiles.map(readJSON).filter(Boolean);
  if (fragments.length === 0) die('Fragments inválidos o vacíos');

  // Inicializar shape del cp_modulo final con metadata del primer fragment
  const first = fragments[0];
  const merged = {
    module_id:    moduleId,
    module_name:  first.module_name || '',
    run_id:       first.run_id || '',
    generated_at: new Date().toISOString(),
    design_mode:  first.design_mode || 'full',
    produced_by:  first.produced_by || 'standalone-command',
    total_cases:  0,
    cases_by_risk: { critical: 0, high: 0, medium: 0, low: 0 },
    coverage_matrix: {
      total_cas_in_hu: 0,
      cas_covered: 0,
      cas_blocked: 0,
      cas_excluded: 0,
      combinations_documented: 0,
      combinations_designed: 0,
      gaps: [],
      pending_validation: true,
    },
    data_needs_summary: {
      total_needs: 0,
      by_provisioning: {},
      client_action_required: [],
      cp_dependencies: [],
    },
    test_cases: [],
    test_datasets: [],
    hu_traceability: {},
    merged_from: fragmentFiles.map(p => path.basename(p)),
  };

  // Mergear test_cases (concat — cp_id único por HU)
  const seenCpIds = new Set();
  for (const frag of fragments) {
    for (const cp of (frag.test_cases || [])) {
      if (!cp.cp_id) continue;
      if (seenCpIds.has(cp.cp_id)) continue; // ignorar duplicado defensivo
      seenCpIds.add(cp.cp_id);
      merged.test_cases.push(cp);
    }
  }

  // Mergear test_datasets (dedup por ds_id; preservar primer encuentro)
  const seenDsIds = new Set();
  for (const frag of fragments) {
    for (const ds of (frag.test_datasets || [])) {
      if (!ds.ds_id || seenDsIds.has(ds.ds_id)) continue;
      seenDsIds.add(ds.ds_id);
      merged.test_datasets.push(ds);
    }
  }

  // Mergear hu_traceability (keys son CA-IDs únicos por HU, no colisionan)
  for (const frag of fragments) {
    if (frag.hu_traceability && typeof frag.hu_traceability === 'object') {
      Object.assign(merged.hu_traceability, frag.hu_traceability);
    }
  }

  // Cases_by_risk = recalcular desde test_cases (P65 lo reescribirá pero
  // dejarlo coherente desde aquí evita confusión inmediata).
  for (const cp of merged.test_cases) {
    const r = (cp.risk_level || '').toLowerCase();
    if (r in merged.cases_by_risk) merged.cases_by_risk[r]++;
  }
  merged.total_cases = merged.test_cases.length;

  // data_needs_summary — consolidar fragments + fallback recálculo desde CPs.
  // Si los fragments emiten summary parcial correcto (PASO 3.7 honrado en single_hu),
  // mergeo sus valores. Si los fragments dejan total_needs en 0 (omisión P86), recálculo
  // desde test_cases[].data_needs[] como red de seguridad.
  for (const frag of fragments) {
    const ns = frag.data_needs_summary;
    if (!ns) continue;
    merged.data_needs_summary.total_needs += (ns.total_needs || 0);
    // Mergear by_provisioning (sumando counts por tipo)
    if (ns.by_provisioning && typeof ns.by_provisioning === 'object') {
      for (const k of Object.keys(ns.by_provisioning)) {
        merged.data_needs_summary.by_provisioning[k] =
          (merged.data_needs_summary.by_provisioning[k] || 0) + (ns.by_provisioning[k] || 0);
      }
    }
    if (Array.isArray(ns.client_action_required)) {
      for (const item of ns.client_action_required) {
        if (!merged.data_needs_summary.client_action_required.includes(item)) {
          merged.data_needs_summary.client_action_required.push(item);
        }
      }
    }
    if (Array.isArray(ns.cp_dependencies)) {
      for (const item of ns.cp_dependencies) {
        if (!merged.data_needs_summary.cp_dependencies.includes(item)) {
          merged.data_needs_summary.cp_dependencies.push(item);
        }
      }
    }
  }
  // Red de seguridad P86: si los fragments olvidaron poblar total_needs pero los
  // CPs individuales SÍ tienen data_needs[], recálculo determinístico aquí.
  if (merged.data_needs_summary.total_needs === 0) {
    let recalcTotal = 0;
    const byProv = {};
    for (const cp of merged.test_cases) {
      const needs = Array.isArray(cp.data_needs) ? cp.data_needs : [];
      recalcTotal += needs.length;
      for (const n of needs) {
        const prov = (n && n.provisioning) || 'unspecified';
        byProv[prov] = (byProv[prov] || 0) + 1;
      }
    }
    if (recalcTotal > 0) {
      merged.data_needs_summary.total_needs = recalcTotal;
      // Solo sobrescribir by_provisioning si está vacío (no pisar conteos válidos)
      if (Object.keys(merged.data_needs_summary.by_provisioning).length === 0) {
        merged.data_needs_summary.by_provisioning = byProv;
      }
      merged.data_needs_summary.recovered_via_recalc = true;
    }
  }

  // Escribir cp_modulo final
  const cpFile = path.join(designDir, `cp_modulo_${moduleId}.json`);
  writeJSONAtomic(cpFile, merged);

  // Mergear screens (archivo separado screens_{moduleId}.json)
  const screensMap = {};
  for (const frag of fragments) {
    for (const sc of (frag.screens || [])) {
      if (!sc.url_path) continue;
      const existing = screensMap[sc.url_path];
      if (!existing) {
        screensMap[sc.url_path] = {
          url_path: sc.url_path,
          description: sc.description || '',
          required_by_cps: Array.isArray(sc.required_by_cps) ? [...sc.required_by_cps] : [],
        };
      } else {
        // Merge required_by_cps (union)
        const set = new Set([...existing.required_by_cps, ...(sc.required_by_cps || [])]);
        existing.required_by_cps = [...set];
        if (!existing.description && sc.description) existing.description = sc.description;
      }
    }
  }
  const screensDoc = {
    module_id: moduleId,
    run_id:    first.run_id || '',
    app_name:  first.app_name || '',
    generated_at: merged.generated_at,
    screens:   Object.values(screensMap),
  };
  const screensFile = path.join(designDir, `screens_${moduleId}.json`);
  writeJSONAtomic(screensFile, screensDoc);

  // Cleanup opcional de fragments
  if (args.cleanup) {
    for (const f of fragmentFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    cp_file: cpFile,
    screens_file: screensFile,
    fragments_merged: fragments.length,
    total_cases: merged.total_cases,
    cases_by_risk: merged.cases_by_risk,
    datasets_unique: merged.test_datasets.length,
    screens_unique: screensDoc.screens.length,
    hu_traceability_entries: Object.keys(merged.hu_traceability).length,
    cleanup: !!args.cleanup,
  }, null, 2) + '\n');

  process.exit(0);
}

main();
