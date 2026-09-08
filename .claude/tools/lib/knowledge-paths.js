'use strict';

/**
 * ATF — knowledge-paths.js
 *
 * Helper centralizado para resolver paths de knowledge + agent-memory per-app.
 * La app actual se lee de `docs/testing/atf-web/config/appweb.yaml` (app.name) y se cachea.
 *
 * Regla arquitectónica:
 *   - `docs/testing/atf-web/knowledge/` → SOLO doctrina extraída por-app (app_behavior.{APP}.md,
 *     test_gotchas.{APP}.md). Un solo formato: sufijado por app.
 *   - `.claude/agent-memory/{APP}/` → registros operacionales, recetas, memoria
 *     específica de cada app.
 *
 * Uso:
 *   const P = require('./lib/knowledge-paths');
 *   const registry = P.agentMemoryFile('cp_registry.json');
 *   const behavior = P.appScopedKnowledge('app_behavior.md');
 *
 * El helper NO crea archivos — solo resuelve paths. El caller decide leer/escribir.
 */

const fs   = require('fs');
const path = require('path');
const { readYaml } = require('./yaml-minimal');

const PROJECT_ROOT  = path.resolve(__dirname, '..', '..', '..');
const CLAUDE_ROOT   = path.join(PROJECT_ROOT, '.claude');
// MERGE-TIME ASDD: knowledge + config viven bajo docs/testing/atf-web/; agent-memory permanece en .claude/.
const ATF_WEB       = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web');
const KNOWLEDGE     = path.join(ATF_WEB, 'knowledge');
const AGENT_MEMORY  = path.join(CLAUDE_ROOT, 'agent-memory');
const APP_YAML      = path.join(ATF_WEB, 'config', 'appweb.yaml');

let _cachedAppName = null;

function getAppName(override) {
  if (override) return override;
  if (_cachedAppName) return _cachedAppName;
  try {
    const y = readYaml(APP_YAML);
    _cachedAppName = (y && y.app && y.app.name) ? y.app.name : 'generic';
  } catch {
    _cachedAppName = 'generic';
  }
  return _cachedAppName;
}

function appScopedKnowledge(basename, appNameOverride) {
  const app = getAppName(appNameOverride);
  const dot = basename.lastIndexOf('.');
  if (dot === -1) return path.join(KNOWLEDGE, `${basename}.${app}`);
  const name = basename.slice(0, dot);
  const ext  = basename.slice(dot + 1);
  return path.join(KNOWLEDGE, `${name}.${app}.${ext}`);
}

function agentMemoryFile(basename, appNameOverride) {
  const app = getAppName(appNameOverride);
  return path.join(AGENT_MEMORY, app, basename);
}

function agentMemoryDir(appNameOverride) {
  return path.join(AGENT_MEMORY, getAppName(appNameOverride));
}

function exists(absPath) {
  return fs.existsSync(absPath);
}

function ensureAppMemoryDir(appNameOverride) {
  const dir = agentMemoryDir(appNameOverride);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Solo para testing / reset explícito del cache
function _resetCache() {
  _cachedAppName = null;
}

module.exports = {
  PROJECT_ROOT,
  CLAUDE_ROOT,
  KNOWLEDGE,
  AGENT_MEMORY,
  getAppName,
  appScopedKnowledge,
  agentMemoryFile,
  agentMemoryDir,
  exists,
  ensureAppMemoryDir,
  _resetCache,
};
