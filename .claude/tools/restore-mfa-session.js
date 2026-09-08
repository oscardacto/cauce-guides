#!/usr/bin/env node
'use strict';
/**
 * ATF v2 — restore-mfa-session.js
 *
 * Prepara TODO el payload para restaurar una sesión MFA en UN solo tool call.
 * Reemplaza los ~14 tool calls que el sub-agente hacía para:
 *   - leer session_state_qa.json
 *   - filtrar cookies
 *   - construir snippet de inyección
 *   - inspeccionar localStorage
 *   - escapar strings JS
 *
 * Contrato:
 *   Input  : --run-folder=output/{run}/  (obligatorio)
 *            --app-yaml=docs/testing/atf-web/config/appweb.yaml  (default)
 *   Output : JSON por stdout con el manifest + archivo .tmp/mfa_inject.js
 *            con el snippet JS listo para browser_evaluate.
 *
 * El sub-agente solo necesita:
 *   1) node .claude/tools/restore-mfa-session.js --run-folder=...  → captura JSON
 *   2) browser_navigate(app_url)                                    → establece origen
 *   3) browser_evaluate({contenido de manifest.inject_eval})        → inyecta LS + cookies
 *   4) browser_navigate(app_url)                                    → reload con sesión
 *   5) browser_evaluate({contenido de manifest.verify_eval})        → verifica auth
 *
 * Reducción: 14 → 5 tool calls = ~65% menos contexto consumido.
 *
 * Seguridad:
 *   - NUNCA loguea el JWT/tokens — solo cuenta de entries + hostname.
 *   - Filtra cookies al hostname de app.url (evita residuos Microsoft Azure).
 *   - Sale con exit 2 + reason cuando la sesión no es válida (executor escribe execution_blocked.json).
 */

const fs   = require('fs');
const path = require('path');
const { readYaml } = require('./lib/yaml-minimal');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ── Argumentos ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    runFolder: null,
    appYaml:   path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config', 'appweb.yaml'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const k = eq > 0 ? a.slice(0, eq) : a;
    const v = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (k === '--run-folder') out.runFolder = v;
    else if (k === '--app-yaml') out.appYaml = v;
    else if (k === '--help' || k === '-h') {
      process.stdout.write('restore-mfa-session.js — prepara payload MFA en 1 call\n');
      process.stdout.write('Uso: --run-folder=output/{run}/ [--app-yaml=path]\n');
      process.exit(0);
    }
  }
  if (!out.runFolder) {
    process.stderr.write('[restore-mfa-session] ERROR: --run-folder es obligatorio\n');
    process.exit(1);
  }
  return out;
}

// ── Helper: emitir JSON + exit ──────────────────────────────────────────────
function emit(status, extra) {
  const out = { status, ...extra };
  process.stdout.write(JSON.stringify(out, null, 2));
  process.stdout.write('\n');
  process.exit(status === 'ready' ? 0 : 2);
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));
  const runFolderAbs = path.isAbsolute(args.runFolder)
    ? args.runFolder
    : path.join(PROJECT_ROOT, args.runFolder);
  const tmpDir = path.join(runFolderAbs, '.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // 1. Leer appweb.yaml → app.url + auth.* (mfa_type, session_state_file, health_check_selector)
  if (!fs.existsSync(args.appYaml)) {
    return emit('feature_off', { reason: 'app_yaml_not_found', path: args.appYaml });
  }
  const appCfg = readYaml(args.appYaml) || {};
  const appUrl = appCfg?.app?.url || '';
  const mfaType = appCfg?.auth?.mfa_type || '';
  const sessionFileRel = appCfg?.auth?.session_state_file || '';
  const healthCheckSelector = appCfg?.auth?.session_health_check_selector || '';

  // Feature off → skip silencioso
  if (!mfaType || !sessionFileRel) {
    return emit('feature_off', { reason: 'mfa_not_configured', mfa_type: mfaType });
  }

  const sessionFileAbs = path.isAbsolute(sessionFileRel)
    ? sessionFileRel
    : path.join(PROJECT_ROOT, sessionFileRel);

  if (!fs.existsSync(sessionFileAbs)) {
    return emit('needs_reauth', {
      reason: 'mfa_session_file_not_found',
      session_state_file: sessionFileRel,
      action_required: `node .claude/tools/save-session.js --env ${appCfg?.app?.environment || 'qa'}`,
    });
  }

  // 2. Parsear session_state y calcular hostname target
  let session;
  try {
    session = JSON.parse(fs.readFileSync(sessionFileAbs, 'utf8'));
  } catch (e) {
    return emit('needs_reauth', {
      reason: 'mfa_session_file_corrupt',
      error_detail: String(e.message || e).slice(0, 200),
      action_required: `node .claude/tools/save-session.js --env ${appCfg?.app?.environment || 'qa'} --force`,
    });
  }

  let hostname = '';
  try { hostname = new URL(appUrl).hostname; } catch (_) { hostname = ''; }
  if (!hostname) {
    return emit('feature_off', { reason: 'app_url_invalid', app_url: appUrl });
  }

  // 3. Filtrar cookies al dominio de la app (elimina residuos Microsoft/Azure del flujo OAuth)
  const allCookies = Array.isArray(session.cookies) ? session.cookies : [];
  const relevant = allCookies.filter((c) => {
    const d = String(c.domain || '').replace(/^\./, '');
    return d === hostname || hostname.endsWith('.' + d) || d.endsWith('.' + hostname);
  });
  const filteredOutCount = allCookies.length - relevant.length;

  // 4. Extraer localStorage del origin objetivo
  const origins = Array.isArray(session.origins) ? session.origins : [];
  const targetOrigin = origins.find((o) => {
    try { return new URL(o.origin).hostname === hostname; } catch (_) { return false; }
  }) || {};
  const lsEntries = Array.isArray(targetOrigin.localStorage) ? targetOrigin.localStorage : [];

  if (relevant.length === 0 && lsEntries.length === 0) {
    return emit('needs_reauth', {
      reason: 'mfa_session_empty_for_target',
      target_hostname: hostname,
      cookies_in_file: allCookies.length,
      cookies_for_target: 0,
      localstorage_entries: 0,
      action_required: `node .claude/tools/save-session.js --env ${appCfg?.app?.environment || 'qa'} --force`,
    });
  }

  // 5. Construir snippet JS de inyección (callable arrow function — browser_evaluate compatible)
  const lsPayload = JSON.stringify(lsEntries);
  const cookiesPayload = JSON.stringify(relevant.map((c) => ({
    name:   c.name,
    value:  c.value,
    domain: c.domain,
    path:   c.path || '/',
  })));

  const injectEval = `() => {
  const ls = ${lsPayload};
  const cookies = ${cookiesPayload};
  let ls_ok = 0, cookies_ok = 0;
  try {
    for (const e of ls) { localStorage.setItem(e.name, e.value); ls_ok++; }
  } catch (err) { /* storage unavailable */ }
  for (const c of cookies) {
    try {
      const parts = [c.name + '=' + c.value, 'path=' + (c.path || '/')];
      if (c.domain) parts.push('domain=' + c.domain);
      document.cookie = parts.join('; ');
      cookies_ok++;
    } catch (err) { /* cookie rejected */ }
  }
  return { ls_injected: ls_ok, cookies_injected: cookies_ok, ls_keys: ls.map(e => e.name), url: location.href };
}`;

  // verify_eval multi-señal ( —:
  //   Señal 1 (primaria)  : JWT en localStorage.auth-storage con appTokenExpiry > now
  //   Señal 2 (definitiva): redirect a IdP externo (login.microsoftonline.com, etc.)
  //   Señal 3 (secundaria): pathname en la app host sugiere login sólo si no hay JWT
  //   Señal 4 (terciaria) : selector DOM de health check
  // authenticated = (JWT válido ∧ ¬IdP externo) ∨ (on_app_host ∧ DOM selector presente)
  // redirected_to_login = on_external_idp ∨ (pathSuggestsLogin ∧ ¬JWT válido)
  const appHostJSON = JSON.stringify(hostname);
  const healthSelectorJSON = healthCheckSelector ? JSON.stringify(healthCheckSelector) : 'null';
  const verifyEval = `() => {
  const appHost = ${appHostJSON};
  const healthSelector = ${healthSelectorJSON};
  const h = location.hostname;

  // 1) JWT en localStorage — verdad canónica
  let jwtValid = false, jwtExpiresInMin = null;
  try {
    const raw = localStorage.getItem('auth-storage');
    if (raw) {
      const p = JSON.parse(raw);
      const exp = p && p.state && p.state.appTokenExpiry;
      if (typeof exp === 'number' && exp * 1000 > Date.now()) {
        jwtValid = true;
        jwtExpiresInMin = Math.round((exp * 1000 - Date.now()) / 60000);
      }
    }
  } catch (_) {}

  // 2) Redirect a IdP externo conocido — señal DEFINITIVA de MFA expirada
  const onExternalIdP = /(^|\\.)(login\\.microsoftonline\\.com|login\\.live\\.com|accounts\\.google\\.com|login\\.okta\\.com)$/i.test(h);

  // 3) Pathname de login SOLO si estamos en el hostname de la app
  const onAppHost = h === appHost;
  const pathSuggestsLogin = onAppHost && /^\\/(login|auth|signin|oauth)(\\?|$|\\/)/i.test(location.pathname);

  // 4) DOM como evidencia secundaria
  const domOk = healthSelector ? !!document.querySelector(healthSelector) : null;

  const authenticated = (jwtValid && !onExternalIdP) || (onAppHost && domOk === true);
  const redirected_to_login = onExternalIdP || (pathSuggestsLogin && !jwtValid);

  return {
    authenticated,
    url: location.href,
    hostname: h,
    on_app_host: onAppHost,
    on_external_idp: onExternalIdP,
    jwt_valid: jwtValid,
    jwt_expires_in_min: jwtExpiresInMin,
    dom_selector_present: domOk,
    path_suggests_login: pathSuggestsLogin,
    has_auth_storage: !!localStorage.getItem('auth-storage'),
    redirected_to_login
  };
}`;

  // 6. Persistir snippet en .tmp/mfa_inject.js (debug-friendly + auditable)
  const snippetPath = path.join(tmpDir, 'mfa_inject.js');
  fs.writeFileSync(snippetPath, injectEval, 'utf8');
  const snippetPathRel = path.relative(PROJECT_ROOT, snippetPath).replace(/\\/g, '/');

  // 7. Emit manifest JSON (compacto — sub-agente lo captura directo)
  return emit('ready', {
    app_url: appUrl,
    target_hostname: hostname,
    mfa_type: mfaType,
    health_check_selector: healthCheckSelector || null,
    localstorage_entries: lsEntries.length,
    filtered_cookies: relevant.length,
    discarded_cookies: filteredOutCount,
    inject_script_path: snippetPathRel,
    inject_eval: injectEval,
    verify_eval: verifyEval,
    instructions: [
      '1. browser_navigate(app_url)  — primer nav para establecer origen',
      '2. browser_evaluate(inject_eval)  — inyecta localStorage + cookies',
      '3. browser_navigate(app_url)  — reload con sesión',
      '4. browser_wait_for({time: 2})  — settle del SPA tras reload (evita falso positivo verify_eval por hydration)',
      '5. browser_evaluate(verify_eval)  — confirma auth o retorna needs_reauth',
    ],
  });
}

try {
  main();
} catch (err) {
  process.stderr.write(`[restore-mfa-session] FATAL: ${err.message}\n${err.stack}\n`);
  process.exit(1);
}
