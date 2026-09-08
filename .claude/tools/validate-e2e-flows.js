#!/usr/bin/env node
// ATF — validate-e2e-flows.js
//
// Validador determinístico de los flujos E2E emitidos por el strategist en
// `execution_plan.json`. Doctrina: ver `docs/concepts/e2e-flows.md`.
//
// Reglas verificadas (KISS reversal:
//   R1. e2e_flows[] NO vacío cuando hay ≥2 módulos.
//   R2. Cada flow cruza ≥2 módulos en modules_involved[].
//   R3. execution_sequence[] ≥3 steps.
//   R4. objective y business_value no vacíos.
//   R5. category válido ("functional" | "technical").
//   R6. Funcionales primero en el array (orden importa para priorización).
//   R7. Topología: cada módulo en modules_involved[] que tenga
//       dependencies_inbound[] debe tener todas sus deps en modules_involved[]
//       O el flow debe empezar (step 1) en un módulo que sea dependencia
//       upstream del módulo dependiente.
//   R8. Mínimos: ≥1 happy_path_e2e. Si app tiene auth, ≥1 security_e2e.
//
// ELIMINADAS (KISS — los flujos son narrativos por diseño):
//   R10 (anclaje URL) — viola cronología: las URLs se descubren en fases
//        posteriores (/sofka-asdd:qa-web-design o /sofka-asdd:qa-web-exec). El strategist en pre-exploración no
//        las conoce. Decisión usuario: dejar steps narrativos.
//
// Modos:
//   default (warning) → exit 0, JSON con violaciones en stdout.
//   --enforce         → exit 2 si hay violaciones.
//
// Uso:
//   node validate-e2e-flows.js --run-id {RUN_ID}
//   node validate-e2e-flows.js --run-id {RUN_ID} --enforce
//
// Stdout JSON:
//   {
//     ok, run_id, modules_count, e2e_flows_count,
//     violations: [ {rule, severity, e2e_id, message} ],
//     summary: { critical: N, warning: N },
//     mode
//   }

'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function die(msg) { process.stderr.write(`validate-e2e-flows: ${msg}\n`); process.exit(1); }

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

function main() {
  const args = parseArgs(process.argv);
  if (!args['run-id']) die('--run-id es obligatorio');
  const runId = args['run-id'];
  const planPath = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', runId, 'strategy', 'execution_plan.json');
  if (!fs.existsSync(planPath)) die(`execution_plan.json no encontrado: ${planPath}`);

  const ep = readJSON(planPath);
  const modules = Array.isArray(ep.modules) ? ep.modules : [];
  const flows   = Array.isArray(ep.e2e_flows) ? ep.e2e_flows : [];

  const violations = [];
  const addViol = (rule, severity, e2e_id, message) => violations.push({ rule, severity, e2e_id, message });

  // R1: e2e_flows[] no vacío con ≥2 módulos
  if (modules.length >= 2 && flows.length === 0) {
    addViol('R1', 'critical', null,
      `e2e_flows[] vacío con ${modules.length} módulos. Doctrina P91: SIEMPRE emitir flujos cuando hay ≥2 módulos. ` +
      `Ver docs/concepts/e2e-flows.md.`);
  }

  // Validación por cada flow individual
  const moduleIds = new Set(modules.map(m => m.module_id).filter(Boolean));
  const moduleDepsByMod = {};
  for (const m of modules) {
    moduleDepsByMod[m.module_id] = {
      inbound:  Array.isArray(m.dependencies_inbound)  ? m.dependencies_inbound  : [],
      outbound: Array.isArray(m.dependencies_outbound) ? m.dependencies_outbound : [],
    };
  }

  let firstTechnicalIdx = -1;
  let lastFunctionalIdx = -1;

  for (let i = 0; i < flows.length; i++) {
    const f = flows[i];
    const fid = f.e2e_id || `flow[${i}]`;

    // R2: cruzar ≥2 módulos
    const involved = Array.isArray(f.modules_involved) ? f.modules_involved : [];
    if (involved.length < 2) {
      addViol('R2', 'critical', fid,
        `modules_involved tiene ${involved.length} módulo(s). Un flujo E2E DEBE cruzar ≥2 módulos.`);
    }

    // R3: execution_sequence ≥3 steps
    const seq = Array.isArray(f.execution_sequence) ? f.execution_sequence : [];
    if (seq.length < 3) {
      addViol('R3', 'critical', fid,
        `execution_sequence tiene ${seq.length} step(s). Un flujo E2E DEBE tener ≥3 steps.`);
    }

    // R4: objective + business_value no vacíos
    if (!f.objective || String(f.objective).trim().length < 10) {
      addViol('R4', 'warning', fid, `objective ausente o demasiado corto (<10 chars).`);
    }
    if (!f.business_value || String(f.business_value).trim().length < 10) {
      addViol('R4', 'warning', fid, `business_value ausente o demasiado corto (<10 chars).`);
    }

    // R5: category válido
    if (!f.category || !['functional', 'technical'].includes(f.category)) {
      addViol('R5', 'warning', fid,
        `category="${f.category}" inválido. Debe ser "functional" o "technical".`);
    }

    // R6: funcionales primero
    if (f.category === 'technical' && firstTechnicalIdx === -1) firstTechnicalIdx = i;
    if (f.category === 'functional') lastFunctionalIdx = i;

    // R7: topología — cada módulo con deps debe tenerlas en involved O el flow empieza por la dep
    if (involved.length >= 2 && seq.length > 0) {
      const firstStepModule = seq[0]?.module;
      for (const mod of involved) {
        const deps = moduleDepsByMod[mod];
        if (!deps) continue;
        for (const inDep of deps.inbound) {
          // Si el módulo dep upstream no está en involved Y el step 1 no es ese dep → violación
          if (!involved.includes(inDep) && firstStepModule !== inDep) {
            addViol('R7', 'warning', fid,
              `Módulo "${mod}" depende de "${inDep}" pero éste no está en modules_involved ni el flow empieza ahí. ` +
              `Topología violada.`);
          }
        }
      }
    }
  }

  // R6 cross-flow: si hay funcional DESPUÉS de un técnico, error de orden
  if (firstTechnicalIdx >= 0 && lastFunctionalIdx > firstTechnicalIdx) {
    addViol('R6', 'warning', null,
      `Orden de flujos incorrecto: hay funcional en posición ${lastFunctionalIdx+1} después de técnico en posición ${firstTechnicalIdx+1}. ` +
      `Funcionales DEBEN ir primero en el array.`);
  }

  // R8: mínimos
  const types = flows.map(f => f.type || '');
  if (modules.length >= 2 && !types.includes('happy_path_e2e')) {
    addViol('R8', 'warning', null,
      `Falta al menos un happy_path_e2e. Mínimo absoluto cuando hay ≥2 módulos.`);
  }
  // Si los módulos sugieren auth (heurística: alguno tiene "auth" en id o requires_auth)
  const hasAuth = modules.some(m => /auth|login/i.test(m.module_id || '') || /admin/i.test(m.primary_actor || ''));
  if (hasAuth && !types.includes('security_e2e')) {
    addViol('R8', 'warning', null,
      `App con autenticación detectada pero sin security_e2e. Recomendado para coverage de NFRs de seguridad.`);
  }

  // R10 ELIMINADA (KISS reversal: los flujos E2E aportan
  // valor desde la descripción funcional cross-módulo. Las URLs son detalles
  // de implementación que se descubren en fases posteriores (/sofka-asdd:qa-web-design, /sofka-asdd:qa-web-exec).
  // No exigir anclaje URL al strategist en pre-exploración.

  const summary = { critical: 0, warning: 0 };
  for (const v of violations) summary[v.severity] = (summary[v.severity] || 0) + 1;

  const mode = args.enforce ? 'enforce' : 'warning';
  const out = {
    ok: true,
    run_id: runId,
    modules_count: modules.length,
    e2e_flows_count: flows.length,
    violations,
    summary,
    mode,
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');

  if (violations.length > 0) {
    process.stderr.write('\n' + '='.repeat(60) + '\n');
    process.stderr.write(`validate-e2e-flows: ${violations.length} violación(es) detectada(s)\n`);
    process.stderr.write(`  · Critical: ${summary.critical || 0}  ·  Warning: ${summary.warning || 0}\n`);
    process.stderr.write('='.repeat(60) + '\n');
    for (const v of violations) {
      const icon = v.severity === 'critical' ? '🔴' : '🟠';
      process.stderr.write(`  ${icon} [${v.rule}] ${v.e2e_id || '(global)'}: ${v.message}\n`);
    }
    process.stderr.write(`\nDoctrina: docs/concepts/e2e-flows.md\n`);
    process.stderr.write(`Acción del QA: re-ejecutar /sofka-asdd:qa-web-strategize para que el strategist regenere e2e_flows[] respetando las reglas.\n`);
    process.stderr.write('='.repeat(60) + '\n\n');
    if (mode === 'enforce' && summary.critical > 0) process.exit(2);
  }

  process.exit(0);
}

main();
