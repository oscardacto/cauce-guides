// sofka-asdd-hash-normalize-lib.mjs — normalización compartida para hashing SHA-256
// cross-OS de artefactos versionados (rule-loading.json / coordinator-loading.json).
//
// Problema que resuelve: el validador y los tests hasheaban bytes crudos de disco.
// Con core.autocrlf=true el working tree materializa CRLF en Windows y LF en
// Linux/macOS/CI, así que el mismo blob de Git produce dos hashes distintos según
// el SO donde se generó o donde se valida. Un BOM UTF-8 accidental (ej. inyectado
// por PowerShell ConvertTo-Json) produce el mismo problema.
//
// Esta normalización es la ÚNICA fuente de verdad para "qué bytes se hashean".
// El validador y los generadores (sofka-asdd-regen-hashes.mjs,
// sofka-asdd-gen-provenance.mjs) DEBEN importar estas funciones — nunca
// reimplementarlas — para que no puedan divergir.
//
// Dos variantes, misma regla: normalizeForHash para texto ya decodificado (lo que
// lee el validador de disco) y normalizeBufferForHash para bytes crudos (blobs de
// git, donde no se puede asumir que el contenido sea texto).

import { readFileSync } from 'node:fs';

const BOM = '﻿';

/**
 * Normaliza texto para hashing/parsing cross-OS:
 * 1. Strip de BOM UTF-8 inicial (si existe).
 * 2. CRLF -> LF (line endings de Git en Windows con core.autocrlf=true).
 *
 * No toca el conteo de palabras, los checks de required_markers ni el
 * frontmatter parser — esos ya son CRLF-aware por su cuenta.
 */
export function normalizeForHash(text) {
  let normalized = String(text);
  if (normalized.charCodeAt(0) === 0xfeff || normalized.startsWith(BOM)) {
    normalized = normalized.slice(1);
  }
  normalized = normalized.replace(/\r\n/g, '\n');
  return normalized;
}

/** Lee un archivo de disco y devuelve su texto ya normalizado para hashing/parseo. */
export function readNormalized(filePath) {
  return normalizeForHash(readFileSync(filePath, 'utf8'));
}

/** Límite de sniffing binario: los primeros 8 KiB, el mismo criterio que usa git. */
const BINARY_SNIFF_LIMIT = 8000;

/**
 * Heurística de git: un byte NUL en la cabecera ⇒ binario.
 *
 * Sin esta guarda, un binario cuyos bytes difieren solo por un par 0D 0A se leería
 * como idéntico a otro que no lo es. El template distribuye hoy un solo binario
 * (el .xlsx semilla del diccionario de Smart Data), pero la regla tiene que estar
 * antes de que sean veinte.
 */
export function isBinaryBuffer(buf) {
  return buf.subarray(0, Math.min(BINARY_SNIFF_LIMIT, buf.length)).includes(0x00);
}

/**
 * Variante byte a byte de normalizeForHash, para contenido que NO viene de una lectura
 * de texto de disco: blobs de git, respuestas de red, cualquier Buffer.
 *
 * Existe porque `normalizeForHash` recibe un string ya decodificado como UTF-8, y esa
 * decodificación es destructiva para contenido binario: reemplaza cada secuencia inválida
 * por U+FFFD, así que dos binarios distintos pueden terminar con el mismo hash. Un
 * generador que recorre la historia del repo no puede asumir que todo lo que toca es
 * texto.
 *
 * Aplica exactamente las mismas dos transformaciones y en el mismo orden — strip de BOM
 * UTF-8, después CRLF → LF — y deja intacto el `\r` solitario, que es una diferencia real
 * de contenido. La única regla que agrega es la guarda binaria: un binario se devuelve tal
 * cual, sin tocar un byte.
 *
 * Contrato cross-repo: esta función y NormalizeForHash del CLI (internal/app/eol.go) tienen
 * que dar el mismo hash para los mismos bytes, o el manifiesto que escribe el CLI y los
 * hashes que publica el template dejan de poder compararse. Un test de paridad lo fija.
 */
export function normalizeBufferForHash(buf) {
  if (isBinaryBuffer(buf)) return buf;

  let out = buf;
  if (out.length >= 3 && out[0] === 0xef && out[1] === 0xbb && out[2] === 0xbf) {
    out = out.subarray(3);
  }
  if (!out.includes('\r\n')) return out;

  // Copia sin los CR que preceden a un LF. Se hace byte a byte y no con un replace sobre
  // string para no pasar por ninguna decodificación intermedia.
  const stripped = Buffer.allocUnsafe(out.length);
  let n = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] === 0x0d && out[i + 1] === 0x0a) continue;
    stripped[n] = out[i];
    n += 1;
  }
  return stripped.subarray(0, n);
}
