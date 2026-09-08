'use strict';

/**
 * ATF — json-utils.js
 *
 * Helpers compartidos de lectura/escritura de JSON para los tools del framework.
 * Elimina duplicación de readJSON/writeJSON con BOM-stripping en validate-session,
 * validate-execution-output, validate-step-fidelity y cp-enricher.
 *
 * API:
 *   readJSON(filePath)           → parsea; null en cualquier error (ENOENT, parse)
 *   readJSONStrict(filePath)     → parsea; null solo en ENOENT, throw en parse error
 *   readJSONOrDie(filePath, die) → parsea; invoca die(msg) en error (incluye ENOENT)
 *   writeJSON(filePath, data, opts)
 *                                → opts.mkdirs (default true), opts.trailingNewline (default false)
 *   stripBOM(text)               → helper interno exportado por si alguien lo necesita
 */

const fs   = require('fs');
const path = require('path');

function stripBOM(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function readJSON(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(stripBOM(text));
  } catch {
    return null;
  }
}

function readJSONStrict(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(stripBOM(text));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function readJSONOrDie(filePath, die) {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(stripBOM(text));
  } catch (e) {
    die(`Error al leer ${filePath}: ${e.message}`);
  }
}

function writeJSON(filePath, data, opts) {
  const o = opts || {};
  const mkdirs           = o.mkdirs !== false;
  const trailingNewline  = o.trailingNewline === true;

  if (mkdirs) {
    const dir = path.dirname(filePath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const payload = JSON.stringify(data, null, 2) + (trailingNewline ? '\n' : '');
  fs.writeFileSync(filePath, payload, 'utf-8');
}

module.exports = {
  readJSON,
  readJSONStrict,
  readJSONOrDie,
  writeJSON,
  stripBOM,
};
