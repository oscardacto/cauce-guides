#!/usr/bin/env node
/**
 * ATF — update-cp-registry.js
 *
 * Mantiene la SSoT cross-runs de los CPs diseñados en
 * `agent-memory/{app_name}/cp_registry.json` y `cp_index.json`.
 *
 * Antes (y previas): el agente design-team era responsable de invocar
 * `merge-registries.js` desde el PASO 4b. En la práctica el LLM saltaba el paso
 * (hallazgo A del — registry quedó en 0 CPs
 * pese a haberse diseñado 26 en `cp_modulo_job-titles.json`).
 *
 * Solución: mover la responsabilidad al comando `/asdd:qa-web-design`. El agente solo
 * escribe `cp_modulo_*.json`; el comando invoca este script post-diseño y el
 * registry se actualiza determinísticamente sin depender del LLM.
 *
 * Schema del registry (conservado no cambia):
 *   {
 *     "cps": {
 *       "CP-{id}": {
 *         "module_id": "...",
 *         "title": "...",
 *         "risk_level": "critical|high|medium|low",
 *         "tags": [],
 *         "status": "active|deprecated",
 *         "first_designed_run": "...",
 *         "last_modified_run": "..."
 *       }
 *     }
 *   }
 *
 * Schema de cp_index.json (paralelo, ligero):
 *   {
 *     "cps": {
 *       "CP-{id}": {
 *         "status": "active|deprecated",
 *         "last_verdict": null|"PASS"|"FAIL"|"BLOCKED",
 *         "last_run_id": null|"..."
 *       }
 *     }
 *   }
 *
 * Comportamiento ante CPs ausentes en el cp_modulo recién escrito:
 *   - CPs del MISMO module_id que YA estaban en el registry pero NO aparecen en
 *     el archivo nuevo → se marcan `status: "deprecated"` (preservados, no
 *     eliminados, para historia y trazabilidad).
 *   - CPs de OTROS module_ids → intactos.
 *
 * Uso:
 *   node update-cp-registry.js --cp-file <ruta-cp_modulo> --app-name <name> --run-id <run>
 *
 * Stdout (JSON):
 *   { ok, cp_file, registry_path, index_path, cps_added, cps_updated, cps_deprecated, total_in_registry }
 *
 * Exit codes:
 *   0 = OK
 *   1 = error fatal (archivo ausente, JSON corrupto, --app-name vacío)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function die(msg) {
  process.stderr.write(`update-cp-registry: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = argv[++i];
    }
  }
  return out;
}

function readJSON(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die(`JSON inválido en ${p}: ${e.message}`); }
}

function writeJSONAtomic(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function main() {
  const args = parseArgs(process.argv);

  if (!args['cp-file']) die('--cp-file es obligatorio');
  if (!args['app-name']) die('--app-name es obligatorio');
  if (!args['run-id']) die('--run-id es obligatorio');

  const cpFile = path.resolve(args['cp-file']);
  if (!fs.existsSync(cpFile)) die(`cp_modulo no encontrado: ${cpFile}`);

  const cpDoc = readJSON(cpFile);
  const moduleId = cpDoc.module_id;
  if (!moduleId) die(`cp_modulo sin module_id: ${cpFile}`);

  const newCps = Array.isArray(cpDoc.test_cases) ? cpDoc.test_cases : [];

  const memDir = path.join(PROJECT_ROOT, '.claude', 'agent-memory', args['app-name']);
  ensureDir(memDir);
  const registryPath = path.join(memDir, 'cp_registry.json');
  const indexPath    = path.join(memDir, 'cp_index.json');

  // Cargar registry y index actuales (default vacíos)
  // Normalizar: cps puede venir como array (legacy/empty) o como objeto. Forzar objeto.
  const normalizeCps = (raw) => {
    if (!raw || raw.cps === undefined || raw.cps === null) return raw ? { ...raw, cps: {} } : { cps: {} };
    if (Array.isArray(raw.cps)) {
      // Legacy array → convertir a objeto indexado por cp_id (preservar entries con cp_id)
      const obj = {};
      for (const entry of raw.cps) {
        if (entry && entry.cp_id) obj[entry.cp_id] = entry;
      }
      return { ...raw, cps: obj };
    }
    return raw;
  };
  const registry = normalizeCps(readJSON(registryPath) || { cps: {} });
  const index    = normalizeCps(readJSON(indexPath)    || { cps: {} });

  const newCpIds = new Set();
  let cpsAdded = 0;
  let cpsUpdated = 0;
  const runId = args['run-id'];

  // 1) Upsert por cada CP del archivo nuevo
  for (const cp of newCps) {
    if (!cp.cp_id) continue;
    newCpIds.add(cp.cp_id);

    const existing = registry.cps[cp.cp_id];
    const entry = {
      module_id:           moduleId,
      title:               cp.title || '',
      risk_level:          cp.risk_level || '',
      tags:                Array.isArray(cp.tags) ? cp.tags.slice() : [],
      status:              'active',
      first_designed_run:  existing?.first_designed_run || runId,
      last_modified_run:   runId,
    };
    registry.cps[cp.cp_id] = entry;

    // Index ligero
    const idxExisting = index.cps[cp.cp_id];
    index.cps[cp.cp_id] = {
      status:       'active',
      last_verdict: idxExisting?.last_verdict ?? null,
      last_run_id:  idxExisting?.last_run_id  ?? null,
    };

    if (existing) cpsUpdated++; else cpsAdded++;
  }

  // 2) Marcar como deprecated los CPs del mismo module_id que ya no aparecen
  let cpsDeprecated = 0;
  for (const [cpId, entry] of Object.entries(registry.cps)) {
    if (entry.module_id !== moduleId) continue; // otros módulos intactos
    if (newCpIds.has(cpId)) continue;           // sigue activo
    if (entry.status === 'deprecated') continue; // ya estaba deprecated
    entry.status = 'deprecated';
    entry.last_modified_run = runId;
    if (index.cps[cpId]) index.cps[cpId].status = 'deprecated';
    cpsDeprecated++;
  }

  // 3) Escritura atómica
  writeJSONAtomic(registryPath, registry);
  writeJSONAtomic(indexPath, index);

  // 4) Breakdown auditable post-update
  // Antes: stdout solo emitía deltas de la invocación (cps_added/updated/deprecated).
  // El QA o el LLM caller no podían distinguir "28 deprecated en este run" vs
  // "41 deprecated acumulados en el módulo desde el primer run". Ahora emite
  // ambas vistas para auditoría sin ambigüedad.
  let totalActiveInModule = 0;
  let totalDeprecatedInModule = 0;
  let totalActiveAcrossModules = 0;
  let totalDeprecatedAcrossModules = 0;
  for (const [, entry] of Object.entries(registry.cps)) {
    const isModule = entry.module_id === moduleId;
    if (entry.status === 'deprecated') {
      totalDeprecatedAcrossModules++;
      if (isModule) totalDeprecatedInModule++;
    } else {
      totalActiveAcrossModules++;
      if (isModule) totalActiveInModule++;
    }
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    cp_file: cpFile,
    registry_path: registryPath,
    index_path: indexPath,
    module_id: moduleId,
    cps_in_module: newCps.length,
    // Deltas de ESTA invocación (transiciones aplicadas en este run)
    delta: {
      cps_added: cpsAdded,
      cps_updated: cpsUpdated,
      cps_deprecated: cpsDeprecated,
    },
    // Estado ACUMULADO del registry post-update (foto completa)
    breakdown: {
      module: {
        active: totalActiveInModule,
        deprecated: totalDeprecatedInModule,
        total: totalActiveInModule + totalDeprecatedInModule,
      },
      registry_total: {
        active: totalActiveAcrossModules,
        deprecated: totalDeprecatedAcrossModules,
        total: Object.keys(registry.cps).length,
      },
    },
    // Compatibilidad retro: campos planos preservados
    cps_added: cpsAdded,
    cps_updated: cpsUpdated,
    cps_deprecated: cpsDeprecated,
    total_in_registry: Object.keys(registry.cps).length,
  }, null, 2) + '\n');

  process.exit(0);
}

main();
