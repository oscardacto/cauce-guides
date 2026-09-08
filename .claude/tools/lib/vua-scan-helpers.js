'use strict';
/**
 * vua-scan-helpers.js
 * Helpers compartidos por los scanners VUA Fase A:
 *   - vua-scan-pages-direct.js  (multi-página con login persistente)
 *   - vua-scan-single-anon.js   (re-scan login en estado anónimo)
 *
 * Centraliza:
 *   - Carga del bundle axe-core inline (CSP-safe).
 *   - Inyección de axe via `new Function(src)()` (bypass CSP `script-src`).
 *   - Configuración axe en español via locales/es.json (i18n nativo).
 *   - Scan unificado: violations + visual + DOM sample + typography + layout.
 *   - Estabilización de la página antes del scan (networkidle + retry).
 *   - Persistencia de page_scan_phase_a.json + screenshot_clean.png.
 *   - Parser regex de credenciales por rol (sin imprimirlas).
 *
 * Excepción a doctrina MCP black-box: estos helpers usan Playwright Node
 * directo porque inyectar el bundle de 589KB de axe-core via MCP
 * `browser_evaluate` es prohibitivo en transcript size. Excepción acotada
 * a la fase visual_ux_a11y; /sofka-asdd:qa-web-exec y /sofka-asdd:qa-web-run mantienen MCP-only.
 */

const fs = require('fs');
const path = require('path');

const AXE_BUNDLE_REL_PATH = 'node_modules/axe-core/axe.min.js';
const AXE_LOCALE_ES_PATH = 'node_modules/axe-core/locales/es.json';

function loadAxeSource() {
  return fs.readFileSync(path.resolve(AXE_BUNDLE_REL_PATH), 'utf8');
}

function loadAxeLocaleEs() {
  if (!fs.existsSync(path.resolve(AXE_LOCALE_ES_PATH))) return null;
  return JSON.parse(fs.readFileSync(path.resolve(AXE_LOCALE_ES_PATH), 'utf8'));
}

function loadCredentials(credPath, role) {
  const raw = fs.readFileSync(credPath, 'utf8');
  const reBlock = new RegExp(
    `${role}:[\\s\\S]*?username:\\s*"([^"]+)"[\\s\\S]*?password:\\s*"([^"]+)"`
  );
  const m = raw.match(reBlock);
  if (!m) throw new Error(`credentials_role_not_found: ${role}`);
  return { username: m[1], password: m[2] };
}

async function injectAxeBundle(page, axeSource, axeLocaleEs) {
  return await page.evaluate(({ axeSrc, locale }) => {
    if (window.axe) {
      // Asegurar locale aplicado aún si axe ya estaba presente
      if (locale && !window.__atfAxeLocaleApplied) {
        try {
          window.axe.configure({ locale });
          window.__atfAxeLocaleApplied = true;
        } catch (e) { /* best-effort */ }
      }
      return { installed: true, reused: true, axe_version: window.axe.version, locale_applied: !!window.__atfAxeLocaleApplied };
    }
    try {
      // eslint-disable-next-line no-new-func
      new Function(axeSrc)();
      if (!window.axe) return { installed: false, error: 'axe_eval_no_export' };
      let localeApplied = false;
      if (locale) {
        try {
          window.axe.configure({ locale });
          localeApplied = true;
          window.__atfAxeLocaleApplied = true;
        } catch (e) {
          localeApplied = false;
        }
      }
      return {
        installed: true,
        reused: false,
        axe_version: window.axe.version,
        locale_applied: localeApplied
      };
    } catch (e) {
      return { installed: false, error: String((e && e.message) || e) };
    }
  }, { axeSrc: axeSource, locale: axeLocaleEs });
}

/**
 * Espera a que la página esté "estable" antes del scan.
 * Estrategia en cascada (todas tolerantes a fallos):
 *   1) waitForLoadState('domcontentloaded')  — ya cubierto por page.goto()
 *   2) waitForLoadState('networkidle', { timeout: 8000 })  — ideal pero costoso
 *   3) Fallback: waitForTimeout(1500)  — última red de seguridad
 */
async function waitForStablePage(page, opts = {}) {
  const networkIdleTimeout = opts.networkIdleTimeout != null ? opts.networkIdleTimeout : 8000;
  try {
    await page.waitForLoadState('networkidle', { timeout: networkIdleTimeout });
    return { strategy: 'networkidle' };
  } catch (e) {
    // No bloquear el scan — fall-through
  }
  try {
    await page.waitForTimeout(1500);
  } catch (e) { /* ignore */ }
  return { strategy: 'fixed_timeout' };
}

async function runScan(page, axeStandards) {
  return await page.evaluate(async (standards) => {
    try {
      const res = await window.axe.run(document, {
        runOnly: { type: 'tag', values: standards }
      });

      // ─── Visual checks ─────────────────────────────────────────
      const visual = {
        lang_attr: (document.documentElement.getAttribute('lang') || '').toLowerCase(),
        page_title: document.title,
        code_in_ui: []
      };
      const codePattern = /[a-z][a-zA-Z0-9_]+\([^)]*\)|[a-z]+\.[a-zA-Z_][a-zA-Z0-9_]+\(/;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let n;
      while ((n = walker.nextNode())) {
        const t = (n.textContent || '').trim();
        if (t.length < 4 || t.length > 200) continue;
        if (codePattern.test(t)) {
          const el = n.parentElement;
          if (el && el.offsetParent !== null) {
            visual.code_in_ui.push({
              text: t.slice(0, 100),
              selector: el.id ? '#' + el.id : el.tagName.toLowerCase()
            });
          }
        }
      }

      // ─── DOM sample (textos visibles + headings + structural) ──
      const dom = {
        texts: [],
        headings: [],
        page_title: document.title,
        cta_labels: [],
        inputs_meta: []
      };
      const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let m, count = 0;
      while ((m = w2.nextNode()) && count < 200) {
        const t = (m.textContent || '').trim();
        if (t.length >= 3 && t.length <= 300) {
          const el = m.parentElement;
          if (el && el.offsetParent !== null && !el.matches('script, style, noscript')) {
            dom.texts.push(t);
            count++;
          }
        }
      }
      dom.headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
        .filter((h) => h.offsetParent !== null)
        .map((h) => ({ tag: h.tagName.toLowerCase(), text: (h.textContent || '').trim() }))
        .filter((h) => h.text.length > 0)
        .slice(0, 30);
      dom.texts = [...new Set(dom.texts)];
      dom.cta_labels = Array.from(document.querySelectorAll('button, a[role="button"], [type="button"], [type="submit"]'))
        .filter((b) => b.offsetParent !== null)
        .map((b) => (b.textContent || b.value || b.getAttribute('aria-label') || '').trim())
        .filter(Boolean)
        .slice(0, 50);
      dom.inputs_meta = Array.from(document.querySelectorAll('input, textarea, select'))
        .filter((i) => i.offsetParent !== null && i.type !== 'hidden')
        .slice(0, 50)
        .map((i) => ({
          tag: i.tagName.toLowerCase(),
          type: i.type || null,
          name: i.name || null,
          has_label: !!(i.id && document.querySelector(`label[for="${i.id}"]`)) || !!i.closest('label'),
          has_placeholder: !!i.placeholder,
          has_aria_describedby: !!i.getAttribute('aria-describedby'),
          required: !!i.required
        }));

      // ─── Typography summary ───────────────────────────────────
      function bucketize(values) {
        const counts = {};
        for (const v of values) counts[v] = (counts[v] || 0) + 1;
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([value, count]) => ({ value, count }));
      }
      const typographySamples = Array.from(
        document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, button, a, input, label, span, li')
      )
        .filter((el) => el.offsetParent !== null && (el.textContent || '').trim().length > 0)
        .slice(0, 200);
      const fontFamilies = [];
      const fontSizesByTag = {};
      const fontWeightsByTag = {};
      for (const el of typographySamples) {
        const cs = window.getComputedStyle(el);
        if (cs.fontFamily) fontFamilies.push(cs.fontFamily.split(',')[0].trim().toLowerCase());
        const tag = el.tagName.toLowerCase();
        if (cs.fontSize) {
          fontSizesByTag[tag] = fontSizesByTag[tag] || [];
          fontSizesByTag[tag].push(cs.fontSize);
        }
        if (cs.fontWeight) {
          fontWeightsByTag[tag] = fontWeightsByTag[tag] || [];
          fontWeightsByTag[tag].push(cs.fontWeight);
        }
      }
      const typography = {
        font_families: bucketize(fontFamilies),
        font_sizes_by_tag: Object.fromEntries(
          Object.entries(fontSizesByTag).map(([k, v]) => [k, bucketize(v).slice(0, 3)])
        ),
        font_weights_by_tag: Object.fromEntries(
          Object.entries(fontWeightsByTag).map(([k, v]) => [k, bucketize(v).slice(0, 3)])
        )
      };

      // ─── Layout indicators ────────────────────────────────────
      const layout = {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        small_touch_targets: [],
        offscreen_focusables: 0,
        overflow_horizontal: false
      };
      const focusables = Array.from(
        document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')
      ).filter((el) => el.offsetParent !== null);
      for (const el of focusables.slice(0, 100)) {
        const r = el.getBoundingClientRect();
        if ((r.width > 0 || r.height > 0) && (r.width < 24 || r.height < 24)) {
          layout.small_touch_targets.push({
            tag: el.tagName.toLowerCase(),
            text: ((el.textContent || el.value || '') + '').trim().slice(0, 40),
            w: Math.round(r.width),
            h: Math.round(r.height)
          });
        }
        if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) {
          layout.offscreen_focusables++;
        }
      }
      if (document.body.scrollWidth > window.innerWidth + 5) {
        layout.overflow_horizontal = true;
      }

      // ─── Help affordances (Nielsen 10) ───────────────────────
      const helpAffordances = {
        has_help_links: !!document.querySelector(
          'a[href*="help"], a[href*="ayuda"], a[href*="docs"], a[href*="soporte"], a[href*="support"]'
        ),
        has_tooltips: document.querySelectorAll('[role="tooltip"], [data-tooltip], [title]').length,
        has_describedby: document.querySelectorAll('[aria-describedby]').length,
        has_details: document.querySelectorAll('details').length
      };

      // ─── Action-flow affordances (Nielsen 3 — undo/cancel) ───
      const actionFlow = {
        has_cancel_button: dom.cta_labels.some((t) =>
          /^(cancel|cancelar|atr[áa]s|volver|back)$/i.test(t)
        ),
        has_undo: dom.cta_labels.some((t) => /^(undo|deshacer)$/i.test(t)),
        has_back_breadcrumbs: !!document.querySelector(
          'nav[aria-label*="bread" i], nav[aria-label*="ruta" i], [class*="breadcrumb" i]'
        )
      };

      return {
        ok: true,
        axe_version: window.axe.version,
        violations: res.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          tags: v.tags,
          help: v.help,
          helpUrl: v.helpUrl,
          description: v.description,
          nodes: v.nodes.slice(0, 5).map((node) => ({
            target: node.target,
            html: (node.html || '').slice(0, 200),
            failureSummary: (node.failureSummary || '').slice(0, 300)
          }))
        })),
        incomplete_count: res.incomplete.length,
        passes_count: res.passes.length,
        visual,
        dom,
        typography,
        layout,
        help_affordances: helpAffordances,
        action_flow: actionFlow
      };
    } catch (e) {
      return { ok: false, phase: 'scan', error: String((e && e.message) || e) };
    }
  }, axeStandards);
}

/**
 * Scan completo con retry. Si el primer scan falla por timing/transient
 * (axe_runtime_failed sin error fatal), reintenta una vez tras estabilizar.
 */
async function scanCurrentPage(page, axeSource, axeStandards, axeLocaleEs = null, opts = {}) {
  const stable1 = await waitForStablePage(page, opts);

  let installed = await injectAxeBundle(page, axeSource, axeLocaleEs);
  if (!installed.installed) {
    // Retry una vez tras un breve respiro
    await page.waitForTimeout(1000);
    installed = await injectAxeBundle(page, axeSource, axeLocaleEs);
    if (!installed.installed) {
      return { ok: false, phase: 'inject', error: installed.error };
    }
  }

  let scan = await runScan(page, axeStandards);
  if (!scan.ok) {
    // Retry scan una vez (ej. DOM aún mutaba durante el evaluate)
    await page.waitForTimeout(1500);
    scan = await runScan(page, axeStandards);
  }
  if (scan.ok) {
    scan.stability = stable1.strategy;
    scan.locale_applied = !!installed.locale_applied;
  }
  return scan;
}

function summarizeImpacts(violations) {
  return violations.reduce((acc, v) => {
    const key = v.impact || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildPhaseAPayload(meta, scanResult, axeStandards) {
  return {
    flow_refs: meta.flow_refs,
    page_index: meta.page_index,
    page_url: meta.page_url,
    page_slug: meta.page_slug,
    scanned_at: new Date().toISOString(),
    axe_version: scanResult.axe_version,
    axe_standards: axeStandards,
    axe_locale: scanResult.locale_applied ? 'es' : 'en',
    auth_state: meta.auth_state || 'authenticated',
    stability_strategy: scanResult.stability || 'fixed_timeout',
    violations_count: scanResult.violations.length,
    violations_by_impact: summarizeImpacts(scanResult.violations),
    violations: scanResult.violations,
    incomplete_count: scanResult.incomplete_count,
    passes_count: scanResult.passes_count,
    visual: scanResult.visual,
    dom: scanResult.dom,
    typography: scanResult.typography || null,
    layout: scanResult.layout || null,
    help_affordances: scanResult.help_affordances || null,
    action_flow: scanResult.action_flow || null
  };
}

async function persistPageArtifacts(page, outDir, phaseA) {
  fs.mkdirSync(outDir, { recursive: true });
  try {
    await page.screenshot({ path: path.join(outDir, 'screenshot_clean.png'), fullPage: false });
  } catch (e) {
    console.log(JSON.stringify({
      event: 'screenshot_failed',
      page_slug: phaseA.page_slug,
      error: String((e && e.message) || e)
    }));
  }
  fs.writeFileSync(
    path.join(outDir, 'page_scan_phase_a.json'),
    JSON.stringify(phaseA, null, 2)
  );
}

function writePageBlocked(outDir, payload) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'page_blocked.json'),
    JSON.stringify(payload, null, 2)
  );
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  return (key, def = null) => {
    const i = args.findIndex((a) => a === key || a.startsWith(key + '='));
    if (i === -1) return def;
    const a = args[i];
    if (a.includes('=')) return a.split('=').slice(1).join('=');
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) return true;
    return next;
  };
}

module.exports = {
  loadAxeSource,
  loadAxeLocaleEs,
  loadCredentials,
  injectAxeBundle,
  waitForStablePage,
  runScan,
  scanCurrentPage,
  summarizeImpacts,
  buildPhaseAPayload,
  persistPageArtifacts,
  writePageBlocked,
  parseCliArgs
};
