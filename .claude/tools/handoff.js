#!/usr/bin/env node
/**
 * ATF — Handoff de QA: transferencia de trabajo entre personas.
 *
 * Uso:
 *   node .claude/tools/handoff.js --mode=detect
 *   node .claude/tools/handoff.js --mode=send  [--reason "..."] [--notes "..."]
 *   node .claude/tools/handoff.js --mode=receive
 *   node .claude/tools/handoff.js --mode=cleanup
 *
 * Exit codes (modo detect):
 *   2 = ENVIAR   (no existe manifest)
 *   3 = RECIBIR  (existe manifest, from_qa != yo)
 *   4 = ACTUALIZAR (existe manifest, from_qa == yo)
 *
 * Exit codes (otros modos):
 *   0 = OK | 1 = error
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/* ─── Constantes ──────────────────────────────────────────────────────────── */

const PROJECT_ROOT   = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH  = path.join(PROJECT_ROOT, 'handoff_manifest.json');
const OUTPUT_DIR     = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web');
const KNOWLEDGE_DIR  = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'knowledge');
const MEMORY_DIR     = path.join(PROJECT_ROOT, '.claude', 'agent-memory');
const AUTOMATION_DIR = path.join(PROJECT_ROOT, 'automation');
const REQS_DIR       = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'requirements');

const PHASE_ORDER = ['0', '1', '1C', '1D', '2C', 'CONSOLIDACION'];

/**
 * Archivos/patrones que NUNCA se suben, sin importar el modo. Mantener
 * sincronizado con .gitignore del proyecto.
 *
 * Regla: usar `path.basename` matching para filenames (con o sin glob `*`)
 * y `includes` para path-substring (carpetas).
 */
const ALWAYS_EXCLUDE = [
  // ── Credenciales (todas las variantes) ────────────────────
  'credentials.yaml',
  'credentials_*.yaml',
  'credentials.*.yaml',
  // (credentials.example.yaml SÍ se incluye explícitamente — es template público)

  // ── Estado de sesión MFA (tokens activos) ─────────────────
  'session_state_*.json',

  // ── Estado de sesión POR-RUN (cookies, localStorage, scripts MFA) ──
  // Sub-archivos de output/{run}/.tmp/ que contienen storageState real.
  // Se filtran por basename (no por path completo).
  'cookies.json',
  'session_state.json',
  'localstorage.json',
  'mfa_inject.js',
  'inject_ls.js',
  'inject_ls_escaped.json',
  'auth_context.json',

  // ── Variables de entorno locales ──────────────────────────
  '.env',
  '.env.local',
  '.env.*.local',

  // ── Configuración local del editor / OS ───────────────────
  'settings.local.json',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',

  // ── Dependencias y artefactos build ───────────────────────
  'node_modules',
  'package-lock.json',

  // ── Debug del MCP Playwright + temporales ─────────────────
  '.playwright-mcp',  // path-substring
  '.tmp',             // matches output/{run}/.tmp/  Y  .tmp/ raíz
  '*.tmp',
  '*.log',
];

/** Rutas relativas (desde PROJECT_ROOT) a incluir en el handoff */
const HANDOFF_PATHS = [
  'output',
  'docs/testing/atf-web/knowledge',
  '.claude/agent-memory',
  'requirements',
  '.claude/settings.json',
  '.mcp.json',
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function die(msg) {
  console.error(`\u274C handoff: ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':   opts.mode   = args[++i]; break;
      case '--reason': opts.reason = args[++i]; break;
      case '--notes':  opts.notes  = args[++i]; break;
      default: {
        // Soportar --mode=value
        const match = args[i].match(/^--(\w+)=(.+)$/);
        if (match) opts[match[1]] = match[2];
        else console.warn(`\u26A0\uFE0F  Argumento desconocido ignorado: ${args[i]}`);
      }
    }
  }
  return opts;
}

function getGitUser() {
  try {
    return execSync('git config user.name', { encoding: 'utf-8' }).trim();
  } catch (_) {
    return '';
  }
}

function getGitEmail() {
  try {
    return execSync('git config user.email', { encoding: 'utf-8' }).trim();
  } catch (_) {
    return '';
  }
}

/**
 * Whitelist explícito: archivos que matchean ALWAYS_EXCLUDE pero queremos
 * incluir igual (templates públicos, etc.).
 */
const FORCE_INCLUDE = [
  'credentials.example.yaml',
];

function isExcluded(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(normalized);

  // Whitelist primero
  if (FORCE_INCLUDE.includes(basename)) return false;

  return ALWAYS_EXCLUDE.some(pattern => {
    if (pattern.includes('*')) {
      // Glob por basename: .env.*.local → .env.<algo>.local
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return regex.test(basename);
    }
    // Match por basename exacto (filenames como cookies.json, session_state.json)
    if (basename === pattern) return true;
    // Match por substring del path (carpetas como node_modules, .playwright-mcp, .tmp)
    return normalized.includes('/' + pattern + '/') || normalized.startsWith(pattern + '/') || normalized === pattern;
  });
}

/* ─── Recolectar archivos ─────────────────────────────────────────────────── */

/**
 * Walker con métricas de exclusión para reporte al usuario.
 * Devuelve { files, excludedSensitive } donde excludedSensitive lista
 * los archivos sensibles que se filtraron (transparencia para el QA).
 */
function walkDirWithMetrics(dir, baseDir, excludedSensitive) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    if (isExcluded(relPath)) {
      // Solo reportar los "interesantes" (los que un QA querría saber que se excluyeron)
      if (/credentials|session_state|cookies|localstorage|inject|mfa|auth_context|\.env/i.test(path.basename(relPath))) {
        excludedSensitive.push(relPath);
      }
      continue;
    }
    if (entry.isDirectory()) {
      results.push(...walkDirWithMetrics(fullPath, baseDir, excludedSensitive));
    } else {
      results.push(relPath);
    }
  }
  return results;
}

function collectHandoffFiles() {
  const files = [];
  const excludedSensitive = [];

  for (const relPath of HANDOFF_PATHS) {
    const absPath = path.join(PROJECT_ROOT, relPath);
    if (!fs.existsSync(absPath)) continue;

    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      files.push(...walkDirWithMetrics(absPath, PROJECT_ROOT, excludedSensitive));
    } else if (!isExcluded(relPath)) {
      files.push(relPath.replace(/\\/g, '/'));
    }
  }

  return { files, excludedSensitive };
}

/* ─── Pipeline state ──────────────────────────────────────────────────────── */

function findLatestRun() {
  if (!fs.existsSync(OUTPUT_DIR)) return null;

  const entries = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'node_modules')
    .map(e => ({
      name: e.name,
      mtime: fs.statSync(path.join(OUTPUT_DIR, e.name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return entries.length > 0 ? entries[0].name : null;
}

function findLatestCheckpoint() {
  const latestRun = findLatestRun();
  if (!latestRun) return null;

  const cpPath = path.join(OUTPUT_DIR, latestRun, 'checkpoint.json');
  if (!fs.existsSync(cpPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(cpPath, 'utf-8'));
  } catch (_) {
    return null;
  }
}

function inferPipelineState(checkpoint) {
  if (!checkpoint) {
    return {
      phases_completed: [],
      phases_pending: [...PHASE_ORDER],
      next_action: 'No se encontró checkpoint — ejecutar pipeline desde Fase 0',
    };
  }

  const completed = checkpoint.phases_completed || [];
  const lastIdx   = Math.max(...completed.map(p => PHASE_ORDER.indexOf(p)).filter(i => i >= 0), -1);
  const pending   = lastIdx >= 0 ? PHASE_ORDER.slice(lastIdx + 1) : [...PHASE_ORDER];
  const nextPhase = pending.length > 0 ? pending[0] : null;

  return {
    phases_completed: completed,
    phases_pending:   pending,
    next_action: nextPhase
      ? `Configurar run_id: "${checkpoint.run_id}" y ejecutar Fase ${nextPhase}`
      : 'Pipeline completo — no hay fases pendientes',
  };
}

/* ─── Modos ───────────────────────────────────────────────────────────────── */

function modeDetect() {
  const me = getGitUser();
  if (!me) die('git config user.name no configurado — necesario para auto-detección');

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log(`\uD83D\uDCE4 MODO: ENVIAR (no existe handoff_manifest.json)`);
    console.log(`   git user: ${me}`);
    process.exit(2);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch (_) {
    die('handoff_manifest.json existe pero no es JSON válido');
  }

  if (manifest.from_qa === me) {
    console.log(`\uD83D\uDD04 MODO: ACTUALIZAR (manifest.from_qa = "${me}" = yo)`);
    console.log(`   run_id: ${manifest.run_id || '(no registrado)'}`);
    process.exit(4);
  }

  console.log(`\uD83D\uDCE5 MODO: RECIBIR (manifest.from_qa = "${manifest.from_qa}" \u2260 "${me}")`);
  console.log(`   run_id: ${manifest.run_id || '(no registrado)'}`);
  process.exit(3);
}

function modeSend(reason, notes) {
  const me        = getGitUser();
  const email     = getGitEmail();
  const latestRun = findLatestRun();
  const checkpoint = findLatestCheckpoint();
  const state     = inferPipelineState(checkpoint);
  const { files, excludedSensitive } = collectHandoffFiles();

  if (files.length === 0) {
    die('No se encontraron archivos para el handoff. ¿Existe output/ o knowledge/?');
  }

  // Generar manifest
  const manifest = {
    handoff_date:        new Date().toISOString(),
    from_qa:             me,
    from_email:          email,
    to_qa:               '',
    reason:              reason || '',
    run_id:              latestRun || '',
    checkpoint:          checkpoint
      ? { last_phase: checkpoint.last_completed_phase, modules_completed: checkpoint.modules_completed || [] }
      : null,
    pipeline_state:      state,
    notes:               notes || '',
    files_included:      files,
    sensitive_excluded:  {
      count: excludedSensitive.length,
      categories: ['credentials', 'session_state', 'cookies', 'localstorage', 'mfa_inject', 'auth_context'],
      files: excludedSensitive
    },
    credentials_excluded: true,  // legacy compat
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\uD83D\uDCCB Manifest generado: handoff_manifest.json`);

  // git add -f de todos los archivos + manifest
  const allFiles = [...files, 'handoff_manifest.json'];
  const batchSize = 50; // Evitar línea de comando demasiado larga

  for (let i = 0; i < allFiles.length; i += batchSize) {
    const batch = allFiles.slice(i, i + batchSize);
    try {
      execSync(`git add -f ${batch.map(f => `"${f}"`).join(' ')}`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err) {
      console.warn(`\u26A0\uFE0F  Algunos archivos no pudieron ser staged: ${err.message}`);
    }
  }

  console.log(`\n\u2705 HANDOFF PREPARADO`);
  console.log(`   Archivos staged: ${allFiles.length}`);
  console.log(`   Run ID:          ${latestRun || '(ninguno)'}`);
  console.log(`   Estado:          ${state.phases_completed.length > 0 ? 'Fases ' + state.phases_completed.join(', ') + ' completadas' : 'Sin fases completadas'}`);
  console.log(`   Pendiente:       ${state.phases_pending.length > 0 ? 'Fases ' + state.phases_pending.join(', ') : 'Pipeline completo'}`);

  if (excludedSensitive.length > 0) {
    console.log(`\n\uD83D\uDD12 Archivos sensibles excluidos autom\u00E1ticamente (${excludedSensitive.length}):`);
    excludedSensitive.slice(0, 8).forEach(f => console.log(`   - ${f}`));
    if (excludedSensitive.length > 8) console.log(`   ... y ${excludedSensitive.length - 8} m\u00E1s (ver manifest.sensitive_excluded.files)`);
    console.log(`   El receptor debe recrearlos localmente:`);
    console.log(`   - credentials.yaml / credentials_<app>.yaml \u2192 copiar de credentials.example.yaml + completar`);
    console.log(`   - session_state_<env>.json \u2192 ejecutar 'node .claude/tools/save-session.js --env <env>'`);
    console.log(`   - cookies/localStorage/mfa_inject del run \u2192 se regeneran al reanudar el pipeline con auth-handler`);
  }

  console.log(`\n\uD83D\uDCA1 Siguiente paso:`);
  console.log(`   git commit -m "HANDOFF: ${me} \u2014 post-FASE ${checkpoint ? checkpoint.last_completed_phase : '?'} \u2014 ${reason || 'transferencia'}"`);
  console.log(`   git push`);
}

function modeReceive() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    die('No existe handoff_manifest.json — no hay handoff pendiente. ¿Hiciste git pull?');
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch (_) {
    die('handoff_manifest.json no es JSON válido');
  }

  const me = getGitUser();

  // Validar que los archivos existen
  const missing = [];
  const present = [];
  for (const f of (manifest.files_included || [])) {
    const absPath = path.join(PROJECT_ROOT, f);
    if (fs.existsSync(absPath)) {
      present.push(f);
    } else {
      missing.push(f);
    }
  }

  const state = manifest.pipeline_state || {};

  console.log(`\uD83D\uDCE5 HANDOFF RECIBIDO`);
  console.log(`   De:              ${manifest.from_qa} (${manifest.from_email || ''})`);
  console.log(`   Fecha:           ${manifest.handoff_date}`);
  console.log(`   Razón:           ${manifest.reason || '(no especificada)'}`);
  console.log(`   Run ID:          ${manifest.run_id || '(ninguno)'}`);
  console.log(`   Archivos:        ${present.length} presentes, ${missing.length} faltantes`);

  if (manifest.notes) {
    console.log(`\n\uD83D\uDCDD Notas de ${manifest.from_qa}:`);
    console.log(`   ${manifest.notes}`);
  }

  console.log(`\n\uD83D\uDCCA Estado del pipeline:`);
  console.log(`   Completadas:     ${(state.phases_completed || []).join(', ') || '(ninguna)'}`);
  console.log(`   Pendientes:      ${(state.phases_pending || []).join(', ') || '(ninguna)'}`);
  console.log(`   Siguiente:       ${state.next_action || '(desconocido)'}`);

  if (missing.length > 0) {
    console.log(`\n\u26A0\uFE0F  Archivos faltantes (${missing.length}):`);
    missing.slice(0, 10).forEach(f => console.log(`   - ${f}`));
    if (missing.length > 10) console.log(`   ... y ${missing.length - 10} más`);
  }

  console.log(`\n\uD83D\uDCA1 Pasos sugeridos:`);
  if (manifest.run_id) {
    console.log(`   1. Configurar en appweb.yaml: run_id: "${manifest.run_id}"`);
  }
  console.log(`   ${manifest.run_id ? '2' : '1'}. Verificar credentials.yaml (cada QA tiene las suyas)`);
  console.log(`   ${manifest.run_id ? '3' : '2'}. Habilitar las fases pendientes en appweb.yaml → pipeline`);
  console.log(`   ${manifest.run_id ? '4' : '3'}. Ejecutar: @.claude/commands/sofka-asdd/qa-web-run.md`);
  console.log(`   \u2022  Al terminar: node .claude/tools/handoff.js --mode=cleanup`);

  // Actualizar manifest con receptor
  manifest.to_qa = me;
  manifest.received_date = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

function modeCleanup() {
  // Des-trackear output/ para que .gitignore vuelva a ignorarlos
  const dirsToUntrack = ['output'];

  for (const dir of dirsToUntrack) {
    const absDir = path.join(PROJECT_ROOT, dir);
    if (!fs.existsSync(absDir)) continue;

    try {
      execSync(`git rm -r --cached "${dir}"`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      console.log(`\uD83D\uDDD1\uFE0F  Des-trackeado: ${dir}`);
    } catch (err) {
      // Si no estaba trackeado, no es error
      if (!err.stderr || !err.stderr.includes('did not match')) {
        console.warn(`\u26A0\uFE0F  No se pudo des-trackear ${dir}: ${err.message}`);
      }
    }
  }

  // Eliminar manifest
  if (fs.existsSync(MANIFEST_PATH)) {
    // Des-trackear manifest si estaba trackeado
    try {
      execSync(`git rm --cached "handoff_manifest.json"`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (_) { /* no estaba trackeado */ }

    fs.unlinkSync(MANIFEST_PATH);
    console.log(`\uD83D\uDDD1\uFE0F  Eliminado: handoff_manifest.json`);
  }

  console.log(`\n\u2705 CLEANUP COMPLETO`);
  console.log(`   output/ vuelve a ser ignorado por .gitignore`);
  console.log(`\n\uD83D\uDCA1 Siguiente paso:`);
  console.log(`   git commit -m "HANDOFF-CLEANUP: des-trackea artefactos post-handoff"`);
}

/* ─── Main ────────────────────────────────────────────────────────────────── */

function main() {
  const opts = parseArgs();

  if (!opts.mode) die('--mode es requerido (detect | send | receive | cleanup)');

  switch (opts.mode) {
    case 'detect':  modeDetect();                    break;
    case 'send':    modeSend(opts.reason, opts.notes); break;
    case 'receive': modeReceive();                   break;
    case 'cleanup': modeCleanup();                   break;
    default:        die(`Modo desconocido: "${opts.mode}". Válidos: detect | send | receive | cleanup`);
  }
}

main();
