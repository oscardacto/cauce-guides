// -----------------------------------------------------------------------------
// report.mjs — salida uniforme y exit codes de los git hooks nativos ASDD.
// -----------------------------------------------------------------------------

import { record } from "./audit.mjs";

const PREFIX = "[asdd]";

export function info(message) {
  process.stderr.write(`${PREFIX} ${message}\n`);
}

/**
 * Aplica una lista de resultados de checks.
 *
 * @param {string} hook   nombre del hook (para la auditoría)
 * @param {string} branch rama efectiva
 * @param {Array<{ok:boolean, rule:string, message:string}>} results
 * @param {{ hatch?: {active: boolean, varName: string} }} [opts]
 * @returns {never} termina el proceso: 0 si pasa, 1 si bloquea
 */
export function apply(hook, branch, results, opts = {}) {
  const hatch = opts.hatch;
  const fallidos = results.filter((r) => r && !r.ok);

  if (hatch?.active) {
    // El escape hatch sigue existiendo por diseño (ADR-007), pero deja de ser
    // una línea efímera en stderr: queda en el log durable con lo que evitó.
    record({
      hook,
      rule: fallidos.map((f) => f.rule).join(",") || "none",
      decision: "hatch",
      detail: `${hatch.varName}=1 · evitó ${fallidos.length} bloqueo(s): ${fallidos.map((f) => f.rule).join(", ")}`,
      branch,
    });
    if (fallidos.length) {
      info(`ADVERTENCIA: ${hatch.varName} está activo — se omitieron ${fallidos.length} bloqueo(s):`);
      for (const f of fallidos) info(`  · ${f.rule}: ${f.message.split("\n")[0]}`);
      info(`Registrado en la auditoría. Usalo solo para operaciones autorizadas por el maintainer.`);
    }
    process.exit(0);
  }

  if (fallidos.length === 0) {
    process.exit(0);
  }

  info(`BLOQUEADO por ${fallidos.length} regla(s) en ${hook}:`);
  for (const f of fallidos) {
    info(`  ${f.rule}: ${f.message.split("\n")[0]}`);
    for (const extra of f.message.split("\n").slice(1)) info(`  ${extra}`);
  }
  record({
    hook,
    rule: fallidos.map((f) => f.rule).join(","),
    decision: "block",
    detail: fallidos.map((f) => f.message.split("\n")[0]).join(" | "),
    branch,
  });
  process.exit(1);
}
