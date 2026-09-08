#!/usr/bin/env node
/**
 * ATF v2 — db-query.js
 *
 * CLI unificado para ejecutar queries de lectura contra una BD. Invocado por
 * `sofka-asdd-atf-web-db-validator` durante Fase 2C (PASO 3.5 del executor) para verificar
 * persistencia post-paso o lecturas contextuales.
 *
 * Solo-lectura: el script rechaza cualquier query que no empiece con SELECT|WITH.
 * La elección del driver se hace por `credentials.yaml → database.{env}.driver`,
 * despachando a `.claude/tools/db-adapters/{driver}-adapter.js`.
 *
 * Uso:
 *   node .claude/tools/db-query.js \
 *     --query "SELECT ID_Incidente, Fecha_Cierre FROM SIO_Bitacora_Incidentes WHERE ID_Incidente = 1234" \
 *     --env qa \
 *     --output path/to/db_evidence_01.json
 *
 * Flags:
 *   --query   <sql>   Query SELECT a ejecutar (requerido).
 *   --env     <name>  Ambiente de BD en credentials.yaml (default: qa).
 *   --output  <path>  Ruta donde escribir el resultado JSON (requerido).
 *   --timeout <ms>    Timeout del query en ms (default: 10000).
 *
 * Salida JSON (db_evidence_*.json):
 * {
 *   "query":       "SELECT ...",
 *   "env":         "qa",
 *   "driver":      "mssql",
 *   "executed_at": "2026-04-23T17:15:00.000Z",
 *   "duration_ms": 245,
 *   "row_count":   1,
 *   "columns":     ["ID_Incidente", "Fecha_Cierre", ...],
 *   "rows":        [{ "ID_Incidente": 1234, "Fecha_Cierre": "2026-04-23T17:00:00" }],
 *   "error":       null
 * }
 *
 * Exit codes:
 *   0 → query ejecutado (puede tener 0 filas — no es error)
 *   1 → error de conexión, query, o adapter
 *   2 → error de configuración (credentials no encontrado, env no existe, adapter ausente)
 *   3 → query no es SELECT (rechazado por seguridad)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { readYaml } = require('./lib/yaml-minimal');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_DIR   = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config');
const CREDS_PATH   = path.join(CONFIG_DIR, 'credentials.yaml');
const ADAPTERS_DIR = path.join(__dirname, 'db-adapters');

/* ─── Arg parsing ────────────────────────────────────────────────────────── */

const rawArgs = process.argv.slice(2);

function getArg(name) {
  const idx = rawArgs.indexOf(name);
  return idx !== -1 && rawArgs[idx + 1] ? rawArgs[idx + 1] : null;
}

const QUERY      = getArg('--query');
const ENV        = getArg('--env') || 'qa';
const OUTPUT     = getArg('--output');
const TIMEOUT_MS = parseInt(getArg('--timeout') || '10000', 10);

/* ─── Helpers de output ─────────────────────────────────────────────────── */

function buildResult(extra) {
  return Object.assign({
    query:       QUERY,
    env:         ENV,
    driver:      null,
    executed_at: new Date().toISOString(),
    duration_ms: 0,
    row_count:   0,
    columns:     [],
    rows:        [],
    error:       null,
  }, extra || {});
}

function writeOutput(data) {
  if (!OUTPUT) return;
  try {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`❌  No se pudo escribir el output: ${e.message}`);
  }
}

/* ─── Validaciones iniciales ─────────────────────────────────────────────── */

if (!QUERY) {
  console.error('❌  --query es requerido');
  process.exit(2);
}

if (!OUTPUT) {
  console.error('❌  --output es requerido');
  process.exit(2);
}

// Seguridad: solo SELECT o WITH (CTE)
const queryTrimmed = QUERY.trim().toUpperCase();
if (!queryTrimmed.startsWith('SELECT') && !queryTrimmed.startsWith('WITH')) {
  const result = buildResult({
    error: { code: 'QUERY_NOT_SELECT',
             message: 'Solo se permiten queries SELECT o WITH (CTE). El framework no ejecuta escrituras en BD.' },
  });
  writeOutput(result);
  console.error('❌  Query rechazado: solo SELECT está permitido');
  process.exit(3);
}

/* ─── Cargar credenciales ────────────────────────────────────────────────── */

function loadDbConfig(env) {
  if (!fs.existsSync(CREDS_PATH)) {
    throw { code: 'CREDENTIALS_NOT_FOUND',
      message: `credentials.yaml no encontrado en: ${CREDS_PATH}` };
  }

  const parsed = readYaml(CREDS_PATH);
  if (!parsed || !parsed.database || !parsed.database[env]) {
    throw { code: 'ENV_NOT_FOUND',
      message: `No existe configuración database.${env} en credentials.yaml` };
  }

  const cfg = parsed.database[env];
  const required = ['host', 'name', 'username', 'password'];
  for (const field of required) {
    const v = cfg[field];
    if (v === undefined || v === null || v === '' || (typeof v === 'string' && v.includes('REEMPLAZAR'))) {
      throw { code: 'CREDENTIALS_INCOMPLETE',
        message: `credentials.yaml → database.${env}.${field} no está configurado` };
    }
  }

  return cfg;
}

/* ─── Cargar adapter ─────────────────────────────────────────────────────── */

function loadAdapter(driver) {
  const adapterFile = path.join(ADAPTERS_DIR, `${driver}-adapter.js`);
  if (!fs.existsSync(adapterFile)) {
    throw { code: 'ADAPTER_NOT_FOUND',
      message: `Adapter no encontrado: ${adapterFile}. Drivers soportados: mssql | mock. Otros drivers (postgres, mysql) disponibles bajo demanda — implementar db-adapters/{driver}-adapter.js con interfaz executeQuery(query, config, timeoutMs).` };
  }
  return require(adapterFile);
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

async function main() {
  let dbConfig;
  try {
    dbConfig = loadDbConfig(ENV);
  } catch (e) {
    const result = buildResult({ error: { code: e.code || 'CONFIG_ERROR', message: e.message } });
    writeOutput(result);
    console.error(`❌  ${e.message}`);
    process.exit(2);
  }

  const driver = dbConfig.driver || 'mssql';
  let adapter;
  try {
    adapter = loadAdapter(driver);
  } catch (e) {
    const result = buildResult({ driver, error: { code: e.code, message: e.message } });
    writeOutput(result);
    console.error(`❌  ${e.message}`);
    process.exit(2);
  }

  // Inyectar el ambiente en la config (útil para adapters que lo requieran, ej. logs por env)
  dbConfig.environment = ENV;

  let adapterResult;
  try {
    adapterResult = await adapter.executeQuery(QUERY, dbConfig, TIMEOUT_MS);
  } catch (e) {
    const result = buildResult({ driver, error: { code: 'ADAPTER_UNCAUGHT', message: e.message } });
    writeOutput(result);
    console.error(`❌  Adapter error: ${e.message}`);
    process.exit(1);
  }

  const result = buildResult({
    driver,
    duration_ms: adapterResult.duration_ms || 0,
    row_count:   adapterResult.row_count   || 0,
    columns:     adapterResult.columns     || [],
    rows:        adapterResult.rows        || [],
    error:       adapterResult.error       || null,
  });

  writeOutput(result);

  if (result.error) {
    console.error(`❌  Error ejecutando query: ${result.error.message}`);
    process.exit(1);
  } else {
    console.log(`✅  Query ejecutado (${driver}) — ${result.row_count} fila(s) en ${result.duration_ms}ms → ${OUTPUT}`);
    process.exit(0);
  }
}

main().catch(err => {
  const result = buildResult({ error: { code: 'UNEXPECTED_ERROR', message: err.message } });
  writeOutput(result);
  console.error('❌  Error inesperado:', err.message);
  process.exit(1);
});
