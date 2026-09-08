#!/usr/bin/env node
/**
 * test-context-footprint.mjs — la medicion del piso always-on tiene que seguir siendo
 * honesta cuando alguien toque los hooks.
 *
 * Cubre las tres formas en que el medidor anterior mentia:
 *   1. no veia los bloques que se inyectan por `unshift` o desde un `const [...]`;
 *   2. sumaba ramas que no pueden coincidir en un mismo turno;
 *   3. no avisaba cuando el hook consultaba una senal que el medidor no ubicaba.
 *
 * Las fixtures son hooks sinteticos: medir los reales ataria el test a su contenido y
 * fallaria en cada edicion de texto. Lo que se verifica es el comportamiento del medidor.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureHookInjection } from "../tools/measure-context-footprint.mjs";

const dir = mkdtempSync(join(tmpdir(), "asdd-footprint-"));
const write = (name, text) => { const f = join(dir, name); writeFileSync(f, text, "utf8"); return f; };
const chars = (n) => "x".repeat(n);

const sessionStart = write("session.mjs", `lines.push(\n  "${chars(100)}",\n);\n`);

// Hook sintetico con la misma forma que el real: dos bloques incondicionales, un grupo
// excluyente de dominio, uno independiente, y el bloque de LIGHT atomico.
const promptSubmit = write("prompt.mjs", `
export function getDeterministicRouteReminder(prompt) {
  const reminder = [
    "${chars(300)}",
  ];
  return reminder;
}

function main() {
  if (directLightAuthorization) {
    reminders.push(
      "${chars(60)}",
    );
  }

  if (profile.signals.includes("figma")) {
    reminders.push(
      "${chars(90)}",
    );
  }

  if (profile.signals.includes("data")) {
    reminders.push(
      "${chars(120)}",
    );
  } else if (profile.signals.includes("software")) {
    reminders.push(
      "${chars(40)}",
    );
  }

  const nucleoOrc = [
    "${chars(600)}",
  ];
  if (profile.mode === "full") reminders.unshift(...nucleoOrc);
}
`);

const result = measureHookInjection({ sessionStart, promptSubmit });
const { session, perTurn, conditional, unclassified, unmatchedPatterns } = result.breakdown;

// 1. El route reminder (300) es el unico incondicional de verdad por turno no-TRIVIAL: entra
//    por `unshift` fuera de un `push`, que es exactamente lo que el medidor viejo se perdia.
//    `nucleoOrc` (600) NO es incondicional -- el hook lo inyecta solo bajo
//    `profile.mode === "full"` -- asi que se cuenta del lado condicional (assert 2), no aca.
assert.equal(perTurn, 300, `incondicionales por turno: esperado 300, medido ${perTurn}`);
assert.equal(session, 100, `SessionStart: esperado 100, medido ${session}`);
assert.deepEqual(unmatchedPatterns, [], `los dos patrones incondicionales deben matchear, no matchearon: ${unmatchedPatterns.join(", ")}`);

// 2. `data` (120) y `software` (40) son excluyentes: se cobra 120, no 160. `nucleoOrc` (600)
//    se suma aparte, como directLight. Total condicional esperado =
//    120 (grupo) + 90 (figma) + 60 (LIGHT) + 600 (nucleoOrc) = 870.
assert.equal(conditional, 870, `condicionales: esperado 870 (rama mayor, no suma, + nucleoOrc), medido ${conditional}`);
assert.equal(result.chars, 1270, `total: esperado 1270, medido ${result.chars}`);
assert.deepEqual(unclassified, [], `sin senales sin clasificar, hubo: ${unclassified.join(", ")}`);
console.log("PASS context footprint: incondicionales contados y ramas excluyentes cobradas por la mayor");

// 3. Guarda contra deriva: una senal consultada cuya guarda el medidor no reconoce tiene que
//    salir reportada, no descontarse en silencio.
const drifted = write("drift.mjs", `
function main() {
  const gate = profile.signals.includes("senal-nueva");
  if (gate) {
    reminders.push("${chars(500)}");
  }
}
`);
const { breakdown: drift } = measureHookInjection({ sessionStart, promptSubmit: drifted });
assert.deepEqual(drift.unclassified, ["senal-nueva"], "una senal con guarda no reconocida debe reportarse");
console.log("PASS context footprint: la guarda contra deriva reporta senales no ubicadas");

// 4. Guarda contra deriva de forma: renombrar `nucleoOrc` rompe el regex que lo detecta.
//    Sin esta guarda, el bloque cae en silencio a 0 palabras y nadie se entera.
const renamed = write("renamed.mjs", `
export function getDeterministicRouteReminder(prompt) {
  const reminder = [
    "${chars(300)}",
  ];
  return reminder;
}

function main() {
  const orcCore = [
    "${chars(600)}",
  ];
  if (profile.mode === "full") reminders.unshift(...orcCore);
}
`);
const { breakdown: renamedBreakdown } = measureHookInjection({ sessionStart, promptSubmit: renamed });
assert.deepEqual(renamedBreakdown.unmatchedPatterns, ["nucleoOrc"], "un rename del bloque nucleoOrc debe reportarse como patron no encontrado");
console.log("PASS context footprint: la guarda contra deriva de forma reporta el patron renombrado");

rmSync(dir, { recursive: true, force: true });
