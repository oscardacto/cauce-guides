#!/usr/bin/env node
/**
 * check-nav-learning-health.js — Detector post-run de degradación silenciosa
 * del feature `navigation_learning`.
 *
 * Motivación (Fase 4):
 *
 * Históricamente nav-learning ha fallado silenciosamente — ningún error, ningún
 * warning. Los runs PASAN sin él, solo más lentos en re-runs (~12-15 s extra
 * por step en MCP Playwright sobre Windows). Sin un check post-run automatizado,
 * el bug puede persistir indefinidamente. Casos confirmados:
 *
 *   - OrangeHRM →: 3+ runs con `navigation_learning`
 *     ausente del session_context. flag inerte sin alerta.
 *   - FogafinSIO: flag presente pero MCP no disponible — abort
 *     legítimo, NO bug del feature. Este detector debe distinguir ambos.
 *
 * Lógica de salud:
 *
 *   ENABLED   = exec_context.navigation_learning_enabled === true
 *   LOOKUPS   = sum(stats.lookups across all nav_session_*.json del run)
 *   DISCOVERS = sum(discoveries.length across all nav_session_*.json)
 *   BLOCKED   = existe execution_blocked.json en run o algún módulo
 *
 *   Status (orden de prioridad — primero match gana):
 *     1. !ENABLED                                  → feature_off (sin alerta)
 *     2. (LOOKUPS > 0 || DISCOVERS > 0)            → ok (sin alerta)
 *                ↑ Si hubo actividad real, el feature funcionó al menos
 *                  parcialmente — incluso si OTRO módulo del run se bloqueó.
 *                  Run multi-módulo puede tener un módulo blocked y otros OK.
 *     3. (LOOKUPS == 0) && BLOCKED                 → blocked (sin alerta)
 *                ↑ Abort temprano sin actividad — esperado.
 *     4. (LOOKUPS == 0) && !BLOCKED                → inert (WARNING)
 *                ↑ Degradación silenciosa: el feature debió ejecutar pero no
 *                  lo hizo y nada lo bloqueó. Causa probable: flag mal
 *                  propagado, o REGLA 19 del executor no respetada.
 *     5. run_folder ausente                        → no_run
 *
 * Uso:
 *   node .claude/tools/check-nav-learning-health.js --run-id={run_id}
 *   node .claude/tools/check-nav-learning-health.js --run-id={run_id} --json
 *
 * Output stdout: JSON con `{status, enabled, total_lookups, sessions_count,
 *                blocked, message, suggestion}`. Sin --json: log legible.
 *
 * Exit codes:
 *   0 → ok | feature_off | blocked | no_run (todos no requieren acción)
 *   2 → inert (degradación silenciosa detectada — warning, NO blocker)
 *   1 → error fatal (run_folder corrupto, etc.)
 *
 * Invocación canónica: post-PASO 4.7.a en `/sofka-asdd:qa-web-exec.md` y consolidación en `/sofka-asdd:qa-web-run.md`.
 * Es un check de telemetría — NO bloquea el run, solo evidencia el problema al QA.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

function parseArgs() {
  const raw  = process.argv.slice(2);
  const opts = { json: false };
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === '--run-id' || a.startsWith('--run-id=')) {
      opts.runId = a.includes('=') ? a.split('=')[1] : raw[++i];
    } else if (a === '--json') {
      opts.json = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write('Uso: ver header del archivo.\n');
      process.exit(0);
    }
  }
  return opts;
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const opts = parseArgs();
  if (!opts.runId) {
    process.stderr.write('check-nav-learning-health: --run-id es requerido\n');
    process.exit(1);
  }

  const ROOT      = process.cwd();
  const RUN_DIR   = path.join(ROOT, 'docs', 'testing', 'atf-web', opts.runId);
  const TMP_DIR   = path.join(RUN_DIR, '.tmp');
  const EXEC_CTX  = path.join(TMP_DIR, 'exec_context.json');
  const EXEC_DIR  = path.join(RUN_DIR, 'execution');

  if (!fs.existsSync(RUN_DIR)) {
    const out = { status: 'no_run', message: `run_folder no existe: ${RUN_DIR}` };
    process.stdout.write(opts.json ? JSON.stringify(out) + '\n' : `ℹ️  ${out.message}\n`);
    process.exit(0);
  }

  // 1. ¿Está el feature habilitado para este run?
  const ctx     = safeReadJson(EXEC_CTX) || {};
  const enabled = ctx.app_yaml_extract?.navigation_learning_enabled === true
               || ctx.navigation_learning_enabled === true;

  // 2. ¿Hubo execution_blocked en el run o en algún módulo?
  const blockedPaths = [
    path.join(RUN_DIR, 'execution_blocked.json'),
  ];
  if (fs.existsSync(EXEC_DIR)) {
    for (const ent of fs.readdirSync(EXEC_DIR, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        blockedPaths.push(path.join(EXEC_DIR, ent.name, 'execution_blocked.json'));
      }
    }
  }
  const blocked = blockedPaths.some(p => fs.existsSync(p));

  // 3. Sumar lookups across todas las sesiones nav-learning del run
  let totalLookups = 0;
  let totalDiscoveries = 0;
  let sessionsCount = 0;
  if (fs.existsSync(TMP_DIR)) {
    const sessions = fs.readdirSync(TMP_DIR)
      .filter(f => /^nav_session_.*\.json$/.test(f))
      .map(f => path.join(TMP_DIR, f));
    sessionsCount = sessions.length;
    for (const sp of sessions) {
      const s = safeReadJson(sp);
      if (!s) continue;
      const lookups = (s.stats && (s.stats.lookups || s.stats.total_lookups)) || 0;
      const disc    = (s.discoveries && s.discoveries.length) || 0;
      totalLookups += lookups;
      totalDiscoveries += disc;
    }
  }

  // 4. Determinar status — prioridad: feature_off → ok (si hubo actividad) →
  //    blocked → inert. Si LOOKUPS o DISCOVERS > 0, el feature funcionó
  //    parcialmente (incluso si otro módulo del run abortó). NO reportar
  //    blocked en ese caso — sería false positive.
  let status, message, suggestion = null;
  if (!enabled) {
    status = 'feature_off';
    message = 'navigation_learning_enabled=false — feature desactivado para este run.';
  } else if (totalLookups > 0 || totalDiscoveries > 0) {
    status = 'ok';
    message = `nav-learning sano — ${totalLookups} lookup(s) y ${totalDiscoveries} discoveries en ${sessionsCount} sesión(es).`;
    if (blocked) {
      message += ' (Algún módulo del run reportó execution_blocked, pero el feature SÍ funcionó parcialmente.)';
    }
  } else if (blocked) {
    status = 'blocked';
    message = `Run abortado (execution_blocked.json presente). Cero lookups esperable; no es bug del feature.`;
  } else {
    status = 'inert';
    message = `⚠️  navigation_learning_enabled=true pero 0 lookups en ${sessionsCount} sesión(es). Degradación silenciosa.`;
    suggestion = 'Verificar: (1) ejecutar "node .claude/tools/refresh-session-context.js --run-id=' + opts.runId + ' ..." para backfill defaults; (2) revisar que executor invoque nav-learning lookup en R2.2 (REGLA 19); (3) revisar exec_context.json.app_yaml_extract.navigation_learning_enabled.';
  }

  const out = {
    status,
    enabled,
    total_lookups: totalLookups,
    total_discoveries: totalDiscoveries,
    sessions_count: sessionsCount,
    blocked,
    message,
    ...(suggestion ? { suggestion } : {}),
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    const icon = { ok: '✅', inert: '⚠️ ', blocked: 'ℹ️ ', feature_off: '⏭️ ', no_run: '❓' }[status] || '?';
    process.stdout.write(`${icon} nav-learning health: ${status}\n`);
    process.stdout.write(`   ${message}\n`);
    if (suggestion) process.stdout.write(`   → ${suggestion}\n`);
  }

  // Exit codes: 2 solo para 'inert' (warning visible al QA, NO blocker).
  process.exit(status === 'inert' ? 2 : 0);
}

main();
