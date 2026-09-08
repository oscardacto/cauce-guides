#!/usr/bin/env node
// Cubre `git -C <ruta>` cuando la ruta va ENTRECOMILLADA. En Windows los espacios
// en rutas son la norma, así que entrecomillar es obligatorio y no un caso raro.
// Los dos sitios que consumen el argumento de `-C` se prueban acá:
//   · classifySegment  -> el léxico de lectura (GIT_READ)
//   · isNarrowGitAdd   -> el `git add` acotado
import assert from "node:assert/strict";
import { classifySegment, isNarrowGitAdd } from "../hooks/_lib/asdd-command-plane.mjs";

const root = process.cwd();
const clase = (c) => classifySegment(c, { caller: "orchestrator", root, isFirst: true }).class;

// --- lectura: la ruta entrecomillada NO puede degradar la clase ---------------
for (const c of [
  "git -C nested status",
  'git -C "nested repo" status',
  "git -C 'otra ruta' log --oneline -5",
  'git -C "C:/Program Files/repo" diff',
  'git -C "a b" -C "c d" status',
  'git -C a -C "b c" status',
]) assert.equal(clase(c), "read", `${c}: lectura no reconocida`);

// --- no regresión: entrecomillar NO puede convertir una mutación en lectura ---
for (const c of [
  'git -C "nested repo" push',
  'git -C "nested repo" commit -m x',
  'git -C "nested repo" reset --hard',
]) assert.notEqual(clase(c), "read", `${c}: mutación clasificada como lectura`);

// --- no regresión: la sustitución de comando sigue siendo peligrosa -----------
for (const c of ['git -C "$(whoami)" status', "git -C \"`whoami`\" status"])
  assert.equal(clase(c), "dangerous", `${c}: sustitución no detectada`);

// --- git add acotado: el segundo sitio del mismo patrón ----------------------
for (const c of [
  "git -C nested add archivo.txt",
  'git -C "nested repo" add archivo.txt',
  "git -C 'nested repo' add archivo.txt",
  'git -C "nested repo" add a.txt b.txt',
]) assert.equal(isNarrowGitAdd(c), true, `${c}: add acotado no reconocido`);

// --- no regresión: el staging amplio sigue frenado, CON Y SIN comillas -------
// El shell hace quote removal en CUALQUIER posición de la palabra, no solo en los
// extremos: `""-A`, `"-"A` y `".""."/x` llegan a git como `-A`, `-A` y `../x`. Un
// strip de extremos los deja pasar, por eso el predicado resuelve la palabra.
// Los `String.raw` son deliberados: en un literal normal `'\-A'` colapsa a `'-A'`
// y el caso se convierte en un duplicado silencioso del de arriba.
for (const c of [
  'git -C "nested repo" add -A',
  'git -C "nested repo" add .',
  'git -C "nested repo" add *',
  'git -C "nested repo" add ../x',
  'git -C "nested repo" add "-A"',
  'git -C "nested repo" add "-u"',
  'git -C "nested repo" add "."',
  'git -C "nested repo" add "*"',
  "git -C 'nested repo' add '-A'",
  'git -C "nested repo" add a.txt "-A"',
  'git add "-A"',
  // comillas en posición interior — el strip de extremos NO los frena
  'git -C "nested repo" add ""-A',
  'git -C "nested repo" add "-"A',
  'git -C "nested repo" add -""A',
  'git -C "nested repo" add "".',
  'git -C "nested repo" add .""',
  "git -C 'nested repo' add ''*",
  'git -C "nested repo" add ".""."/x',
  'git add ""-A',
  'git add "".',
  // barra invertida — con String.raw, que es lo que preserva la barra real
  String.raw`git -C "nested repo" add \-A`,
  // `$'…'` es ANSI-C quoting y `$"…"` traducción por locale: bash entrega `-A`.
  // El resolvedor no las modela y falla cerrado.
  String.raw`git -C "nested repo" add $'-A'`,
  String.raw`git -C "nested repo" add $"-A"`,
  String.raw`git -C "nested repo" add $'\x2dA'`,
  String.raw`git -C "nested repo" add $'.'`,
  String.raw`git -C "nested repo" add $'../x'`,
  String.raw`git add $'-A'`,
]) assert.equal(isNarrowGitAdd(c), false, `${c}: staging amplio admitido`);

// --- y lo que NO se puede romper: comillas que producen un pathspec literal ---
// `"'-A'"` resuelve a `'-A'`: las comillas simples son literales dentro de dobles,
// así que git recibe un pathspec, no una opción. Una remoción ingenua lo rompería.
// `"$'-A'"` y `'$-A'` son el mismo caso: el `$` entrecomillado NO abre ANSI-C.
for (const c of [
  `git -C "nested repo" add "'-A'"`,
  `git -C "nested repo" add '"-A"'`,
  'git -C "nested repo" add "mi archivo.txt"',
  String.raw`git -C "nested repo" add "$'-A'"`,
  String.raw`git -C "nested repo" add '$-A'`,
]) assert.equal(isNarrowGitAdd(c), true, `${c}: pathspec literal rechazado`);

console.log("PASS git -C con ruta entrecomillada (lectura + add acotado)");
