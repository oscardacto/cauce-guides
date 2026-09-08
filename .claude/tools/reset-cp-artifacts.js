#!/usr/bin/env node
/**
 * ATF — Reset de artefactos de CPs para re-ejecución selectiva
 *
 * Prepara el execution/{module_id}/ para re-ejecutar uno o más CPs. Si existe
 * {execution_dir}/{module_id}/{slug}/ → se BORRA recursivamente. Luego el
 * executor re-ejecuta y escribe en {slug}/ fresca.
 *
 * No se preserva historial por CP — cada run sobreescribe la carpeta {slug}/
 * del CP. El historial de ejecuciones vive en `cp_registry.execution_history`
 * y en ALM. (Cambio: se eliminó el modo `archive` por completo.)
 *
 * Invocado por asdd-atf-web-rerun-resolver (vía executor PASO 0.5), o manualmente.
 *
 * Uso:
 *   node .claude/tools/reset-cp-artifacts.js \
 *     --execution-dir <path> \
 *     --cp-ids '["CP-M1-003","CP-M2-007"]' \
 *     [--dry-run]
 *
 * Acciones por cada CP ID:
 *   1. Derivar module_id y slug con tools/lib/cp-slug.js
 *      (ej: "CP-Matriz_1-12,01,1" → module_id="Matriz_1", slug="12_01_1")
 *   2. Borrar recursivo {execution_dir}/{module_id}/{slug}/ si existe.
 *   3. Actualizar cp_progress.json (remover de completed_cps/failed_cps, ajustar counters)
 *   4. Actualizar headless_results.json (remover entrada por cp_id)
 *
 * NO toca: cp_registry.json, module_result.json, automation/, ni carpetas
 * legacy {slug}_rerun<N>/ preexistentes (se ignoran durante el escaneo REGLA 2.1;
 * si quedaron en disco de una versión anterior, hay que borrarlas manualmente
 * cuando se desee).
 *
 * Salida:
 *   Exit 0 → OK (manifiesto JSON por stdout)
 *   Exit 1 → error fatal
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const {
  cpIdToFolder,
  cpIdToFolderFromKnownModules,
  extractModuleId,
  extractModuleIdFromKnownModules,
} = require('./lib/cp-slug');

/**
 * Lista módulos conocidos derivando de design/cp_modulo_*.json del run.
 * Robusto para módulos multi-palabra (admin-organization, email-config).
 * Si --design-dir no está disponible, retorna [] y los callers caen a heurística.
 */
function loadKnownModules(designDir) {
  if (!designDir || !fs.existsSync(designDir)) return [];
  return fs.readdirSync(designDir)
    .filter(f => f.startsWith('cp_modulo_') && f.endsWith('.json'))
    .map(f => f.replace(/^cp_modulo_/, '').replace(/\.json$/, ''));
}

/**
 * Helpers que prefieren la versión known-modules-aware y caen a la heurística
 * legacy si no hay módulos conocidos. NUNCA emiten warnings — la fallback es válida.
 */
function safeExtractModule(cpId, knownModules) {
  return extractModuleIdFromKnownModules(cpId, knownModules) || extractModuleId(cpId);
}
function safeCpIdToFolder(cpId, knownModules) {
  if (Array.isArray(knownModules) && knownModules.length > 0) {
    return cpIdToFolderFromKnownModules(cpId, knownModules);
  }
  return cpIdToFolder(cpId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`❌ reset-cp-artifacts: ${msg}`);
  process.exit(1);
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

// --help | -h
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`\
reset-cp-artifacts.js — reinicia artefactos de CPs para re-ejecución selectiva

Uso:
  node .claude/tools/reset-cp-artifacts.js \\
    --execution-dir <path>              Directorio execution/ del run.
    --cp-ids '<JSON array>'             Array JSON de CP-IDs a resetear.
                                        Ej: '["CP-M1-003","CP-M2-007"]'
    [--design-dir <path>]               Directorio design/ del run.
                                        Recomendado: deriva knownModules para
                                        slug canónico en módulos multi-palabra
                                        (admin-organization, email-config).
                                        Si se omite, fallback a heurística legacy.
    [--archive-legacy]                  Archiva carpetas legacy (slug truncado
                                        de runs antiguos) como {canonical}_legacy_{ts}/
                                        en vez de borrarlas.
                                        Default: purga (borra).
                                        Histórico: archive era default; cambió porque
                                        las carpetas archivadas duplicaban evidencia
                                        ya persistida en cp_registry.execution_history.
    [--purge-legacy]                    No-op (preservado para retro-compat).
                                        El default ya purga; no necesitas pasarlo.
    [--legacy-only]                     SOLO ejecuta REGLA 2.1 (archiva/purga
                                        legacy folders) — NO borra carpetas
                                        canónicas ni limpia cp_progress/headless.
                                        Útil para cleanup post-run sin afectar
                                        evidencias del run actual.
    [--viewport <name>]                 Nombre sanitizado del viewport (ej: "mobile").
                                        Si se pasa, solo limpia {slug}/{name}/ y el
                                        {slug}/result.json consolidado (REGLA 29).
                                        Sin --viewport: elimina {slug}/ completo (default).
    [--dry-run]                         Solo log, no modifica archivos.

Qué hace por cada CP:
  1. Deriva slug canónico vía tools/lib/cp-slug.js (REGLA 2.1).
     - Con --design-dir: cpIdToFolderFromKnownModules → canónico real.
     - Sin --design-dir: cpIdToFolder heurístico (puede truncar multi-palabra).
  2. Detecta carpetas legacy (slug heurístico ≠ canónico) y archiva o purga.
  3. Borra recursivo {execution-dir}/{module_id}/{slug}/ si existe.
  4. Limpia cp_progress.json (remueve cp_id de completed_cps/failed_cps).
  5. Limpia headless_results.json (remueve entrada por cp_id).

Salida:
  stdout: log legible + marcador ---MANIFEST_START--- con JSON del resultado.
  exit 0 → OK. exit 1 → error fatal.

Invocado por asdd-atf-web-rerun-resolver (executor PASO 0.5) o manualmente.
`);
  process.exit(0);
}

const executionDir = getArg('--execution-dir');
const cpIdsRaw     = getArg('--cp-ids');
const designDir    = getArg('--design-dir');
const VIEWPORT     = getArg('--viewport') || null;  // REGLA 29: limpieza selectiva por viewport
const DRY_RUN      = args.includes('--dry-run');
//: Default flipped a `purge`. Las carpetas legacy archivadas como
// `_legacy_TIMESTAMP/` acumulaban ~5MB/run de polución sin valor (la evidencia
// histórica ya vive en `cp_registry.execution_history` + el report.html del run
// original). Para preservar el comportamiento previo (archivar) usar
// `--archive-legacy` explícitamente. `--purge-legacy` se mantiene como no-op
// para retro-compat con callers que ya lo pasaban.
const ARCHIVE_LEGACY = args.includes('--archive-legacy');
const PURGE_LEGACY   = !ARCHIVE_LEGACY;
const LEGACY_ONLY    = args.includes('--legacy-only');

// #2 — derivar knownModules una vez del design dir (si está disponible)
const knownModules = loadKnownModules(designDir);

if (!executionDir) die('--execution-dir es requerido. Usa --help para ver la sintaxis.');
if (!cpIdsRaw)     die('--cp-ids es requerido. Usa --help para ver la sintaxis.');

let cpIds;
try {
  cpIds = JSON.parse(cpIdsRaw);
  if (!Array.isArray(cpIds) || cpIds.length === 0) {
    die('--cp-ids debe ser un array JSON no vacío de strings');
  }
} catch (e) {
  die(`--cp-ids JSON inválido: ${e.message}`);
}

if (!exists(executionDir)) {
  die(`execution_dir no existe: ${executionDir}`);
}

// ─── Agrupar CPs por módulo ──────────────────────────────────────────────────

const cpsByModule = {};
for (const cpId of cpIds) {
  const modId = safeExtractModule(cpId, knownModules);
  if (!modId) {
    console.warn(`⚠️  No se pudo derivar module_id de "${cpId}" — omitido`);
    continue;
  }
  if (!cpsByModule[modId]) cpsByModule[modId] = [];
  cpsByModule[modId].push(cpId);
}

// ─── Manifiesto de salida ────────────────────────────────────────────────────

const manifest = {
  timestamp: new Date().toISOString(),
  dry_run: DRY_RUN,
  execution_dir: executionDir,
  total_cp_ids: cpIds.length,
  modules_processed: [],
  actions: [],
  errors: [],
};

// ─── Procesar cada módulo ────────────────────────────────────────────────────

for (const [moduleId, moduleCpIds] of Object.entries(cpsByModule)) {
  const moduleDir = path.join(executionDir, moduleId);
  const moduleEntry = {
    module_id: moduleId,
    cp_ids: moduleCpIds,
    cp_folders_deleted: [],
    cp_progress_updated: false,
    headless_results_updated: false,
  };

  if (!exists(moduleDir)) {
    const msg = `Directorio de módulo no existe: ${moduleDir} — nada que limpiar para ${moduleCpIds.join(', ')}`;
    console.warn(`⚠️  ${msg}`);
    manifest.actions.push({ type: 'skip', module_id: moduleId, reason: 'module_dir_not_found' });
    manifest.modules_processed.push(moduleEntry);
    continue;
  }

  console.log(`\n📂 Procesando módulo ${moduleId} — ${moduleCpIds.length} CP(s) a resetear`);

  // ── 0. REGLA 2.1 — Detectar y renombrar carpetas con slug legacy ─────────
  //    Si encuentra un {legacy_slug}/ cuyo result.json.cp_id mapea al slug
  //    canónico esperado, lo renombra. Protege contra executors que escribieron
  //    con nombres ad-hoc (ej: cp_m5_002 en vez de 002).
  //
  //    #2 — usa cpIdToFolderFromKnownModules como fuente de verdad.
  //    Si --design-dir no se pasó, fallback a heurística (sin warning ruidoso).
  try {
    const expectedSlugs = new Map(); // canonical_slug → cp_id
    for (const cpId of moduleCpIds) {
      const canonical = safeCpIdToFolder(cpId, knownModules);
      expectedSlugs.set(canonical, cpId);
    }

    const siblings = fs.readdirSync(moduleDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    for (const sibling of siblings) {
      if (expectedSlugs.has(sibling)) continue;                 // ya canónico
      if (/_rerun\d+$/.test(sibling)) continue;                 // archivado histórico
      if (/_legacy_\d+$/.test(sibling)) continue;               // archivado previo

      const siblingResult = readJSON(path.join(moduleDir, sibling, 'result.json'));
      if (!siblingResult || !siblingResult.cp_id) continue;

      const canonicalSlug = safeCpIdToFolder(siblingResult.cp_id, knownModules);
      if (canonicalSlug === sibling) continue;                  // ya canónico
      if (!expectedSlugs.has(canonicalSlug)) continue;          // no es un CP del batch

      const legacyPath    = path.join(moduleDir, sibling);
      const canonicalPath = path.join(moduleDir, canonicalSlug);

      if (exists(canonicalPath)) {
        // Conflicto: ambos coexisten (caso típico — run anterior dejó legacy,
        // run nuevo creó canónico). Default: archivar legacy. Con --purge-legacy: borrar.
        if (PURGE_LEGACY) {
          if (DRY_RUN) {
            console.log(`  [DRY] REGLA 2.1 — slug legacy '${sibling}' y canónico '${canonicalSlug}' coexisten → ELIMINARÍA legacy (--purge-legacy)`);
          } else {
            fs.rmSync(legacyPath, { recursive: true, force: true });
            console.warn(`  🗑️  REGLA 2.1 — slug legacy '${sibling}' purgado (canónico '${canonicalSlug}' preservado)`);
          }
          manifest.actions.push({ type: 'regla2_1_purge_legacy', cp_id: expectedSlugs.get(canonicalSlug), legacy_slug: sibling, module_id: moduleId });
        } else {
          const ts      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const archive = path.join(moduleDir, `${canonicalSlug}_legacy_${ts}`);
          if (DRY_RUN) {
            console.log(`  [DRY] REGLA 2.1 — slug legacy '${sibling}' y canónico '${canonicalSlug}' coexisten → archivaría legacy como ${path.basename(archive)}/`);
          } else {
            fs.renameSync(legacyPath, archive);
            console.warn(`  ⚠️  REGLA 2.1 — conflicto: slug legacy '${sibling}' archivado como ${path.basename(archive)}/ (canónico '${canonicalSlug}' preservado)`);
          }
          manifest.actions.push({ type: 'regla2_1_archive_legacy', cp_id: expectedSlugs.get(canonicalSlug), legacy_slug: sibling, archived_as: path.basename(archive), module_id: moduleId });
        }
      } else {
        if (DRY_RUN) {
          console.log(`  [DRY] REGLA 2.1 — renombraría slug legacy '${sibling}' → '${canonicalSlug}'`);
        } else {
          fs.renameSync(legacyPath, canonicalPath);
          console.warn(`  ⚠️  REGLA 2.1 — slug legacy detectado: '${sibling}' → renombrado a '${canonicalSlug}' (canónico known-modules-aware)`);
        }
        manifest.actions.push({ type: 'regla2_1_rename_legacy', cp_id: expectedSlugs.get(canonicalSlug), legacy_slug: sibling, canonical_slug: canonicalSlug, module_id: moduleId });
      }
    }
  } catch (err) {
    console.warn(`  ⚠️  REGLA 2.1 — escaneo de slugs legacy falló: ${err.message} (no bloqueante)`);
  }

  // ── 1. Borrar carpetas de CP usando slug filesystem-safe ──────────────────
  if (LEGACY_ONLY) {
    console.log(`  ⏭️  --legacy-only: omitiendo borrado de carpetas canónicas`);
  } else for (const cpId of moduleCpIds) {
    const slug  = safeCpIdToFolder(cpId, knownModules);  // canónico known-modules-aware
    const cpDir = path.join(moduleDir, slug);

    if (!exists(cpDir)) {
      console.log(`  ℹ️  ${cpId} (slug=${slug})/ no existe — nada que borrar`);
      manifest.actions.push({ type: 'skip', cp_id: cpId, slug, reason: 'cp_dir_not_found' });
      continue;
    }

    if (VIEWPORT) {
      // REGLA 29 — limpieza selectiva: solo la subcarpeta del viewport + root result.json consolidado
      const vpDir = path.join(cpDir, VIEWPORT);
      const rootResult = path.join(cpDir, 'result.json');
      if (!exists(vpDir)) {
        console.log(`  ℹ️  ${cpId} (slug=${slug})/${VIEWPORT}/ no existe — nada que borrar para ese viewport`);
        manifest.actions.push({ type: 'skip', cp_id: cpId, slug, viewport: VIEWPORT, reason: 'viewport_dir_not_found' });
      } else {
        if (DRY_RUN) {
          console.log(`  [DRY] eliminaría → ${slug}/${VIEWPORT}/`);
        } else {
          fs.rmSync(vpDir, { recursive: true, force: true });
          console.log(`  ✓ eliminado → ${slug}/${VIEWPORT}/`);
        }
        moduleEntry.cp_folders_deleted.push(`${slug}/${VIEWPORT}`);
        manifest.actions.push({ type: 'delete_viewport_dir', cp_id: cpId, slug, viewport: VIEWPORT, module_id: moduleId });
      }
      // Borrar root result.json consolidado (se regenerará tras ejecutar todos los viewports)
      if (exists(rootResult)) {
        if (DRY_RUN) {
          console.log(`  [DRY] eliminaría → ${slug}/result.json (consolidado responsive)`);
        } else {
          fs.rmSync(rootResult, { force: true });
          console.log(`  ✓ eliminado → ${slug}/result.json (consolidado responsive)`);
        }
        manifest.actions.push({ type: 'delete_root_result', cp_id: cpId, slug, module_id: moduleId });
      }
    } else {
      // Comportamiento original: borrar toda la carpeta del CP
      if (DRY_RUN) {
        console.log(`  [DRY] eliminaría → ${slug}/`);
      } else {
        fs.rmSync(cpDir, { recursive: true, force: true });
        console.log(`  ✓ eliminado → ${slug}/`);
      }
      moduleEntry.cp_folders_deleted.push(slug);
      manifest.actions.push({ type: 'delete_cp_dir', cp_id: cpId, slug, module_id: moduleId });
    }
  }

  // ── 2. Actualizar cp_progress.json ──────────────────────────────────────
  const progressPath = path.join(moduleDir, 'cp_progress.json');
  if (LEGACY_ONLY) {
    // skip — no tocar progress en modo legacy-only
  } else if (exists(progressPath)) {
    const progress = readJSON(progressPath);
    if (progress) {
      const cpIdSet = new Set(moduleCpIds);
      const originalCompleted = (progress.completed_cps || []).length;
      const originalFailed    = (progress.failed_cps || []).length;

      // Contar cuántos se van a remover para ajustar contadores
      const removedFromCompleted = (progress.completed_cps || []).filter(id => cpIdSet.has(id));
      const removedFromFailed    = (progress.failed_cps || []).filter(id => cpIdSet.has(id));
      const removedPassCount     = removedFromCompleted.filter(id => !removedFromFailed.includes(id)).length;
      const removedFailCount     = removedFromFailed.length;

      // Filtrar listas
      progress.completed_cps = (progress.completed_cps || []).filter(id => !cpIdSet.has(id));
      progress.failed_cps    = (progress.failed_cps || []).filter(id => !cpIdSet.has(id));

      // Ajustar contadores
      if (progress.counters) {
        progress.counters.executed = Math.max(0, (progress.counters.executed || 0) - removedFromCompleted.length);
        progress.counters.passed   = Math.max(0, (progress.counters.passed || 0) - removedPassCount);
        progress.counters.failed   = Math.max(0, (progress.counters.failed || 0) - removedFailCount);
      }

      // Ajustar contadores por riesgo si existen
      if (progress.counters_by_risk) {
        // No podemos saber el risk_level de cada CP removido sin leer el diseño,
        // pero los contadores se recalcularán al final por asdd-atf-web-execution-result-writer.
        // Dejamos los counters_by_risk como están — el writer los sobreescribe.
      }

      progress.last_updated = new Date().toISOString();

      if (DRY_RUN) {
        console.log(`  [DRY] actualizaría cp_progress.json — removería ${removedFromCompleted.length} de completed, ${removedFailCount} de failed`);
      } else {
        writeJSON(progressPath, progress);
        console.log(`  ✓ cp_progress.json actualizado — removidos: ${removedFromCompleted.length} completed, ${removedFailCount} failed`);
      }
      moduleEntry.cp_progress_updated = true;
      manifest.actions.push({
        type: 'update_cp_progress',
        module_id: moduleId,
        removed_completed: removedFromCompleted.length,
        removed_failed: removedFailCount,
        remaining_completed: progress.completed_cps.length,
      });
    }
  } else {
    console.log(`  ℹ️  cp_progress.json no existe — primera ejecución`);
  }

  // ── 3. Actualizar headless_results.json ─────────────────────────────────
  const headlessPath = path.join(moduleDir, 'headless_results.json');
  if (LEGACY_ONLY) {
    // skip — no tocar headless en modo legacy-only
  } else if (exists(headlessPath)) {
    const headless = readJSON(headlessPath);
    if (headless && Array.isArray(headless.results)) {
      const cpIdSet = new Set(moduleCpIds);
      const before  = headless.results.length;
      headless.results = headless.results.filter(r => !cpIdSet.has(r.cp_id));
      const removed = before - headless.results.length;

      if (removed > 0) {
        headless.total = headless.results.length;
        if (DRY_RUN) {
          console.log(`  [DRY] actualizaría headless_results.json — removería ${removed} entrada(s)`);
        } else {
          writeJSON(headlessPath, headless);
          console.log(`  ✓ headless_results.json actualizado — ${removed} entrada(s) removidas`);
        }
        moduleEntry.headless_results_updated = true;
        manifest.actions.push({
          type: 'update_headless_results',
          module_id: moduleId,
          removed: removed,
          remaining: headless.results.length,
        });
      } else {
        console.log(`  ℹ️  headless_results.json no contenía CPs target`);
      }
    }
  } else {
    console.log(`  ℹ️  headless_results.json no existe`);
  }

  manifest.modules_processed.push(moduleEntry);
}

// ─── Output ──────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════');
console.log('  reset-cp-artifacts — Resumen');
console.log('══════════════════════════════════════════════════════');
console.log(`  CPs solicitados  : ${cpIds.length}`);
console.log(`  Módulos afectados: ${Object.keys(cpsByModule).length}`);
console.log(`  Acciones         : ${manifest.actions.length}`);
if (DRY_RUN) {
  console.log('  ⚠️  DRY-RUN: ningún archivo fue modificado.');
}
console.log('');

// Emitir manifiesto JSON por stdout (separado del log por marcador)
console.log('---MANIFEST_START---');
console.log(JSON.stringify(manifest, null, 2));
console.log('---MANIFEST_END---');

process.exit(manifest.errors.length > 0 ? 1 : 0);
