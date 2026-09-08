#!/usr/bin/env node
// run-suite.mjs — Ejecuta la suite completa de evals ASDD (62 configs / 223 tests).
// Cross-OS, sin dependencias npm (solo stdlib + npx promptfoo).
//
// Uso:
//   cd .claude/evals && node run-suite.mjs [--filter <substr>] [--concurrency N]
//
// Requiere: ANTHROPIC_API_KEY en el ambiente.
// Resultados: .results/<config>.json por archivo + resumen agregado en stdout.
// Exit code: 0 si todo pasó; 1 si hubo fallos o errores.

import { readdirSync, statSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATEGORIES = ['1-orchestrator', '2-agents', '3-skills', '4-workflow', '5-commands', '6-rules'];
const RESULTS = join(HERE, '.results');

const args = process.argv.slice(2);
const getFlag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const FILTER = getFlag('--filter', '');
const CONCURRENCY = getFlag('--concurrency', '4');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY no está definida en el ambiente.');
  process.exit(1);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (name.endsWith('.yaml')) yield full;
  }
}

const configs = [];
for (const cat of CATEGORIES) {
  const dir = join(HERE, cat);
  if (!existsSync(dir)) continue;
  for (const f of walk(dir)) {
    const rel = relative(HERE, f);
    const relPosix = rel.replaceAll('\\', '/');
    if (!FILTER || relPosix.includes(FILTER)) configs.push(rel);
  }
}

if (configs.length === 0) {
  console.error(`No se encontraron configs${FILTER ? ` con filtro "${FILTER}"` : ''}.`);
  process.exit(1);
}

mkdirSync(RESULTS, { recursive: true });
console.log(`Ejecutando ${configs.length} config(s), concurrencia ${CONCURRENCY} por config...\n`);

let totPass = 0, totFail = 0, totErr = 0;
const rows = [];

for (const cfg of configs) {
  const outName = cfg.replace(/\.yaml$/, '').replace(/[\\/]/g, '__') + '.json';
  const outPath = join(RESULTS, outName);
  process.stdout.write(`[run ] ${cfg} ... `);
  const r = spawnSync('npx', ['promptfoo', 'eval', '-c', cfg, '--no-cache', '-j', CONCURRENCY, '-o', outPath], {
    cwd: HERE,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 30 * 60 * 1000,
  });
  let pass = 0, fail = 0, err = 0;
  try {
    const stats = JSON.parse(readFileSync(outPath, 'utf8')).results.stats;
    pass = stats.successes ?? 0;
    fail = stats.failures ?? 0;
    err = stats.errors ?? 0;
  } catch {
    err = 1;
    console.log(`SIN RESULTADO (rc=${r.status})`);
    rows.push([cfg, '-', '-', 'parse-error']);
    totErr += 1;
    continue;
  }
  totPass += pass; totFail += fail; totErr += err;
  console.log(`pass=${pass} fail=${fail} err=${err}`);
  rows.push([cfg, pass, fail, err]);
}

const total = totPass + totFail + totErr;
console.log('\n=== RESUMEN SUITE ===');
console.log(`Configs: ${configs.length} | Tests: ${total}`);
console.log(`PASS: ${totPass} (${total ? Math.round((totPass / total) * 100) : 0}%) | FAIL: ${totFail} | ERROR: ${totErr}`);
console.log(`Resultados por archivo en: ${RESULTS}/`);

process.exit(totFail + totErr > 0 ? 1 : 0);
