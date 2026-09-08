#!/usr/bin/env node
// -----------------------------------------------------------------------------
// test-orc-ids-inyectados.mjs
//
// Todo ID normativo que el framework le INYECTA al modelo tiene que existir en
// las reglas. B13 fue precisamente eso al revés: `ORC-010-L` se le pasaba al
// modelo en cada turno y no estaba definido en ninguna parte — el modelo recibía
// una orden que no podía resolver ni verificar, y ninguna suite lo detectaba.
//
// No prueba comportamiento: prueba que la inyección y la norma no divergan.
// Corre en el repo, sin preparación y sin escribir nada.
//
// LÍMITE DECLARADO: los IDs compuestos se verifican a medias. `ORC-001/001-B`
// produce `ORC-001` y el `001-B` no se comprueba; lo mismo `ART-001/002` con el
// `002`. La forma que causó B13 (`ORC-010-L/F`) sí se detecta: el `\b` corta
// antes de la barra. Cerrar el resto pide expandir las formas con barra antes de
// matchear, y es una v2.
// -----------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..", "..");
const HOOK = join(RAIZ, ".claude/hooks/sofka-asdd-user-prompt-submit.mjs");

// Dónde puede estar definido un ID: las reglas, sus referencias, y CLAUDE.md
// (que es donde viven los CORE-*).
const DIRS = [join(RAIZ, ".claude/rules"), join(RAIZ, ".claude/references/rules")];
const SUELTOS = [join(RAIZ, "CLAUDE.md")];

if (!existsSync(HOOK)) {
  console.log(`❌ no existe el hook de inyección: ${HOOK}`);
  process.exit(1);
}

const normas = [
  ...DIRS.flatMap((dir) => (!existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => readFileSync(join(dir, e.name), "utf8")))),
  ...SUELTOS.filter(existsSync).map((f) => readFileSync(f, "utf8")),
].join("\n");

if (!normas.trim()) {
  console.log("❌ no se pudo leer ninguna regla: el test no puede concluir nada");
  process.exit(1);
}

const ID_RE = /\b((?:ORC|ART|CORE|GS|DEF)-\d{3}(?:-[A-Z])?)\b/g;
const citados = [...new Set(
  [...readFileSync(HOOK, "utf8").matchAll(ID_RE)].map((m) => m[1]),
)].sort();

if (!citados.length) {
  console.log("❌ el hook no cita ningún ID normativo: o cambió de forma, o la regex quedó vieja");
  process.exit(1);
}

const huerfanos = citados.filter((id) => !normas.includes(id));

console.log(`IDs normativos citados por el hook de inyección: ${citados.length}`);
console.log(`  ${citados.join(" ")}`);

if (huerfanos.length) {
  console.log(`\n❌ ${huerfanos.length} ID(s) que el modelo recibe y ninguna regla define:`);
  for (const id of huerfanos) console.log(`     ${id}`);
  console.log("\n   O el ID está mal escrito, o la norma falta. Las dos cosas son un defecto:");
  console.log("   el modelo recibe una instrucción que no puede resolver ni verificar.");
  process.exit(1);
}

console.log("\n✅ todos resuelven contra las reglas");
process.exit(0);
