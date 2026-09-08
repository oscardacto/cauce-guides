#!/usr/bin/env node
/**
 * vua-scan-single-anon.js
 * Re-escanea UNA página específica en estado anónimo (sin reusar la sesión
 * persistente). Útil para la pantalla de login: si el browser ya está auth,
 * /auth/login redirige a /dashboard y enmascara la página real.
 *
 * Comparte helpers con vua-scan-pages-direct.js via lib/vua-scan-helpers.js.
 * Misma excepción doctrinal MCP black-box (ver header del lib).
 */

'use strict';

const fs = require('fs');
const { chromium } = require('playwright');
const helpers = require('./lib/vua-scan-helpers.js');

async function main() {
  const arg = helpers.parseCliArgs(process.argv);

  const url = arg('--url');
  const outDir = arg('--out-dir');
  const ctxPath = arg('--vua-context');
  const flowRefsRaw = arg('--flow-refs');
  const pageIndex = parseInt(arg('--page-index', '1'), 10) || 1;
  const pageSlug = arg('--page-slug', 'web_indexphp_auth_login');

  if (!url || !outDir || !ctxPath) {
    console.error('USO: --url=<u> --out-dir=<d> --vua-context=<p> [--flow-refs=<csv>] [--page-index=<n>] [--page-slug=<s>]');
    process.exit(2);
  }

  const flowRefs = flowRefsRaw
    ? flowRefsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : ['E2E-001', 'E2E-002', 'E2E-003', 'E2E-004', 'E2E-005'];

  const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  const axeSource = helpers.loadAxeSource();
  const axeLocaleEs = helpers.loadAxeLocaleEs();
  const standards = (ctx.a11y_config && ctx.a11y_config.axe_standards) || ['wcag2a', 'wcag2aa'];

  const browser = await chromium.launch({ headless: true });
  const browserCtx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: 'en-US'
  });
  const page = await browserCtx.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch (e) {
    helpers.writePageBlocked(outDir, {
      reason: 'navigation_failed',
      error: String((e && e.message) || e),
      timestamp: new Date().toISOString(),
      page_url: url
    });
    await browser.close();
    process.exit(1);
  }

  const scan = await helpers.scanCurrentPage(page, axeSource, standards, axeLocaleEs);
  if (!scan.ok) {
    helpers.writePageBlocked(outDir, {
      reason: 'axe_runtime_failed',
      error: scan.error,
      phase: scan.phase,
      timestamp: new Date().toISOString(),
      page_url: url
    });
    await browser.close();
    process.exit(1);
  }

  const phaseA = helpers.buildPhaseAPayload({
    flow_refs: flowRefs,
    page_index: pageIndex,
    page_url: url,
    page_slug: pageSlug,
    auth_state: 'anonymous'
  }, scan, standards);

  await helpers.persistPageArtifacts(page, outDir, phaseA);
  console.log(JSON.stringify({
    event: 'page_done_anon',
    url,
    violations: scan.violations.length,
    by_impact: phaseA.violations_by_impact
  }));
  await browser.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
