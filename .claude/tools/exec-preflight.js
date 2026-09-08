#!/usr/bin/env node
/**
 * exec-preflight.js — consolida PASOs 0-3.3 del /asdd:qa-web-exec en UN solo script.
 * Reduce 5 bash calls (~100s overhead) a 1.
 *
 * Ejecuta (en orden):
 *   1. cleanup_mcp      → cleanup-mcp-browser.js --quiet (con fast-path nuevo)
 *   2. validate_prereqs → session_context.json + cp_modulo_{M}.json existen
 *   3. sync_tag_filter  → session-context.write (require directo, sin spawn)
 *   4. knowledge_excerpt→ knowledge-excerpt.js --output {exec_context_path}
 *   5. plan_batches     → plan-batches.js con stdin
 *   6. pre_resolve_cps  → Fix D: lee cp_modulo_{M}.json y inyecta CPs completos
 *                         en exec_context.json bajo cp_targets_resolved[]
 *
 * Uso:
 *   node exec-preflight.js --run-id=<id> [--custom-tags=@cp:X,@cp:Y]
 *                          [--batch-size=3] [--output=<path>]
 *
 * Si --custom-tags no se pasa, lee de appweb.yaml (test_run.custom_tags).
 *
 * stdout: JSON con { ok, total_ms, phases[], batches, cp_targets_resolved_count,
 *                    exec_context_path, warnings }
 *
 * exit: 0 si todas las phases críticas OK, 1 si alguna crítica falló.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { extractModuleIdFromKnownModules } = require('./lib/cp-slug');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Lista los module_ids disponibles en el design/ del run, derivados de los
 * archivos `cp_modulo_*.json`. Sirve como ground truth para `deriveCpTargets`
 * cuando los module_ids contienen guiones (admin-organization, email-config).
 *
 * sin esto, la regex original `/^CP-([A-Za-z0-9_]+)-/`
 * trunca el module_id en el primer guion, generando lookups a archivos
 * inexistentes (cp_modulo_admin.json en lugar de cp_modulo_admin-organization.json).
 */
function loadKnownModules(designDir) {
  if (!fs.existsSync(designDir)) return [];
  return fs.readdirSync(designDir)
    .filter(f => f.startsWith('cp_modulo_') && f.endsWith('.json'))
    .map(f => f.replace(/^cp_modulo_/, '').replace(/\.json$/, ''));
}

/**
 * Derives steps_raw from Gherkin When/And/Then lines.
 * Excludes And lines that follow Given (those are preconditions).
 */
function deriveStepsRawFromGherkin(gherkin) {
  if (!gherkin || typeof gherkin !== 'string') return null;
  const trimmed = gherkin.split('\n').map(l => l.trim()).filter(Boolean);
  const result = [];
  let inActionZone = false;
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
      inActionZone = false;
    }
  }
  if (result.length === 0) return null;
  return result.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

function die(msg, extra) {
  process.stderr.write('[exec-preflight] ERROR: ' + msg + '\n');
  if (extra) process.stderr.write(JSON.stringify(extra, null, 2) + '\n');
  process.exit(1);
}

function parseArgs() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--run-id=')) out.runId = a.slice('--run-id='.length);
    else if (a.startsWith('--custom-tags=')) out.customTags = a.slice('--custom-tags='.length);
    else if (a.startsWith('--batch-size=')) out.batchSize = parseInt(a.slice('--batch-size='.length), 10);
    else if (a.startsWith('--output=')) out.output = a.slice('--output='.length);
  }
  if (!out.runId) die('--run-id requerido');
  return out;
}

function runPhase(phases, name, fn, { critical = true } = {}) {
  const t = Date.now();
  try {
    const result = fn();
    phases.push({ name, ok: true, ms: Date.now() - t });
    return result;
  } catch (e) {
    phases.push({ name, ok: false, ms: Date.now() - t, error: e.message });
    if (critical) {
      // Abortar limpio: emitir JSON estructurado (sin stack trace) y salir
      const result = {
        ok: false,
        total_ms: Date.now() - t0,
        phases,
        error: { phase: name, message: e.message },
        batches: [],
        total_batches: 0,
        cp_targets_resolved_count: 0,
        exec_context_path: null,
        stats: null,
        warnings,
      };
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(1);
    }
    return null;
  }
}

function safeSpawn(scriptPath, args, opts = {}) {
  const r = spawnSync('node', [scriptPath, ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
    input: opts.stdin,
    ...opts,
  });
  if (r.error) throw new Error(`spawn ${scriptPath}: ${r.error.message}`);
  if (r.status !== 0) {
    const errMsg = (r.stderr || '').trim() || (r.stdout || '').trim() || `exit ${r.status}`;
    throw new Error(`${scriptPath}: ${errMsg.slice(0, 300)}`);
  }
  return { stdout: r.stdout || '', stderr: r.stderr || '' };
}

function readAppYamlCustomTags() {
  const yamlPath = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config', 'appweb.yaml');
  if (!fs.existsSync(yamlPath)) return [];
  const text = fs.readFileSync(yamlPath, 'utf8');

  // Walk line by line. Tolerar comentarios (líneas enteras `# ...` e inline ` # ...`)
  // entre `custom_tags:` y el array. Encontrar el primer `[...]` NO comentado.
  const lines = text.split(/\r?\n/);
  let inCustomTags = false;
  let depth = 0;  // para saltar subclaves anidadas de otro key con el mismo nombre (improbable)

  function stripComments(line) {
    // Línea completa de comentario
    if (/^\s*#/.test(line)) return '';
    // Comentario inline (heurística simple: ` # ` fuera de quotes)
    return line.replace(/\s+#[^"']*$/, '');
  }

  function parseInlineArray(src) {
    const arr = src
      .replace(/'/g, '"')
      .replace(/\[([^\]]*)\]/, (_, inner) => {
        if (inner.includes('"')) return '[' + inner + ']';
        const parts = inner.split(',').map(s => s.trim()).filter(Boolean);
        return '[' + parts.map(p => JSON.stringify(p)).join(',') + ']';
      });
    try { return JSON.parse(arr); } catch { return null; }
  }

  for (const raw of lines) {
    const line = stripComments(raw);
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!inCustomTags) {
      const m = trimmed.match(/^custom_tags:\s*(.*)$/);
      if (!m) continue;
      // Caso 1: array inline en la misma línea
      if (m[1].startsWith('[')) {
        const arr = parseInlineArray(m[1]);
        if (arr) return arr;
        return [];
      }
      inCustomTags = true;
      continue;
    }

    // Dentro de la sección custom_tags:
    // Si aparece una nueva clave YAML a nivel raíz/padre → terminamos sin encontrar
    if (/^[A-Za-z_][A-Za-z0-9_-]*:/.test(trimmed)) break;

    // Array inline
    if (trimmed.startsWith('[')) {
      const arr = parseInlineArray(trimmed);
      if (arr) return arr;
      return [];
    }

    // TODO: soporte de lista multi-línea `- "@cp:X"` si alguna vez se usa
    // (por ahora appweb.yaml del proyecto usa inline).
  }
  return [];
}

/**
 * Deriva cp_targets[] desde los custom_tags `@cp:CP-...`.
 *
 * Estrategia:
 *   1. Si knownModules tiene contenido → longest-prefix match contra ellos.
 *      Captura correctamente "admin-organization", "email-config", "job-titles".
 *   2. Si NO matchea (o knownModules vacío) → fallback heurístico regex
 *      `/^CP-([A-Za-z0-9_]+)-/` que captura módulos sin guiones (auth, M1,
 *      Matriz_1). Mantiene backward compat para SauceDemo, Fogafin.
 *
 * @param {string[]} customTags — tags del appweb.yaml o CLI (@cp:CP-X formato)
 * @param {string[]} knownModules — module_ids derivados de design/cp_modulo_*.json
 * @returns {Array<{module_id: string, cp_id: string}>}
 */
function deriveCpTargets(customTags, knownModules) {
  const out = [];
  for (const tag of customTags) {
    if (typeof tag !== 'string' || !tag.startsWith('@cp:CP-')) continue;
    const cpId = tag.slice('@cp:'.length);
    // Estrategia 1: longest-prefix match contra módulos del run
    let module_id = extractModuleIdFromKnownModules(cpId, knownModules);
    // Estrategia 2 (fallback): regex heurística para módulos single-word
    if (!module_id) {
      const m = cpId.match(/^CP-([A-Za-z0-9_]+)-/);
      if (m) module_id = m[1];
    }
    if (!module_id) continue;
    out.push({ module_id, cp_id: cpId });
  }
  return out;
}

/* ─── Main ─────────────────────────────────────────────────────────────── */

const args = parseArgs();
const t0 = Date.now();
const phases = [];
const warnings = [];

const runFolder = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', args.runId);
if (!fs.existsSync(runFolder)) die(`run_folder no existe: ${runFolder}`);

const execContextPath = args.output
  ? path.resolve(args.output)
  : path.join(runFolder, '.tmp', 'exec_context.json');

// Derivar custom_tags
let customTags;
if (args.customTags) {
  customTags = args.customTags.split(',').map(t => t.trim()).filter(Boolean);
} else {
  customTags = runPhase(phases, 'read_app_yaml', () => readAppYamlCustomTags());
}

if (!customTags || !customTags.length) die('no se pudieron derivar custom_tags');

// P99b — pre-cargar módulos conocidos del design/ para longest-prefix match
const knownModules = loadKnownModules(path.join(runFolder, 'design'));
const cpTargets = deriveCpTargets(customTags, knownModules);
if (!cpTargets.length) die('cp_targets vacío tras derivación');

// 1. CLEANUP MCP (non-critical: warnings en vez de abort si falla)
runPhase(phases, 'cleanup_mcp', () => {
  const r = safeSpawn('.claude/tools/cleanup-mcp-browser.js', ['--quiet'], { timeout: 10000 });
  return { stdout_preview: r.stdout.slice(0, 120) };
}, { critical: false });

// 2. VALIDATE PREREQS + clean stale execution_blocked.json (run-level + module-level)
//    + auto-purge stale _legacy_TIMESTAMP/ folders
runPhase(phases, 'validate_prereqs', () => {
  const sc = path.join(runFolder, 'session_context.json');
  if (!fs.existsSync(sc)) throw new Error(`session_context.json no existe`);
  const uniqueModules = [...new Set(cpTargets.map(t => t.module_id))];

  // Legacy folder TTL — 30 días. Después de eso, la evidencia archivada de
  // runs antiguos (cuando reset-cp-artifacts default era `archive`) ya no
  // tiene valor forense (el report.html del run original sigue intacto en
  // `docs/testing/atf-web/{ese_run_id}/`). Purgar libera disco sin pérdida real.
  const LEGACY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const legacyPattern = /_legacy_\d{4}-\d{2}-\d{2}T?/;  // _legacy_2026-04-28T13-50-16
  let legacyPurgedCount = 0;

  for (const m of uniqueModules) {
    const designFile = path.join(runFolder, 'design', `cp_modulo_${m}.json`);
    if (!fs.existsSync(designFile)) {
      throw new Error(`cp_modulo_${m}.json no existe`);
    }
    // Remove stale execution_blocked.json from prior failed runs (módulo-level)
    const moduleDir = path.join(runFolder, 'execution', m);
    const blockedFile = path.join(moduleDir, 'execution_blocked.json');
    if (fs.existsSync(blockedFile)) {
      fs.unlinkSync(blockedFile);
      warnings.push(`Removed stale execution_blocked.json for module ${m}`);
    }
    // Auto-purge _legacy_TIMESTAMP/ folders > 30 días
    if (fs.existsSync(moduleDir)) {
      try {
        const entries = fs.readdirSync(moduleDir, { withFileTypes: true });
        const nowMs = Date.now();
        for (const e of entries) {
          if (!e.isDirectory() || !legacyPattern.test(e.name)) continue;
          const legacyPath = path.join(moduleDir, e.name);
          try {
            const ageMs = nowMs - fs.statSync(legacyPath).mtimeMs;
            if (ageMs > LEGACY_TTL_MS) {
              fs.rmSync(legacyPath, { recursive: true, force: true });
              legacyPurgedCount++;
            }
          } catch (_) { /* skip si stat falla */ }
        }
      } catch (_) { /* directorio inaccesible — continuar */ }
    }
  }
  if (legacyPurgedCount > 0) {
    warnings.push(`Auto-purged ${legacyPurgedCount} legacy folder(s) older than 30 days`);
  }
  // Remove stale execution_blocked.json a nivel run (escrito por abort-blocked.js
  // en P26/P32/P33). Si el run anterior fue ABORT y el QA reintenta, dejar el
  // marker viejo confunde al dashboard y reportes. Es seguro borrarlo: si este
  // run también aborta, abort-blocked.js lo re-escribe con timestamp fresco.
  // : blocked de 12:13 sobrevivió al run
  // exitoso de 12:58 → coexistencia BLOCKED+PASS en el mismo run-folder.
  const runLevelBlocked = path.join(runFolder, 'execution_blocked.json');
  if (fs.existsSync(runLevelBlocked)) {
    fs.unlinkSync(runLevelBlocked);
    warnings.push(`Removed stale run-level execution_blocked.json`);
  }
  return { modules: uniqueModules };
});

// 3. SYNC active_tag_filter vía session-context (require directo)
runPhase(phases, 'sync_tag_filter', () => {
  const sessionContext = require('./session-context');
  sessionContext.write(args.runId, { active_tag_filter: customTags });
  return { applied: customTags };
});

// 3.5. VALIDATE MFA SESSION + SYNC session_context (critical: abort si CP no-literal sin storageState)
// Relee appweb.yaml y resolveDbConfig directamente — session_context.json puede estar stale si
// el run fue creado antes del refactor MFA/BD. Además sincroniza los campos al session_context.
// Si `auth.mfa_type !== ""` + `session_state_file` configurado → verificar existencia.
// Si el batch contiene al menos 1 CP NO-literal, el archivo faltante emite error temprano.
runPhase(phases, 'validate_mfa_session', () => {
  const { readYaml } = require('./lib/yaml-minimal');
  const { resolveDbConfig } = require('./lib/db-config-resolver');
  const sessionContext = require('./session-context');

  const APP_YAML = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config', 'appweb.yaml');
  const appYaml = readYaml(APP_YAML) || {};
  const auth = appYaml.auth || {};
  const testRun = appYaml.test_run || {};
  const appName = (appYaml.app || {}).name || '';
  const env = (appYaml.app || {}).environment || 'qa';

  const mfaType = auth.mfa_type || '';
  const sessionStateFile = auth.session_state_file || '';
  const healthSelector = auth.session_health_check_selector || '';
  const { db_config } = resolveDbConfig(appName, env, testRun);

  // Sync al session_context.json — runs pre-refactor no tenían estos campos propagados
  sessionContext.write(args.runId, {
    mfa_type: mfaType,
    session_state_file: sessionStateFile,
    session_health_check_selector: healthSelector,
    db_config, // null o objeto completo
  });

  if (!mfaType) return { skipped: true, reason: 'mfa_type_empty' };
  if (!sessionStateFile) {
    warnings.push(`mfa_type="${mfaType}" pero session_state_file vacío en appweb.yaml — configurar antes de ejecutar CPs que requieran auth`);
    return { skipped: true, reason: 'session_state_file_empty' };
  }

  const absPath = path.isAbsolute(sessionStateFile) ? sessionStateFile : path.join(PROJECT_ROOT, sessionStateFile);
  if (fs.existsSync(absPath)) {
    const stat = fs.statSync(absPath);
    const ageHours = ((Date.now() - stat.mtimeMs) / 3_600_000).toFixed(1);

    // Validar JWT en auth-storage, no solo existencia del archivo.
    // El storageState puede tener token vencido aunque el archivo sea reciente.
    // Decodifica el appToken (JWT) de localStorage.auth-storage y compara exp vs now.
    let jwtValid = null;       // null si no hay auth-storage parseable
    let jwtExpiresInMin = null;
    try {
      const raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
      const origins = Array.isArray(raw.origins) ? raw.origins : [];
      for (const o of origins) {
        const ls = Array.isArray(o.localStorage) ? o.localStorage : [];
        const authEntry = ls.find(e => e.name === 'auth-storage');
        if (!authEntry) continue;
        try {
          const parsed = JSON.parse(authEntry.value);
          const exp = parsed && parsed.state && parsed.state.appTokenExpiry;
          if (typeof exp === 'number') {
            const nowSec = Math.floor(Date.now() / 1000);
            jwtValid = exp > nowSec;
            jwtExpiresInMin = Math.round((exp - nowSec) / 60);
            break;
          }
        } catch (_) { /* auth-storage no es JSON parseable */ }
      }
    } catch (_) { /* archivo ilegible o sin localStorage */ }

    // Warning si JWT vencerá en menos de 10 min — informativo, no bloquea
    if (jwtValid === true && jwtExpiresInMin !== null && jwtExpiresInMin < 10) {
      warnings.push(
        `JWT en session_state_file expira en ${jwtExpiresInMin} min — ` +
        `considerar regenerar sesión antes del batch para evitar expiración mid-run: ` +
        `node .claude/tools/save-session.js --env ${env} --force`
      );
    }

    // Error duro si JWT vencido — el archivo existe pero está inútil
    if (jwtValid === false) {
      throw new Error(
        `JWT en session_state_file VENCIDO hace ${Math.abs(jwtExpiresInMin)} min. ` +
        `Regenerar sesión antes de /asdd:qa-web-exec: node .claude/tools/save-session.js --env ${env} --force`
      );
    }

    return {
      exists: true,
      age_hours: Number(ageHours),
      path: sessionStateFile,
      jwt_valid: jwtValid,                // true | false | null (si no se pudo decodificar)
      jwt_expires_in_min: jwtExpiresInMin,
    };
  }

  // Archivo ausente — verificar si hay CPs no-literales en el batch.
  // Heurística login-literal: el CP es del módulo auth (o tiene tag @auth/@login)
  // Y su primer step es "Navegar a {URL}". Criterio conservador: si duda, exige MFA.
  const nonLiteralCps = [];
  for (const t of cpTargets) {
    const designFile = path.join(runFolder, 'design', `cp_modulo_${t.module_id}.json`);
    if (!fs.existsSync(designFile)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(designFile, 'utf8'));
      const cps = doc.test_cases || doc.cases || doc.cps || [];
      const cp = cps.find(c => c.cp_id === t.cp_id);
      if (!cp) continue;
      const tags = Array.isArray(cp.tags) ? cp.tags.map(s => String(s).toLowerCase()) : [];
      const isAuthLike = /^(auth|login|signin|security)/i.test(t.module_id || '')
                       || tags.some(tag => /@(auth|login|signin)$/i.test(tag));
      const firstStepRaw = (cp.steps_raw || '').split('\n').find(l => l.trim()) || '';
      const firstStep = firstStepRaw.replace(/^\d+\.\s*/, '').trim();
      const firstStepNavigates = /^navegar\s+a\b/i.test(firstStep);
      const isLiteralLogin = isAuthLike && firstStepNavigates;
      if (!isLiteralLogin) nonLiteralCps.push(t.cp_id);
    } catch { /* skip */ }
  }

  if (nonLiteralCps.length > 0) {
    throw new Error(
      `session_state_file NO existe en disco: ${sessionStateFile}. ` +
      `El batch contiene ${nonLiteralCps.length} CP(s) no-literales (${nonLiteralCps.slice(0, 3).join(', ')}${nonLiteralCps.length > 3 ? '…' : ''}) que requieren sesión MFA activa. ` +
      `Ejecutar ANTES de /asdd:qa-web-exec: node .claude/tools/save-session.js --env ${env}`
    );
  }

  // Archivo ausente pero todos los CPs son login-literales — OK con warning informativo
  warnings.push(`session_state_file ausente (${sessionStateFile}) pero todos los CPs del batch son login-literales — no se requiere sesión MFA previa`);
  return { exists: false, reason: 'all_cps_login_literal' };
}, { critical: true });

// 4. KNOWLEDGE-EXCERPT → exec_context.json (--minimal for re-runs: skip knowledge files)
//    --cache: re-runs del mismo run_id reutilizan el JSON via mtime-check de
//    appweb.yaml/credentials/session_context/knowledge files. Ahorra ~15-30 s
//    en re-ejecuciones intra-sesión sin riesgo (auto-invalidación si cambia
//    cualquier source file).
runPhase(phases, 'knowledge_excerpt', () => {
  const knArgs = [`--run-id=${args.runId}`, `--output=${execContextPath}`, '--minimal', '--cache'];
  safeSpawn('.claude/tools/knowledge-excerpt.js', knArgs);
  return { path: path.relative(PROJECT_ROOT, execContextPath).replace(/\\/g, '/') };
});

// 5+6. PLAN-BATCHES + PRE-RESOLVE (unified — share module cache, avoid double I/O)
const batchSize = args.batchSize || 10;
const RISK_ORDER = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
const DURATION_BY_RISK = { critical: 1.5, high: 1.2, medium: 0.9, low: 0.7, unknown: 1.0 };

const { planResult, cpResolved } = runPhase(phases, 'plan_and_resolve', () => {
  const uniqueModules = [...new Set(cpTargets.map(t => t.module_id))];
  const cache = {};
  for (const m of uniqueModules) {
    const p = path.join(runFolder, 'design', `cp_modulo_${m}.json`);
    cache[m] = JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  // --- Enrich risk levels + sort + batch ---
  const enriched = cpTargets.map(t => {
    const doc = cache[t.module_id];
    const cps = doc.test_cases || doc.cases || doc.cps || [];
    const cp = cps.find(c => c.cp_id === t.cp_id);
    const risk = (cp && cp.risk_level) ? String(cp.risk_level).toLowerCase() : 'unknown';
    return { module_id: t.module_id, cp_id: t.cp_id, risk_level: risk in RISK_ORDER ? risk : 'unknown' };
  });

  const sorted = [...enriched].sort((a, b) => {
    const dr = RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level];
    if (dr !== 0) return dr;
    if (a.module_id !== b.module_id) return a.module_id < b.module_id ? -1 : 1;
    return a.cp_id < b.cp_id ? -1 : a.cp_id > b.cp_id ? 1 : 0;
  });

  const batches = [];
  for (let i = 0; i < sorted.length; i += batchSize) {
    batches.push(sorted.slice(i, i + batchSize));
  }

  const by_risk = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  const by_module = {};
  let estDur = 0;
  for (const t of enriched) {
    by_risk[t.risk_level] = (by_risk[t.risk_level] || 0) + 1;
    by_module[t.module_id] = (by_module[t.module_id] || 0) + 1;
    estDur += (DURATION_BY_RISK[t.risk_level] || 1.0);
  }

  const plan = {
    batches,
    total_batches: batches.length,
    stats: { total_cps: enriched.length, by_risk, by_module },
    estimated_duration_min: Math.round(estDur * 10) / 10,
    warnings: [],
  };

  // --- Pre-resolve CPs (full data for executor) ---
  const resolved = [];
  for (const target of cpTargets) {
    const doc = cache[target.module_id];
    const cps = doc.test_cases || doc.cases || doc.cps || [];
    const cp = cps.find(c => c.cp_id === target.cp_id);
    if (!cp) {
      warnings.push(`CP ${target.cp_id} no encontrado en cp_modulo_${target.module_id}.json`);
      continue;
    }

    let resolvedStepsRaw = cp.steps_raw || null;
    if (!resolvedStepsRaw && cp.gherkin) {
      resolvedStepsRaw = deriveStepsRawFromGherkin(cp.gherkin);
    }

    resolved.push({
      module_id: target.module_id,
      cp_id: target.cp_id,
      ...(cp.source_id && { source_id: cp.source_id }),
      hu_id: cp.hu_id,
      risk_level: cp.risk_level || 'unknown',
      title: cp.title,
      technique: cp.technique,
      tags: cp.tags,
      gherkin: cp.gherkin,
      test_data_ref: cp.test_data_ref,
      expected_result: cp.expected_result,
      responsive_viewports: cp.responsive_viewports,
      ...(resolvedStepsRaw && { steps_raw: resolvedStepsRaw }),
      ...(cp.preconditions && { preconditions: cp.preconditions }),
      ...(cp.type && { type: cp.type }),
      ...(cp.auto_inferred && { auto_inferred: cp.auto_inferred }),
      ...(cp.module && { module: cp.module }),
    });
  }

  return { planResult: plan, cpResolved: resolved };
});

//  — Pre-resolución determinística de selectores via nav-learning lookup-batch.
// Cierra el gap "lookup-first ignorado por LLM" haciendo la resolución ANTES del sub-agent.
// El executor recibe `selector_hints[]` por CP y los usa sin invocar nav-learning runtime.
runPhase(phases, 'pre_resolve_selectors', () => {
  // Skip si nav-learning está deshabilitado en este run
  const ctxRead = JSON.parse(fs.readFileSync(execContextPath, 'utf8'));
  const navEnabled = ctxRead?.app_yaml_extract?.navigation_learning_enabled === true;
  if (!navEnabled) {
    return { skipped: true, reason: 'navigation_learning_disabled', cps_resolved: 0, total_hints: 0 };
  }

  const appName = ctxRead?.app_yaml_extract?.app_name;
  if (!appName) {
    return { skipped: true, reason: 'app_name_missing', cps_resolved: 0, total_hints: 0 };
  }

  const navMapPath = path.join(PROJECT_ROOT, '.claude', 'agent-memory', appName, 'navigation_map.json');
  if (!fs.existsSync(navMapPath)) {
    return { skipped: true, reason: 'navigation_map_missing', cps_resolved: 0, total_hints: 0 };
  }

  // Verbo lexicon (español) → action_type canónico para lookup-batch.
  // Solo verbos que producen action_type interactivo en nav-learning.
  const VERB_PATTERNS = [
    { re: /\b(da[rs]?|hac[ea]r?|presion[ae]r?)\s+(?:un\s+)?cli[ck]+/i, action: 'click' },
    { re: /\bcli[ck]+(?:e|ear)?\b/i,                                  action: 'click' },
    { re: /\bingres[ae]r?|escrib[ae]r?|llen[ae]r?|teclea[rs]?\b/i,    action: 'type' },
    { re: /\bsuministr[ae]r?|digit[ae]r?\b/i,                          action: 'type' },
    { re: /\bselec(?:cion[ae]r?)?|escog[ae]r?|elegir|elij[ae]\b/i,    action: 'select_option' },
    { re: /\bmarc[ae]r?|tild[ae]r?|activ[ae]r?\b/i,                    action: 'click' },
    { re: /\bdesmarc[ae]r?|destild[ae]r?|desactiv[ae]r?\b/i,          action: 'click' },
    { re: /\bsub[ie]r?|carg[ae]r?|adjunt[ae]r?\b/i,                    action: 'file_upload' },
  ];

  // Extraer label heurísticamente del step_text. Patrones:
  //   "...el botón <X>...", "...campo <X>...", "...input <X>...", "...menú <X>...",
  //   "...checkbox <X>...", "...la opción <X>...", "...el link <X>...", "...el ítem <X>..."
  // Toma palabras capitalizadas o entre comillas.
  const LABEL_EXTRACTORS = [
    /['"`]([^'"`]{2,40})['"`]/,                                       // "X" o 'X'
    /\b(?:bot[oó]n|button|input|campo|field|men[uú]|menu|checkbox|opci[oó]n|link|enlace|tab|pesta[ñn]a|toggle)\s+["']?([A-Z][\w\s\-]{1,40}?)["']?(?:\s|[.,;]|$)/i,
    /\b(?:en|sobre|del?|para)\s+(?:el|la|los|las)?\s*["']?([A-Z][\w\s\-]{1,40}?)["']?(?:\s|[.,;]|$)/,
  ];

  function extractAction(stepText) {
    for (const { re, action } of VERB_PATTERNS) {
      if (re.test(stepText)) return action;
    }
    return null;
  }

  function extractLabel(stepText) {
    for (const re of LABEL_EXTRACTORS) {
      const m = stepText.match(re);
      if (m && m[1]) {
        const cleaned = m[1].trim().replace(/\s+/g, ' ');
        if (cleaned.length >= 2 && cleaned.length <= 60) return cleaned;
      }
    }
    return null;
  }

  // Cargar navigation_map y construir lookup local (sin spawn — más rápido).
  let navMap;
  try { navMap = JSON.parse(fs.readFileSync(navMapPath, 'utf8')); }
  catch (e) {
    return { skipped: true, reason: `nav_map_unreadable: ${e.message}`, cps_resolved: 0, total_hints: 0 };
  }

  const navMapPages = navMap?.pages || {};

  // Lookup helper local (replica la lógica esencial de nav-learning lookup sin spawn).
  function localLookup(label, action) {
    if (!label || !action) return null;
    const labelLC = label.toLowerCase();
    const actionLC = String(action).toLowerCase().replace(/^browser_/, '');
    let bestHit = null;
    let bestConfidence = 0;
    for (const pageData of Object.values(navMapPages)) {
      const elements = pageData?.elements || {};
      for (const [_, el] of Object.entries(elements)) {
        const elAction = String(el.action_type || '').toLowerCase().replace(/^browser_/, '');
        if (elAction !== actionLC) continue;
        const elLabel = String(el.element_label || '').toLowerCase();
        const elKey = String(el.element_key || '').toLowerCase();
        const labelMatch = elLabel.includes(labelLC) || labelLC.includes(elLabel) || elKey.includes(labelLC.replace(/\s+/g, '_'));
        if (!labelMatch) continue;
        const conf = el.confidence || 0;
        if (el.stale) continue;
        if (conf > bestConfidence) {
          bestHit = {
            selector: el.selector,
            strategy: el.selector_strategy,
            confidence: conf,
            element_key: el.element_key,
            element_label: el.element_label,
          };
          bestConfidence = conf;
        }
      }
    }
    if (bestConfidence >= 0.5) return bestHit;
    return null;
  }

  let totalHints = 0;
  let cpsResolved = 0;
  for (const cp of cpResolved) {
    if (!cp.steps_raw) continue;
    const lines = String(cp.steps_raw).split(/\n/).map(l => l.replace(/^[-\s]*\d+\.\s*/, '').trim()).filter(Boolean);
    const hints = {};
    for (let i = 0; i < lines.length; i++) {
      const stepN = i + 1;
      const stepText = lines[i];
      const action = extractAction(stepText);
      if (!action) continue;
      const label = extractLabel(stepText);
      if (!label) continue;
      const hit = localLookup(label, action);
      if (hit) {
        hints[String(stepN)] = {
          action,
          label,
          selector: hit.selector,
          strategy: hit.strategy,
          confidence: hit.confidence,
          element_key: hit.element_key,
          source: 'nav_map',
        };
        totalHints++;
      }
    }
    if (Object.keys(hints).length > 0) {
      cp.selector_hints = hints;
      cpsResolved++;
    }
  }

  return {
    skipped: false,
    cps_resolved: cpsResolved,
    total_cps: cpResolved.length,
    total_hints: totalHints,
    nav_map_elements: Object.values(navMapPages).reduce((a, p) => a + Object.keys(p.elements || {}).length, 0),
  };
});

runPhase(phases, 'merge_context', () => {
  const ctx = JSON.parse(fs.readFileSync(execContextPath, 'utf8'));
  ctx.cp_targets_resolved = cpResolved;
  ctx.batches = planResult.batches;
  ctx.total_batches = planResult.total_batches;
  ctx.plan_stats = planResult.stats;
  fs.writeFileSync(execContextPath, JSON.stringify(ctx, null, 2), 'utf8');
  return { ctx_size_kb: +(fs.statSync(execContextPath).size / 1024).toFixed(1) };
});

// Output final
const result = {
  ok: phases.every(p => p.ok),
  total_ms: Date.now() - t0,
  phases,
  batches: planResult.batches,
  total_batches: planResult.total_batches,
  cp_targets_resolved_count: cpResolved.length,
  exec_context_path: path.relative(PROJECT_ROOT, execContextPath).replace(/\\/g, '/'),
  stats: planResult.stats,
  warnings: warnings.concat(planResult.warnings || []),
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
