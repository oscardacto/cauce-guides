#!/usr/bin/env node
/**
 * detect-anomalies.js — detector post-mortem de anomalías de ejecución.
 *
 *  — red de seguridad post-batch para detectar patrones que el
 * watchdog doctrinal del executor pudo no capturar. Produce un audit.json
 * accionable que el orchestrator/QA revisa para decidir si re-correr.
 *
 * Anomalías detectadas:
 *   - duration_excess  → CP cuya duración wall-clock excede `--max-cp-minutes`
 *                        (default 8). Indica posible hung tool call (stale ref,
 *                        elemento no actionable, navigate sin completar).
 *   - excessive_steps_blocked → CP con ≥50% de steps en `NOT_EXECUTED`/`BLOCKED`.
 *                        Indica abort temprano sin marcar BLOCKED a nivel CP.
 *   - missing_evidence → CP PASS o FAIL pero `evidence_files: []` o `interactions: []`.
 *                        Indica falla silenciosa de captura de evidencia.
 *
 * Uso:
 *   node detect-anomalies.js --run-id=<id> [--max-cp-minutes=8] [--output=<path>]
 *
 * Output (stdout JSON):
 *   {
 *     "run_id": "...",
 *     "scanned_cps": N,
 *     "anomalies": [
 *       { "kind": "duration_excess", "cp_id": "...", "module_id": "...",
 *         "duration_min": 12.5, "threshold_min": 8, "evidence_path": "..." }
 *     ],
 *     "audit_file": "{run_folder}/post_execution_audit.json" | null
 *   }
 *
 * Exit codes:
 *   0 — ejecutado OK (incluso si encontró anomalías)
 *   1 — error fatal (run_folder ausente, JSON corrupto)
 *
 * NO bloquea el pipeline. Las anomalías son señales para humano, no abort triggers.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function die(msg) {
  process.stderr.write(`[detect-anomalies] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseArgs() {
  const out = { maxCpMinutes: 8 };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--run-id='))         out.runId = a.slice('--run-id='.length);
    else if (a.startsWith('--max-cp-minutes=')) out.maxCpMinutes = parseFloat(a.slice('--max-cp-minutes='.length));
    else if (a.startsWith('--output='))    out.output = a.slice('--output='.length);
  }
  if (!out.runId) die('--run-id requerido');
  return out;
}

function durationMinutes(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 60000;
}

const args = parseArgs();
const runFolder = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', args.runId);
if (!fs.existsSync(runFolder)) die(`run_folder no existe: ${runFolder}`);

const executionDir = path.join(runFolder, 'execution');
if (!fs.existsSync(executionDir)) {
  // Sin execution/ → nada que auditar (run pre-FASE-2C). No es error.
  process.stdout.write(JSON.stringify({
    run_id: args.runId,
    scanned_cps: 0,
    anomalies: [],
    audit_file: null,
    note: 'execution/ no existe — nada que auditar',
  }, null, 2) + '\n');
  process.exit(0);
}

const anomalies = [];
let scannedCps = 0;

// Recorrer execution/{module}/{slug}/result.json
const modules = fs.readdirSync(executionDir, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);

for (const moduleId of modules) {
  const moduleDir = path.join(executionDir, moduleId);
  const slugs = fs.readdirSync(moduleDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !/_legacy_/.test(e.name) && !/_rerun\d+$/.test(e.name))
    .map(e => e.name);

  for (const slug of slugs) {
    const resultPath = path.join(moduleDir, slug, 'result.json');
    if (!fs.existsSync(resultPath)) continue;
    let result;
    try { result = JSON.parse(fs.readFileSync(resultPath, 'utf8')); }
    catch (_) { continue; }
    scannedCps++;

    const cpId = result.cp_id || `${moduleId}/${slug}`;
    const evidenceRel = path.relative(PROJECT_ROOT, path.join(moduleDir, slug)).replace(/\\/g, '/');

    // 1) duration_excess
    const dur = durationMinutes(result.started_at, result.ended_at);
    if (dur !== null && dur > args.maxCpMinutes) {
      anomalies.push({
        kind: 'duration_excess',
        cp_id: cpId,
        module_id: moduleId,
        duration_min: Number(dur.toFixed(2)),
        threshold_min: args.maxCpMinutes,
        status: result.status,
        evidence_path: evidenceRel,
      });
    }

    // 2) excessive_steps_blocked (≥50% NOT_EXECUTED/BLOCKED en CPs no marcados BLOCKED)
    if (result.status !== 'BLOCKED' && Array.isArray(result.steps) && result.steps.length > 0) {
      const blockedCount = result.steps.filter(s =>
        ['NOT_EXECUTED', 'BLOCKED'].includes(String(s.status || '').toUpperCase())
      ).length;
      const ratio = blockedCount / result.steps.length;
      if (ratio >= 0.5) {
        anomalies.push({
          kind: 'excessive_steps_blocked',
          cp_id: cpId,
          module_id: moduleId,
          status: result.status,
          blocked_steps: blockedCount,
          total_steps: result.steps.length,
          evidence_path: evidenceRel,
        });
      }
    }

    // 3) missing_evidence (PASS/FAIL sin interactions ni evidence_files)
    if (['PASS', 'FAIL'].includes(String(result.status || '').toUpperCase())) {
      const hasEvidence = Array.isArray(result.steps) && result.steps.some(s =>
        (Array.isArray(s.interactions) && s.interactions.length > 0) ||
        (s.evidence_file && s.evidence_file !== '')
      );
      if (!hasEvidence) {
        anomalies.push({
          kind: 'missing_evidence',
          cp_id: cpId,
          module_id: moduleId,
          status: result.status,
          evidence_path: evidenceRel,
        });
      }
    }
  }
}

// Escribir audit.json si hay anomalías
let auditFile = null;
if (anomalies.length > 0) {
  const audit = {
    run_id: args.runId,
    audited_at: new Date().toISOString(),
    reason: 'execution_anomalies_detected',
    threshold_max_cp_minutes: args.maxCpMinutes,
    scanned_cps: scannedCps,
    anomaly_count: anomalies.length,
    anomalies,
    suggestion_next_action: 'Revisar cada anomalía. Para `duration_excess` confirmar visualmente la evidencia y considerar re-ejecutar el CP. Para `missing_evidence` re-ejecutar con evidence_mode=all.',
  };
  const auditPath = args.output
    ? path.resolve(args.output)
    : path.join(runFolder, 'post_execution_audit.json');
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
  auditFile = path.relative(PROJECT_ROOT, auditPath).replace(/\\/g, '/');
}

process.stdout.write(JSON.stringify({
  run_id: args.runId,
  scanned_cps: scannedCps,
  anomalies,
  audit_file: auditFile,
}, null, 2) + '\n');
process.exit(0);
