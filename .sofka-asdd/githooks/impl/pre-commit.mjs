// pre-commit — GS-001 (rama protegida) + ART-001 (naming de artefactos nuevos).
// Corre después de que git resolvió repo, rama e índice: sin parseo de shell.

import { currentBranch, hatchActive, repoRoot } from "../lib/facts.mjs";
import { checkArtifactNaming, checkProtectedBranch, enforcementPathsTouched } from "../lib/checks.mjs";
import { apply, info } from "../lib/report.mjs";
import { record } from "../lib/audit.mjs";

const cwd = repoRoot();
const branch = currentBranch(cwd);

// Cambiar el propio enforcement es trabajo legítimo en este template, pero
// nunca debe pasar inadvertido: se registra y se avisa, no se bloquea.
const tocadas = enforcementPathsTouched(cwd);
if (tocadas.length) {
  info(`este commit modifica ${tocadas.length} archivo(s) de enforcement:`);
  for (const f of tocadas.slice(0, 10)) info(`  · ${f}`);
  if (tocadas.length > 10) info(`  · … y ${tocadas.length - 10} más`);
  record({
    hook: "pre-commit",
    rule: "SYS-INTEGRITY",
    decision: "warn",
    detail: `enforcement modificado: ${tocadas.join(", ")}`,
    branch,
  });
}

apply(
  "pre-commit",
  branch,
  [checkProtectedBranch(branch), checkArtifactNaming(cwd)],
  { hatch: { active: hatchActive("SOFKA_ASDD_GUARD_BRANCH_DISABLE"), varName: "SOFKA_ASDD_GUARD_BRANCH_DISABLE" } }
);
