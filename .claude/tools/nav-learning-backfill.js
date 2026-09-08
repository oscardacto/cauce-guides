#!/usr/bin/env node
/**
 * ATF — nav-learning-backfill.js
 *
 * Red de seguridad post-CP. Escanea `result.json.steps[].interactions[]` y
 * sintetiza llamadas `nav-learning record` retroactivas para los selectores
 * persistibles (no ad-hoc) que el sub-agent usó durante el run pero no
 * registró via lookup/record explícitamente.
 *
 * Contexto del problema:
 *   Aunque la doctrina del executor (execute.md PASO 3.B) marca
 *   `nav-learning lookup` como OBLIGATORIO antes de cada click/type, el LLM
 *   ocasionalmente lo bypaseaba creando IDs ad-hoc (`#__atf_*`) via
 *   browser_evaluate. Resultado: navigation_map.json inerte run tras run.
 *   : 0 lookups, 0 discoveries pese a
 *   3 clicks + 3 types ejecutados con éxito.
 *
 * Solución: este script lee result.json POST-EJECUCIÓN y registra cada
 * (page, action_type, element_label, selector_real) como upsert. Filtra:
 *   - Selectores ad-hoc (regex /^#__atf_/) — no persistibles entre runs.
 *   - Acciones no-interactivas (verify, navigate sin form) — no aportan knowledge.
 *   - Steps con selector vacío.
 *
 * Uso:
 *   node nav-learning-backfill.js \
 *     --result-file <execution/{m}/{slug}/result.json> \
 *     --session <run_folder/.tmp/nav_session_*.json> \
 *     --run-id <run_id>
 *
 * Output (stdout JSON):
 *   { backfilled: N, skipped: M, skip_reasons: {...}, recorded: [...] }
 *
 * Exit:
 *   0 — OK (incluso si backfilled=0)
 *   1 — error fatal (input inválido, archivos ausentes)
 *
 * NOTA: este script NO altera el flujo del executor. Solo añade discoveries
 * a la session file. El `nav-learning merge` posterior (PASO 4.7.a de /asdd:qa-web-exec)
 * los consolida a navigation_map.json.
 */

'use strict';

const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_DIR     = __dirname;
const NAV_LEARNING   = path.join(SCRIPT_DIR, 'nav-learning.js');
const ADHOC_PATTERN  = /^#__atf_/;
const INTERACTIVE    = new Set(['click', 'type', 'fill_form', 'select', 'press_key', 'select_option', 'type+click']);

function die(msg) {
  console.error(`❌ nav-learning-backfill: ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--result-file': opts.resultFile = args[++i]; break;
      case '--session':     opts.session    = args[++i]; break;
      case '--run-id':      opts.runId      = args[++i]; break;
      case '--dry-run':     opts.dryRun     = true; break;
      // — el caller (run-backfill.js) pasa este flag
      // cuando el CP terminó en PASS: los selectores se ejecutaron sobre
      // elementos reales y el resultado fue exitoso → verificación implícita.
      // Sin este flag, los records quedan con `verified_against_dom: false`.
      case '--verified':    opts.verified   = true; break;
      default: console.warn(`⚠️  Argumento desconocido: ${args[i]}`);
    }
  }
  if (!opts.resultFile) die('--result-file es requerido');
  if (!opts.session)    die('--session es requerido');
  if (!opts.runId)      die('--run-id es requerido');
  return opts;
}

// Mapea action_type del result.json al action_type aceptado por nav-learning record.
// nav-learning usa nombres lógicos (click, type, fill_form, select). El executor
// puede emitir variantes como 'type+click' (compuesto) o 'browser_click' (verbo MCP).
//
// Para compounds tipo `type+click` (típico de fill-form + submit), inferimos por
// el shape del selector: inputs → 'type', buttons/submit → 'click'. Si no es
// determinable, default 'click' (más conservador para nav-learning lookup).
function normalizeActionType(raw, selector) {
  if (!raw) return null;
  const t = String(raw).toLowerCase().replace(/^browser_/, '');
  if (t === 'type+click') {
    if (!selector) return 'click';
    if (/input\b/i.test(selector) || /textarea\b/i.test(selector) || /\[type=['"](text|password|email|search|number)['"]/i.test(selector)) return 'type';
    if (/button\b/i.test(selector) || /\[type=['"]submit['"]/i.test(selector) || /\bsubmit\b/i.test(selector)) return 'click';
    return 'click';
  }
  if (INTERACTIVE.has(t)) return t;
  return null;  // no interactivo → skip
}

// Divide selectores compuestos `"sel1, sel2, sel3"` y labels `"lbl1, lbl2, lbl3"`
// en arrays paralelos. Si el conteo no coincide, alinea por posición y usa el
// label[0] como fallback.
function splitCompound(selectorStr, labelStr) {
  if (!selectorStr) return [];
  const selectors = selectorStr.split(',').map(s => s.trim()).filter(Boolean);
  const labels    = (labelStr || '').split(',').map(s => s.trim()).filter(Boolean);
  return selectors.map((sel, i) => ({
    selector: sel,
    label:    labels[i] || labels[0] || `unnamed_${i}`,
  }));
}

function recordOne(opts, args) {
  const proc = spawnSync('node', [NAV_LEARNING, 'record', ...args], {
    encoding: 'utf8',
    stdio:    ['ignore', 'pipe', 'pipe'],
    timeout:  10000,
  });
  const stdout = (proc.stdout || '').trim();
  const result = {
    ok:        proc.status === 0,
    stdout,
    stderr:    (proc.stderr || '').trim(),
    status:    proc.status,
    rejected:  false,
    rejectReason: null,
  };
  // Parsear stdout JSON para detectar rejection (filtro anti-frágil de ):
  // nav-learning record exit 0 + rejected:true → contar como skipped, no como backfilled.
  if (proc.status === 0 && stdout) {
    try {
      const parsed = JSON.parse(stdout);
      if (parsed && parsed.rejected) {
        result.rejected     = true;
        result.rejectReason = parsed.pattern || parsed.reason || 'fragile_selector';
        result.ok           = false;  // no contar como backfilled
      }
    } catch (_) { /* stdout no es JSON parseable, asumir éxito */ }
  }
  return result;
}

// ─── Main ──────────────────────────────────────────────────────────────────

const opts = parseArgs();

if (!fs.existsSync(opts.resultFile)) die(`result.json no existe: ${opts.resultFile}`);
if (!fs.existsSync(opts.session))    die(`session file no existe: ${opts.session}`);

let result;
try { result = JSON.parse(fs.readFileSync(opts.resultFile, 'utf8')); }
catch (e) { die(`result.json inválido: ${e.message}`); }

const cpId = result.cp_id || '_unknown';
const steps = Array.isArray(result.steps) ? result.steps : [];

const stats = {
  backfilled:    0,
  skipped:       0,
  skip_reasons:  {},
  recorded:      [],
  errors:        [],
};

function bumpSkip(reason) {
  stats.skipped++;
  stats.skip_reasons[reason] = (stats.skip_reasons[reason] || 0) + 1;
}

for (const step of steps) {
  const interactions = Array.isArray(step.interactions) ? step.interactions : [];
  for (const ix of interactions) {
    if (!ix.selector_used) { bumpSkip('no_selector'); continue; }
    if (!ix.page_url)      { bumpSkip('no_page_url'); continue; }

    // En compound (type+click), el action por-selector se infiere del shape del selector.
    // Para action no compuesto, se aplica el mismo a todos los selectors del compound.
    const pairs = splitCompound(ix.selector_used, ix.element_label);
    for (const { selector, label } of pairs) {
      const action = normalizeActionType(ix.action_type, selector);
      if (!action) { bumpSkip('non_interactive_action'); continue; }
      if (ADHOC_PATTERN.test(selector)) {
        bumpSkip('adhoc_selector');
        continue;
      }

      if (opts.dryRun) {
        stats.recorded.push({ step: step.n, page: ix.page_url, label, selector, action, dry_run: true });
        stats.backfilled++;
        continue;
      }

      const recArgs = [
        '--session',         opts.session,
        '--run-id',          opts.runId,
        '--cp-id',           cpId,
        '--path',            ix.page_url,
        '--action-type',     action,
        '--element-label',   label,
        '--selector',        selector,
        '--discovered-via',  'backfill',  // C — trazabilidad de origen
      ];
      if (ix.visible_text) recArgs.push('--visible-text', ix.visible_text);
      if (ix.aria_label)   recArgs.push('--aria-label',   ix.aria_label);
      // — propagar verified si el CP terminó PASS.
      if (opts.verified)   recArgs.push('--verified');

      const r = recordOne(opts, recArgs);
      if (r.ok) {
        stats.backfilled++;
        stats.recorded.push({ step: step.n, page: ix.page_url, label, selector, action });
      } else if (r.rejected) {
        // Rejection del filtro anti-frágil — counts como skipped, no como error.
        bumpSkip(`fragile_selector:${r.rejectReason}`);
      } else {
        stats.errors.push({ step: step.n, label, selector, status: r.status, stderr: r.stderr.slice(0, 200) });
      }
    }
  }
}

// Output JSON a stdout para que el caller (orchestrator/exec) parsee
process.stdout.write(JSON.stringify({
  cp_id:         cpId,
  result_file:   opts.resultFile,
  session_file:  opts.session,
  ...stats,
}, null, 2) + '\n');

process.exit(stats.errors.length > 0 ? 0 : 0); // backfill no bloqueante: errores no fallan el pipeline
