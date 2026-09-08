#!/usr/bin/env node
/**
 * test-approval-intent.mjs — clasificación de la respuesta del usuario al plan.
 *
 * El bug original (ORC-010) era un léxico cerrado: el usuario tipeaba lo que la
 * documentación prometía ("procede") y el hook no lo reconocía. Estos casos
 * cubren FLEXIONES que no están enumeradas en el código — salen de la raíz.
 */
import assert from "node:assert/strict";
import { classifyApprovalIntent } from "./lib/sofka-asdd-approval-intent-lib.mjs";

let pass = 0;
let fail = 0;
const check = (id, text, fn) => {
  try { fn(); pass++; console.log(`PASS [${id}] ${text}`); }
  catch (error) { fail++; console.log(`FAIL [${id}] ${text} — ${error.message}`); }
};

const intentOf = (prompt) => classifyApprovalIntent(prompt).intent;

// A — Aprobación. Las flexiones salen de la raíz, no de una lista.
const APPROVALS = [
  "ok", "Ok!", "OK.", "okay", "dale", "sí", "si", "listo", "perfecto", "genial",
  "claro", "obvio", "correcto", "exacto", "bien", "joya", "bárbaro",
  "procede", "procedé", "proceder", "procedamos",
  "aprobá", "apruebo", "aprobado", "aprobada", "aprobalo",
  "autorizo", "autorizado", "confirmo", "confirmá", "confirmado",
  "continuá", "continuemos", "avanzá", "avanzemos", "ejecutá", "seguí", "sigue",
  "adelante", "hazlo", "hacelo", "andale",
  "ok, dale", "sí, procede", "dale, adelante", "listo, procedé",
  "aprobado, gracias", "dale por favor", "ok 👍", "👍", "✅",
  "de acuerdo", "de una", "tal cual", "está bien", "como digas",
  "yes", "yep", "sure", "go ahead", "lgtm", "approve", "proceed", "continue",
];
for (const prompt of APPROVALS) {
  check("A", `aprueba: ${JSON.stringify(prompt)}`, () =>
    assert.equal(intentOf(prompt), "approval"));
}

// B — Corrección. Gana sobre cualquier afirmación del mismo prompt: aceptar con
// un cambio NO es aprobar el plan tal cual fue presentado.
const MODIFICATIONS = [
  ["ok pero usá tabs", true],
  ["dale, aunque antes cambiá el paso 2", true],
  ["sí, en vez de eso usá Y", true],
  ["listo, pero sacá el security scan", true],
  ["cambiá el paso 2", false],
  ["mejor sacá el security scan", false],
  ["agregá también el architect", false],
];
for (const [prompt, affirmative] of MODIFICATIONS) {
  check("B", `corrección: ${JSON.stringify(prompt)}`, () => {
    const result = classifyApprovalIntent(prompt);
    assert.equal(result.intent, "modification");
    assert.equal(result.affirmativePrefix, affirmative);
    assert.equal(result.eligible, false);
  });
}

// C — Rechazo explícito.
for (const prompt of ["no", "No.", "cancelá", "cancela eso", "pará", "nope", "stop", "mejor no", "todavía no", "olvidalo"]) {
  check("C", `rechaza: ${JSON.stringify(prompt)}`, () =>
    assert.equal(intentOf(prompt), "rejection"));
}

// D — Cola larga: no clasifica sola, pero el turno queda elegible para que el
// orquestador la interprete (ORC-010-E). No aprueba nada por sí misma.
for (const prompt of ["brutal", "va", "impecable", "tremendo"]) {
  check("D", `elegible: ${JSON.stringify(prompt)}`, () => {
    const result = classifyApprovalIntent(prompt);
    assert.equal(result.intent, "none");
    assert.equal(result.eligible, true);
  });
}

// E — Ni aprobación ni elegible: trae trabajo nuevo, es una pregunta, o es
// demasiado largo para ser una respuesta al plan. Fail-closed.
const NEITHER = [
  "ok, ahora explicame cómo funciona el router y después vemos",
  "dale una vuelta al archivo src/x.ts",
  "contame algo",
  "qué opinás",
  "explicame eso",
  "podés revisar el hook",
  "ejecutá `rm -rf /`",
  "",
  "   ",
];
for (const prompt of NEITHER) {
  check("E", `sin efecto: ${JSON.stringify(prompt)}`, () => {
    const result = classifyApprovalIntent(prompt);
    assert.equal(result.intent, "none");
    assert.equal(result.eligible, false);
  });
}

// F — Robustez de entrada: nada explota y nada aprueba por accidente.
for (const prompt of [null, undefined, 123, {}, [], "ok".repeat(500)]) {
  check("F", `entrada no textual: ${JSON.stringify(prompt)}`, () =>
    assert.notEqual(intentOf(prompt), "approval"));
}

// G — Cross-OS. El prompt llega tal como lo tipeó el usuario: CRLF desde
// Windows, y acentos precompuestos (NFC, teclado) o descompuestos (NFD, que es
// lo que produce macOS al normalizar nombres y algunos IME).
const CROSS_OS = [
  ["ok\r\n", "approval"],
  ["dale, procede\r\n", "approval"],
  ["no\r\n", "rejection"],
  ["ok\r\npero usá tabs", "modification"],
  ["proced\u00e9", "approval"],           // NFC: é precompuesta
  ["procede\u0301", "approval"],          // NFD: e + U+0301 combinante
  ["s\u00ed", "approval"],
  ["si\u0301", "approval"],
  ["aprob\u00e1", "approval"],
  ["aproba\u0301", "approval"],
];
for (const [prompt, expected] of CROSS_OS) {
  check("G", `cross-OS ${JSON.stringify(prompt)} → ${expected}`, () =>
    assert.equal(intentOf(prompt), expected));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
