// pre-merge-commit — GS-001 sobre merges.
//
// Cierra un hueco concreto de la capa PreToolUse: su guard de rama solo
// intercepta `git commit`, así que un `git merge --no-ff` sobre una rama
// protegida pasaba sin control aunque GS-001 prohíba "escribir, commitear o
// reescribir historia" en esas ramas.

import { currentBranch, hatchActive, repoRoot } from "../lib/facts.mjs";
import { checkProtectedBranch } from "../lib/checks.mjs";
import { apply } from "../lib/report.mjs";

const branch = currentBranch(repoRoot());

apply(
  "pre-merge-commit",
  branch,
  [checkProtectedBranch(branch)],
  { hatch: { active: hatchActive("ASDD_GUARD_BRANCH_DISABLE"), varName: "ASDD_GUARD_BRANCH_DISABLE" } }
);
