// reference-transaction — GS-004 (naming al crear rama) y GS-010 (borrado de ramas).
//
// Este hook corre en CADA actualización de referencia: fetch, merge, reset,
// checkout -b, branch -d. Un bloqueo mal calibrado acá rompe operaciones
// legítimas, así que por defecto solo AVISA y registra. Se vuelve bloqueante
// con ASDD_GITHOOKS_STRICT_REFS=1, una vez que el equipo confirmó que el
// aviso no produce falsos positivos en su flujo.

import { readFileSync } from "node:fs";
import { git, gitflowPrefixes, hatchActive, protectedBranches, repoRoot } from "../lib/facts.mjs";
import { record } from "../lib/audit.mjs";
import { info } from "../lib/report.mjs";

const estado = process.argv[2] || "";
// Solo la fase "prepared" puede rechazar la transacción.
if (estado !== "prepared") process.exit(0);
if (hatchActive("ASDD_GUARD_BRANCH_DISABLE")) process.exit(0);

const ZERO = /^0+$/;
const cwd = repoRoot();
const strict = process.env.ASDD_GITHOOKS_STRICT_REFS === "1";
const prefijos = gitflowPrefixes();
const protegidas = protectedBranches();

let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

const problemas = [];

for (const line of raw.split(/\r?\n/).filter(Boolean)) {
  const [oldSha, newSha, ref] = line.trim().split(/\s+/);
  if (!ref || !ref.startsWith("refs/heads/")) continue; // ignoramos remotos, tags y notas
  const rama = ref.slice("refs/heads/".length);

  const creacion = ZERO.test(oldSha || "") && !ZERO.test(newSha || "");
  const borrado = !ZERO.test(oldSha || "") && ZERO.test(newSha || "");

  if (creacion && !protegidas.includes(rama)) {
    if (!prefijos.some((p) => rama.startsWith(p))) {
      problemas.push(`GS-004: la rama nueva '${rama}' no usa un prefijo GitFlow (${prefijos.join(" ")}).`);
    } else if (rama.length > 60) {
      problemas.push(`GS-004: la rama nueva '${rama}' excede 60 caracteres.`);
    }
  }

  if (borrado && !protegidas.includes(rama)) {
    // GS-010 exige verificar que la rama esté integrada antes de borrarla.
    const mergeada = git(["branch", "--merged", "HEAD", "--format=%(refname:short)"], cwd);
    const lista = String(mergeada || "").split(/\r?\n/).map((s) => s.trim());
    if (!lista.includes(rama)) {
      problemas.push(
        `GS-010: se borra la rama '${rama}' y no aparece como mergeada en HEAD. Verificá la integración antes de borrarla.`
      );
    }
  }
}

if (problemas.length === 0) process.exit(0);

for (const p of problemas) info(p);
record({
  hook: "reference-transaction",
  rule: problemas.map((p) => p.split(":")[0]).join(","),
  decision: strict ? "block" : "warn",
  detail: problemas.join(" | "),
  branch: "",
});

if (!strict) {
  info("aviso únicamente. Activá ASDD_GITHOOKS_STRICT_REFS=1 para que estas reglas bloqueen.");
  process.exit(0);
}
process.exit(1);
