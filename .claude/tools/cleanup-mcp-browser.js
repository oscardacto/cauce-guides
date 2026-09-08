#!/usr/bin/env node
/**
 * cleanup-mcp-browser.js — limpia procesos Chrome/Chromium huérfanos que mantienen
 * lock sobre el user-data-dir del MCP Playwright (`mcp-chromium-*`).
 *
 * Motivación (incidente, MiApp-v1.0-20260101-0900):
 * Cuando un run previo deja un Chromium vivo con el profile MCP (por crash, cierre
 * incompleto, o porque otra sesión de Claude Code lo dejó corriendo), el próximo
 * `browser_navigate` del executor falla con:
 *   "Browser is already in use for {profile}, use --isolated to run multiple instances"
 *
 * El executor luego pierde 3-4 min diagnosticando y matando procesos manualmente
 * con PowerShell. Este script lo hace en ~500 ms antes de cada fase que usa browser.
 *
 * Qué hace (en este orden):
 *   1. Enumera procesos chrome.exe cuyo command-line contiene `mcp-chromium`.
 *   2. Los mata con force stop (universal: Windows/Linux/macOS).
 *   3. Borra `SingletonLock` y `lockfile` de todos los profile dirs encontrados.
 *   4. Reporta acciones tomadas (0..N procesos, 0..N lockfiles).
 *
 * Qué NO hace:
 *   - NO mata chrome.exe del usuario (navegador personal). Filtra SOLO por
 *     `mcp-chromium` en cmdline — los profiles MCP siempre llevan ese nombre.
 *   - NO borra el profile dir completo (cache, cookies de test user, etc.).
 *   - NO requiere admin. Los procesos son propiedad del mismo user que los lanzó.
 *
 * Uso:
 *   node .claude/tools/cleanup-mcp-browser.js           # ejecución normal
 *   node .claude/tools/cleanup-mcp-browser.js --dry-run # solo reportar, no tocar
 *   node .claude/tools/cleanup-mcp-browser.js --quiet   # silencioso (exit code only)
 *
 * Exit codes: 0 = OK (haya o no matado algo). 1 = error inesperado.
 *
 * Invocado por:
 *   - .claude/commands/sofka-asdd/qa-web-exec.md PASO 0 (antes de invocar executor)
 *   - execute.md PASO 0.0 (antes del primer browser_navigate)
 *   - Opcional: skill browser-lifecycle antes de FASES 2A/2B/2C
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DRY_RUN = process.argv.includes('--dry-run');
const QUIET = process.argv.includes('--quiet');
const FORCE = process.argv.includes('--force');  // bypass fast-path si hace falta

function log(msg) { if (!QUIET) process.stdout.write(msg + '\n'); }
function warn(msg) { if (!QUIET) process.stderr.write(msg + '\n'); }

/**
 * Fast-path: si ningún profile dir MCP tiene lockfile, no hay proceso residual
 * posible (Chromium crea SingletonLock al abrir el profile). Evita invocar la
 * enum CIM lenta (hasta 18s en Windows por startup de PowerShell + AMSI).
 *
 * Retorna:
 *   { skip: true,  reason: "no lockfile" }           → no hay procesos, exit 0 rápido
 *   { skip: false, candidateDirs: [...] }            → hay lockfile(s), ejecutar enum
 *   { skip: true,  reason: "no ms-playwright dir" }  → Playwright nunca se instaló
 */
function fastPathCheck() {
  if (FORCE) return { skip: false, candidateDirs: null, reason: "force flag" };

  // Resolver base dir según plataforma (cache de Playwright difiere por OS)
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  let baseDir;
  if (isWin) {
    baseDir = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'), 'ms-playwright');
  } else if (isMac) {
    baseDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  } else {
    baseDir = path.join(os.homedir(), '.cache', 'ms-playwright');
  }

  if (!fs.existsSync(baseDir)) {
    return { skip: true, reason: `${baseDir} no existe — Playwright no instalado o primer uso` };
  }

  const LOCK_NAMES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
  let subdirs;
  try {
    subdirs = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith('mcp-chromium'))
      .map(e => path.join(baseDir, e.name));
  } catch (e) {
    return { skip: false, candidateDirs: null, reason: `readdir falló: ${e.message}` };
  }

  if (subdirs.length === 0) {
    return { skip: true, reason: `sin subdirectorios mcp-chromium-* en ${baseDir}` };
  }

  const dirsWithLock = subdirs.filter(dir =>
    LOCK_NAMES.some(name => fs.existsSync(path.join(dir, name)))
  );

  if (dirsWithLock.length === 0) {
    return { skip: true, reason: `ningún profile MCP tiene lockfile (${subdirs.length} revisados)` };
  }

  return { skip: false, candidateDirs: dirsWithLock, reason: `${dirsWithLock.length}/${subdirs.length} con lockfile` };
}

/**
 * Enumera procesos chrome.exe con `mcp-chromium` en su cmdline.
 * Usa PowerShell CIM en Windows (confiable). En POSIX usa `ps -eo pid,command`.
 * Retorna: [{ pid, userDataDir }]
 */
function findMcpChromeProcesses() {
  const out = [];
  const isWin = process.platform === 'win32';

  try {
    if (isWin) {
      // PowerShell CIM query — JSON output para parse estable.
      // @(...) fuerza array incluso con 0 o 1 elementos.
      // -AsArray no existe en PS 5.x → usar -InputObject con @(...) explícito.
      // -EncodedCommand (UTF-16LE base64) evita quoting issues bash↔powershell.
      const psScript =
        "ConvertTo-Json -Compress -Depth 3 -InputObject @(" +
        "Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" " +
        "| Where-Object { $_.CommandLine -like '*mcp-chromium*' } " +
        "| Select-Object ProcessId, CommandLine)";
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const raw = execSync(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'ignore'], // descartar stderr (CLIXML warnings)
      }).trim();
      if (!raw || raw === 'null' || raw === '[]') return out;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const p of list) {
        if (!p || !p.ProcessId) continue;
        const m = String(p.CommandLine || '').match(/--user-data-dir=([^\s"']+)/);
        out.push({ pid: p.ProcessId, userDataDir: m ? m[1] : null });
      }
    } else {
      // POSIX: `ps -eo pid,command` y filtro por grep-equivalente en JS
      const raw = execSync("ps -eo pid,command", { encoding: 'utf8', timeout: 10000 });
      for (const line of raw.split('\n')) {
        if (!line.includes('mcp-chromium')) continue;
        const m = line.trim().match(/^(\d+)\s+(.+)$/);
        if (!m) continue;
        const cmd = m[2];
        const udd = cmd.match(/--user-data-dir=([^\s"']+)/);
        out.push({ pid: parseInt(m[1], 10), userDataDir: udd ? udd[1] : null });
      }
    }
  } catch (e) {
    warn(`[cleanup-mcp-browser] enumeration failed: ${e.message}`);
  }
  return out;
}

function killProcess(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F /T`, { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return true;
  } catch (e) {
    warn(`[cleanup-mcp-browser] kill ${pid} failed: ${e.message}`);
    return false;
  }
}

function removeLockFiles(userDataDirs) {
  const LOCK_NAMES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
  let removed = 0;
  for (const dir of userDataDirs) {
    if (!dir) continue;
    for (const lock of LOCK_NAMES) {
      const p = path.join(dir, lock);
      try {
        if (fs.existsSync(p)) {
          if (!DRY_RUN) fs.unlinkSync(p);
          removed++;
          log(`  ${DRY_RUN ? '[dry]' : 'removed'} ${p}`);
        }
      } catch (e) {
        // EBUSY si aún hay proceso con el lock — aceptable, el kill previo debería haberlo liberado
        warn(`  lock "${p}" no removible: ${e.code || e.message}`);
      }
    }
  }
  return removed;
}

/* ─── Main ─────────────────────────────────────────────────────────────── */

const t0 = Date.now();

// Fast-path: si no hay lockfile en ningún profile MCP, no hay proceso residual
// (Chromium crea SingletonLock al abrir profile; imposible vivir sin él).
const fp = fastPathCheck();
if (fp.skip) {
  log(`[cleanup-mcp-browser] Fast-path: ${fp.reason}. Exit sin invocar CIM (${Date.now() - t0}ms).`);
  process.exit(0);
}

log(`[cleanup-mcp-browser] Fast-path detectó posible residual (${fp.reason}) — ejecutando enumeración completa.`);
const procs = findMcpChromeProcesses();

if (procs.length === 0) {
  log('[cleanup-mcp-browser] No hay procesos MCP Chromium residuales — nada que limpiar.');
  // Los lockfiles pueden ser huérfanos (proceso muerto sin limpiar). Removerlos.
  const removed = removeLockFiles(fp.candidateDirs || []);
  log(`[cleanup-mcp-browser] ${removed} lockfile(s) huérfano(s) removido(s) (${Date.now() - t0}ms).`);
  process.exit(0);
}

log(`[cleanup-mcp-browser] ${procs.length} proceso(s) MCP Chromium detectado(s):`);
const uniqueDirs = new Set();
let killed = 0;
for (const p of procs) {
  const tag = p.userDataDir ? ` (profile: ${path.basename(p.userDataDir)})` : '';
  log(`  PID ${p.pid}${tag}`);
  if (p.userDataDir) uniqueDirs.add(p.userDataDir);
  if (!DRY_RUN && killProcess(p.pid)) killed++;
}

if (!DRY_RUN && killed > 0) {
  // Pausa corta para que el OS libere los handles antes de tocar locks
  const waitMs = 500;
  execSync(process.platform === 'win32'
    ? `powershell.exe -NoProfile -Command "Start-Sleep -Milliseconds ${waitMs}"`
    : `sleep 0.5`, { stdio: 'ignore', timeout: 3000 });
}

const removed = removeLockFiles([...uniqueDirs]);
const ms = Date.now() - t0;
log(`[cleanup-mcp-browser] Done — killed=${killed} locks_removed=${removed} duration=${ms}ms${DRY_RUN ? ' [DRY-RUN]' : ''}`);
process.exit(0);
