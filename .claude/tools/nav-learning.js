#!/usr/bin/env node
/**
 * ATF — Navigation Learning: lookup, registro y merge de selectores descubiertos.
 *
 * Herramienta determinística que reemplaza la lógica de navigation learning
 * que antes residía en instrucciones del spec del agente executor.
 * El executor solo necesita LLAMAR esta herramienta — no implementar la lógica.
 *
 * Uso:
 *
 *   # Reconciliación post-módulo (orchestrator — reemplaza pasos a/b/c/d)
 *   node .claude/tools/nav-learning.js reconcile \
 *     --run-folder {run_folder} \
 *     --module-id  {module_id} \
 *     --nav-map    .claude/agent-memory/{APP}/navigation_map.json \
 *     --output     .claude/agent-memory/{APP}/navigation_map.json \
 *     --stats-output {execution_dir}/{module_id}/nav_stats_{module_id}.json \
 *     --run-id     {run_id} \
 *     [--min-confidence 0.5] [--max-alternatives 3] [--stale-purge-after-runs 3]
 *
 *   # Inicializar sesión (PASO 1.1 del executor)
 *   node .claude/tools/nav-learning.js lookup --init \
 *     --nav-map .claude/agent-memory/{APP}/navigation_map.json \
 *     --session {run_folder}/.tmp/nav_session_{module_id}.json \
 *     --min-confidence 0.5 \
 *     --max-alternatives 3
 *
 *   # Consultar selector (R2.2 pre-step B.0) — single lookup
 *   node .claude/tools/nav-learning.js lookup \
 *     --session {session_path} \
 *     --path /login \
 *     --action-type click \
 *     --element-label "Iniciar sesion" \
 *     --cp-id CP-auth-001
 *
 *   # Consultar múltiples selectores de un CP en 1 call (R2.2 — ahorra N bash spawns)
 *   node .claude/tools/nav-learning.js lookup-batch \
 *     --session {session_path} \
 *     --steps-json '[{"path":"/login","action_type":"fill","element_label":"Usuario","cp_id":"CP-auth-001"},{"path":"/login","action_type":"fill","element_label":"Contraseña","cp_id":"CP-auth-001"},{"path":"/login","action_type":"click","element_label":"Iniciar sesión","cp_id":"CP-auth-001"}]'
 *   # Output: JSON array [{idx, result, selector, strategy, confidence, element_key}, ...]
 *
 *   # Registrar selector descubierto (R2.2 post-step B.4)
 *   node .claude/tools/nav-learning.js record \
 *     --session {session_path} \
 *     --cp-id CP-auth-001 \
 *     --path /login \
 *     --element-label "Iniciar sesion" \
 *     --action-type click \
 *     --selector "button#login-button" \
 *     --selector-strategy id \
 *     --visible-text "Login" \
 *     --aria-label "Iniciar sesion" \
 *     --parent-section "Formulario de login" \
 *     --run-id MiApp-v1.0-20260101-0900
 *
 *   # Marcar selector stale (R2.2 paso 3 — selector de nav_map falló)
 *   node .claude/tools/nav-learning.js record \
 *     --session {session_path} \
 *     --cp-id CP-auth-001 \
 *     --path /login \
 *     --element-key login_button \
 *     --stale \
 *     --run-id MiApp-v1.0-20260101-0900
 *
 *   # Merge discoveries a knowledge (PASO 5b Parte 5)
 *   node .claude/tools/nav-learning.js merge \
 *     --session {session_path} \
 *     --nav-map .claude/agent-memory/{APP}/navigation_map.json \
 *     --output .claude/agent-memory/{APP}/navigation_map.json \
 *     --stats-output {output_dir}/nav_stats_{module_id}.json \
 *     --stale-purge-after-runs 3 \
 *     --run-id MiApp-v1.0-20260101-0900
 *
 * Exit codes: 0 = OK | 1 = error
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function die(msg) {
  console.error(`❌ nav-learning: ${msg}`);
  process.exit(1);
}

// ─── Filtro anti-selector-frágil ────────
//
// Dos clases de fragilidad:
//   HARD (rechazo total): selectors test-data-dependent o estado-runtime.
//     [value='X']        → depende del valor actual del campo (test data)
//     [textContent='X']  → idem para texto
//     .X--active/--focused/--filled/--selected → estado runtime del componente
//     :focus/:checked/:hover → pseudo-clases de estado del browser
//
//   SOFT (acepto con confidence cap): text-based selectors. Para apps que NO
//     exponen attributes estructurales (caso real OrangeHRM, el
//     único discriminator es el texto del label. Persistir con cap permite
//     fallback útil sin promoverlos como preferred.
//     :has-text('X')     → texto literal de la UI
//     :contains('X')     → jQuery-style
//
// Permitido sin penalty (estructurales):
//   [name=...], [id=...], [data-*=...], [aria-*=...], [role=...], #ID,
//   clases semánticas sin sufijos de estado, :nth-of-type / :nth-child.
//
const FRAGILE_HARD = [
  { pattern: /\[value\s*=/i,                name: 'attr_value' },
  { pattern: /\[textContent\s*=/i,          name: 'attr_textContent' },
  { pattern: /[.\w-]+--active\b/,           name: 'state_active' },
  { pattern: /[.\w-]+--focused\b/,          name: 'state_focused' },
  { pattern: /[.\w-]+--filled\b/,           name: 'state_filled' },
  { pattern: /[.\w-]+--selected\b/,         name: 'state_selected' },
  { pattern: /:focus\b/,                    name: 'pseudo_focus' },
  { pattern: /:checked\b/,                  name: 'pseudo_checked' },
  { pattern: /:hover\b/,                    name: 'pseudo_hover' },
];
const FRAGILE_SOFT = [
  { pattern: /:has-text\s*\(/i,             name: 'has_text' },
  { pattern: /:contains\s*\(/i,             name: 'contains' },
];
const SOFT_CONFIDENCE_CAP = 0.4;  // Selectors text-based persisten pero no superan este nivel

function detectFragileSelector(selector) {
  if (!selector || typeof selector !== 'string') return { kind: null };
  for (const { pattern, name } of FRAGILE_HARD) {
    if (pattern.test(selector)) return { kind: 'hard', reason: name };
  }
  for (const { pattern, name } of FRAGILE_SOFT) {
    if (pattern.test(selector)) return { kind: 'soft', reason: name };
  }
  return { kind: null };
}

function parseArgs() {
  const raw = process.argv.slice(2);
  if (raw.length === 0) die('Subcomando requerido: lookup | record | merge | reconcile | export-recipes');

  const subcommand = raw[0];
  const opts = { subcommand };

  for (let i = 1; i < raw.length; i++) {
    switch (raw[i]) {
      case '--init':              opts.init = true; break;
      case '--stale':             opts.stale = true; break;
      case '--stale-reason':      opts.staleReason = raw[++i]; break;
      case '--discovered-via':    opts.discoveredVia = raw[++i]; break;  // C
      case '--steps-json':        opts.stepsJson = raw[++i]; break;
      case '--nav-map':           opts.navMap = raw[++i]; break;
      case '--session':           opts.session = raw[++i]; break;
      case '--path':              opts.urlPath = raw[++i]; break;
      case '--action-type':       opts.actionType = raw[++i]; break;
      case '--element-label':     opts.elementLabel = raw[++i]; break;
      case '--element-key':       opts.elementKey = raw[++i]; break;
      case '--cp-id':             opts.cpId = raw[++i]; break;
      case '--selector':          opts.selector = raw[++i]; break;
      case '--selector-strategy': opts.selectorStrategy = raw[++i]; break;
      case '--visible-text':      opts.visibleText = raw[++i]; break;
      case '--aria-label':        opts.ariaLabel = raw[++i]; break;
      case '--parent-section':    opts.parentSection = raw[++i]; break;
      case '--run-id':            opts.runId = raw[++i]; break;
      case '--min-confidence':    opts.minConfidence = parseFloat(raw[++i]); break;
      case '--max-alternatives':  opts.maxAlternatives = parseInt(raw[++i], 10); break;
      case '--output':            opts.output = raw[++i]; break;
      case '--stats-output':      opts.statsOutput = raw[++i]; break;
      case '--stale-purge-after-runs': opts.stalePurgeAfterRuns = parseInt(raw[++i], 10); break;
      case '--run-folder':        opts.runFolder = raw[++i]; break;
      case '--module-id':         opts.moduleId = raw[++i]; break;
      case '--memory-dir':        opts.memoryDir = raw[++i]; break;
      //  — verified-against-DOM: el caller (executor) lo setea TRAS
      // ejecutar `browser_evaluate('!!document.querySelector(...)')` con éxito.
      // Sin este flag, el record se marca como `verified_against_dom: false` y
      // la confidence queda capada para evitar que selectores hallucinados
      // suban a HIT-grade sin verificación. Doctrina en execute.md PASO 3.B paso 6.
      case '--verified':          opts.verified = true; break;
      default:
        console.warn(`⚠️  Argumento desconocido ignorado: ${raw[i]}`);
    }
  }
  return opts;
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    die(`Error al leer ${filePath}: ${e.message}`);
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Normaliza un label a una clave de elemento.
 * Lowercase, sin acentos, espacios → _, max 50 chars.
 */
function slugify(label) {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

/**
 * Infiere la estrategia de un selector a partir de su formato.
 */
function inferStrategy(selector) {
  if (!selector) return 'unknown';
  if (selector.startsWith('#'))                       return 'id';
  if (selector.includes('[name='))                    return 'name';
  if (selector.startsWith('text=') || selector.startsWith('"')) return 'text';
  if (selector.startsWith('//') || selector.startsWith('xpath=')) return 'xpath';
  return 'css';
}

/**
 * Construye el objeto de stats para la salida.
 */
function buildStats(session, extra) {
  return {
    module_id:     session.module_id,
    total_lookups: session.stats.lookups,
    hits:          session.stats.hits,
    misses:        session.stats.misses,
    stale_hits:    session.stats.stale_hits,
    discoveries:   session.stats.discoveries,
    stale_marks:   session.stats.stale_marks,
    purged:        extra.purged || 0,
    new_elements:  extra.newElements || 0,
    updated_elements: extra.updatedElements || 0,
    stale_elements:   extra.staleElements || 0,
    skipped:       false,
    by_cp:         session.stats.by_cp,
  };
}

/* ─── Subcomando: lookup ──────────────────────────────────────────────────── */

function actionLookupInit(opts) {
  if (!opts.session) die('--session es requerido para lookup --init');

  let navMap = { updated_at: null, last_run_id: null, schema_version: '1.0', pages: {} };
  if (opts.navMap) {
    if (fs.existsSync(opts.navMap)) {
      navMap = readJSON(opts.navMap);
    } else {
      // Auto-create empty navigation_map.json for this app (first run).
      // Ensures merge post-module can write back without error.
      const navDir = path.dirname(opts.navMap);
      if (!fs.existsSync(navDir)) fs.mkdirSync(navDir, { recursive: true });
      writeJSON(opts.navMap, navMap);
      console.error(`📍 nav-learning: navigation_map.json creado en ${opts.navMap} (primera ejecución de esta app)`);
    }
  }

  const pages = navMap.pages || {};
  let totalElements = 0;
  for (const page of Object.values(pages)) {
    if (page.elements) totalElements += Object.keys(page.elements).length;
  }

  // Derivación del module_id:
  //   1) Si `--module-id` se pasó explícitamente, usarlo (canonical).
  //   2) Si no, fallback a basename del filename (legacy).
  // Razón: filenames del fast-path siguen el patrón `nav_session_{module}_b{batch}.json`.
  // Derivar de basename produce `module_id="admin-organization_b1"` (contaminado con
  // sufijo de batch) → fragmenta knowledge en navigation_map.json. run
  // MiApp-v1.0-20260101-0900 (ver autopsia /plans/ya-lo-detuve-...).
  const moduleId = opts.moduleId
    ? opts.moduleId
    : path.basename(opts.session, '.json').replace(/^nav_session_/, '');
  const session = {
    module_id:      moduleId,
    initialized_at: new Date().toISOString(),
    nav_map_path:   opts.navMap || null,
    min_confidence: isNaN(opts.minConfidence) ? 0.5 : opts.minConfidence,
    max_alternatives: isNaN(opts.maxAlternatives) ? 3 : opts.maxAlternatives,
    pages,
    discoveries: [],
    stats: {
      lookups:     0,
      hits:        0,
      misses:      0,
      stale_hits:  0,
      stale_marks: 0,
      discoveries: 0,
      by_cp:       {},
    },
  };

  writeJSON(opts.session, session);

  const result = {
    status:     'initialized',
    pages:      Object.keys(pages).length,
    elements:   totalElements,
    updated_at: navMap.updated_at || null,
  };

  console.log(`📍 nav-learning: sesión inicializada — ${result.pages} páginas, ${result.elements} elementos`);
  console.log(JSON.stringify(result));
}

/**
 * Normaliza una URL o path a solo el pathname.
 * "https://www.saucedemo.com/cart.html" → "/cart.html"
 * "/cart.html" → "/cart.html"
 * Evita duplicados en el mapa entre path relativo y URL absoluta de la misma página.
 */
function normalizeUrlPath(raw) {
  if (!raw) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try { return new URL(raw).pathname; } catch (_) {}
  }
  return raw;
}

function actionLookupQuery(opts) {
  if (!opts.session)      die('--session es requerido para lookup');
  if (!opts.urlPath)      die('--path es requerido para lookup');
  if (!opts.actionType)   die('--action-type es requerido para lookup');
  if (!opts.elementLabel) die('--element-label es requerido para lookup');
  if (!fs.existsSync(opts.session)) die(`Session file no existe: ${opts.session}`);

  const session = readJSON(opts.session);
  const cpId = opts.cpId || '_unknown';

  if (!session.stats.by_cp[cpId]) {
    session.stats.by_cp[cpId] = { hits: 0, misses: 0, discoveries: 0 };
  }
  session.stats.lookups++;

  // B2: normalizar el path de entrada a pathname puro antes de buscar en el mapa.
  const normalizedPath = normalizeUrlPath(opts.urlPath);
  let page = session.pages[normalizedPath];

  // Fallback: si el path es relativo ("/", "/cart") y no matchea,
  // buscar URLs completas cuyo pathname coincida (ej: "https://www.saucedemo.com/" → "/").
  // Tras B2 esto debería ser raro, pero se mantiene para mapas históricos no normalizados.
  if ((!page || !page.elements) && normalizedPath.startsWith('/')) {
    for (const [pageKey, pageVal] of Object.entries(session.pages)) {
      if (pageKey === normalizedPath) continue; // ya probado
      try {
        const parsed = new URL(pageKey);
        if (parsed.pathname === normalizedPath && pageVal && pageVal.elements) {
          page = pageVal;
          break;
        }
      } catch (_) { /* no es URL válida — ignorar */ }
    }
  }

  if (!page || !page.elements) {
    session.stats.misses++;
    session.stats.by_cp[cpId].misses++;
    writeJSON(opts.session, session);
    console.log(JSON.stringify({ result: 'MISS', selector: null, element_key: null }));
    return;
  }

  const searchLabel  = opts.elementLabel.toLowerCase();
  const searchAction = normalizeActionType(opts.actionType);
  // B1: también derivar el slugified key del label buscado para matchear claves del mapa.
  const searchKey    = slugify(opts.elementLabel);

  for (const [key, el] of Object.entries(page.elements)) {
    // Fase 3c — comparar action_type normalizado (sin prefijo browser_)
    if (normalizeActionType(el.action_type || '') !== searchAction) continue;

    // B1: incluir búsqueda por element_key slugificado.
    // Resuelve el MISS inicial de "login page" cuando la key almacenada es "login_page".
    const labelMatch =
      (el.element_label || '').toLowerCase().includes(searchLabel) ||
      (el.visible_text  || '').toLowerCase().includes(searchLabel) ||
      key === searchKey ||
      key.includes(searchKey) ||
      searchKey.includes(key);
    if (!labelMatch) continue;

    if (el.stale || (el.confidence || 0) < session.min_confidence) {
      session.stats.stale_hits++;
      session.stats.by_cp[cpId].misses++;
      writeJSON(opts.session, session);
      console.log(JSON.stringify({
        result:      'STALE',
        selector:    el.selector,
        strategy:    el.selector_strategy,
        confidence:  el.confidence,
        element_key: key,
      }));
      return;
    }

    // B3: incrementar confidence del elemento tras cada HIT exitoso (+0.05, máx 1.0).
    // Refuerza la confianza en selectores que se usan exitosamente en múltiples runs.
    if ((el.confidence || 0) < 1.0) {
      el.confidence = Math.min(1.0, (el.confidence || 0.5) + 0.05);
      page.elements[key] = el;
    }

    session.stats.hits++;
    session.stats.by_cp[cpId].hits++;
    writeJSON(opts.session, session);
    console.log(JSON.stringify({
      result:      'HIT',
      selector:    el.selector,
      strategy:    el.selector_strategy,
      confidence:  el.confidence,
      element_key: key,
    }));
    return;
  }

  session.stats.misses++;
  session.stats.by_cp[cpId].misses++;
  writeJSON(opts.session, session);
  console.log(JSON.stringify({ result: 'MISS', selector: null, element_key: null }));
}

/* ─── Subcomando: lookup-batch ────────────────────────────────────────────── */
/**
 * Batch lookup: N consultas en 1 sola call de bash en vez de N calls secuenciales.
 * Ahorra ~6-8s por CP (4 pasos × ~2s de bash spawn cada uno) en Windows.
 *
 * Uso:
 *   node .claude/tools/nav-learning.js lookup-batch \
 *     --session {session_path} \
 *     --steps-json '[{"path":"/","action_type":"click","element_label":"Login button","cp_id":"CP-auth-001"},...]'
 *
 * Output (última línea): JSON array indexado por posición, con result/selector/strategy/confidence/element_key.
 * Ejemplo de resultado:
 *   [
 *     {"idx":0,"result":"HIT","selector":"#login-button","strategy":"id","confidence":0.9,"element_key":"login_button"},
 *     {"idx":1,"result":"MISS","selector":null,"element_key":null}
 *   ]
 *
 * El executor itera esta respuesta antes del loop de pasos y construye un mapa
 * de selectores en memoria — sin bash spawn por step en R2.2.
 */

function actionLookupBatch(opts) {
  if (!opts.session)   die('--session es requerido para lookup-batch');
  if (!opts.stepsJson) die('--steps-json es requerido para lookup-batch');
  if (!fs.existsSync(opts.session)) die(`Session file no existe: ${opts.session}`);

  let steps;
  try {
    steps = JSON.parse(opts.stepsJson);
  } catch (e) {
    die(`--steps-json no es JSON válido: ${e.message}`);
  }
  if (!Array.isArray(steps)) die('--steps-json debe ser un array');

  const session = readJSON(opts.session);
  const results = [];

  for (let idx = 0; idx < steps.length; idx++) {
    const step = steps[idx];
    if (!step.path || !step.action_type || !step.element_label) {
      results.push({ idx, result: 'SKIP', selector: null, element_key: null, reason: 'missing_fields' });
      continue;
    }

    // action_type=evaluate no es interacción DOM (JS puro) — nav-learning no aplica.
    // Antes: estos steps generaban MISSes ruidosos en la telemetría sin valor.
    if (String(step.action_type).toLowerCase() === 'evaluate') {
      results.push({ idx, result: 'SKIP', selector: null, element_key: null, reason: 'non_dom_action' });
      continue;
    }

    const cpId         = step.cp_id || '_unknown';
    const normalizedPath = normalizeUrlPath(step.path);
    const searchLabel  = step.element_label.toLowerCase();
    const searchAction = normalizeActionType(step.action_type); // Fase 3c
    const searchKey    = slugify(step.element_label);

    if (!session.stats.by_cp[cpId]) {
      session.stats.by_cp[cpId] = { hits: 0, misses: 0, discoveries: 0 };
    }
    session.stats.lookups++;

    // Buscar la página (con fallback URL completa → pathname, igual que lookup single)
    let page = session.pages[normalizedPath];
    if ((!page || !page.elements) && normalizedPath.startsWith('/')) {
      for (const [pageKey, pageVal] of Object.entries(session.pages)) {
        if (pageKey === normalizedPath) continue;
        try {
          const parsed = new URL(pageKey);
          if (parsed.pathname === normalizedPath && pageVal && pageVal.elements) {
            page = pageVal;
            break;
          }
        } catch (_) { /* no URL válida */ }
      }
    }

    if (!page || !page.elements) {
      session.stats.misses++;
      session.stats.by_cp[cpId].misses++;
      results.push({ idx, result: 'MISS', selector: null, element_key: null });
      continue;
    }

    let matched = false;
    for (const [key, el] of Object.entries(page.elements)) {
      // Fase 3c — comparar action_type normalizado (sin prefijo browser_)
      if (normalizeActionType(el.action_type || '') !== searchAction) continue;

      const labelMatch =
        (el.element_label || '').toLowerCase().includes(searchLabel) ||
        (el.visible_text  || '').toLowerCase().includes(searchLabel) ||
        key === searchKey ||
        key.includes(searchKey) ||
        searchKey.includes(key);
      if (!labelMatch) continue;

      if (el.stale || (el.confidence || 0) < session.min_confidence) {
        session.stats.stale_hits++;
        session.stats.by_cp[cpId].misses++;
        results.push({
          idx,
          result:      'STALE',
          selector:    el.selector,
          strategy:    el.selector_strategy,
          confidence:  el.confidence,
          element_key: key,
        });
        matched = true;
        break;
      }

      // B3: incrementar confidence tras HIT (igual que lookup single)
      if ((el.confidence || 0) < 1.0) {
        el.confidence = Math.min(1.0, (el.confidence || 0.5) + 0.05);
        page.elements[key] = el;
      }

      session.stats.hits++;
      session.stats.by_cp[cpId].hits++;
      results.push({
        idx,
        result:      'HIT',
        selector:    el.selector,
        strategy:    el.selector_strategy,
        confidence:  el.confidence,
        element_key: key,
      });
      matched = true;
      break;
    }

    if (!matched) {
      session.stats.misses++;
      session.stats.by_cp[cpId].misses++;
      results.push({ idx, result: 'MISS', selector: null, element_key: null });
    }
  }

  // Escribir sesión una sola vez al final (vs N writes en lookup single)
  writeJSON(opts.session, session);

  const hits   = results.filter(r => r.result === 'HIT').length;
  const misses = results.filter(r => r.result === 'MISS').length;
  const stale  = results.filter(r => r.result === 'STALE').length;
  console.log(`📍 nav-learning lookup-batch: ${steps.length} steps — ${hits} HITs | ${misses} MISSes | ${stale} STALEs`);
  console.log(JSON.stringify(results));
}

/* ─── Subcomando: record ──────────────────────────────────────────────────── */

function actionRecord(opts) {
  if (!opts.session) die('--session es requerido para record');
  if (!opts.urlPath) die('--path es requerido para record');
  if (!opts.runId)   die('--run-id es requerido para record');
  if (!fs.existsSync(opts.session)) die(`Session file no existe: ${opts.session}`);

  const session = readJSON(opts.session);
  const cpId = opts.cpId || '_unknown';

  // B2: normalizar el path a pathname puro antes de usarlo como key en session.pages.
  // Evita crear entradas duplicadas "https://www.saucedemo.com/" y "/" para la misma página.
  const normalizedPath = normalizeUrlPath(opts.urlPath);

  if (!session.stats.by_cp[cpId]) {
    session.stats.by_cp[cpId] = { hits: 0, misses: 0, discoveries: 0 };
  }

  /* ── Marcado stale ─────────────────────────────────────────────────────── */
  if (opts.stale) {
    if (!opts.elementKey) die('--element-key es requerido para record --stale');

    session.discoveries.push({
      cp_id:       cpId,
      page_key:    normalizedPath,
      element_key: opts.elementKey,
      action:      'mark_stale',
      reason:      opts.staleReason || null,    // D: forensics
      run_id:      opts.runId,
      timestamp:   new Date().toISOString(),
    });
    session.stats.stale_marks++;

    writeJSON(opts.session, session);
    console.log(JSON.stringify({ recorded: true, action: 'mark_stale', element_key: opts.elementKey, reason: opts.staleReason || null }));
    return;
  }

  /* ── Registro de descubrimiento (upsert) ───────────────────────────────── */
  if (!opts.elementLabel) die('--element-label es requerido para record (upsert)');
  if (!opts.actionType)   die('--action-type es requerido para record (upsert)');
  if (!opts.selector)     die('--selector es requerido para record (upsert)');

  // Filtro anti-frágil de dos niveles:
  //   HARD → rechazar (test-data o estado-runtime).
  //   SOFT → aceptar pero capar confidence (text-based: única opción para apps
  //          sin attributes estructurales como OrangeHRM Organization Name input).
  const fragility = detectFragileSelector(opts.selector);
  if (fragility.kind === 'hard') {
    console.log(JSON.stringify({
      recorded: false,
      rejected: true,
      reason:   'fragile_selector',
      pattern:  fragility.reason,
      selector: opts.selector,
      hint:     'Use selectors estructurales: [name=...], [id=...], [data-*], [aria-*], [role=...], o clases semánticas sin sufijos de estado (--active/--focused/--filled).',
    }));
    return;
  }
  // Para SOFT (text-based): persistimos pero con cap. La lógica del cap se
  // aplica más abajo cuando computamos `confidence`.

  const existingPage = session.pages[normalizedPath];

  // Deduplicación por selector: si ya existe un elemento con el mismo selector en esta página,
  // reutilizar su key en lugar de derivar uno nuevo del label.
  // Evita duplicados cuando distintas fuentes (executor vs reconciliation) usan labels distintos
  // para el mismo elemento (ej: "First Name" vs "firstName" → ambos generan keys distintos
  // pero apuntan al mismo selector [data-test="firstName"]).
  let elementKey = opts.elementKey || slugify(opts.elementLabel);
  if (existingPage && existingPage.elements && opts.selector) {
    const match = Object.entries(existingPage.elements)
      .find(([, el]) => el.selector === opts.selector);
    if (match) elementKey = match[0];
  }

  const existingElement = existingPage && existingPage.elements
    ? existingPage.elements[elementKey]
    : null;

  let confidence     = 0.5;
  let discoveryCount = 1;
  let firstRun       = opts.runId;

  if (existingElement) {
    confidence     = Math.min(1.0, (existingElement.confidence || 0.5) + 0.1);
    discoveryCount = (existingElement.discovery_count || 1) + 1;
    firstRun       = existingElement.first_discovered_run || opts.runId;
  }

  // Aplicar SOFT cap: selectores text-based no superan SOFT_CONFIDENCE_CAP.
  // Esto los mantiene como fallback útil sin promoverlos como preferred sobre
  // alternativas estructurales que aparezcan después.
  if (fragility.kind === 'soft' && confidence > SOFT_CONFIDENCE_CAP) {
    confidence = SOFT_CONFIDENCE_CAP;
  }

  //  — `--verified` da bonus +0.05; la ausencia NO penaliza.
  //
  // Histórico ( aquí): existía un `UNVERIFIED_CONFIDENCE_CAP=0.7`
  // que congelaba la confidence de records sin `--verified`. Bug: el backfill
  // (que es la fuente principal de records cuando el sub-agent omite lookup
  // runtime) no podía pasar `--verified` porque no observa el browser. Resultado:
  // 100% de records quedaban capados a 0.7 — el sistema nunca promovía
  // selectores estables a HIT-grade (≥0.85). Run OrangeHRM: 8/15
  // selectores con discovery_count ≥ 9 todos clavados en 0.7.
  //
  // Solución (A): eliminar el cap. La ausencia de `--verified` solo significa
  // "no hubo verificación explícita en este record". Si el caller ya filtró
  // (el backfill solo invoca record cuando result.status=PASS),
  // los selectores SÍ se ejecutaron exitosamente en runtime — son legítimos.
  const verified = !!opts.verified;
  if (verified) confidence = Math.min(1.0, confidence + 0.05);

  session.discoveries.push({
    cp_id:       cpId,
    page_key:    normalizedPath,
    element_key: elementKey,
    action:      'upsert',
    data: {
      element_label:        opts.elementLabel,
      visible_text:         opts.visibleText || null,
      aria_label:           opts.ariaLabel || null,
      action_type:          normalizeActionType(opts.actionType), // Fase 3c
      selector:             opts.selector,
      selector_strategy:    opts.selectorStrategy || inferStrategy(opts.selector),
      confidence,
      discovery_count:      discoveryCount,
      stale:                false,
      stale_since:          null,
      stale_run_count:      0,
      first_discovered_run: firstRun,
      last_success_run:     opts.runId,
      last_success_at:      new Date().toISOString(),
      // trazabilidad: distinguir si el record vino del executor en runtime
      // (verificado contra DOM) vs backfill post-run (inferido de result.json) vs
      // reconciliation. Default 'runtime' para invocaciones del executor sin flag.
      discovered_via:       opts.discoveredVia || 'runtime',
      fragility_kind:       fragility.kind || null,  // null|soft (hard ya rechazó arriba)
      //  — flag que el lookup futuro consulta para preferir
      // discoveries verificadas sobre las inferidas. NO confundir con
      // `discovered_via='backfill'` (post-run) — un backfill puede ser
      // verificado si en runtime hubo verify previo.
      verified_against_dom: verified,
      context_hints: {
        parent_section: opts.parentSection || null,
      },
    },
    run_id:    opts.runId,
    timestamp: new Date().toISOString(),
  });

  session.stats.discoveries++;
  session.stats.by_cp[cpId].discoveries++;

  // Upsert en session.pages para aceleración intra-módulo:
  // los lookups de CPs posteriores dentro del mismo run encuentran HIT
  // sin esperar al merge final contra navigation_map.json.
  if (!session.pages[normalizedPath]) session.pages[normalizedPath] = { elements: {} };
  session.pages[normalizedPath].elements[elementKey] = session.discoveries[session.discoveries.length - 1].data;

  writeJSON(opts.session, session);
  console.log(JSON.stringify({ recorded: true, action: 'upsert', element_key: elementKey }));
}

/* ─── Subcomando: merge ───────────────────────────────────────────────────── */

function actionMerge(opts) {
  if (!opts.session) die('--session es requerido para merge');
  if (!opts.navMap)  die('--nav-map es requerido para merge');
  if (!opts.output)  die('--output es requerido para merge');
  if (!opts.runId)   die('--run-id es requerido para merge');

  /* ── Resolver sesión(es): soporta glob con * ───────────────────────────── */
  let sessionFiles;
  if (opts.session.includes('*')) {
    const dir     = path.dirname(opts.session);
    const base    = path.basename(opts.session);
    const regex   = new RegExp('^' + base.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    try {
      sessionFiles = fs.readdirSync(dir)
        .filter(f => regex.test(f))
        .map(f => path.join(dir, f))
        .filter(f => fs.existsSync(f));
    } catch (_) { sessionFiles = []; }
  } else {
    if (!fs.existsSync(opts.session)) die(`Session file no existe: ${opts.session}`);
    sessionFiles = [opts.session];
  }

  if (sessionFiles.length === 0) {
    console.log('📍 nav-learning: sin session files matching pattern — merge omitido');
    return;
  }

  /* ── Mergear múltiples sesiones en una sola ────────────────────────────── */
  const sessions = sessionFiles.map(readJSON);
  const session  = sessions[0];
  if (sessions.length > 1) {
    // Agregar discoveries y pages de sesiones adicionales
    for (let i = 1; i < sessions.length; i++) {
      session.discoveries.push(...sessions[i].discoveries);
      for (const [pk, pv] of Object.entries(sessions[i].pages || {})) {
        if (!session.pages[pk]) session.pages[pk] = { elements: {} };
        Object.assign(session.pages[pk].elements, pv.elements || {});
      }
      // Agregar stats acumuladas
      // Fase 3a/3b — fixes de merge multi-sesión:
      //  (3a) `total_lookups` no existe en `stats` source — el campo correcto
      //       es `lookups` (ver buildStats nav-learning.js:185 que rebautiza
      //       lookups → total_lookups solo en el OUTPUT). Sumar el campo
      //       equivocado siempre daba 0+0=0 → métricas multi-sesión inertes.
      //  (3b) `Object.assign(by_cp, ...)` reemplazaba entries con misma key
      //       en lugar de acumular hits/misses/discoveries por cp_id.
      //       Ahora se acumulan numéricamente.
      if (sessions[i].stats) {
        session.stats.lookups     = (session.stats.lookups     || 0) + (sessions[i].stats.lookups     || 0);
        session.stats.hits        = (session.stats.hits        || 0) + (sessions[i].stats.hits        || 0);
        session.stats.misses      = (session.stats.misses      || 0) + (sessions[i].stats.misses      || 0);
        session.stats.stale_hits  = (session.stats.stale_hits  || 0) + (sessions[i].stats.stale_hits  || 0);
        session.stats.discoveries = (session.stats.discoveries || 0) + (sessions[i].stats.discoveries || 0);
        session.stats.stale_marks = (session.stats.stale_marks || 0) + (sessions[i].stats.stale_marks || 0);
        // by_cp: acumular en lugar de sobreescribir
        if (!session.stats.by_cp) session.stats.by_cp = {};
        for (const [cpId, srcCp] of Object.entries(sessions[i].stats.by_cp || {})) {
          if (!session.stats.by_cp[cpId]) {
            session.stats.by_cp[cpId] = { hits: 0, misses: 0, discoveries: 0 };
          }
          session.stats.by_cp[cpId].hits        = (session.stats.by_cp[cpId].hits        || 0) + (srcCp.hits        || 0);
          session.stats.by_cp[cpId].misses      = (session.stats.by_cp[cpId].misses      || 0) + (srcCp.misses      || 0);
          session.stats.by_cp[cpId].discoveries = (session.stats.by_cp[cpId].discoveries || 0) + (srcCp.discoveries || 0);
        }
      }
    }
  }

  const stalePurge = isNaN(opts.stalePurgeAfterRuns) ? 3 : opts.stalePurgeAfterRuns;

  /* ── Sin discoveries → stats vacías y salir ────────────────────────────── */
  if (session.discoveries.length === 0) {
    const stats = buildStats(session, {});
    console.log('📍 nav-learning: sin descubrimientos — merge omitido');
    if (opts.statsOutput) writeJSON(opts.statsOutput, stats);
    console.log(JSON.stringify(stats));
    return;
  }

  /* ── Construir fragmento agrupando discoveries por page_key ────────────── */
  const fragment = { pages: {} };
  let newCount = 0, updatedCount = 0, staleCount = 0;

  for (const disc of session.discoveries) {
    if (disc.action === 'upsert') {
      if (!fragment.pages[disc.page_key]) {
        fragment.pages[disc.page_key] = { elements: {} };
      }
      const existsInBase = !!(session.pages[disc.page_key] &&
        session.pages[disc.page_key].elements &&
        session.pages[disc.page_key].elements[disc.element_key]);

      if (existsInBase) updatedCount++;
      else              newCount++;

      // Fase 3c — normalizar action_type al persistir al fragment.
      // Defensa en profundidad: aunque record runtime ya normaliza (línea 596),
      // discoveries de records legacy o sesiones cargadas desde navigation_map
      // pre-existentes pueden venir con `browser_click`/`type`/`fill_form`.
      // El merge garantiza convención canónica salga de aquí.
      const dataNormalized = disc.data && disc.data.action_type
        ? { ...disc.data, action_type: normalizeActionType(disc.data.action_type) }
        : disc.data;
      fragment.pages[disc.page_key].elements[disc.element_key] = dataNormalized;
    }

    if (disc.action === 'mark_stale') {
      const currentEl = session.pages[disc.page_key] &&
        session.pages[disc.page_key].elements
        ? session.pages[disc.page_key].elements[disc.element_key]
        : null;

      if (currentEl) {
        if (!fragment.pages[disc.page_key]) {
          fragment.pages[disc.page_key] = { elements: {} };
        }
        fragment.pages[disc.page_key].elements[disc.element_key] = {
          ...currentEl,
          stale:           true,
          stale_since:     disc.timestamp,
          stale_run_count: (currentEl.stale_run_count || 0) + 1,
          confidence:      Math.max(0, (currentEl.confidence || 0.5) - 0.2),
        };
        staleCount++;
      }
    }
  }

  fragment.updated_at  = new Date().toISOString();
  fragment.last_run_id = opts.runId;

  /* ── Escribir fragmento temporal (path portable) ───────────────────────── */
  const sessionDir   = path.dirname(sessionFiles[0]);
  const fragmentPath = path.join(sessionDir, `nav_fragment_${session.module_id}.json`);
  writeJSON(fragmentPath, fragment);

  /* ── Invocar merge-registries.js ───────────────────────────────────────── */
  const mergeScript = path.join(__dirname, 'merge-registries.js');
  try {
    execFileSync('node', [
      mergeScript,
      '--base',   opts.navMap,
      '--new',    fragmentPath,
      '--mode',   'map_merge',
      '--field',  'pages',
      '--output', opts.output,
    ], { stdio: 'pipe' });
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : e.message;
    die(`merge-registries.js falló: ${stderr}`);
  }

  /* ── Purga de entradas stale antiguas ──────────────────────────────────── */
  let purgedCount = 0;
  if (fs.existsSync(opts.output)) {
    const merged  = readJSON(opts.output);
    let   changed = false;

    for (const [pageKey, page] of Object.entries(merged.pages || {})) {
      if (!page.elements) continue;
      const toPurge = [];

      for (const [elKey, el] of Object.entries(page.elements)) {
        if (!el.stale) continue;
        const count = el.stale_run_count || 1;
        if (count > stalePurge) {
          toPurge.push(elKey);
        }
      }

      for (const elKey of toPurge) {
        delete page.elements[elKey];
        purgedCount++;
        changed = true;
      }

      if (Object.keys(page.elements).length === 0) {
        delete merged.pages[pageKey];
        changed = true;
      }
    }

    if (changed) writeJSON(opts.output, merged);
  }

  /* ── Stats ─────────────────────────────────────────────────────────────── */
  const stats = buildStats(session, {
    purged:          purgedCount,
    newElements:     newCount,
    updatedElements: updatedCount,
    staleElements:   staleCount,
  });

  if (opts.statsOutput) writeJSON(opts.statsOutput, stats);

  console.log(`📍 Navigation Map actualizado: ${newCount} nuevos | ${updatedCount} actualizados | ${staleCount} stale | ${purgedCount} purgados`);
  console.log(JSON.stringify(stats));
}

/* ─── Subcomando: reconcile ───────────────────────────────────────────────── */
/**
 * Extrae selectores de verification.highlight_selector en todos los result.json
 * del módulo y los persiste en navigation_map.json en un único call determinístico.
 * Reemplaza el flujo manual a/b/c/d del orchestrator (lookup-init + loop record + merge).
 *
 * Uso:
 *   node .claude/tools/nav-learning.js reconcile \
 *     --run-folder   {run_folder} \
 *     --module-id    {module_id} \
 *     --nav-map      .claude/agent-memory/{APP}/navigation_map.json \
 *     --output       .claude/agent-memory/{APP}/navigation_map.json \
 *     --stats-output {execution_dir}/{module_id}/nav_stats_{module_id}.json \
 *     --run-id       {run_id} \
 *     [--min-confidence 0.5] \
 *     [--max-alternatives 3] \
 *     [--stale-purge-after-runs 3]
 *
 * Stdout (última línea): JSON con stats del reconcile.
 * Exit 0 = OK (incluso si no hay selectores), Exit 1 = error fatal.
 */

function extractUrlPath(step) {
  const assertionUrl =
    step.verification &&
    step.verification.assertions &&
    step.verification.assertions.url;

  if (assertionUrl) {
    if (assertionUrl.startsWith('http')) {
      try { return new URL(assertionUrl).pathname; } catch (_) {}
    }
    if (assertionUrl.startsWith('/')) return assertionUrl;
  }

  // Extraer patrón /ruta.html del texto del step
  const m = (step.text || '').match(/\/[\w\-./]+(?:\.html)?/);
  if (m) return m[0];

  // No se puede determinar la página: retornar null en lugar de contaminar '/'
  return null;
}

function extractElementLabel(stepText, selector) {
  // Texto entre comillas simples o dobles (2–60 chars)
  const quoted = stepText.match(/['"]([^'"]{2,60})['"]/);
  if (quoted) return quoted[1];

  // Fragmento tras verbos de interacción
  const verb = stepText.match(
    /(?:clic\s+en|hace\s+clic\s+en|presiona|ingresa\s+en|rellena|selecciona)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(.+?)(?:\s+(?:y|con|para|de)\s|\s*$)/i
  );
  if (verb) return verb[1].trim().substring(0, 60);

  return selector;
}

function inferActionTypeFromText(stepText) {
  const t = stepText.toLowerCase();
  if (/ingresa|rellena|escribe|tipea|llena/.test(t))   return 'fill';
  if (/selecciona.*opci|dropdown|lista desplegable/.test(t)) return 'select';
  return 'click';
}

/**
 * Fase 3c — Normaliza un `action_type` raw (de cualquier source: record
 * runtime, lookup, reconcile heurístico, design-team JSON) a la forma canónica
 * lowercase SIN prefijo `browser_`.
 *
 * Bug histórico que cierra: el record runtime emitía `action_type: 'browser_click'`
 * (nombre del MCP tool) mientras `inferActionTypeFromText` usado por reconcile
 * emite 'click' (verbo lógico). El lookup posterior comparaba con `===` strict y
 * fallaba con MISS espurio. El navigation_map.json terminaba con entradas
 * heterogéneas (algunas con prefijo, otras sin) y el lookup no encontraba HITs.
 *
 * Convención canónica: siempre sin prefijo. Verbos válidos:
 *   click, fill, type (alias de fill), select, hover, evaluate, navigate, submit
 *
 * Aplicar en TODOS los paths que escriben/leen action_type:
 *   - record (CLI)
 *   - lookup / lookup-batch (matching)
 *   - reconcile (descubrimiento desde texto)
 *
 * @param {string} raw — action_type sin normalizar (puede tener prefijo browser_,
 *                       mayúsculas, alias)
 * @returns {string} canónico lowercase sin prefijo
 */
function normalizeActionType(raw) {
  if (typeof raw !== 'string' || !raw) return 'click';
  let v = raw.toLowerCase().trim();
  // Strip prefijos del MCP tool
  if (v.startsWith('browser_')) v = v.slice('browser_'.length);
  if (v.startsWith('mcp_'))     v = v.slice('mcp_'.length);
  // Aliases comunes
  if (v === 'type')          return 'fill';   // browser_type rellena un input
  if (v === 'tap')           return 'click';  // mobile alias
  if (v === 'press')         return 'click';
  if (v === 'fill_form')     return 'fill';   // browser_fill_form
  if (v === 'select_option') return 'select'; // browser_select_option
  if (v === 'goto')          return 'navigate';
  return v;
}

function actionReconcile(opts) {
  if (!opts.runFolder) die('--run-folder es requerido para reconcile');
  if (!opts.moduleId)  die('--module-id es requerido para reconcile');
  if (!opts.navMap)    die('--nav-map es requerido para reconcile');
  if (!opts.output)    die('--output es requerido para reconcile');
  if (!opts.runId)     die('--run-id es requerido para reconcile');

  const minConf    = isNaN(opts.minConfidence)      ? 0.5 : opts.minConfidence;
  const maxAlt     = isNaN(opts.maxAlternatives)     ? 3   : opts.maxAlternatives;

  const executionDir = path.join(opts.runFolder, 'execution', opts.moduleId);
  if (!fs.existsSync(executionDir)) {
    console.log(`⚠️  nav-learning reconcile: ${executionDir} no existe — omitiendo`);
    const empty = {
      module_id: opts.moduleId, total_lookups: 0, hits: 0, misses: 0,
      stale_hits: 0, discoveries: 0, stale_marks: 0, purged: 0,
      new_elements: 0, updated_elements: 0, stale_elements: 0,
      skipped: false, by_cp: {},
    };
    if (opts.statsOutput) writeJSON(opts.statsOutput, empty);
    console.log(JSON.stringify(empty));
    return;
  }

  /* ── Re-inicializar sesión fresca desde el nav_map actual ─────────────── */
  let navMap = { updated_at: null, last_run_id: null, schema_version: '1.0', pages: {} };
  if (fs.existsSync(opts.navMap)) navMap = readJSON(opts.navMap);

  const tmpDir     = path.join(opts.runFolder, '.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const sessionPath = path.join(tmpDir, `nav_session_${opts.moduleId}.json`);

  const session = {
    module_id:        opts.moduleId,
    initialized_at:   new Date().toISOString(),
    nav_map_path:     opts.navMap,
    min_confidence:   minConf,
    max_alternatives: maxAlt,
    pages:            JSON.parse(JSON.stringify(navMap.pages || {})), // deep copy
    discoveries:      [],
    stats: {
      lookups: 0, hits: 0, misses: 0,
      stale_hits: 0, stale_marks: 0, discoveries: 0, by_cp: {},
    },
  };

  /* ── Escanear result.json de cada CP del módulo ───────────────────────── */
  let cpDirs = [];
  const cpDirToName = new Map(); // cpId → actual directory name
  try {
    cpDirs = fs.readdirSync(executionDir).filter(name => {
      const fullPath = path.join(executionDir, name);
      if (!fs.statSync(fullPath).isDirectory()) return false;
      // Accept any subdirectory that contains a result.json
      // (covers both CP-* prefixed dirs and source_id-style dirs like 5_03_1)
      return fs.existsSync(path.join(fullPath, 'result.json'));
    });
  } catch (e) {
    console.warn(`⚠️  nav-learning reconcile: error leyendo ${executionDir}: ${e.message}`);
  }

  for (const cpDir of cpDirs) {
    const resultPath = path.join(executionDir, cpDir, 'result.json');
    if (!fs.existsSync(resultPath)) continue;

    let result;
    try { result = readJSON(resultPath); } catch (_) { continue; }

    const cpId = result.cp_id || cpDir;
    cpDirToName.set(cpId, cpDir); // track actual directory name for patching
    if (!session.stats.by_cp[cpId]) {
      session.stats.by_cp[cpId] = { hits: 0, misses: 0, discoveries: 0 };
    }

    for (const step of (result.steps || [])) {
      if (step.status !== 'PASS') continue;

      const highlightSelector =
        step.verification && step.verification.highlight_selector;
      if (!highlightSelector) continue;

      const urlPath = extractUrlPath(step);
      if (!urlPath) continue; // skip: página indeterminada, no contaminar '/'
      const stepText = step.text || '';
      const elementLabel = extractElementLabel(stepText, highlightSelector);
      const actionType   = inferActionTypeFromText(stepText);
      const visibleText  = stepText.substring(0, 80);

      // Deduplicación por selector dentro de la página
      const existingPage = session.pages[urlPath];
      let elementKey = slugify(elementLabel || highlightSelector);
      if (existingPage && existingPage.elements) {
        const match = Object.entries(existingPage.elements)
          .find(([, el]) => el.selector === highlightSelector);
        if (match) elementKey = match[0];
      }

      const existingEl = existingPage && existingPage.elements
        ? existingPage.elements[elementKey] : null;

      let confidence     = 0.5;
      let discoveryCount = 1;
      let firstRun       = opts.runId;
      if (existingEl) {
        confidence     = Math.min(1.0, (existingEl.confidence || 0.5) + 0.1);
        discoveryCount = (existingEl.discovery_count || 1) + 1;
        firstRun       = existingEl.first_discovered_run || opts.runId;
      }

      const entryData = {
        element_label:        elementLabel,
        visible_text:         visibleText || null,
        aria_label:           null,
        action_type:          actionType,
        selector:             highlightSelector,
        selector_strategy:    opts.selectorStrategy || inferStrategy(highlightSelector),
        confidence,
        discovery_count:      discoveryCount,
        stale:                false,
        stale_since:          null,
        stale_run_count:      0,
        first_discovered_run: firstRun,
        last_success_run:     opts.runId,
        last_success_at:      new Date().toISOString(),
        context_hints:        { parent_section: null },
      };

      session.discoveries.push({
        cp_id:       cpId,
        page_key:    urlPath,
        element_key: elementKey,
        action:      'upsert',
        data:        entryData,
        run_id:      opts.runId,
        timestamp:   new Date().toISOString(),
      });

      session.stats.discoveries++;
      session.stats.by_cp[cpId].discoveries++;

      // Upsert intra-sesión para deduplicar CPs posteriores del mismo módulo
      if (!session.pages[urlPath]) session.pages[urlPath] = { elements: {} };
      session.pages[urlPath].elements[elementKey] = entryData;
    }

    /* ── Bloque 2: interactions[] — acciones de flujo sin highlight_selector ── */
    for (const step of (result.steps || [])) {
      if (step.status !== 'PASS') continue;
      if (!step.interactions || step.interactions.length === 0) continue;

      for (const interaction of step.interactions) {
        let selectorUsed = interaction.selector_used || null;

        // browser_evaluate sin locator directo: intentar extraer querySelector simple
        if (!selectorUsed && interaction.evaluate_code) {
          const m = interaction.evaluate_code
            .match(/document\.querySelector\(['"]([^'"]+)['"]\)/);
          if (m) selectorUsed = m[1];
        }

        // Sin selector recuperable: omitir (no contaminar el mapa con entradas null)
        if (!selectorUsed || !interaction.page_url) continue;

        // B2: normalizar la URL de la interacción a pathname puro.
        const urlPathI    = normalizeUrlPath(interaction.page_url);
        const rawActionTypeI = interaction.action_type || 'click';
        const labelI      = interaction.element_label || selectorUsed;
        const visibleI    = (interaction.visible_text || '').substring(0, 80);

        // Deduplicación por selector dentro de la página
        const existingPageI = session.pages[urlPathI];
        let elementKeyI = slugify(labelI || selectorUsed);
        if (existingPageI && existingPageI.elements) {
          const matchI = Object.entries(existingPageI.elements)
            .find(([, el]) => el.selector === selectorUsed);
          if (matchI) elementKeyI = matchI[0];
        }

        const existingElI = existingPageI && existingPageI.elements
          ? existingPageI.elements[elementKeyI] : null;

        let confidenceI     = 0.5;
        let discoveryCountI = 1;
        let firstRunI       = opts.runId;
        if (existingElI) {
          confidenceI     = Math.min(1.0, (existingElI.confidence || 0.5) + 0.1);
          discoveryCountI = (existingElI.discovery_count || 1) + 1;
          firstRunI       = existingElI.first_discovered_run || opts.runId;
        }

        // Fase 3c — normalizar TODOS los action_type que entren al map.
        // Preservar action_type específico (fill/click/select) si el existente
        // ya lo tiene y la interacción actual es 'evaluate' (secundaria).
        const normalizedRawI   = normalizeActionType(rawActionTypeI);
        const normalizedExistI = existingElI ? normalizeActionType(existingElI.action_type || '') : '';
        const specificActions  = new Set(['fill', 'click', 'select', 'hover']);
        const actionTypeI = (normalizedRawI === 'evaluate' && existingElI
          && specificActions.has(normalizedExistI))
          ? normalizedExistI
          : normalizedRawI;

        const entryDataI = {
          element_label:        labelI,
          visible_text:         visibleI || null,
          aria_label:           interaction.aria_label || null,
          action_type:          actionTypeI,
          selector:             selectorUsed,
          selector_strategy:    inferStrategy(selectorUsed),
          confidence:           confidenceI,
          discovery_count:      discoveryCountI,
          stale:                false,
          stale_since:          null,
          stale_run_count:      0,
          first_discovered_run: firstRunI,
          last_success_run:     opts.runId,
          last_success_at:      new Date().toISOString(),
          context_hints:        { parent_section: interaction.parent_section || null },
        };

        session.discoveries.push({
          cp_id:       cpId,
          page_key:    urlPathI,
          element_key: elementKeyI,
          action:      'upsert',
          data:        entryDataI,
          run_id:      opts.runId,
          timestamp:   new Date().toISOString(),
        });

        session.stats.discoveries++;
        session.stats.by_cp[cpId].discoveries++;

        // Upsert intra-sesión para deduplicar CPs posteriores del mismo módulo
        if (!session.pages[urlPathI]) session.pages[urlPathI] = { elements: {} };
        session.pages[urlPathI].elements[elementKeyI] = entryDataI;
      }
    }
  }

  writeJSON(sessionPath, session);

  /* ── Merge → navigation_map.json ─────────────────────────────────────── */
  actionMerge({
    session:            sessionPath,
    navMap:             opts.navMap,
    output:             opts.output,
    statsOutput:        opts.statsOutput,
    runId:              opts.runId,
    stalePurgeAfterRuns: isNaN(opts.stalePurgeAfterRuns) ? 3 : opts.stalePurgeAfterRuns,
  });

  /* ── Patch module_result.json con stats reales ────────────────────────── */
  if (opts.statsOutput && fs.existsSync(opts.statsOutput)) {
    const stats = readJSON(opts.statsOutput);

    const moduleResultPath = path.join(executionDir, 'module_result.json');
    if (fs.existsSync(moduleResultPath)) {
      try {
        const mr = readJSON(moduleResultPath);
        mr.nav_learning = {
          skipped:           false,
          total_lookups:     stats.total_lookups,
          hits:              stats.hits,
          misses:            stats.misses,
          discoveries:       stats.discoveries,
          new_elements:      stats.new_elements,
          updated_elements:  stats.updated_elements,
          source:            'reconcile',
        };
        writeJSON(moduleResultPath, mr);
      } catch (e) {
        console.warn(`⚠️  nav-learning reconcile: no se pudo patchear module_result.json: ${e.message}`);
      }
    }

    // Patch result.json de cada CP con sus stats individuales
    for (const [cpId, cpStats] of Object.entries(stats.by_cp || {})) {
      // Resolve actual directory name: cpId may differ from dir (e.g. "CP-Matriz_1-5,03,1" → "5_03_1")
      const actualDir = cpDirToName.get(cpId) || cpId;
      const cpResultPath = path.join(executionDir, actualDir, 'result.json');
      if (!fs.existsSync(cpResultPath)) continue;
      try {
        const cr = readJSON(cpResultPath);
        cr.nav_learning = {
          hits:        cpStats.hits        || 0,
          misses:      cpStats.misses      || 0,
          discoveries: cpStats.discoveries || 0,
        };
        writeJSON(cpResultPath, cr);
      } catch (e) {
        console.warn(`⚠️  nav-learning reconcile: no se pudo patchear ${cpResultPath}: ${e.message}`);
      }
    }
  }
}

/* ─── Subcomando: export-recipes ──────────────────────────────────────────── */
/**
 * Lee navigation_map.json y genera learned-selectors.md en agent-memory/{app}/.
 * El executor ya lee ese directorio en PASO 1.2 — este archivo se convierte en
 * el puente entre el nav map (que el executor no lee) y las recetas (que sí lee).
 *
 * Uso:
 *   node .claude/tools/nav-learning.js export-recipes \
 *     --nav-map    .claude/agent-memory/{APP}/navigation_map.json \
 *     --memory-dir .claude/agent-memory/SauceDemo
 *
 * Exit 0 = OK (incluso si nav map está vacío), Exit 1 = error fatal.
 */

function actionExportRecipes(opts) {
  if (!opts.navMap)    die('--nav-map es requerido para export-recipes');
  if (!opts.memoryDir) die('--memory-dir es requerido para export-recipes');

  if (!fs.existsSync(opts.navMap)) {
    console.log('📍 export-recipes: navigation_map.json no existe — omitiendo');
    return;
  }

  const navMap = readJSON(opts.navMap);
  const pages = navMap.pages || {};
  const pageKeys = Object.keys(pages);

  if (pageKeys.length === 0) {
    console.log('📍 export-recipes: navigation_map.json vacío — omitiendo');
    return;
  }

  const lines = [
    '# Selectores Aprendidos — Navigation Learning',
    '',
    '> Generado automáticamente por `nav-learning.js export-recipes`.',
    '> El executor DEBE usar estos selectores en lugar de improvisar por DOM.',
    '> Actualizado tras cada reconciliación post-módulo.',
    '',
    `Última actualización: ${navMap.updated_at || 'N/A'}`,
    `Último run: ${navMap.last_run_id || 'N/A'}`,
    '',
    '---',
    '',
  ];

  for (const pageKey of pageKeys.sort()) {
    const page = pages[pageKey];
    const elements = page.elements || {};
    const elementKeys = Object.keys(elements);
    if (elementKeys.length === 0) continue;

    lines.push(`## Página: \`${pageKey}\``);
    lines.push('');
    lines.push('| Elemento | Selector | Tipo acción | Confianza | Usos |');
    lines.push('|----------|----------|-------------|-----------|------|');

    for (const elKey of elementKeys.sort()) {
      const el = elements[elKey];
      if (el.stale) continue; // no exportar stale
      const label = (el.element_label || elKey).replace(/\|/g, '\\|');
      const sel   = (el.selector || '').replace(/\|/g, '\\|');
      const act   = el.action_type || 'click';
      const conf  = el.confidence != null ? el.confidence.toFixed(1) : '0.5';
      const count = el.discovery_count || 1;
      lines.push(`| ${label} | \`${sel}\` | ${act} | ${conf} | ${count} |`);
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Cómo usar estos selectores');
  lines.push('');
  lines.push('Antes de cada acción browser (click, fill, select), buscar el elemento en la tabla de la página correspondiente.');
  lines.push('Si el selector tiene confianza >= 0.7, usarlo directamente.');
  lines.push('Si el selector tiene confianza < 0.7, usarlo como primera opción pero verificar que el elemento existe antes de interactuar.');
  lines.push('Si el elemento no está en la tabla, usar la receta de `navigation-recipes.md` y el DOM.');
  lines.push('');

  const outputPath = path.join(opts.memoryDir, 'learned-selectors.md');
  if (!fs.existsSync(opts.memoryDir)) fs.mkdirSync(opts.memoryDir, { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

  const totalElements = pageKeys.reduce((sum, pk) => {
    return sum + Object.keys(pages[pk].elements || {}).filter(ek => !pages[pk].elements[ek].stale).length;
  }, 0);

  console.log(`📍 export-recipes: ${totalElements} selectores exportados a ${outputPath}`);
}

/* ─── Main ────────────────────────────────────────────────────────────────── */

function main() {
  const opts = parseArgs();

  switch (opts.subcommand) {
    case 'lookup':
      if (opts.init) actionLookupInit(opts);
      else           actionLookupQuery(opts);
      break;
    case 'lookup-batch':
      actionLookupBatch(opts);
      break;
    case 'record':
      actionRecord(opts);
      break;
    case 'merge':
      actionMerge(opts);
      break;
    case 'reconcile':
      actionReconcile(opts);
      break;
    case 'export-recipes':
      actionExportRecipes(opts);
      break;
    default:
      die(`Subcomando desconocido: "${opts.subcommand}". Válidos: lookup | lookup-batch | record | merge | reconcile | export-recipes`);
  }
}

main();
