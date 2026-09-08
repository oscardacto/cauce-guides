#!/usr/bin/env node
/**
 * test-provenance.mjs — suite de `.sofka-asdd/sofka-asdd-provenance.json` y su generador.
 *
 * Qué protege, en orden de importancia:
 *
 *  1. Que el archivo publicado esté al día. Un provenance viejo no rompe nada — el CLI
 *     simplemente no reconoce los contenidos que faltan y preserva, que es el
 *     comportamiento conservador de siempre — pero degrada en silencio, y un archivo
 *     generado que nadie regenera termina siendo peor que no tenerlo.
 *  2. Que la forma sea la que el CLI parsea, sin rutas que no correspondan.
 *  3. Que la normalización sea byte a byte la misma que aplica el CLI. Si las dos puntas
 *     divergen, ningún hash coincide nunca y la función queda inerte sin dar señal.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isBinaryBuffer,
  normalizeBufferForHash,
  normalizeForHash,
} from "./lib/sofka-asdd-hash-normalize-lib.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const provenancePath = resolve(root, ".sofka-asdd/sofka-asdd-provenance.json");
const contractPath = resolve(root, ".sofka-asdd/cli-contract.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** ¿Este clon tiene la historia que el generador necesita? */
function hasHistory() {
  for (const branch of ["dev", "qa", "main"]) {
    for (const ref of [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`]) {
      try {
        execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: root });
        return true;
      } catch {
        // ref ausente: seguir probando
      }
    }
  }
  return false;
}

// ── 1. Paridad de la normalización byte a byte ───────────────────────────────────────
// Los casos son los mismos que fija el test de paridad cross-repo del CLI, más el binario,
// que es justamente lo que la variante de texto no puede manejar.
{
  const casos = [
    ["LF", Buffer.from("linea uno\nlinea dos\n")],
    ["CRLF", Buffer.from("linea uno\r\nlinea dos\r\n")],
    ["BOM", Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("linea uno\n")])],
    ["BOM + CRLF", Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("linea uno\r\n")])],
    ["CR suelto", Buffer.from("linea\runo\n")],
    ["vacio", Buffer.alloc(0)],
    ["sin newline", Buffer.from("una sola linea")],
  ];
  for (const [nombre, bytes] of casos) {
    const porBuffer = normalizeBufferForHash(bytes);
    const porTexto = Buffer.from(normalizeForHash(bytes.toString("utf8")), "utf8");
    assert.equal(
      porBuffer.toString("utf8"),
      porTexto.toString("utf8"),
      `las dos variantes de normalización difieren en el caso "${nombre}"`,
    );
  }

  // Un CRLF dentro de un binario NO se toca: colapsarlo cambiaría el contenido.
  const binario = Buffer.from([0x50, 0x4b, 0x00, 0x01, 0x0d, 0x0a, 0xff]);
  assert.ok(isBinaryBuffer(binario), "el sniff binario no reconoció un buffer con NUL");
  assert.equal(
    normalizeBufferForHash(binario).length,
    binario.length,
    "la normalización alteró un contenido binario",
  );

  // El `\r` solitario sobrevive, en las dos variantes: es una diferencia real.
  assert.ok(
    normalizeBufferForHash(Buffer.from("a\rb")).includes(0x0d),
    "se perdió un CR solitario, que es contenido y no fin de línea",
  );
}

// ── 2. El archivo existe y tiene la forma esperada ───────────────────────────────────
assert.ok(
  existsSync(provenancePath),
  ".sofka-asdd/sofka-asdd-provenance.json no existe — correr `npm run provenance:regen`",
);

const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
assert.equal(provenance.schema_version, 1, "schema_version inesperado");
assert.ok(provenance.files && typeof provenance.files === "object", "falta el objeto `files`");

const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const distribution = contract.distribution ?? [];
const dirs = distribution.filter((e) => e.endsWith("/"));
const exactFiles = new Set(distribution.filter((e) => !e.endsWith("/")));
const isDistributed = (path) => exactFiles.has(path) || dirs.some((d) => path.startsWith(d));

const paths = Object.keys(provenance.files);
assert.ok(paths.length > 0, "el provenance quedó vacío");

const hexHash = /^[0-9a-f]{64}$/;
for (const path of paths) {
  assert.ok(
    isDistributed(path),
    `${path} está en el provenance pero el contrato no lo distribuye`,
  );
  assert.ok(
    !path.startsWith(".sofka-asdd/"),
    `${path} está bajo .sofka-asdd/, que el CLI sobreescribe siempre: no tiene baseline`,
  );

  const hashes = provenance.files[path];
  assert.ok(Array.isArray(hashes) && hashes.length > 0, `${path}: conjunto de hashes vacío`);
  for (const h of hashes) {
    assert.ok(hexHash.test(h), `${path}: hash con forma inválida (${h})`);
  }
  assert.equal(new Set(hashes).size, hashes.length, `${path}: hashes duplicados`);
  assert.deepEqual(hashes, [...hashes].sort(), `${path}: hashes sin ordenar`);
}
assert.deepEqual(paths, [...paths].sort(), "las rutas no están ordenadas");

// ── 3. El contenido de hoy está en su propio conjunto ────────────────────────────────
// Es la invariante más fuerte: si lo que el template distribuye AHORA no figura en el
// provenance de su ruta, entonces el archivo no cubre ni la versión que se está entregando
// y cualquier proyecto que la reciba queda sin baseline.
{
  let comprobadas = 0;
  let faltantes = [];
  for (const path of paths) {
    const abs = resolve(root, path);
    if (!existsSync(abs)) continue; // ruta que existió y ya no: su historia sigue siendo válida
    comprobadas += 1;
    const hash = sha256(normalizeBufferForHash(readFileSync(abs)));
    if (!provenance.files[path].includes(hash)) faltantes.push(path);
  }
  assert.ok(comprobadas > 0, "no se pudo comprobar ninguna ruta contra el disco");
  // El working tree puede estar en una rama de trabajo cuyo contenido todavía no se mergeó
  // a ninguna rama distribuible; eso no es un defecto del provenance. Se exige que la
  // enorme mayoría coincida, no la totalidad.
  const ratio = (comprobadas - faltantes.length) / comprobadas;
  assert.ok(
    ratio > 0.9,
    `solo ${(ratio * 100).toFixed(1)}% del contenido en disco figura en su provenance ` +
    `(${faltantes.length} de ${comprobadas} ausentes). Correr \`npm run provenance:regen\`. ` +
    `Ejemplos: ${faltantes.slice(0, 5).join(", ")}`,
  );
}

// ── 4. Está al día respecto de la historia ───────────────────────────────────────────
// Se afirma sobre el exit code, que es el contrato declarado del generador: 0 al día,
// 1 desactualizado, 2 imposible de determinar. Parsear stderr acoplaría la suite al texto
// de los mensajes.
{
  const run = spawnSync(
    process.execPath,
    [resolve(root, ".claude/scripts/sofka-asdd-gen-provenance.mjs"), "--check"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(run.error, undefined, `no se pudo ejecutar el generador: ${run.error?.message}`);
  if (run.status === 2) {
    assert.ok(!hasHistory(), "el generador dijo 'indeterminado' con la historia disponible");
    console.log("  (clon sin las ramas distribuibles — chequeo de frescura salteado)");
  } else {
    assert.equal(
      run.status,
      0,
      `el provenance publicado está desactualizado: ${(run.stderr || "").trim()}`,
    );
  }
}

console.log(`OK — provenance: ${paths.length} rutas verificadas`);
