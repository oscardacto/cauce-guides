#!/usr/bin/env node
/**
 * lh-measure-flows.js — Fase de medición de la fase performance (Core Web Vitals).
 * Traducción Node+Playwright del agente Lighthouse (playwright-cli evaluate → page.evaluate).
 *
 * Por cada flow de perf_context.flows (sin skip_reason), repite N veces:
 *   goto(entry_url) → inyecta PerformanceObservers (buffered) → espera → lee métricas.
 * Escribe la medición cruda en {output_base_dir}/.raw/{e2e_id}.json.
 *
 * Auth — cascada de 3 niveles (cliente-agnóstica):
 *   1. requires_auth=false                  → sin login.
 *   2. session_state_file presente          → storageState (cualquier login: estándar/SSO/MFA).
 *   3. login_selectors o genéricos          → login por formulario user/pass.
 *
 * INP: medido pasivamente (sin interacción simulada). Si no hubo ningún evento de
 *      interacción → inp=null (no 0) para que lh-thresholds lo marque no_data y NO
 *      infle el score con un falso 'good'.
 *
 * Excepción doctrinal MCP black-box: misma que VUA (ver SKILL del validador).
 *
 * Uso: node lh-measure-flows.js --run-id=<id> --perf-context=<path> [--role=admin]
 *      [--credentials=<path>] [--headed]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const helpers = require('./lib/vua-scan-helpers.js');

// Construye el browser context aplicando la cascada de auth. Devuelve { browserCtx, authMode }.
async function buildContext(browser, ctx, credPath, role) {
  const base = { viewport: { width: 1366, height: 900 } };
  const auth = ctx.auth || {};

  // Nivel 1 — App sin login
  if (!auth.requires_auth) {
    return { browserCtx: await browser.newContext(base), authMode: 'none' };
  }

  // Nivel 2 — storageState pre-capturado (REGLA 8 — cualquier login: estándar/SSO/MFA)
  const ssf = auth.session_state_file;
  if (ssf && fs.existsSync(ssf)) {
    return { browserCtx: await browser.newContext({ ...base, storageState: ssf }), authMode: 'storage_state' };
  }

  // Nivel 3 — login por formulario con selectores configurables (default genéricos)
  const browserCtx = await browser.newContext(base);
  const ls = auth.login_selectors || {};
  const sel = {
    username: ls.username || 'input[name="username"], input[type="email"], #username',
    password: ls.password || 'input[name="password"], input[type="password"], #password',
    submit:   ls.submit   || 'button[type="submit"], input[type="submit"]'
  };
  const creds = helpers.loadCredentials(credPath, role);
  const page = await browserCtx.newPage();
  try {
    await page.goto(ctx.app_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector(sel.username, { timeout: 15000 });
    await page.fill(sel.username, creds.username);
    await page.fill(sel.password, creds.password);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}),
      page.click(sel.submit)
    ]);
  } catch (e) {
    await page.close().catch(() => {});
    throw new Error(
      `login_failed: ${(e && e.message) || e}. Si el login no es estándar, configura auth.login_selectors ` +
      `en appweb.yaml o pre-captura sesión: node .claude/tools/save-session.js --env <env>`
    );
  }
  await page.close();
  return { browserCtx, authMode: 'form_login' };
}

// Inyecta observers (buffered) + lee métricas sobre una página ya navegada.
async function measureOnce(page, stabilizationMs) {
  await page.evaluate(() => {
    window.__atf_metrics = { inp_observed: false };
    const safe = (cb) => { try { cb(); } catch (e) { window.__atf_metrics.observer_error = String((e && e.message) || e); } };
    safe(() => new PerformanceObserver((l) => {
      const e = l.getEntries(); if (e.length) window.__atf_metrics.lcp = e[e.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true }));
    safe(() => { let cls = 0; new PerformanceObserver((l) => {
      for (const en of l.getEntries()) if (!en.hadRecentInput) cls += en.value;
      window.__atf_metrics.cls = cls;
    }).observe({ type: 'layout-shift', buffered: true }); });
    safe(() => new PerformanceObserver((l) => {
      const fcp = l.getEntries().find((en) => en.name === 'first-contentful-paint');
      if (fcp) window.__atf_metrics.fcp = fcp.startTime;
    }).observe({ type: 'paint', buffered: true }));
    safe(() => new PerformanceObserver((l) => {
      const ents = l.getEntries();
      if (ents.length) {
        window.__atf_metrics.inp_observed = true;
        const max = Math.max(...ents.map((en) => en.duration));
        window.__atf_metrics.inp = Math.max(window.__atf_metrics.inp || 0, max);
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 }));
  });
  await page.waitForTimeout(stabilizationMs);
  return await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const m = window.__atf_metrics || {};
    return {
      lcp: m.lcp != null ? m.lcp : null,
      cls: m.cls != null ? m.cls : 0,
      fcp: m.fcp != null ? m.fcp : null,
      // INP pasivo: null si NO hubo interacción real (no 0 → no infla el score).
      inp: m.inp_observed ? (m.inp != null ? m.inp : null) : null,
      ttfb: nav.responseStart != null ? nav.responseStart : null,
      dom_content_loaded: nav.domContentLoadedEventEnd != null ? nav.domContentLoadedEventEnd : null,
      load_complete: nav.loadEventEnd != null ? nav.loadEventEnd : null
    };
  });
}

async function main() {
  const arg = helpers.parseCliArgs(process.argv);
  const runId = arg('--run-id');
  const ctxPath = arg('--perf-context');
  const credPath = arg('--credentials', 'docs/testing/atf-web/config/credentials.yaml');
  const role = arg('--role', 'admin');
  const headless = arg('--headed') ? false : true;

  if (!runId || !ctxPath) {
    console.error('USO: --run-id=<id> --perf-context=<path> [--role=admin] [--credentials=<path>] [--headed]');
    process.exit(2);
  }

  const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  const reps = (ctx.perf_config && ctx.perf_config.repetitions) || 3;
  const waitMs = (ctx.perf_config && ctx.perf_config.stabilization_wait_ms) || 2000;
  const rawDir = path.join(ctx.output_base_dir, '.raw');
  fs.mkdirSync(rawDir, { recursive: true });

  const browser = await chromium.launch({ headless });
  let authMode = 'none';
  try {
    console.log(JSON.stringify({ event: 'auth_start', requires_auth: !!(ctx.auth && ctx.auth.requires_auth) }));
    const built = await buildContext(browser, ctx, credPath, role);
    const browserCtx = built.browserCtx;
    authMode = built.authMode;
    console.log(JSON.stringify({ event: 'auth_ok', auth_mode: authMode }));

    const flows = ctx.flows.filter((f) => !f.skip_reason);
    const stats = { flows_measured: 0, flows_failed: 0, auth_mode: authMode, started_at: new Date().toISOString() };

    for (const flow of flows) {
      console.log(JSON.stringify({ event: 'flow_start', e2e_id: flow.e2e_id, url: flow.entry_url, reps }));
      const measurements = [];
      for (let r = 1; r <= reps; r++) {
        const page = await browserCtx.newPage();
        try {
          await page.goto(flow.entry_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          const m = await measureOnce(page, waitMs);
          measurements.push(m);
          console.log(JSON.stringify({ event: 'rep_done', e2e_id: flow.e2e_id, rep: r, lcp: m.lcp, fcp: m.fcp }));
        } catch (e) {
          measurements.push({ error: String((e && e.message) || e) });
          console.log(JSON.stringify({ event: 'rep_failed', e2e_id: flow.e2e_id, rep: r, error: String((e && e.message) || e) }));
        } finally {
          await page.close().catch(() => {});
        }
      }
      const ok = measurements.filter((m) => !m.error).length;
      if (ok > 0) stats.flows_measured++; else stats.flows_failed++;
      fs.writeFileSync(
        path.join(rawDir, `${flow.e2e_id}.json`),
        JSON.stringify({ e2e_id: flow.e2e_id, flow_name: flow.name, entry_url: flow.entry_url, repetitions: reps, measurements }, null, 2)
      );
      console.log(JSON.stringify({ event: 'flow_done', e2e_id: flow.e2e_id, successful_reps: ok }));
    }

    stats.ended_at = new Date().toISOString();
    console.log(JSON.stringify({ event: 'all_flows_done', stats }));
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
