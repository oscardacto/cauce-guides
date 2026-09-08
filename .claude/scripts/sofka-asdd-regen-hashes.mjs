#!/usr/bin/env node
/**
 * sofka-asdd-regen-hashes.mjs — Recalcula y persiste los hashes SHA-256 de
 * .sofka-asdd/rule-loading.json (entries[].reference_sha256) y
 * .sofka-asdd/coordinator-loading.json (coordinators.*.rollback_sha256 y
 * coordinators.*.routes[].sha256).
 *
 * Por qué existe: antes de este script no había ningún generador — los hashes
 * se regeneraban a mano con sha256sum/certutil/Get-FileHash, y así fue como
 * entraron hashes contaminados con CRLF cuando alguien los regeneró en
 * Windows sin normalizar. .gitattributes por sí solo no basta: depende de que
 * cada checkout lo respete al pie de la letra.
 *
 * Normaliza con la MISMA función que usa el validador
 * (sofka-asdd-hash-normalize-lib.mjs) — validador y generador NUNCA deben
 * reimplementar su propia normalización por separado, o pueden divergir otra
 * vez (exactamente el bug que este cambio cierra).
 *
 * Idempotente: correrlo dos veces seguidas no produce diff la segunda vez,
 * porque el hash se calcula sobre el contenido ya normalizado del archivo en
 * disco — independiente del hash previamente almacenado en el manifest.
 *
 * Escritura atómica: temp file en el MISMO directorio que el manifest
 * (nunca os.tmpdir(), que puede estar en otro filesystem/volumen y disparar
 * EXDEV en rename — ver sofka-asdd-run-bootstrap.mjs:36 como referencia
 * correcta). No usa dependencias npm nuevas.
 *
 * Uso:
 *   node .claude/scripts/sofka-asdd-regen-hashes.mjs
 *   npm run hash:regen
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNormalized } from './lib/sofka-asdd-hash-normalize-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const p = (...segs) => resolve(ROOT, ...segs);

const RULE_LOADING_PATH = p('.sofka-asdd/rule-loading.json');
const COORDINATOR_LOADING_PATH = p('.sofka-asdd/coordinator-loading.json');

function hashOf(absPath) {
  const text = readNormalized(absPath);
  return createHash('sha256').update(text).digest('hex');
}

function atomicWriteJson(targetPath, value) {
  const dir = dirname(targetPath);
  const temp = join(dir, `.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temp, targetPath);
}

/**
 * Recorre un manifest y regenera los hashes declarados por `fields`.
 * `fields` es una lista de { get(entry) -> absPath, set(entry, hash), label(entry) }.
 * Devuelve { manifest, changes[] } sin escribir a disco.
 */
function regenerate(manifest, visitEntries) {
  const changes = [];
  visitEntries((absPath, label, getCurrent, setNew) => {
    if (!existsSync(absPath)) {
      changes.push({ label, status: 'missing', path: absPath });
      return;
    }
    const newHash = hashOf(absPath);
    const oldHash = getCurrent();
    if (oldHash === newHash) {
      changes.push({ label, status: 'unchanged', old: oldHash, new: newHash });
      return;
    }
    setNew(newHash);
    changes.push({ label, status: 'updated', old: oldHash, new: newHash });
  });
  return changes;
}

function regenRuleLoading() {
  if (!existsSync(RULE_LOADING_PATH)) return { changes: [], wrote: false };
  const manifest = JSON.parse(readNormalized(RULE_LOADING_PATH));
  const changes = regenerate(manifest, (visit) => {
    for (const entry of manifest.entries ?? []) {
      visit(
        p(entry.reference),
        `rule-loading:${entry.name}.reference_sha256`,
        () => entry.reference_sha256,
        (hash) => { entry.reference_sha256 = hash; },
      );
    }
  });
  const anyUpdated = changes.some((c) => c.status === 'updated');
  if (anyUpdated) atomicWriteJson(RULE_LOADING_PATH, manifest);
  return { changes, wrote: anyUpdated };
}

function regenCoordinatorLoading() {
  if (!existsSync(COORDINATOR_LOADING_PATH)) return { changes: [], wrote: false };
  const manifest = JSON.parse(readNormalized(COORDINATOR_LOADING_PATH));
  const changes = regenerate(manifest, (visit) => {
    for (const [name, config] of Object.entries(manifest.coordinators ?? {})) {
      visit(
        p(config.rollback_source),
        `coordinator-loading:${name}.rollback_sha256`,
        () => config.rollback_sha256,
        (hash) => { config.rollback_sha256 = hash; },
      );
      for (const route of config.routes ?? []) {
        visit(
          p(route.path),
          `coordinator-loading:${name}.${route.name}.sha256`,
          () => route.sha256,
          (hash) => { route.sha256 = hash; },
        );
      }
    }
  });
  const anyUpdated = changes.some((c) => c.status === 'updated');
  if (anyUpdated) atomicWriteJson(COORDINATOR_LOADING_PATH, manifest);
  return { changes, wrote: anyUpdated };
}

function report(title, changes) {
  console.log(`\n${title}`);
  if (changes.length === 0) {
    console.log('  (manifest not present — skipped)');
    return;
  }
  const updated = changes.filter((c) => c.status === 'updated');
  const unchanged = changes.filter((c) => c.status === 'unchanged');
  const missing = changes.filter((c) => c.status === 'missing');
  if (updated.length === 0) {
    console.log(`  sin cambios (${unchanged.length} hash(es) ya coinciden con el contenido normalizado)`);
  }
  for (const c of updated) {
    console.log(`  [UPDATED] ${c.label}`);
    console.log(`    old: ${c.old}`);
    console.log(`    new: ${c.new}`);
  }
  for (const c of missing) {
    console.log(`  [MISSING] ${c.label} — archivo no encontrado: ${c.path}`);
  }
  console.log(`  Total: ${updated.length} actualizado(s), ${unchanged.length} sin cambio, ${missing.length} faltante(s)`);
}

function main() {
  const rule = regenRuleLoading();
  const coordinator = regenCoordinatorLoading();
  report('rule-loading.json', rule.changes);
  report('coordinator-loading.json', coordinator.changes);
  const totalUpdated = [...rule.changes, ...coordinator.changes].filter((c) => c.status === 'updated').length;
  const totalMissing = [...rule.changes, ...coordinator.changes].filter((c) => c.status === 'missing').length;
  console.log(`\nResumen: ${totalUpdated} hash(es) actualizado(s), ${totalMissing} archivo(s) faltante(s).`);
  if (totalMissing > 0) process.exit(1);
}

main();
