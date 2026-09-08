'use strict';

/**
 * ATF — paths.js
 *
 * Resolver centralizado de rutas del framework. Los scripts bajo .claude/tools/
 * y .claude/dashboard/ pueden importar desde aquí en lugar de hardcodear paths.
 * Esto permite mover la estructura sin romper scripts.
 *
 * Uso:
 *   const P = require('./lib/paths.js');
 *   const runsIndex = path.join(P.OUTPUT, 'runs_index.json');
 *
 * PROJECT_ROOT sube 3 niveles desde este archivo
 * (.claude/tools/lib → .claude/tools → .claude → root).
 */

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CLAUDE_ROOT  = path.join(PROJECT_ROOT, '.claude');

// MERGE-TIME aplicado: al fusionar con el template ASDD, el estado del framework ATF Web
// (runs, config, knowledge, requirements) vive bajo docs/testing/atf-web/ para ser espejo
// del pipeline API (docs/testing/atf/). agent-memory/ permanece en .claude/agent-memory/.
const ATF_WEB = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web');

module.exports = {
  PROJECT_ROOT,
  CLAUDE_ROOT,
  ATF_WEB,

  AGENTS:               path.join(CLAUDE_ROOT, 'agents'),
  SKILLS:               path.join(CLAUDE_ROOT, 'skills'),
  COMMANDS:             path.join(CLAUDE_ROOT, 'commands'),
  HOOKS:                path.join(CLAUDE_ROOT, 'hooks'),
  RULES:                path.join(CLAUDE_ROOT, 'rules'),
  TOOLS:                path.join(CLAUDE_ROOT, 'tools'),

  KNOWLEDGE:            path.join(ATF_WEB, 'knowledge'),
  AGENT_MEMORY:         path.join(CLAUDE_ROOT, 'agent-memory'),

  CONFIG:               path.join(ATF_WEB, 'config'),
  APP_YAML:             path.join(ATF_WEB, 'config', 'appweb.yaml'),
  CONFIG_YAML:          path.join(ATF_WEB, 'config', 'config.yaml'),
  CREDENTIALS_YAML:     path.join(ATF_WEB, 'config', 'credentials.yaml'),

  REQUIREMENTS:         path.join(ATF_WEB, 'requirements'),

  OUTPUT:               ATF_WEB,
  RUNS_INDEX:           path.join(ATF_WEB, 'runs_index.json'),

  DASHBOARD:            path.join(CLAUDE_ROOT, 'dashboard'),
  DOCS:                 path.join(PROJECT_ROOT, 'docs'),
  DECISIONS:            path.join(PROJECT_ROOT, 'docs', 'atf-web', 'decisions'),
};
