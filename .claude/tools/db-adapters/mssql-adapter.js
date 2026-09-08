'use strict';
/**
 * ATF v2 — db-adapters/mssql-adapter.js
 *
 * Adapter para SQL Server (Microsoft SQL Server / Azure SQL Database).
 * Usa el driver oficial `mssql` (https://www.npmjs.com/package/mssql).
 *
 * Interfaz (común a todos los adapters):
 *   async executeQuery(query: string, dbConfig: object, timeoutMs: number)
 *     → { rows, row_count, columns, duration_ms, error | null }
 *
 * Contrato de seguridad: `db-query.js` ya validó que el query empieza con SELECT|WITH.
 * El adapter NUNCA loguea credenciales — solo el host en errores, si aplica.
 */

const PROJECT_ROOT = require('path').resolve(__dirname, '..', '..', '..');

module.exports.executeQuery = async function executeQuery(query, dbConfig, timeoutMs) {
  // Carga perezosa del driver — permite que el pipeline arranque sin mssql
  // instalado cuando la app no usa BD (ej: SauceDemo).
  let sql;
  try {
    sql = require('mssql');
  } catch {
    return {
      rows: [],
      row_count: 0,
      columns: [],
      duration_ms: 0,
      error: {
        code: 'MSSQL_NOT_INSTALLED',
        message: 'Paquete mssql no instalado. Ejecutar: npm install (desde la raíz del proyecto).',
      },
    };
  }

  const opts = dbConfig.options || {};
  const sqlConfig = {
    server:   dbConfig.host,
    port:     dbConfig.port || 1433,
    database: dbConfig.name,
    user:     dbConfig.username,
    password: dbConfig.password,
    options: {
      encrypt:                opts.encrypt !== false,
      trustServerCertificate: opts.trust_server_certificate !== false,
      connectTimeout:         opts.connection_timeout || 15000,
      requestTimeout:         timeoutMs,
      enableArithAbort:       true,
    },
  };

  const start = Date.now();
  let pool = null;

  try {
    pool = await sql.connect(sqlConfig);
    const request = pool.request();
    request.timeout = timeoutMs;

    const result = await request.query(query);
    const rows    = result.recordset || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      rows,
      row_count: rows.length,
      columns,
      duration_ms: Date.now() - start,
      error: null,
    };
  } catch (e) {
    return {
      rows: [],
      row_count: 0,
      columns: [],
      duration_ms: Date.now() - start,
      error: {
        code:    e.code || 'QUERY_ERROR',
        message: e.message,
        number:  e.number || null,
        state:   e.state  || null,
      },
    };
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
};
