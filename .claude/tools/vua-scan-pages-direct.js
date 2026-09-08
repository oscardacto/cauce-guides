#!/usr/bin/env node
/**
 * vua-scan-pages-direct.js
 * Helper que ejecuta el barrido VUA Fase A (axe-core + checks visuales + extracción DOM)
 * via Playwright Node directo, evitando el costo en contexto del LLM de inyectar
 * el bundle de 589KB en cada page_url via MCP browser_evaluate.
 *
 * Auth: usa credenciales del rol indicado de credentials.yaml (parseo regex sin
 *       imprimirlas) y hace login al app_url al inicio. La sesión se reutiliza
 *       entre páginas en el mismo browser context.
 *
 * Output: por cada page de vua_context.pages (sin skip_reason) escribe:
 *   {output_dir}/page_scan_phase_a.json
 *   {output_dir}/screenshot_clean.png
 *
 * El primary-context (LLM) lee page_scan_phase_a.json para construir findings.json
 * unificado con la Fase B (Nielsen + ortografía).
 *
 * Excepción doctrinal MCP black-box: ver lib/vua-scan-helpers.js (header).
 */

'use strict';

const fs = require('fs');
const { chromium } = require('playwright');
const helpers = require('./lib/vua-scan-helpers.js');

async function loginOrangeHRM(page, app_url, creds) {
  await page.goto(app_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('input[name="username"]', { timeout: 15000 });
  await page.fill('input[name="username"]', creds.username);
  await page.fill('input[name="password"]', creds.password);
  await Promise.all([
    page.waitForURL(/\/dashboard\//, { timeout: 20000 }),
    page.click('button[type="submit"]')
  ]);
}

async function main() {
  const arg = helpers.parseCliArgs(process.argv);

  const runId = arg('--run-id');
  const ctxPath = arg('--vua-context');
  const credPath = arg('--credentials', 'docs/testing/atf-web/config/credentials.yaml');
  const appRole = arg('--role', 'admin');
  const headless = arg('--headed') ? false : true;

  if (!runId || !ctxPath) {
    console.error('USO: --run-id=<id> --vua-context=<path> [--role=admin] [--credentials=<path>] [--headed]');
    process.exit(2);
  }

  const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  const axeSource = helpers.loadAxeSource();
  const axeLocaleEs = helpers.loadAxeLocaleEs();
  const creds = helpers.loadCredentials(credPath, appRole);
  const standards = (ctx.a11y_config && ctx.a11y_config.axe_standards) || ['wcag2a', 'wcag2aa'];

  const browser = await chromium.launch({ headless });
  const browserCtx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: 'en-US'
  });
  const page = await browserCtx.newPage();

  const stats = {
    pages_completed: 0,
    pages_aborted: 0,
    pages_skipped: 0,
    started_at: new Date().toISOString()
  };

  console.log(JSON.stringify({ event: 'login_start', app_url: ctx.app_url }));
  await loginOrangeHRM(page, ctx.app_url, creds);
  console.log(JSON.stringify({ event: 'login_ok' }));

  const pages = ctx.pages.filter((p) => !p.skip_reason);

  for (const pageInfo of pages) {
    const out = pageInfo.output_dir;
    console.log(JSON.stringify({ event: 'page_start', index: pageInfo.page_index, url: pageInfo.page_url }));

    try {
      await page.goto(pageInfo.page_url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (e) {
      helpers.writePageBlocked(out, {
        reason: 'navigation_failed',
        error: String((e && e.message) || e),
        timestamp: new Date().toISOString(),
        page_url: pageInfo.page_url
      });
      stats.pages_aborted++;
      console.log(JSON.stringify({ event: 'page_blocked', reason: 'navigation_failed' }));
      continue;
    }

    const scan = await helpers.scanCurrentPage(page, axeSource, standards, axeLocaleEs);
    if (!scan.ok) {
      helpers.writePageBlocked(out, {
        reason: 'axe_runtime_failed',
        error: scan.error,
        phase: scan.phase,
        timestamp: new Date().toISOString(),
        page_url: pageInfo.page_url
      });
      stats.pages_aborted++;
      console.log(JSON.stringify({ event: 'page_blocked', reason: 'axe_runtime_failed' }));
      continue;
    }

    const phaseA = helpers.buildPhaseAPayload({
      flow_refs: pageInfo.flow_refs,
      page_index: pageInfo.page_index,
      page_url: pageInfo.page_url,
      page_slug: pageInfo.page_slug,
      auth_state: 'authenticated'
    }, scan, standards);

    await helpers.persistPageArtifacts(page, out, phaseA);
    stats.pages_completed++;
    console.log(JSON.stringify({
      event: 'page_done',
      index: pageInfo.page_index,
      slug: pageInfo.page_slug,
      violations: scan.violations.length,
      by_impact: phaseA.violations_by_impact
    }));
  }

  stats.ended_at = new Date().toISOString();
  await browser.close();
  console.log(JSON.stringify({ event: 'all_pages_done', stats }));
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
