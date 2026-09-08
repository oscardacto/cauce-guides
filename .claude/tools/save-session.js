#!/usr/bin/env node
/**
 * ATF v2 — save-session.js
 *
 * Script interactivo para guardar el estado de sesión de Playwright cuando
 * la aplicación usa MFA (Microsoft Authenticator, Google Auth, TOTP, etc.)
 * que no puede automatizarse.
 *
 * El QA autentica manualmente (incluyendo el paso de MFA) y el script guarda
 * el storageState completo (cookies + localStorage + sessionStorage) en un
 * archivo JSON. El executor carga ese estado en lugar de hacer login por CP,
 * evitando el prompt de MFA en cada caso de prueba.
 *
 * Uso:
 *   node .claude/tools/save-session.js
 *   node .claude/tools/save-session.js --env qa
 *   node .claude/tools/save-session.js --env staging --force
 *
 * Flags:
 *   --env <nombre>   Ambiente a autenticar. Default: lee appweb.yaml → app.environment
 *   --force          Sobreescribir sesión existente sin preguntar
 *   --url <url>      Sobreescribir la URL de appweb.yaml (útil para hotfixes)
 *
 * Salida:
 *   docs/testing/atf-web/config/session_state_{env}.json   ← gitignored, NUNCA versionar
 *
 * Duración típica de tokens Azure AD:
 *   Access token  → ~1 hora
 *   Refresh token → hasta 90 días si "Keep me signed in" habilitado
 *   En ambientes QA el administrador puede extender la duración.
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const PROJECT_ROOT  = path.join(__dirname, '..', '..');
const CONFIG_DIR    = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config');
const APP_YAML_PATH = path.join(CONFIG_DIR, 'appweb.yaml');

const { readYaml } = require('./lib/yaml-minimal');

// ─── ARG PARSING ──────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

function getFlag(name) {
  const idx = rawArgs.indexOf(name);
  return idx !== -1 && rawArgs[idx + 1] ? rawArgs[idx + 1] : null;
}

const ENV_ARG   = getFlag('--env');
const URL_ARG   = getFlag('--url');
const FORCE_ARG = rawArgs.includes('--force');

// ─── LECTURA DE appweb.yaml ──────────────────────────────────────────────────────

function readAppYaml() {
  if (!fs.existsSync(APP_YAML_PATH)) {
    console.warn(`⚠️  appweb.yaml no encontrado en: ${APP_YAML_PATH}`);
    return {};
  }
  const parsed = readYaml(APP_YAML_PATH) || {};
  const app  = parsed.app || {};
  const auth = parsed.auth || {};
  return {
    url:                            app.url,
    environment:                    app.environment,
    session_state_file:             auth.session_state_file || '',
    session_health_check_selector:  auth.session_health_check_selector || '',
  };
}

// ─── READLINE HELPER ──────────────────────────────────────────────────────────

function askUser(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── PLAYWRIGHT LOADER ────────────────────────────────────────────────────────

function loadPlaywright() {
  const candidates = ['@playwright/test', 'playwright', 'playwright-core'];
  for (const pkg of candidates) {
    try {
      const p = require(pkg);
      if (p && (p.chromium || p.default?.chromium)) {
        return p.chromium ?? p.default.chromium;
      }
    } catch {
      // package no instalado — intentar el siguiente
    }
  }
  return null;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const appConfig = readAppYaml();

  const env    = ENV_ARG || appConfig.environment || 'qa';
  const appUrl = URL_ARG || appConfig.url;
  const healthSelector = appConfig.session_health_check_selector || null;

  if (!appUrl) {
    console.error('\n❌  No se encontró la URL de la aplicación.');
    console.error('   Opciones:');
    console.error('     1. Editar docs/testing/atf-web/config/appweb.yaml → app.url');
    console.error('     2. Pasar el flag: --url https://mi-app.com\n');
    process.exit(1);
  }

  // Resolver path del session_state:
  //   Si appweb.yaml → auth.session_state_file está configurado, usar ese path (relativo al PROJECT_ROOT).
  //   Si no, default: docs/testing/atf-web/config/session_state_{env}.json
  let sessionFile;
  if (appConfig.session_state_file) {
    const raw = appConfig.session_state_file;
    sessionFile = path.isAbsolute(raw) ? raw : path.join(PROJECT_ROOT, raw);
  } else {
    sessionFile = path.join(CONFIG_DIR, `session_state_${env}.json`);
  }

  // ── Cabecera ──────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  ATF v2 — Guardar Sesión con MFA                 ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  Ambiente : ${env}`);
  console.log(`  URL      : ${appUrl}`);
  console.log(`  Archivo  : ${sessionFile}`);
  if (healthSelector) {
    console.log(`  Selector : ${healthSelector}`);
  }

  // ── Verificar sesión existente ────────────────────────────────────────────
  if (fs.existsSync(sessionFile) && !FORCE_ARG) {
    const stat     = fs.statSync(sessionFile);
    const ageH     = ((Date.now() - stat.mtimeMs) / 3_600_000).toFixed(1);
    const ageDays  = (ageH / 24).toFixed(1);
    console.log(`\n⚠️  Ya existe ${path.basename(sessionFile)}`);
    console.log(`   Guardado hace: ${ageH} horas (${ageDays} días)`);

    const ans = await askUser('\n   ¿Sobreescribir? (s/N): ');
    if (ans.toLowerCase() !== 's') {
      console.log('\n   Operación cancelada. Sesión anterior conservada.\n');
      process.exit(0);
    }
  }

  // ── Cargar Playwright ─────────────────────────────────────────────────────
  const playwright = loadPlaywright();
  if (!playwright) {
    console.error('\n❌  No se encontró Playwright. Ejecuta: npm run setup\n');
    process.exit(1);
  }

  // ── Instrucciones al QA ───────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────');
  console.log('  Instrucciones:');
  console.log('  1. Se abrirá el browser en modo visible');
  console.log('  2. Autenticate con tu usuario (usuario + contraseña + MFA)');
  console.log('  3. Cuando estés dentro de la app, vuelve a esta terminal');
  console.log('  4. Presiona Enter para guardar la sesión');
  console.log('──────────────────────────────────────────────────────\n');

  await askUser('  [Enter] para abrir el browser → ');

  // ── Lanzar browser headed ─────────────────────────────────────────────────
  let browser, context, page;
  try {
    browser = await playwright.launch({
      headless: false,
      args:     ['--start-maximized'],
    });
    context  = await browser.newContext({ viewport: null });
    page     = await context.newPage();

    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    console.log(`\n  ✅  Browser abierto. Navega a: ${appUrl}`);
    console.log('  Completa el login + MFA en el browser...\n');
  } catch (e) {
    console.error(`\n❌  Error al abrir el browser: ${e.message}\n`);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }

  // ── Esperar confirmación del QA ───────────────────────────────────────────
  await askUser('  [Enter] cuando hayas completado el login y MFA → ');

  // ── Verificar sesión activa ───────────────────────────────────────────────
  if (healthSelector) {
    console.log(`\n  Verificando sesión (buscando: "${healthSelector}")...`);
    try {
      await page.waitForSelector(healthSelector, { timeout: 8_000 });
      console.log('  ✅  Sesión verificada correctamente');
    } catch {
      console.log(`  ⚠️  No se encontró el selector "${healthSelector}"`);
      console.log('      Puede que no estés autenticado, o el selector esté desactualizado.');
      console.log('      (Actualiza auth.session_health_check_selector en appweb.yaml si es incorrecto)\n');
      const ans = await askUser('  ¿Continuar guardando la sesión de todas formas? (s/N): ');
      if (ans.toLowerCase() !== 's') {
        console.log('\n  Operación cancelada.\n');
        await browser.close().catch(() => {});
        process.exit(0);
      }
    }
  } else {
    console.log('\n  ℹ️  Sin selector de salud configurado — asumiendo sesión activa.');
    console.log('     (Opcional: configura auth.session_health_check_selector en appweb.yaml)');
  }

  // ── Guardar storageState ──────────────────────────────────────────────────
  try {
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    await context.storageState({ path: sessionFile });

    const stat   = fs.statSync(sessionFile);
    const sizeKb = (stat.size / 1024).toFixed(1);
    const data   = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    const nCookies = (data.cookies || []).length;

    console.log(`\n  ✅  Sesión guardada:`);
    console.log(`     Archivo  : ${sessionFile}`);
    console.log(`     Tamaño   : ${sizeKb} KB`);
    console.log(`     Cookies  : ${nCookies}`);
    console.log(`\n  💡  El pipeline reutilizará esta sesión sin solicitar MFA.`);
    console.log(`  ⏱️  Si expira, vuelve a ejecutar:`);
    console.log(`     node .claude/tools/save-session.js --env ${env} --force\n`);
  } catch (e) {
    console.error(`\n❌  Error al guardar storageState: ${e.message}\n`);
    await browser.close().catch(() => {});
    process.exit(1);
  }

  await browser.close().catch(() => {});
}

main().catch(err => {
  console.error('\n❌  Error inesperado:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
