#!/usr/bin/env node
/**
 * ATF — Escribe/actualiza checkpoint.json tras completar una fase del pipeline.
 *
 * Uso:
 *   # Escribir checkpoint al completar una fase
 *   node .claude/tools/generate-checkpoint.js \
 *     --run-id            <run_id>          \
 *     --run-folder        <ruta_run>        \
 *     --last-phase        <fase>            \
 *     [--pipeline-start   <ISO>]            \
 *     [--modules-completed <json_array>]    \
 *     [--modules-remaining <json_array>]    \
 *     [--agent-log         <json_array>]
 *
 *   # Eliminar checkpoint (pipeline completado)
 *   node .claude/tools/generate-checkpoint.js \
 *     --run-folder <ruta_run> --delete
 *
 * Fases válidas (en orden): 0 | 1 | 1C | 1D | 1E | 2A | 2B | 2C | CONSOLIDACION | 3
 *
 * Comportamiento acumulativo:
 *   - Si ya existe checkpoint.json, preserva pipeline_start, phases_completed anteriores
 *     y agent_call_log_snapshot, salvo que se pasen nuevos valores por argumento.
 *   - phases_completed se acumula (nunca se sobreescribe destructivamente).
 *   - phases_remaining se recalcula automáticamente desde last_phase.
 *
 * Exit codes: 0 = OK | 1 = error
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ─── Constantes ──────────────────────────────────────────────────────────── */

const PHASE_ORDER = ['0', '1', '1C', '1D', '1E', '2A', '2B', '2C', 'CONSOLIDACION', '3'];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function die(msg) {
  console.error(`❌ generate-checkpoint: ${msg}`);
  process.exit(1);
}

function nextPhase(lastPhase) {
  const idx = PHASE_ORDER.indexOf(lastPhase);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

function phasesRemaining(lastPhase) {
  const idx = PHASE_ORDER.indexOf(lastPhase);
  if (idx < 0) return [...PHASE_ORDER];
  return PHASE_ORDER.slice(idx + 1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--run-id':             opts.runId             = args[++i]; break;
      case '--run-folder':         opts.runFolder         = args[++i]; break;
      case '--last-phase':         opts.lastPhase         = args[++i]; break;
      case '--pipeline-start':     opts.pipelineStart     = args[++i]; break;
      case '--modules-completed':  opts.modulesCompleted  = args[++i]; break;
      case '--modules-remaining':  opts.modulesRemaining  = args[++i]; break;
      case '--agent-log':          opts.agentLog          = args[++i]; break;
      // ⚠️  Flag para borrar checkpoint: --delete (booleano), NO --mode delete.
      //    Preferir siempre el skill: [SKILL: asdd-atf-web-checkpoint-writer | mode: delete]
      //    en lugar de llamar este script directamente.
      case '--delete':             opts.delete            = true;       break;
      default:
        console.warn(`⚠️  Argumento desconocido ignorado: ${args[i]}`);
    }
  }
  return opts;
}

function tryParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

/* ─── Main ────────────────────────────────────────────────────────────────── */

function main() {
  const opts = parseArgs();

  if (!opts.runFolder) die('--run-folder es requerido');

  const checkpointPath = path.join(opts.runFolder, 'checkpoint.json');

  /* ── Modo eliminación ───────────────────────────────────────────────────── */
  if (opts.delete) {
    if (fs.existsSync(checkpointPath)) {
      // C2: calcular duración total del pipeline antes de borrar
      let durationMsg = '';
      try {
        const cp = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
        if (cp.pipeline_start) {
          const durationMs = Date.now() - new Date(cp.pipeline_start).getTime();
          const mins = Math.floor(durationMs / 60000);
          const secs = Math.floor((durationMs % 60000) / 1000);
          durationMsg = ` (duración total: ${mins}m ${secs}s)`;
        }
      } catch (_) { /* no fatal */ }
      fs.unlinkSync(checkpointPath);
      console.log(`✅ checkpoint.json eliminado — pipeline completo${durationMsg}`);
    } else {
      console.log('ℹ️  checkpoint.json no existía — nada que eliminar');
    }
    return;
  }

  /* ── Modo escritura ─────────────────────────────────────────────────────── */
  if (!opts.runId)    die('--run-id es requerido (o usar --delete)');
  if (!opts.lastPhase) die('--last-phase es requerido (o usar --delete)');

  if (!PHASE_ORDER.includes(opts.lastPhase)) {
    die(`Fase inválida: "${opts.lastPhase}". Válidas: ${PHASE_ORDER.join(' | ')}`);
  }

  // Leer checkpoint existente para preservar estado acumulado
  let existing = {};
  if (fs.existsSync(checkpointPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
    } catch (_) {
      console.warn('⚠️  checkpoint.json existente ilegible — sobreescribiendo');
    }
  }

  // phases_completed: acumular
  const prevCompleted = Array.isArray(existing.phases_completed) ? existing.phases_completed : [];
  const newCompleted  = [...new Set([...prevCompleted, opts.lastPhase])];

  // Opcionales: usar arg si se pasó, sino preservar del checkpoint existente, sino default
  const modulesCompleted = opts.modulesCompleted
    ? tryParseJSON(opts.modulesCompleted, existing.modules_completed || [])
    : (existing.modules_completed || []);

  const modulesRemaining = opts.modulesRemaining
    ? tryParseJSON(opts.modulesRemaining, existing.modules_remaining || [])
    : (existing.modules_remaining || []);

  const agentLog = opts.agentLog
    ? tryParseJSON(opts.agentLog, existing.agent_call_log_snapshot || [])
    : (existing.agent_call_log_snapshot || []);

  const pipelineStart = opts.pipelineStart
    || existing.pipeline_start
    || new Date().toISOString();

  // C2: phase_timestamps acumulativo — registra cuándo completó cada fase.
  // Permite calcular duración real por fase en la consolidación.
  const prevTimestamps = existing.phase_timestamps || {};
  const phaseTimestamps = { ...prevTimestamps, [opts.lastPhase]: new Date().toISOString() };

  // Calcular duración de esta fase respecto a la anterior (si hay timestamp previo)
  let phaseDurationMsg = '';
  const prevPhaseIdx = PHASE_ORDER.indexOf(opts.lastPhase) - 1;
  if (prevPhaseIdx >= 0) {
    const prevPhase    = PHASE_ORDER[prevPhaseIdx];
    const prevPhaseTs  = prevTimestamps[prevPhase] || pipelineStart;
    if (prevPhaseTs) {
      const durMs  = new Date(phaseTimestamps[opts.lastPhase]).getTime() - new Date(prevPhaseTs).getTime();
      const mins   = Math.floor(durMs / 60000);
      const secs   = Math.floor((durMs % 60000) / 1000);
      phaseDurationMsg = ` — duración: ${mins}m ${secs}s`;
    }
  }

  const next = nextPhase(opts.lastPhase);

  const checkpoint = {
    run_id:                   opts.runId,
    pipeline_start:           pipelineStart,
    last_completed_phase:     opts.lastPhase,
    next_phase:               next,
    phases_completed:         newCompleted,
    phases_remaining:         phasesRemaining(opts.lastPhase),
    modules_completed:        modulesCompleted,
    modules_remaining:        modulesRemaining,
    last_checkpoint_at:       new Date().toISOString(),
    phase_timestamps:         phaseTimestamps,
    agent_call_log_snapshot:  agentLog,
  };

  // Crear carpeta si no existe
  if (!fs.existsSync(opts.runFolder)) {
    fs.mkdirSync(opts.runFolder, { recursive: true });
  }

  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf-8');

  console.log(`📌 CHECKPOINT: fase ${opts.lastPhase} completada → checkpoint.json actualizado${phaseDurationMsg}`);
  console.log(`   next_phase        : ${next || '(sin siguiente — pipeline completo)'}`);
  console.log(`   phases_completed  : [${newCompleted.join(', ')}]`);
  console.log(`   phases_remaining  : [${phasesRemaining(opts.lastPhase).join(', ')}]`);
  if (modulesCompleted.length > 0) {
    console.log(`   modules_completed : [${modulesCompleted.join(', ')}]`);
  }
}

main();
