#!/usr/bin/env node
/**
 * setup-app.js — Alista una nueva app en el ATF en una sola invocación.
 *
 * Reemplaza el flujo manual (4-6 archivos editados a mano) por un script
 * atómico que renderiza templates desde `docs/testing/atf-web/config/templates/` y
 * crea toda la estructura per-app.
 *
 * Filosofía: doctrina prosa-vs-código aplicada.
 *   - El cuestionario interactivo lo conduce el LLM (decisión contextual).
 *   - La escritura de archivos la hace este script (validador determinístico).
 *
 * Uso:
 *   node setup-app.js \
 *     --app-name "OrangeHRM" \
 *     --app-url "https://opensource-demo.orangehrmlive.com/" \
 *     --environment "demo" \
 *     --default-role "admin" \
 *     --mfa-type "" \
 *     --db-driver "" \
 *     --description "App demo de RRHH para validación end-to-end" \
 *     --notebooklm-id "" \
 *     --matrix-format "generic"
 *
 * Outputs (8-10 archivos):
 *   docs/testing/atf-web/config/appweb.yaml                              (sobrescribe; backup auto)
 *   docs/testing/atf-web/config/credentials.yaml                      (merge con existente o crea)
 *   docs/testing/atf-web/config/db_tables_registry.{app_name}.yaml   (solo si has_database)
 *   .claude/agent-memory/{app_name}/cp_index.json
 *   .claude/agent-memory/{app_name}/cp_registry.json
 *   .claude/agent-memory/{app_name}/module_verdicts.json
 *   .claude/agent-memory/{app_name}/navigation_map.json
 *   docs/testing/atf-web/knowledge/app_behavior.{app_name}.md         (placeholder con marker)
 *   docs/testing/atf-web/knowledge/test_gotchas.{app_name}.md         (placeholder con marker)
 *
 * Backup automático: si `appweb.yaml` ya existe, lo respalda a
 *   `docs/testing/atf-web/config/app {APP_NAME_actual}.yaml` antes de sobrescribir
 *   (preserva el patrón consciente del QA de tener plantillas con espacio).
 *
 * Exit codes:
 *   0 — OK, JSON consolidado en stdout con files_created[] + next_steps[]
 *   1 — error fatal (template ausente, args inválidos, escritura falló)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { readYaml } = require('./lib/yaml-minimal');

const TEMPLATES_DIR = path.resolve('docs/testing/atf-web/config/templates');
const CONFIG_DIR    = path.resolve('docs/testing/atf-web/config');
const KNOWLEDGE_DIR = path.resolve('docs/testing/atf-web/knowledge');
const MEMORY_DIR    = path.resolve('.claude/agent-memory');
const REQUIREMENTS_CTX_DIR = path.resolve('docs/testing/atf-web/requirements/context');

function die(msg, code = 1) {
  process.stderr.write(`[setup-app] FATAL: ${msg}\n`);
  process.exit(code);
}

function toForwardSlashes(p) {
  return p.replace(/\\/g, '/');
}

function parseArgs() {
  const out = {
    appName: null,
    appUrl: null,
    environment: 'qa',
    defaultRole: null,
    mfaType: '',
    dbDriver: '',
    description: '',
    notebooklmId: '',
    matrixFormat: 'generic',
    force: false,
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    if (a === '--app-name')             out.appName       = next();
    else if (a === '--app-url')         out.appUrl        = next();
    else if (a === '--environment')     out.environment   = next();
    else if (a === '--default-role')    out.defaultRole   = next();
    else if (a === '--mfa-type')        out.mfaType       = next();
    else if (a === '--db-driver')       out.dbDriver      = next();
    else if (a === '--description')     out.description   = next();
    else if (a === '--notebooklm-id')   out.notebooklmId  = next();
    else if (a === '--matrix-format')   out.matrixFormat  = next();
    else if (a === '--force')           out.force         = true;
  }
  if (!out.appName)     die('--app-name es obligatorio');
  if (!out.appUrl)      die('--app-url es obligatorio');
  if (!out.defaultRole) die('--default-role es obligatorio');
  // Sanitización del app_name (sin espacios ni caracteres especiales)
  if (!/^[A-Za-z0-9_-]+$/.test(out.appName)) {
    die(`--app-name debe ser alfanumérico (sin espacios). Recibido: "${out.appName}"`);
  }
  // Validar enums
  const validMfa = ['', 'manual_confirm', 'microsoft_authenticator', 'google_auth', 'totp'];
  if (!validMfa.includes(out.mfaType)) {
    die(`--mfa-type inválido: "${out.mfaType}". Valores: ${validMfa.join(' | ')}`);
  }
  const validDb = ['', 'mssql', 'postgres', 'mock'];
  if (!validDb.includes(out.dbDriver)) {
    die(`--db-driver inválido: "${out.dbDriver}". Valores: ${validDb.join(' | ')}`);
  }
  return out;
}

function readTemplate(name) {
  const p = path.join(TEMPLATES_DIR, name);
  if (!fs.existsSync(p)) die(`Template ausente: ${p}. Ejecuta git pull o restaura docs/testing/atf-web/config/templates/`);
  return fs.readFileSync(p, 'utf8');
}

function renderTemplate(template, vars) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

function buildDatabaseBlock(driver, env) {
  if (!driver) {
    return '# (sin BD — agregar el bloque `database:` aquí cuando aplique)';
  }
  // Schema canónico (CLAUDE.md): database.{env}.{driver,host,...}
  if (driver === 'mock') {
    return `database:
  ${env}:
    driver: "mock"
    host: "n/a"
    port: 0
    name: "n/a"
    username: "n/a"
    password: "n/a"
    options: {}
    # Fixtures: editar docs/testing/atf-web/config/mock_fixtures/${env}.json`;
  }
  return `database:
  ${env}:
    driver: "${driver}"
    host: "REPLACE_WITH_REAL_HOST"
    port: ${driver === 'mssql' ? 1433 : 5432}
    name: "REPLACE_WITH_DB_NAME"
    username: "REPLACE_WITH_READONLY_USER"
    password: "REPLACE_WITH_READONLY_PASSWORD"
    options: {}`;
}

function backupExistingAppYaml() {
  const appYamlPath = path.join(CONFIG_DIR, 'appweb.yaml');
  if (!fs.existsSync(appYamlPath)) return null;
  let currentName = 'unknown';
  try {
    const data = readYaml(appYamlPath);
    currentName = (data.app && data.app.name) || 'unknown';
  } catch (_) { /* corrupto — backup igual */ }
  // Patrón consciente del QA: archivos con espacio = plantillas guardadas
  const backupPath = path.join(CONFIG_DIR, `app ${currentName}.yaml`);
  fs.copyFileSync(appYamlPath, backupPath);
  return toForwardSlashes(path.relative(process.cwd(), backupPath));
}

function mergeCredentials(args) {
  const credsPath = path.join(CONFIG_DIR, 'credentials.yaml');
  const credsTemplate = readTemplate('credentials.yaml.template');

  // Si credentials.yaml ya existe Y tiene el rol → no tocar (preservar contraseñas reales)
  if (fs.existsSync(credsPath)) {
    try {
      const existing = readYaml(credsPath) || {};
      // Schema canónico (CLAUDE.md): environments.{env}.roles.{role}
      const canonicalRole = existing.environments?.[args.environment]?.roles?.[args.defaultRole];
      // Schema legacy : roles.{role} sin wrapper de entorno
      const legacyRole = existing.roles?.[args.defaultRole];
      if (canonicalRole || legacyRole) {
        return { path: credsPath, action: 'preserved', backup: null };
      }
    } catch (_) { /* archivo corrupto, regenerar */ }
    // Backup antes de sobrescribir
    const backupPath = path.join(CONFIG_DIR, `credentials.${Date.now()}.yaml.bak`);
    fs.copyFileSync(credsPath, backupPath);
  }

  // Renderizar desde template
  const rendered = renderTemplate(credsTemplate, {
    APP_NAME: args.appName,
    APP_ENVIRONMENT: args.environment,
    TIMESTAMP_ISO: new Date().toISOString(),
    DEFAULT_ROLE: args.defaultRole,
    ROLE_USERNAME_PLACEHOLDER: 'REPLACE_WITH_REAL_USERNAME',
    ROLE_PASSWORD_PLACEHOLDER: 'REPLACE_WITH_REAL_PASSWORD',
    DATABASE_BLOCK: buildDatabaseBlock(args.dbDriver, args.environment),
  });
  fs.writeFileSync(credsPath, rendered, 'utf8');
  return { path: credsPath, action: 'created', backup: null };
}

function writeAppYaml(args, backupPath) {
  const tmpl = readTemplate('appweb.yaml.template');
  const rendered = renderTemplate(tmpl, {
    APP_NAME: args.appName,
    APP_URL: args.appUrl,
    APP_ENVIRONMENT: args.environment,
    APP_DESCRIPTION: args.description || `App alistada por /sofka-asdd:qa-web-setup-app ${args.appName}`,
    DEFAULT_ROLE: args.defaultRole,
    MFA_TYPE: args.mfaType,
    MFA_SESSION_FILE: args.mfaType ? `docs/testing/atf-web/config/session_state_${args.environment}.json` : '',
    MFA_HEALTH_SELECTOR: args.mfaType ? '.user-menu' : '',
    NOTEBOOKLM_ENABLED: args.notebooklmId ? 'true' : 'false',
    NOTEBOOKLM_ID: args.notebooklmId,
    MATRIX_FORMAT: args.matrixFormat,
    TIMESTAMP_ISO: new Date().toISOString(),
  });
  const out = path.join(CONFIG_DIR, 'appweb.yaml');
  fs.writeFileSync(out, rendered, 'utf8');
  return out;
}

function writeDbRegistry(args) {
  if (!args.dbDriver) return null;
  const tmpl = readTemplate('db_tables_registry.template.yaml');
  const rendered = renderTemplate(tmpl, {
    APP_NAME: args.appName,
    TIMESTAMP_ISO: new Date().toISOString(),
  });
  const out = path.join(CONFIG_DIR, `db_tables_registry.${args.appName}.yaml`);
  fs.writeFileSync(out, rendered, 'utf8');
  return out;
}

function writeAgentMemory(args) {
  const dir = path.join(MEMORY_DIR, args.appName);
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  // Initial empty registries con shape mínimo
  // Fase 5 — `navigation_map.json` con schema canónico que el merge
  // espera (ver nav-learning.js: pages, last_run_id, updated_at). El campo
  // legacy `elements: []` se conserva por retrocompat con readers antiguos
  // (algunos checks históricos lo consultan); el merge nuevo escribe `pages{}`.
  // Sin esto, apps onboardeadas por setup-app antes de quedaban con
  // shape mínimo `{app_name, elements:[], last_updated:null}` y el primer
  // merge tenía que decidir si rebuild o respetar — comportamiento ambiguo.
  const seeds = {
    'cp_index.json':       { app_name: args.appName, total_cps: 0, by_module: {}, last_updated: null },
    'cp_registry.json':    { app_name: args.appName, cps: [], last_updated: null },
    'module_verdicts.json': { app_name: args.appName, modules: {}, last_updated: null, verdicts: [] },
    'navigation_map.json': {
      app_name:     args.appName,
      pages:        {},          // canónico — populado por nav-learning.js merge
      elements:     [],          // legacy — conservado por compat con readers antiguos
      updated_at:   null,
      last_run_id:  null,
      last_updated: null,        // legacy alias de updated_at
    },
  };
  for (const [name, content] of Object.entries(seeds)) {
    const fp = path.join(dir, name);
    if (!fs.existsSync(fp)) {
      fs.writeFileSync(fp, JSON.stringify(content, null, 2), 'utf8');
      files.push(fp);
    }
  }
  return files;
}

function writeKnowledgePlaceholders(args) {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  const tmpl = readTemplate('knowledge_skeleton.md.template');
  const files = [];
  const knowledgeFiles = [
    { name: `app_behavior.${args.appName}.md`, title: 'App Behavior' },
    { name: `test_gotchas.${args.appName}.md`, title: 'Test Gotchas' },
  ];
  for (const f of knowledgeFiles) {
    const fp = path.join(KNOWLEDGE_DIR, f.name);
    if (!fs.existsSync(fp)) {
      const rendered = renderTemplate(tmpl, {
        APP_NAME: args.appName,
        TIMESTAMP_ISO: new Date().toISOString(),
        KNOWLEDGE_TITLE: f.title,
      });
      fs.writeFileSync(fp, rendered, 'utf8');
      files.push(fp);
    }
  }
  return files;
}

function detectRequirementsContext() {
  if (!fs.existsSync(REQUIREMENTS_CTX_DIR)) return { count: 0, files: [] };
  const files = fs.readdirSync(REQUIREMENTS_CTX_DIR)
    .filter(n => /\.(md|txt|docx|pdf)$/i.test(n));
  return { count: files.length, files };
}

function relPath(absPath) {
  return toForwardSlashes(path.relative(process.cwd(), absPath));
}

function main() {
  const args = parseArgs();
  const filesCreated = [];

  // 1. Backup appweb.yaml existente (preserva patrón "app {Name}.yaml" del QA)
  const appBackup = backupExistingAppYaml();

  // 2. Renderizar y escribir archivos
  const appYamlPath = writeAppYaml(args);
  filesCreated.push(relPath(appYamlPath));

  const credsResult = mergeCredentials(args);
  if (credsResult.action === 'created') {
    filesCreated.push(relPath(credsResult.path) + ' (creado — editar con credenciales reales)');
  } else {
    filesCreated.push(relPath(credsResult.path) + ' (preservado — rol existente intacto)');
  }

  const dbRegistryPath = writeDbRegistry(args);
  if (dbRegistryPath) {
    filesCreated.push(relPath(dbRegistryPath));
  }

  const memoryFiles = writeAgentMemory(args);
  for (const f of memoryFiles) filesCreated.push(relPath(f));

  const knowledgeFiles = writeKnowledgePlaceholders(args);
  for (const f of knowledgeFiles) filesCreated.push(relPath(f));

  // 3. Detectar requirements/context/ para guidance
  const ctx = detectRequirementsContext();

  // 4. Construir next_steps
  const nextSteps = [];
  if (credsResult.action === 'created') {
    nextSteps.push(`Editar docs/testing/atf-web/config/credentials.yaml — sustituir REPLACE_WITH_REAL_USERNAME / PASSWORD del rol "${args.defaultRole}".`);
  }
  if (args.mfaType) {
    nextSteps.push(`MFA "${args.mfaType}" configurado: ejecutar \`node .claude/tools/save-session.js --env ${args.environment}\` para capturar storageState.`);
  }
  if (args.dbDriver && args.dbDriver !== 'mock') {
    nextSteps.push(`Editar credentials.yaml -> database con host/name/usuario REAL (solo lectura).`);
    nextSteps.push(`Editar docs/testing/atf-web/config/db_tables_registry.${args.appName}.yaml — descomentar y completar las tablas por módulo.`);
  }
  if (ctx.count > 0) {
    nextSteps.push(`Detectados ${ctx.count} archivo(s) en requirements/context/: ejecutar \`/sofka-asdd:qa-web-knowledge\` para extraer doctrina y reemplazar los placeholders.`);
  } else {
    nextSteps.push(`Cuando tengas docs funcionales (HUs, mapas, contratos), agrégalos a requirements/context/ y ejecuta \`/sofka-asdd:qa-web-knowledge\`.`);
  }
  nextSteps.push(`Ejecutar \`/sofka-asdd:qa-web-run\` para el primer ciclo de pruebas sobre ${args.appName}.`);

  // 5. Output JSON consolidado
  const summary = {
    ok: true,
    app_name: args.appName,
    app_url: args.appUrl,
    environment: args.environment,
    default_role: args.defaultRole,
    mfa_enabled: !!args.mfaType,
    db_enabled: !!args.dbDriver,
    matrix_format: args.matrixFormat,
    backup_of_previous_app_yaml: appBackup,
    files_created: filesCreated,
    requirements_context_detected: ctx.count,
    next_steps: nextSteps,
    setup_at: new Date().toISOString(),
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(0);
}

try { main(); }
catch (err) {
  process.stderr.write(`[setup-app] UNCAUGHT: ${err.message}\n${err.stack}\n`);
  process.exit(1);
}
