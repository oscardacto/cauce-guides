#!/usr/bin/env node
/**
 * asdd-artifact-name.mjs
 *
 * Helper de naming run-trazable para artefactos ASDD.
 *
 * ESTE HELPER ES LA ÚNICA FORMA CORRECTA de derivar el nombre de un
 * artefacto de run. Los skills lo invocan vía `node asdd-artifact-name.mjs
 * --slug <slug>` y capturan el nombre desde stdout. NUNCA estampar a mano (D3).
 *
 * Patrón producido: {run_id}-{PHASE}-{SEQ}-{slug}.{ext}
 *   - run_id  : de .asdd-run.json (YYYY-MM-DD-NNN)
 *   - PHASE   : uppercase del campo --phase (o current_phase del json)
 *   - SEQ     : artifact_seq + 1, 3 dígitos con cero-padding
 *   - slug    : argumento --slug (kebab-case; semver con puntos permitido)
 *
 * Salida:
 *   stdout → nombre del archivo derivado (solo ese string, sin newline extra)
 *   stderr → mensajes de diagnóstico
 *   exit 0 → éxito
 *   exit 1 → error (json ausente, inválido, run completo, slug faltante, etc.)
 *
 * Fases válidas (del schema asdd-run.schema.json):
 *   specify | analyze | design | build | verify | document
 *
 * Uso:
 *   node .claude/scripts/asdd-artifact-name.mjs --slug mi-artefacto
 *   node .claude/scripts/asdd-artifact-name.mjs --phase design --slug mi-artefacto
 *   node .claude/scripts/asdd-artifact-name.mjs --phase design --slug c4-contexto --ext puml
 *   node .claude/scripts/asdd-artifact-name.mjs --slug mi-artefacto --dry-run
 *
 * Flags:
 *   --dry-run  : calcula y emite el nombre SIN persistir el incremento de
 *                artifact_seq en .asdd-run.json. Útil para pre-validar el
 *                nombre contra el guard antes de consumir la secuencia
 *                (Bug A ítem A4 — evita quemar artifact_seq en intentos
 *                fallidos).
 *
 * Variables de entorno:
 *   CLAUDE_PROJECT_DIR  : raíz del proyecto (donde vive .asdd-run.json).
 *                         Si no está definida, se usa process.cwd().
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';
import { resolveActivePhase, VALID_PHASES as VALID_PHASES_LIST } from '../hooks/_lib/run-phase-resolver.mjs';
import { deriveArtifactName } from './lib/asdd-artifact-name-lib.mjs';

// ---------------------------------------------------------------------------
// Fases válidas — alineadas con asdd-run.schema.json → phases
// (SSOT compartida con el guard vía .claude/hooks/_lib/run-phase-resolver.mjs)
// ---------------------------------------------------------------------------
const VALID_PHASES = new Set(VALID_PHASES_LIST);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escribe a stderr sin lanzar excepción. */
function err(msg) {
  process.stderr.write(`[asdd-artifact-name] ${msg}\n`);
}

/**
 * Parsea args simples: --key value (par clave-valor) o --flag (booleano,
 * cuando no hay valor siguiente o el siguiente token también es un flag).
 */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

/**
 * Escritura atómica: escribe a un tmp y renombra.
 * Si falla el rename, intenta write directo como fallback.
 */
function atomicWrite(filePath, content) {
  const dir = dirname(filePath);
  // Temp en el MISMO directorio del destino: el rename queda intra-dispositivo
  // y no puede lanzar EXDEV (evita el cross-device rename de /tmp en Linux o
  // de una unidad distinta en Windows).
  const tmpFile = join(dir, `.asdd-run-${randomBytes(6).toString('hex')}.tmp`);
  writeFileSync(tmpFile, content, 'utf8');
  try {
    renameSync(tmpFile, filePath);
  } catch {
    // Fallback defensivo (no debería ocurrir con temp en el mismo dir).
    writeFileSync(filePath, content, 'utf8');
    try { unlinkSync(tmpFile); } catch { /* ignorar */ }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));

  // --- Validar slug (requerido) ---
  const slug = args['slug'];
  if (!slug || slug.trim() === '') {
    err('--slug es requerido. Ejemplo: --slug mi-artefacto');
    process.exit(1);
  }

  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(slug)) {
    err('--slug debe estar en kebab-case ASCII; se permiten puntos solo para segmentos como semver.');
    process.exit(1);
  }

  const extension = String(args['ext'] ?? 'md').toLowerCase();
  if (!/^[a-z0-9]{1,10}$/.test(extension)) {
    err('--ext debe contener solo letras/números y máximo 10 caracteres.');
    process.exit(1);
  }

  // --- Resolver raíz del proyecto ---
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const runFilePath = join(projectDir, '.asdd-run.json');

  // --- Leer .asdd-run.json ---
  let raw;
  try {
    raw = readFileSync(runFilePath, 'utf8');
  } catch (e) {
    err(`.asdd-run.json no encontrado en ${runFilePath}. No se puede derivar nombre sin run activo.`);
    process.exit(1);
  }

  // --- Parsear JSON ---
  let run;
  try {
    run = JSON.parse(raw);
  } catch (e) {
    err(`.asdd-run.json tiene JSON inválido: ${e.message}`);
    process.exit(1);
  }

  // --- Validar campos mínimos ---
  if (!run.run_id || typeof run.run_id !== 'string') {
    err('.asdd-run.json no tiene run_id válido.');
    process.exit(1);
  }

  // --- Verificar que el run no está completo ---
  if (run.status === 'complete') {
    err(`El run ${run.run_id} ya está en status "complete". No se pueden estampar artefactos en un run cerrado.`);
    process.exit(1);
  }

  // --- Resolver fase ---
  let phase = args['phase'];
  if (phase) {
    phase = phase.toLowerCase();
    if (!VALID_PHASES.has(phase)) {
      err(`Fase inválida: "${phase}". Fases válidas: ${[...VALID_PHASES].join(', ')}`);
      process.exit(1);
    }
  } else {
    // Intentar derivar la fase activa del run state (SSOT compartida con el guard).
    phase = resolveActivePhase(run);
    if (!phase) {
      err('No se pudo determinar la fase activa del run. Usa --phase <fase> para indicarla explícitamente.');
      process.exit(1);
    }
    err(`Fase inferida del run state: ${phase}`);
  }

  const currentSeq = typeof run.artifact_seq === 'number' ? run.artifact_seq : 0;
  const derived = deriveArtifactName(run, { phase, slug, extension });
  const { name, nextSeq } = derived;

  // --- Dry-run: emitir el nombre SIN consumir artifact_seq (Bug A ítem A4) ---
  const isDryRun = args['dry-run'] === true;
  if (isDryRun) {
    err(`--dry-run: artifact_seq NO fue incrementado (se habría usado ${currentSeq} → ${nextSeq})`);
    process.stdout.write(name + '\n');
    return;
  }

  // --- Write-back: incrementar artifact_seq en .asdd-run.json ---
  run = derived.run;
  try {
    atomicWrite(runFilePath, JSON.stringify(run, null, 2));
    err(`artifact_seq actualizado: ${currentSeq} → ${nextSeq}`);
  } catch (e) {
    err(`No se pudo escribir .asdd-run.json: ${e.message}`);
    process.exit(1);
  }

  // --- Output: solo el nombre a stdout ---
  process.stdout.write(name + '\n');
}

main();
