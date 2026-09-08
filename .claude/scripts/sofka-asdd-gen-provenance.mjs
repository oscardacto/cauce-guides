#!/usr/bin/env node
/**
 * sofka-asdd-gen-provenance.mjs — Genera `.sofka-asdd/sofka-asdd-provenance.json`:
 * por cada ruta distribuida, el conjunto de hashes SHA-256 normalizados que esa ruta
 * tuvo a lo largo de la historia del repo.
 *
 * PARA QUÉ SIRVE
 *
 * El CLI decide si puede actualizar un archivo del consumidor en su lugar comparando
 * lo que hay en disco contra un baseline — «esto es lo que el template te entregó».
 * Las dos fuentes de baseline que existían preguntan «¿qué versión tenías?», y esa
 * pregunta no tiene respuesta confiable: el lock del proyecto declara una versión que
 * su contenido no necesariamente tiene, y el tip de una rama se mueve, así que la misma
 * versión se distribuyó como contenidos distintos más de una vez. Sin baseline el CLI
 * hace lo conservador: preserva el archivo del consumidor y deja la versión nueva al
 * lado, como `.asdd-new`, para que alguien las concilie a mano. En un proyecto viejo eso
 * son cientos de archivos, casi todos sin una sola edición del consumidor.
 *
 * Este archivo cambia la pregunta por **«¿este contenido salió alguna vez de acá?»**, que
 * sí tiene respuesta exacta y no depende de ninguna versión declarada. Si el hash de lo
 * que el consumidor tiene en disco está en el conjunto de esa ruta, nadie lo editó: es
 * contenido del template, viejo, y se puede actualizar. Si no está, se preserva — el
 * comportamiento de siempre.
 *
 * POR QUÉ SE GENERA ACÁ Y NO EN EL CLI
 *
 * El CLI clona con `--depth 1 --single-branch`: no tiene historia y no puede reconstruir
 * esto ni queriendo. Tiene que venir publicado en el repo.
 *
 * LA VENTANA: CADA COMMIT ALCANZABLE DESDE LAS TRES RAMAS DISTRIBUIBLES
 *
 * No los tags. Un proyecto real puede tener en disco contenido de un commit que nunca
 * fue release: el `.claude/agents/sofka-asdd-explorer.md` de un consumidor medido en
 * agosto de 2026 no coincide con NINGÚN tag, y aparece en `b975f83`, de abril. Limitar la
 * ventana a los tags deja afuera justamente los proyectos que más lo necesitan. Un
 * superset de commits solo aumenta cobertura: la pertenencia sigue siendo por hash exacto.
 *
 * QUÉ QUEDA AFUERA
 *
 * - Rutas que el contrato no distribuye: no llegan al consumidor.
 * - `.sofka-asdd/`: el CLI las sobreescribe siempre por diseño, nunca pasan por la
 *   decisión no destructiva, así que un baseline para ellas no significa nada.
 *
 * DETERMINISMO
 *
 * Salida ordenada — rutas y hashes — y sin timestamps ni SHAs de los tips. Correrlo dos
 * veces da el mismo archivo, y el archivo solo cambia cuando cambia el contenido de una
 * ruta distribuida. Eso es lo que hace viable el modo `--check`.
 *
 * EL RIESGO, DECLARADO
 *
 * Si una edición del consumidor coincide EXACTAMENTE con una versión anterior del mismo
 * archivo, el CLI la va a actualizar. Eso es un revert a una versión vieja del template,
 * y actualizarlo es el comportamiento correcto. Por eso el hash va completo, sin truncar.
 *
 * Uso:
 *   node .claude/scripts/sofka-asdd-gen-provenance.mjs
 *   node .claude/scripts/sofka-asdd-gen-provenance.mjs --check
 *   npm run provenance:regen
 *   npm run provenance:check
 *
 * Exit codes, para que quien lo invoque distinga los tres desenlaces sin leer stderr:
 *   0 — al día (o, sin `--check`, escrito).
 *   1 — desactualizado o ausente: hay que regenerar y commitear.
 *   2 — no se puede determinar: falta el contrato o la historia (clon shallow, sin las
 *       ramas distribuibles). No es un hallazgo, es una respuesta imposible de dar acá.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBufferForHash } from './lib/sofka-asdd-hash-normalize-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const p = (...segs) => resolve(ROOT, ...segs);

const CONTRACT_PATH = p('.sofka-asdd/cli-contract.json');
const OUTPUT_PATH = p('.sofka-asdd/sofka-asdd-provenance.json');
const OUTPUT_REL = '.sofka-asdd/sofka-asdd-provenance.json';

/** El CLI mapea canal → rama así (structurecommon.ChannelToBranch). */
const DISTRIBUTABLE_BRANCHES = ['dev', 'qa', 'main'];

/** Prefijo que el CLI sobreescribe siempre, sin pasar por la decisión no destructiva. */
const ALWAYS_OVERWRITTEN_PREFIX = '.sofka-asdd/';

const SCHEMA_VERSION = 1;
const NULL_OID = '0'.repeat(40);

/** Ver el bloque de exit codes del encabezado. */
const EXIT_STALE = 1;
const EXIT_INDETERMINATE = 2;

/** Cuántos blobs se piden por invocación de `git cat-file --batch`. */
const BATCH_SIZE = 300;

function git(args, { input, quiet = false } = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    input,
    maxBuffer: 1 << 30,
    // Por defecto stderr se hereda, que es lo correcto para un fallo real. Las sondas de
    // existencia de refs se llaman con quiet: para ellas el fallo ES la respuesta, y su
    // `fatal:` en pantalla se lee como un error del generador cuando no lo es.
    stdio: quiet ? ['pipe', 'pipe', 'ignore'] : undefined,
  });
}

/**
 * Predicado «el contrato entrega esta ruta al consumidor».
 *
 * `distribution` mezcla dos formas: una entrada terminada en `/` es un directorio y cubre
 * cuanto haya debajo; el resto son rutas de archivo exactas.
 */
function buildDistributionFilter(contract) {
  const entries = contract.distribution ?? [];
  const dirs = entries.filter((e) => e.endsWith('/'));
  const files = new Set(entries.filter((e) => !e.endsWith('/')));
  return (path) => {
    if (path.startsWith(ALWAYS_OVERWRITTEN_PREFIX)) return false;
    if (files.has(path)) return true;
    return dirs.some((d) => path.startsWith(d));
  };
}

/**
 * Resuelve cada rama distribuible a un ref existente, prefiriendo el remoto.
 *
 * El remoto va primero porque es el que refleja lo que se publicó de verdad; el local
 * es el respaldo para un clon donde no se configuró `origin`. Una rama que no existe en
 * ninguna de las dos formas se salta: en un clon parcial es normal, y no tener una rama
 * solo reduce cobertura.
 */
function resolveBranchRefs() {
  const refs = [];
  const missing = [];
  for (const branch of DISTRIBUTABLE_BRANCHES) {
    const candidate = [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`].find((ref) => {
      try {
        git(['rev-parse', '--verify', '--quiet', ref], { quiet: true });
        return true;
      } catch {
        return false;
      }
    });
    if (candidate) refs.push(candidate);
    else missing.push(branch);
  }
  return { refs, missing };
}

/**
 * Recorre la historia y devuelve, por ruta distribuida, el conjunto de blobs que esa ruta
 * tuvo alguna vez.
 *
 * `diff-tree` en vez de un `ls-tree` por commit: solo lista lo que cambió en cada commit,
 * y la unión de los lados nuevos de todos los diffs es exactamente el conjunto de
 * materializaciones. `--root` incluye el commit inicial (sin él, todo lo que nunca cambió
 * desde el principio quedaría afuera) y `-m` abre los merges contra cada padre, para que un
 * contenido introducido en el propio merge no se pierda.
 */
function collectMaterializations(refs, isDistributed) {
  const revs = git(['rev-list', ...refs]).toString();
  const diff = git(
    ['diff-tree', '-r', '-m', '--root', '--no-commit-id', '--stdin'],
    { input: revs },
  ).toString();

  const byPath = new Map();
  const blobs = new Set();
  for (const line of diff.split('\n')) {
    if (!line.startsWith(':')) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    // ":<modo-viejo> <modo-nuevo> <oid-viejo> <oid-nuevo> <estado>\t<ruta>". Sin el `:`
    // inicial los campos quedan en 0..4, así que el oid NUEVO — el que interesa, porque es
    // el contenido que ese commit dejó publicado — es el índice 3. El 2 es el que quedó
    // atrás.
    const newOid = line.slice(1, tab).split(' ')[3];
    const path = line.slice(tab + 1);
    // NULL_OID del lado nuevo = borrado. La ruta pudo existir antes, y ese contenido ya
    // entró por el commit que lo introdujo.
    if (newOid === NULL_OID) continue;
    if (!isDistributed(path)) continue;
    if (!byPath.has(path)) byPath.set(path, new Set());
    byPath.get(path).add(newOid);
    blobs.add(newOid);
  }
  return { byPath, blobs };
}

/**
 * Hashea el contenido normalizado de cada blob.
 *
 * `cat-file --batch` en lotes en vez de un proceso git por blob: son miles, y el costo de
 * arranque por proceso domina todo lo demás. El formato de respuesta es
 * "<oid> <tipo> <tamaño>\n<contenido>\n", y el tamaño se lee del encabezado en vez de
 * buscar el salto de línea siguiente, porque el contenido puede tenerlos.
 */
function hashBlobs(blobs) {
  const hashes = new Map();
  const list = [...blobs];
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const chunk = list.slice(i, i + BATCH_SIZE);
    const out = git(['cat-file', '--batch'], { input: `${chunk.join('\n')}\n` });
    let offset = 0;
    for (const oid of chunk) {
      const headerEnd = out.indexOf(0x0a, offset);
      const size = Number.parseInt(out.subarray(offset, headerEnd).toString('utf8').split(' ')[2], 10);
      const start = headerEnd + 1;
      const content = out.subarray(start, start + size);
      hashes.set(oid, createHash('sha256').update(normalizeBufferForHash(content)).digest('hex'));
      offset = start + size + 1; // +1 por el \n que git agrega después del contenido
    }
  }
  return hashes;
}

/**
 * Orden por unidad de código, explícito: es el mismo que da `.sort()` sin argumentos, pero
 * dicho, porque de este orden depende que la salida sea reproducible.
 */
function byCodeUnit(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function buildDocument(byPath, blobHashes) {
  const files = {};
  for (const path of [...byPath.keys()].sort(byCodeUnit)) {
    const set = new Set();
    for (const oid of byPath.get(path)) set.add(blobHashes.get(oid));
    files[path] = [...set].sort(byCodeUnit);
  }
  return { schema_version: SCHEMA_VERSION, files };
}

function serialize(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Escritura atómica con el temp en el MISMO directorio que el destino: os.tmpdir() puede
 * estar en otro filesystem y disparar EXDEV en el rename.
 */
function atomicWrite(targetPath, text) {
  const temp = join(dirname(targetPath), `.${process.pid}.${SCHEMA_VERSION}.provenance.tmp`);
  writeFileSync(temp, text, 'utf8');
  renameSync(temp, targetPath);
}

function main() {
  const checkOnly = process.argv.includes('--check');

  if (!existsSync(CONTRACT_PATH)) {
    console.error(`INDETERMINADO: no se encontró ${CONTRACT_PATH}`);
    process.exit(EXIT_INDETERMINATE);
  }
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  const isDistributed = buildDistributionFilter(contract);

  const { refs, missing } = resolveBranchRefs();
  if (refs.length === 0) {
    console.error(
      `INDETERMINADO: ninguna de las ramas distribuibles (${DISTRIBUTABLE_BRANCHES.join(', ')}) existe en este clon. ` +
      'El generador necesita la historia completa; un clon shallow o de una sola rama no alcanza.',
    );
    process.exit(EXIT_INDETERMINATE);
  }
  if (missing.length > 0) {
    console.log(`AVISO: ramas ausentes en este clon, no se recorrieron: ${missing.join(', ')}`);
  }

  const { byPath, blobs } = collectMaterializations(refs, isDistributed);
  const blobHashes = hashBlobs(blobs);
  const document = buildDocument(byPath, blobHashes);
  const text = serialize(document);

  // Se cuenta sobre el documento y no sobre los blobs: dos blobs distintos que difieren
  // solo en fin de línea colapsan al mismo hash normalizado, y lo que importa es cuántos
  // contenidos distinguibles quedaron publicados.
  const paths = Object.keys(document.files);
  const totalHashes = paths.reduce((acc, path) => acc + document.files[path].length, 0);
  console.log(`refs recorridos     : ${refs.join(', ')}`);
  console.log(`rutas distribuidas  : ${paths.length}`);
  console.log(`blobs recorridos    : ${blobs.size}`);
  console.log(`materializaciones   : ${totalHashes} (${(totalHashes / Math.max(1, paths.length)).toFixed(2)} por ruta)`);
  console.log(`tamaño del archivo  : ${(text.length / 1024).toFixed(1)} KB`);

  const previous = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, 'utf8') : null;
  if (previous === text) {
    console.log(`\n${OUTPUT_REL} ya está al día.`);
    return;
  }

  if (checkOnly) {
    console.error(
      `\nERROR: ${OUTPUT_REL} está ${previous === null ? 'ausente' : 'desactualizado'}. ` +
      'Correr `npm run provenance:regen` y commitear el resultado.',
    );
    process.exit(EXIT_STALE);
  }

  atomicWrite(OUTPUT_PATH, text);
  console.log(`\n${OUTPUT_REL} ${previous === null ? 'creado' : 'actualizado'}.`);
}

main();
