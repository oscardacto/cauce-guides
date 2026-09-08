#!/usr/bin/env node
// ATF — strategize-coverage.js
//
// Verifica que las pantallas referenciadas por los CPs (`design/screens_*.json`)
// estén cubiertas por al menos un `e2e_flow.execution_sequence[]` o `entry_url`
// del `strategy/execution_plan.json`. Si hay gaps, opcionalmente añade flujos
// `E2E-COVER-N` (type=coverage_fill_e2e) que cubran las pantallas huérfanas.
//
// Doctrina: ver `docs/concepts/e2e-flows.md` § "Reglas inviolables" (cobertura
// de pantallas como cierre del ciclo design ↔ strategy).
//
// Por qué script atómico: el check de cobertura es 100% determinístico y debe
// ejecutarse incluso cuando `/asdd:qa-web-strategize` corre standalone (sin re-spawnear el
// agente). Migrarlo a script asegura que el ciclo design ↔ strategy quede
// cerrado en cualquier modo de invocación.
//
// Modos:
//   default (warning)         → exit 0, JSON con gaps en stdout.
//   --enforce                 → exit 2 si hay gaps no cubiertos.
//   --add-coverage-flows      → añade E2E-COVER-N al execution_plan para
//                               cubrir gaps detectados (mutación atómica).
//
// Uso:
//   node strategize-coverage.js --run-id {RUN_ID}
//   node strategize-coverage.js --run-id {RUN_ID} --enforce
//   node strategize-coverage.js --run-id {RUN_ID} --add-coverage-flows
//
// Stdout JSON:
//   {
//     ok, run_id,
//     modules_designed: N,
//     screens_total: N,
//     screens_covered: N,
//     screens_uncovered: [ { url_path, module_id, required_by_cps[] } ],
//     coverage_pct: N,
//     coverage_flows_added: N (solo en --add-coverage-flows),
//     mode
//   }

'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function die(msg) { process.stderr.write(`strategize-coverage: ${msg}\n`); process.exit(1); }

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
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die(`JSON inválido en ${p}: ${e.message}`); }
}

function writeJSONAtomic(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

// Heurística de cobertura: una pantalla está cubierta por un flujo si:
//   1. `e2e_flow.entry_url` contiene su `url_path` (substring), O
//   2. Algún `step.action` o `step.module + step.action` la menciona (substring
//      del path significativo, mínimo 5 chars distintivos), O
//   3. `step.module === module_id` de la screen Y `step.action` contiene una
//      palabra del path final (last segment del url_path).
function isScreenCoveredByFlow(screen, flow) {
  const urlPath = String(screen.url_path || '').toLowerCase();
  const moduleId = String(screen.module_id || '').toLowerCase();
  if (!urlPath) return false;

  // 1. entry_url contiene url_path
  const entryUrl = String(flow.entry_url || '').toLowerCase();
  if (entryUrl && entryUrl.includes(urlPath)) return true;

  // Last segment significativo del path (ej: "/admin/viewJobTitleList" → "viewjobtitlelist")
  const segments = urlPath.split('/').filter(s => s.length >= 5);
  const lastMeaningful = segments.length ? segments[segments.length - 1] : null;

  // 2/3. Recorrer execution_sequence
  for (const step of (flow.execution_sequence || [])) {
    const action = String(step.action || '').toLowerCase();
    const stepModule = String(step.module || '').toLowerCase();

    // Match directo del url_path en la acción
    if (action.includes(urlPath)) return true;

    // Match por last segment significativo (ej: "viewjobtitlelist" en la acción)
    if (lastMeaningful && action.includes(lastMeaningful)) return true;

    // Match por module + palabra clave del path
    if (stepModule === moduleId && lastMeaningful) {
      // Si el step pertenece al módulo de la pantalla y menciona la última parte significativa
      if (action.includes(lastMeaningful)) return true;
    }
  }

  return false;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args['run-id']) die('--run-id es obligatorio');
  const runId = args['run-id'];

  const runDir = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', runId);
  if (!fs.existsSync(runDir)) die(`run no existe: ${runDir}`);

  const planPath = path.join(runDir, 'strategy', 'execution_plan.json');
  const ep = readJSON(planPath);
  if (!ep) die(`execution_plan.json no encontrado: ${planPath}`);

  const flows = Array.isArray(ep.e2e_flows) ? ep.e2e_flows : [];
  if (flows.length === 0) {
    process.stderr.write('strategize-coverage: e2e_flows[] vacío. Ejecuta /asdd:qa-web-strategize primero.\n');
    process.stdout.write(JSON.stringify({
      ok: false, reason: 'no_e2e_flows', run_id: runId,
    }, null, 2) + '\n');
    process.exit(args.enforce ? 2 : 0);
  }

  // Recolectar todas las pantallas de los design/screens_*.json
  const designDir = path.join(runDir, 'design');
  if (!fs.existsSync(designDir)) {
    process.stderr.write('strategize-coverage: design/ no existe (no hay módulos diseñados todavía).\n');
    process.stdout.write(JSON.stringify({
      ok: true, reason: 'no_design_yet', run_id: runId,
      modules_designed: 0, screens_total: 0, coverage_pct: null,
    }, null, 2) + '\n');
    process.exit(0);
  }

  const screenFiles = fs.readdirSync(designDir)
    .filter(f => f.startsWith('screens_') && f.endsWith('.json'));

  const allScreens = [];
  for (const sf of screenFiles) {
    const moduleId = sf.replace(/^screens_/, '').replace(/\.json$/, '');
    const sc = readJSON(path.join(designDir, sf));
    if (!sc || !Array.isArray(sc.screens)) continue;
    for (const s of sc.screens) {
      if (!s.url_path) continue;
      allScreens.push({
        url_path: s.url_path,
        module_id: moduleId,
        description: s.description || '',
        required_by_cps: Array.isArray(s.required_by_cps) ? s.required_by_cps : [],
      });
    }
  }

  // Verificar cobertura de cada pantalla
  const uncovered = [];
  let covered = 0;
  for (const screen of allScreens) {
    let isCovered = false;
    for (const flow of flows) {
      if (isScreenCoveredByFlow(screen, flow)) { isCovered = true; break; }
    }
    if (isCovered) covered++;
    else uncovered.push(screen);
  }

  const coveragePct = allScreens.length > 0 ? Math.round(covered / allScreens.length * 100) : 100;
  const coverageFlowsAdded = [];

  // --add-coverage-flows: añadir E2E-COVER-N para cada uncovered
  if (args['add-coverage-flows'] && uncovered.length > 0) {
    const existingCoverIds = flows
      .filter(f => (f.e2e_id || '').startsWith('E2E-COVER-'))
      .map(f => parseInt((f.e2e_id || '').replace(/^E2E-COVER-/, ''), 10) || 0);
    let nextId = (existingCoverIds.length ? Math.max(...existingCoverIds) : 0) + 1;

    for (const screen of uncovered) {
      const newFlow = {
        e2e_id:                  `E2E-COVER-${String(nextId).padStart(3, '0')}`,
        type:                    'coverage_fill_e2e',
        category:                'technical',
        name:                    `Cobertura técnica: navegación a ${screen.url_path}`,
        objective:               `Garantizar acceso navegable a ${screen.url_path} (modulo ${screen.module_id})`,
        business_value:          `Validar que la pantalla del modulo ${screen.module_id} es accesible y no queda huerfana en la cobertura E2E del run.`,
        modules_involved:        ['auth', screen.module_id].filter((v, i, a) => a.indexOf(v) === i),
        hus_involved:            [],
        actor:                   'Administrador',
        session_duration_min:    5,
        entry_url:               '/web/index.php/auth/login',
        execution_sequence: [
          { step: 1, module: 'auth', action: 'Login como Administrador', state_produced: 'session_active', cp_refs: [] },
          { step: 2, module: screen.module_id, action: `Navegar a ${screen.url_path}`, state_produced: 'screen_reached', cp_refs: screen.required_by_cps.slice(0, 2) },
          { step: 3, module: screen.module_id, action: `Validar carga inicial de ${screen.url_path}`, state_produced: 'screen_validated', cp_refs: [] },
        ],
        state_continuity_checks: [`La pantalla ${screen.url_path} carga sin errores y respeta el estado de sesión.`],
        what_to_look_for:        ['No 404 ni redirect inesperado', 'Selectores principales presentes en DOM'],
        risk_level:              'low',
        requires_auth:           true,
        pending_po_validation:   false,
        nfrs:                    ['disponibilidad: la pantalla responde en <=3s'],
        auto_generated_for_coverage: true,
      };
      flows.push(newFlow);
      coverageFlowsAdded.push(newFlow.e2e_id);
      nextId++;
    }

    // Reescribir execution_plan.json atómicamente
    ep.e2e_flows = flows;
    ep.coverage_check = {
      run_at: new Date().toISOString(),
      screens_total: allScreens.length,
      screens_covered_before: covered,
      coverage_flows_added: coverageFlowsAdded,
    };
    writeJSONAtomic(planPath, ep);
  }

  // Persistir reporte de cobertura como artefacto auditable
  const coveragePath = path.join(runDir, 'strategy', 'screen_coverage.json');
  const coverageReport = {
    ok: true,
    run_id: runId,
    generated_at: new Date().toISOString(),
    modules_designed: screenFiles.length,
    e2e_flows_count: flows.length,
    screens_total: allScreens.length,
    screens_covered: covered,
    screens_uncovered: uncovered.length,
    coverage_pct: coveragePct,
    uncovered_details: uncovered,
    coverage_flows_added: coverageFlowsAdded,
  };
  writeJSONAtomic(coveragePath, coverageReport);

  process.stdout.write(JSON.stringify({
    ok: true,
    run_id: runId,
    modules_designed: screenFiles.length,
    e2e_flows_count: flows.length,
    screens_total: allScreens.length,
    screens_covered: covered,
    screens_uncovered: uncovered.length,
    coverage_pct: coveragePct,
    coverage_flows_added: coverageFlowsAdded.length,
    coverage_report_path: path.relative(PROJECT_ROOT, coveragePath),
    mode: args.enforce ? 'enforce' : (args['add-coverage-flows'] ? 'add' : 'warning'),
  }, null, 2) + '\n');

  if (uncovered.length > 0 && !args['add-coverage-flows']) {
    // KISS reversal: este reporte es INFORMATIVO. Los flujos E2E son
    // narrativos por diseño y no exigen URLs literales. La cobertura es un
    // dato útil al QA (qué pantallas son tocadas por flujos) pero NO una
    // invariante que rompa el pipeline.
    process.stderr.write('\n' + '─'.repeat(60) + '\n');
    process.stderr.write(`strategize-coverage [INFO]: ${uncovered.length} pantalla(s) no mencionada(s) en flujos E2E\n`);
    process.stderr.write(`Cobertura informativa: ${covered}/${allScreens.length} (${coveragePct}%)\n`);
    process.stderr.write('─'.repeat(60) + '\n');
    for (const s of uncovered.slice(0, 10)) {
      process.stderr.write(`  · [${s.module_id}] ${s.url_path}  (${s.required_by_cps.length} CP${s.required_by_cps.length===1?'':'s'})\n`);
    }
    if (uncovered.length > 10) process.stderr.write(`  ... +${uncovered.length - 10} más\n`);
    process.stderr.write(`\nNota: la baja cobertura aquí NO es un defecto. Los flujos E2E son narrativos\n`);
    process.stderr.write(`y aportan valor desde la descripción funcional. Para reportes ejecutivos use\n`);
    process.stderr.write(`screen_coverage.json como vista cross-reference.\n`);
    process.stderr.write('─'.repeat(60) + '\n\n');
    // --enforce sigue disponible para CI/CD que sí quiera gating duro
    if (args.enforce) process.exit(2);
  }

  process.exit(0);
}

main();
