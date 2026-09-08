'use strict';

/**
 * ATF v2 — db-config-resolver.js
 *
 * Resolución de configuración de BD para el pipeline. Extraído de
 * session-context.js (refactor SOLID/KISS T2.1) para mantener el DAO puro.
 *
 * Responsabilidad única: dado el nombre de la app, el ambiente y la sección
 * test_run de appweb.yaml, leer credentials.yaml + db_tables_registry.{app}.yaml
 * y devolver un `db_config` único o `null` si la feature está off.
 *
 * Contrato:
 *   resolveDbConfig(appName, appEnvironment, testRun) → { db_config: object|null }
 *
 * El objeto `db_config` (si no null) incluye:
 *   - host, port, name, username, password, driver, options  ← credentials.yaml
 *   - registry_path                                           ← path relativo al registry YAML
 *
 * La feature está OFF (retorna null) cuando:
 *   - db_tables_registry.{app}.yaml no existe
 *   - registry.enabled !== true
 *   - credentials.yaml no existe
 *   - credentials.database.{env} falta o tiene campos vacíos/placeholder
 *
 * Garantía de silencio: cualquier falla del resolver (parseo YAML, I/O) devuelve
 * feature off — nunca lanza hacia el caller. Apps sin BD (SauceDemo) no ven ruido.
 */

const fs   = require('fs');
const path = require('path');

const { readYaml } = require('./yaml-minimal');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CREDS_YAML   = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config', 'credentials.yaml');

/**
 * @param {string} appName           — appweb.yaml → app.name
 * @param {string} appEnvironment    — appweb.yaml → app.environment
 * @param {object} testRun           — appweb.yaml → test_run (puede ser undefined)
 * @returns {{ db_config: object|null }}
 */
function resolveDbConfig(appName, appEnvironment, testRun) {
  const off = { db_config: null };

  // Registry path: default per-app; override explícito vía test_run.db_registry_path (legacy — se mantiene por retrocompat)
  const registryOverride = testRun && testRun.db_registry_path;
  const registryAbs = registryOverride
    ? (path.isAbsolute(registryOverride) ? registryOverride : path.join(PROJECT_ROOT, registryOverride))
    : path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config', `db_tables_registry.${appName}.yaml`);

  if (!fs.existsSync(registryAbs)) return off;

  let registry;
  try { registry = readYaml(registryAbs); } catch { return off; }
  if (!registry || registry.enabled !== true) return off;

  if (!fs.existsSync(CREDS_YAML)) return off;
  let creds;
  try { creds = readYaml(CREDS_YAML); } catch { return off; }

  const dbCfg = creds && creds.database && creds.database[appEnvironment];
  if (!dbCfg) return off;

  const required = ['host', 'name', 'username', 'password'];
  for (const k of required) {
    const v = dbCfg[k];
    if (v === undefined || v === null || v === '' || (typeof v === 'string' && v.includes('REEMPLAZAR'))) {
      return off;
    }
  }

  // registry_path se persiste como relativo al PROJECT_ROOT para portabilidad
  // (los runs se comparten entre máquinas con distintos PROJECT_ROOT absolutos).
  const registryRel = path.relative(PROJECT_ROOT, registryAbs).replace(/\\/g, '/');

  return {
    db_config: {
      host: dbCfg.host,
      port: dbCfg.port || 1433,
      name: dbCfg.name,
      username: dbCfg.username,
      password: dbCfg.password,
      driver: dbCfg.driver || 'mssql',
      options: dbCfg.options || {},
      registry_path: registryRel,
    },
  };
}

module.exports = { resolveDbConfig };
