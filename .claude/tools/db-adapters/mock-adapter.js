'use strict';
/**
 * ATF v2 — db-adapters/mock-adapter.js
 *
 * Adapter sintético para smoke tests end-to-end sin BD real (ej. SauceDemo).
 * Lee "tablas" desde un fixture JSON y responde queries SELECT como si fuera
 * una BD real. Implementa la misma interfaz que mssql-adapter.js.
 *
 * Fixture:
 *   Path: docs/testing/atf-web/config/mock_fixtures/{env}.json
 *   Forma: { "tableName": [ {col1: ..., col2: ...}, ... ] }
 *
 * El "env" se toma de `dbConfig.environment` (inyectado por db-query.js).
 *
 * Alcance del parser SQL-lite (suficiente para asdd-atf-web-db-validator):
 *   - SELECT <cols|*> FROM <table> [WHERE <col> = '<val>']
 *   - SELECT COUNT(*) AS total, <group_col> FROM <table> [WHERE <col> = '<val>'] GROUP BY <group_col>
 *   - <val> puede ser string con/sin comillas, número o identificador.
 *
 * No soporta: JOIN, subqueries, multi-WHERE, LIKE, IN. Si algún query pasa
 * algo más complejo → el adapter retorna 0 filas sin error (fail-soft).
 *
 * Seguridad: nunca escribe en disco. Nunca ejecuta SQL real. Solo lectura
 * de JSON local. Si el fixture no existe, retorna 0 filas + warning en error.code.
 */

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadFixture(env) {
  const fixturePath = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config', 'mock_fixtures', `${env}.json`);
  if (!fs.existsSync(fixturePath)) {
    return { fixture: null, fixturePath, error: `Fixture no encontrado: ${fixturePath}` };
  }
  try {
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Quitar claves meta que empiecen con "_"
    const fixture = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!k.startsWith('_')) fixture[k] = v;
    }
    return { fixture, fixturePath, error: null };
  } catch (e) {
    return { fixture: null, fixturePath, error: `Fixture corrupto: ${e.message}` };
  }
}

/**
 * Parser SQL-lite — extrae tabla, WHERE simple, columnas seleccionadas, GROUP BY.
 * Retorna null si el query no matchea los patrones soportados.
 */
function parseQuery(query) {
  const q = query.trim().replace(/\s+/g, ' ');

  // Capturar columnas del SELECT (antes del FROM)
  const selectMatch = q.match(/^SELECT\s+(.+?)\s+FROM\s+([A-Za-z0-9_.\[\]"]+)/i);
  if (!selectMatch) return null;
  const columnsRaw = selectMatch[1].trim();
  const table = selectMatch[2].replace(/[\[\]"`]/g, '');

  // Detectar COUNT(*) AS total, <group>
  const countMatch = columnsRaw.match(/COUNT\s*\(\s*\*\s*\)\s+AS\s+(\w+)(?:\s*,\s*(.+))?/i);
  const isCount = !!countMatch;
  const countAlias = isCount ? countMatch[1] : null;
  const groupCol = isCount && countMatch[2] ? countMatch[2].trim() : null;

  // Columnas explícitas (no-COUNT)
  let columns = null; // null = SELECT *
  if (!isCount) {
    if (columnsRaw !== '*') {
      columns = columnsRaw.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    }
  }

  // WHERE simple
  const whereMatch = q.match(/\bWHERE\s+([A-Za-z0-9_]+)\s*=\s*('([^']*)'|"([^"]*)"|([^\s)]+))/i);
  let where = null;
  if (whereMatch) {
    const val = whereMatch[3] ?? whereMatch[4] ?? whereMatch[5];
    where = { column: whereMatch[1], value: val };
  }

  // GROUP BY (si no vino del COUNT)
  const groupByMatch = q.match(/\bGROUP\s+BY\s+([A-Za-z0-9_]+)/i);
  const groupBy = groupByMatch ? groupByMatch[1] : groupCol;

  return { table, columns, where, isCount, countAlias, groupBy };
}

function applyWhere(rows, where) {
  if (!where) return rows;
  return rows.filter(r => {
    const cell = r[where.column];
    if (cell === undefined || cell === null) return false;
    // Comparación laxa: string vs string, number vs number
    return String(cell) === String(where.value);
  });
}

function projectColumns(rows, columns) {
  if (!columns) return rows; // SELECT *
  return rows.map(r => {
    const out = {};
    for (const c of columns) out[c] = r[c];
    return out;
  });
}

function groupCount(rows, groupCol, countAlias) {
  const buckets = new Map();
  for (const r of rows) {
    const key = r[groupCol];
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const out = [];
  for (const [key, count] of buckets.entries()) {
    const row = {};
    row[countAlias] = count;
    row[groupCol] = key;
    out.push(row);
  }
  return out;
}

/**
 * Interfaz común de adapters.
 */
module.exports.executeQuery = async function executeQuery(query, dbConfig, _timeoutMs) {
  const start = Date.now();
  const env = dbConfig.environment || 'qa';
  const { fixture, fixturePath, error: loadErr } = loadFixture(env);

  if (loadErr) {
    return {
      rows: [], row_count: 0, columns: [],
      duration_ms: Date.now() - start,
      error: { code: 'MOCK_FIXTURE_NOT_FOUND', message: `${loadErr}. Crear fixture para ejercitar el flujo BD.` },
    };
  }

  const parsed = parseQuery(query);
  if (!parsed) {
    return {
      rows: [], row_count: 0, columns: [],
      duration_ms: Date.now() - start,
      error: { code: 'MOCK_QUERY_UNSUPPORTED', message: `mock-adapter no pudo parsear el query. Patrones soportados: SELECT ... FROM t [WHERE c=v]; SELECT COUNT(*) AS total, g FROM t [WHERE c=v] GROUP BY g.` },
    };
  }

  const tableRows = fixture[parsed.table];
  if (!Array.isArray(tableRows)) {
    return {
      rows: [], row_count: 0, columns: [],
      duration_ms: Date.now() - start,
      error: { code: 'MOCK_TABLE_NOT_IN_FIXTURE', message: `Tabla "${parsed.table}" no existe en ${fixturePath}. Agrégala al fixture como array de objetos.` },
    };
  }

  let filtered = applyWhere(tableRows, parsed.where);
  let projected;

  if (parsed.isCount) {
    projected = groupCount(filtered, parsed.groupBy, parsed.countAlias);
  } else {
    projected = projectColumns(filtered, parsed.columns);
  }

  const columns = projected.length > 0 ? Object.keys(projected[0]) : (parsed.columns || []);

  return {
    rows: projected,
    row_count: projected.length,
    columns,
    duration_ms: Date.now() - start,
    error: null,
  };
};
