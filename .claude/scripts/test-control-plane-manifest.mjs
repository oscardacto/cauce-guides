#!/usr/bin/env node
// -----------------------------------------------------------------------------
// test-control-plane-manifest.mjs — P4 y P8 del plan «Clasificar por plano».
//
// El manifiesto de `.claude/hooks/_lib/asdd-command-plane.mjs` reemplazó a
// cuatro listas del mismo concepto con cuatro membresías distintas. Este archivo
// existe para que no vuelvan a divergir:
//
//   (a) un script distribuido del control-plane sin entrada en el manifiesto,
//   (b) una entrada del manifiesto sin archivo en disco,
//   (c) `settings.json` y el manifiesto declarando cosas distintas,
//
// son las tres formas en que la divergencia se reintroduce, y las tres fallan acá.
// -----------------------------------------------------------------------------

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTROL_PLANE, DOMAIN_EXEC } from "../hooks/_lib/asdd-command-plane.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..", "..");
const SCRIPTS = join(RAIZ, ".claude", "scripts");
const SETTINGS = join(RAIZ, ".claude", "settings.json");

let passed = 0;
let failed = 0;

function assert(label, ok, detail = "") {
  if (ok) {
    console.log(`  ✅ ${label}`);
    passed += 1;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? `  →  ${detail}` : ""}`);
    failed += 1;
  }
}

// --- (a) y (b) · manifiesto ↔ disco -----------------------------------------
console.log("Manifiesto de control-plane ↔ archivos en disco");
{
  const sinArchivo = Object.keys(CONTROL_PLANE).filter((script) => !existsSync(join(SCRIPTS, script)));
  assert(
    "toda entrada del manifiesto tiene su archivo",
    sinArchivo.length === 0,
    sinArchivo.join(", "),
  );

  // La cobertura obligatoria son los scripts que las reglas le mandan ejecutar al
  // orquestador o a un subagente, más los que hay que denegarle explícitamente.
  // No es «todo .mjs de scripts/»: los `test-*` y el tooling de mantenedor no son
  // control-plane y declararlos sería inventar autoridad que nadie pidió.
  const OBLIGATORIOS = [
    "asdd-resolve-rule.mjs",
    "asdd-resolve-capability.mjs",
    "asdd-load-capability.mjs",
    "asdd-route-request.mjs",
    "asdd-artifact-name.mjs",
    "asdd-run-bootstrap.mjs",
    "asdd-plan-authorization.mjs",
    "asdd-commit-authorization.mjs",
    "asdd-resolve-workspace.mjs",
    "asdd-regen-hashes.mjs",
    "validate-template.mjs",
  ];
  const faltantes = OBLIGATORIOS.filter((script) => !CONTROL_PLANE[script]);
  assert(
    "ningún script de control-plane distribuido quedó sin entrada",
    faltantes.length === 0,
    faltantes.join(", "),
  );

  const sinCallers = Object.entries(CONTROL_PLANE).filter(([, entradas]) =>
    Object.values(entradas).some((entrada) => !(entrada.callers instanceof Set) || !Array.isArray(entrada.effects)));
  assert(
    "toda entrada declara callers y effects",
    sinCallers.length === 0,
    sinCallers.map(([script]) => script).join(", "),
  );

  assert("DOMAIN_EXEC declara un agente por ejecutable", [...DOMAIN_EXEC.values()].every((agente) => typeof agente === "string" && agente.length > 0));
}

// --- (c) · manifiesto ↔ settings.json ---------------------------------------
//
// P8: las entradas `Bash(node .claude/scripts/…)` de `permissions.allow` se
// DERIVAN del manifiesto — solo las que tienen al orquestador en `callers`— y este
// test falla si divergen. Con el manifiesto por subcomando, lo que se deriva es la
// forma exacta: `commit-authorization approve` no se deriva nunca, y `plan-
// authorization approve/amend` tampoco, porque su forma canónica exige un UUID y
// no es expresable como prefijo (`exactRe`). Un permiso nativo más ancho que el
// manifiesto es autoridad concedida por la puerta de atrás.
console.log("\nManifiesto de control-plane ↔ permissions.allow de settings.json");
{
  const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
  const allow = settings.permissions?.allow ?? [];

  const esperadas = [];
  for (const [script, entradas] of Object.entries(CONTROL_PLANE)) {
    for (const [sub, entrada] of Object.entries(entradas)) {
      if (!entrada.callers.has("orchestrator")) continue;
      if (entrada.exactRe) continue;
      // Cuando la entrada declara UN solo flag válido, se deriva también el flag:
      // `route-request --file:*` es más estrecho que `route-request:*` y el
      // permiso nativo no tiene por qué ser más ancho que el manifiesto.
      const soloFlag = entrada.flags?.length === 1 ? ` ${entrada.flags[0]}` : "";
      const cola = sub === "*" ? soloFlag : ` ${sub}`;
      esperadas.push(`Bash(node .claude/scripts/${script}${cola}:*)`);
    }
  }
  esperadas.sort();

  const declaradas = allow.filter((regla) => regla.startsWith("Bash(node .claude/scripts/")).sort();
  const faltan = esperadas.filter((regla) => !declaradas.includes(regla));
  const sobran = declaradas.filter((regla) => !esperadas.includes(regla));

  assert("settings.json declara todo lo que el manifiesto le permite al orquestador", faltan.length === 0, faltan.join(" · "));
  assert("settings.json no declara nada que el manifiesto no permita", sobran.length === 0, sobran.join(" · "));

  // Una entrada repetida no cambia la decisión de permisos, pero sí oculta una
  // edición a medias: los duplicados que dejó 5113932 pasaron los dos asserts de
  // arriba porque `sobran` compara por pertenencia, no por multiplicidad.
  const repetidas = [...new Set(allow.filter((regla, i) => allow.indexOf(regla) !== i))];
  assert("permissions.allow no repite ninguna entrada", repetidas.length === 0, repetidas.join(" · "));

  const crudo = readFileSync(SETTINGS, "utf8");
  const commit = crudo.match(/commit-authorization/g) ?? [];
  assert("commit-authorization aparece exactamente una vez: solo `issue`, nunca `approve`", commit.length === 1, `apariciones: ${commit.length}`);
  assert("resolve-rule está declarado", crudo.includes("asdd-resolve-rule.mjs"));
  assert("resolve-capability está declarado", crudo.includes("asdd-resolve-capability.mjs"));
  assert("regen-hashes NO está declarado (D7)", !crudo.includes("asdd-regen-hashes.mjs"));
  assert("resolve-workspace NO está declarado (D7)", !crudo.includes("asdd-resolve-workspace.mjs"));
}

console.log(`\n${"─".repeat(52)}`);
console.log(`Manifiesto de control-plane: ${passed} ✅  ${failed} ❌`);
if (failed > 0) process.exit(1);
