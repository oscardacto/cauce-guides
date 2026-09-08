#!/usr/bin/env node
/**
 * batch-evidence-copy.js — Copia múltiples screenshots PNG desde sus ubicaciones
 * temporales (ej. .playwright-mcp/) a los evidence dirs canónicos del run.
 * Diseñado para el modo MCP donde `browser_take_screenshot` guarda PNGs al CWD
 * del proyecto y el agente no recibe base64.
 *
 * Uso:
 *   node .claude/tools/batch-evidence-copy.js '<json_array>'
 *
 * Donde <json_array> es un JSON stringificado con la forma:
 *   [
 *     { "src": ".playwright-mcp/page-2026-04-21T20-46-17-387Z.png",
 *       "dst": "docs/testing/atf-web/RUN/execution/auth/001/evidence_01.png" },
 *     { "src": ".playwright-mcp/page-2026-04-21T20-46-42-164Z.png",
 *       "dst": "docs/testing/atf-web/RUN/execution/auth/001/evidence_02.png" }
 *   ]
 *
 * Alternativa (para payloads grandes):
 *   node .claude/tools/batch-evidence-copy.js --stdin
 *   (lee el JSON de stdin)
 *
 * Exit codes:
 *   0  — todos los PNGs copiados correctamente
 *   1  — error de argumento / JSON inválido
 *   2  — al menos un PNG falló (los demás se copiaron)
 *
 * Comportamiento:
 *   - Copia src → dst (binario)
 *   - Valida que dst >= 100 bytes post-copia
 *   - Crea directorios intermedios del dst automáticamente (mkdirSync recursive)
 *   - Paths se validan contra path traversal
 *   - Limpia (elimina) archivos src tras copia exitosa para evitar acumulación en CWD
 */
'use strict';

const fs = require('fs');
const path = require('path');

function main() {
  let raw;

  if (process.argv.includes('--stdin')) {
    raw = fs.readFileSync(0, 'utf8');
  } else if (process.argv.length >= 3 && process.argv[2] !== '--stdin') {
    raw = process.argv[2];
  } else {
    process.stderr.write('Usage: batch-evidence-copy.js \'<json_array>\' | --stdin\n');
    process.exit(1);
  }

  let entries;
  try {
    entries = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`[batch-evidence-copy] JSON parse error: ${e.message}\n`);
    process.exit(1);
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    process.stderr.write('[batch-evidence-copy] Input must be a non-empty array\n');
    process.exit(1);
  }

  const cwd = process.cwd();
  let copied = 0;
  let cleaned = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const src = entry && entry.src;
    const dst = entry && entry.dst;

    if (!src || typeof src !== 'string') {
      errors.push({ index: i, error: 'missing or invalid src' });
      failed++;
      continue;
    }

    if (!dst || typeof dst !== 'string') {
      errors.push({ index: i, src, error: 'missing or invalid dst' });
      failed++;
      continue;
    }

    // Path traversal guard for dst. `relative()` es la forma correcta de
    // verificar contención: startsWith(cwd) sin separador de cierre deja pasar
    // un directorio hermano cuyo nombre empieza igual (ej. "cwd-otro").
    const resolvedDst = path.resolve(dst);
    const relToCwd = path.relative(cwd, resolvedDst);
    const isInsideCwd = !relToCwd.startsWith('..') && !path.isAbsolute(relToCwd);
    if (!isInsideCwd && !resolvedDst.includes(path.sep + 'output' + path.sep)) {
      errors.push({ index: i, src, dst, error: 'dst path traversal rejected' });
      failed++;
      continue;
    }

    // Resolve src (relative to cwd)
    const resolvedSrc = path.resolve(src);

    // Verify src exists
    if (!fs.existsSync(resolvedSrc)) {
      errors.push({ index: i, src, dst, error: 'src file not found' });
      failed++;
      continue;
    }

    try {
      // Verify src is reasonable size
      const srcStat = fs.statSync(resolvedSrc);
      if (srcStat.size < 100) {
        errors.push({ index: i, src, dst, error: `src file too small: ${srcStat.size} bytes` });
        failed++;
        continue;
      }

      // Create dst directory
      const dstDir = path.dirname(resolvedDst);
      fs.mkdirSync(dstDir, { recursive: true });

      // Copy file
      fs.copyFileSync(resolvedSrc, resolvedDst);

      // Verify dst on disk
      const dstStat = fs.statSync(resolvedDst);
      if (dstStat.size < 100) {
        errors.push({ index: i, src, dst, error: `copied file too small: ${dstStat.size} bytes` });
        failed++;
        continue;
      }

      copied++;

      // Cleanup: remove src file from CWD to prevent orphan accumulation
      try {
        fs.unlinkSync(resolvedSrc);
        cleaned++;
      } catch (_) {
        // Non-fatal: copy succeeded even if cleanup fails
      }
    } catch (e) {
      errors.push({ index: i, src, dst, error: e.message });
      failed++;
    }
  }

  const summary = { total: entries.length, copied, cleaned, failed };
  if (errors.length > 0) summary.errors = errors;

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(failed > 0 ? 2 : 0);
}

main();
