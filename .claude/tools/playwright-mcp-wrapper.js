#!/usr/bin/env node
/**
 * Playwright MCP wrapper — lee `docs/testing/atf-web/config/appweb.yaml` y lanza `@playwright/mcp`
 * con o sin `--headless` según el flag `browser.headless`.
 *
 * Uso: invocado desde `.mcp.json` como command del server "playwright".
 *      Claude Code lo ejecuta una vez al startup de la sesión.
 *
 * Para cambiar de modo:
 *   1. Editar `browser.headless: true|false` en `docs/testing/atf-web/config/appweb.yaml`
 *   2. Reiniciar Claude Code (los MCP servers se spawnean al start)
 *
 * Fallback: si `appweb.yaml` no se puede leer, arranca en modo visible (seguro).
 */
'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');

const APP_YAML = require('./lib/paths.js').APP_YAML;

function readHeadlessFlag() {
  try {
    const raw = fs.readFileSync(APP_YAML, 'utf8');
    // Busca el bloque `browser:` y dentro la key `headless: true`.
    // Regex tolera espacios y comentarios inline.
    const browserBlock = raw.match(/^browser\s*:\s*\n((?:\s{2,}.*\n?)+)/m);
    if (!browserBlock) return false;
    return /^\s+headless\s*:\s*true\b/m.test(browserBlock[1]);
  } catch (e) {
    // Silencioso: si appweb.yaml no existe o es ilegible, arrancamos visible.
    return false;
  }
}

const headless = readHeadlessFlag();

// Construimos la línea de comando como string único (no array). Esto evita el
// DeprecationWarning DEP0190 de Node 22+ que aplica cuando se combina args[]
// con shell:true. Los argumentos son literales controlados por el framework —
// no hay input de usuario, por lo que la concatenación es segura.
// `--isolated`: cada session tiene su propio user-data-dir. Sin este
// flag, el profile compartido sufre de SingletonLock huérfano cuando una sesión
// previa de Chromium muere sin liberar el lockfile — bloquea spawn de nuevas
// sesiones del MCP por horas hasta intervención manual. Causa raíz histórica
// de `browser_mcp_unavailable` recurrente. `cleanup-mcp-browser.js` mitigaba
// el síntoma; `--isolated` elimina la causa.
const flags = [
  '--browser chromium',
  '--isolated',
  '--ignore-https-errors',
  '--viewport-size=1920,1080',
];
if (headless) flags.push('--headless');
const shellCmd = `npx @playwright/mcp ${flags.join(' ')}`;

// Log a stderr para que aparezca en el log del MCP sin contaminar stdout (el
// canal MCP es JSON-RPC por stdio).
process.stderr.write(`[playwright-mcp-wrapper] headless=${headless}\n`);

const child = spawn(shellCmd, {
  stdio: 'inherit',
  shell: true,
  windowsHide: true,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

/**
 * Mata al proceso hijo y, en Windows, TODO su árbol de procesos.
 *
 * `spawn(..., { shell: true })` en Windows lanza cmd.exe como hijo directo;
 * el árbol completo `npx` → `node` → `chromium` cuelga de ahí. `child.kill()` solo termina
 * cmd.exe y deja el resto huérfano (mismo síntoma que el lockfile SingletonLock
 * documentado arriba). `taskkill /T` mata el árbol completo.
 * Mismo patrón que `killProcess()` en `cleanup-mcp-browser.js`.
 */
function killChildTree(sig) {
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /PID ${child.pid} /F /T`, { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    } catch {
      /* el proceso puede ya haber salido */
    }
  } else {
    child.kill(sig);
  }
}

// Reenvía señales al child para que Claude Code pueda matar el server limpiamente.
// SIGHUP no es entregable en Windows — se omite ahí, taskkill ya cubre ese caso.
const signals = process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];
for (const sig of signals) {
  process.on(sig, () => killChildTree(sig));
}
