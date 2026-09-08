// pre-rebase — GS-007: sincronizar por merge, nunca por rebase.
//
// Es la única operación que la regla marca PROHIBIDO y que no tenía ningún
// enforcement: `git rebase` no aparecía en un solo patrón de la capa
// PreToolUse. GS-007 admite una excepción — "si el usuario pide rebase
// explícitamente, confirmar advirtiendo el riesgo" — y el escape hatch es
// justamente el mecanismo de esa excepción, ahora registrado en la auditoría.

import { currentBranch, hatchActive, repoRoot } from "../lib/facts.mjs";
import { apply } from "../lib/report.mjs";

const upstream = process.argv[2] || "(upstream)";
const rama = process.argv[3] || currentBranch(repoRoot()) || "(HEAD)";

const resultado = {
  ok: false,
  rule: "GS-007",
  message:
    `rebase de '${rama}' sobre '${upstream}' está prohibido.\n` +
      `  Sincronizá con merge:  git fetch origin ${String(upstream).replace(/^origin\//, "")} && git merge --no-ff ${upstream}\n` +
      `  Razón: el rebase re-aplica N commits y ya causó pérdida de código del equipo.\n` +
      `  Si el rebase es una decisión explícita y consciente, ejecutá con SOFKA_ASDD_GUARD_REBASE_DISABLE=1 (queda auditado).`,
};

apply(
  "pre-rebase",
  rama,
  [resultado],
  { hatch: { active: hatchActive("SOFKA_ASDD_GUARD_REBASE_DISABLE"), varName: "SOFKA_ASDD_GUARD_REBASE_DISABLE" } }
);
