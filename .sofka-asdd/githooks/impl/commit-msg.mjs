// commit-msg — GS-005 (conventional commits) + CORE-009 (sin atribución de IA).
// Es el único punto donde el mensaje real existe: la capa PreToolUse solo veía
// el string del comando, así que un heredoc o un -F archivo se le escapaban.

import { readFileSync } from "node:fs";
import { currentBranch, hatchActive, repoRoot } from "../lib/facts.mjs";
import { checkCommitMessage, checkNoAiAttribution } from "../lib/checks.mjs";
import { apply, info } from "../lib/report.mjs";

const file = process.argv[2];
if (!file) {
  info("commit-msg invocado sin archivo de mensaje; no hay nada que validar.");
  process.exit(0);
}

let raw = "";
try {
  raw = readFileSync(file, "utf8");
} catch (error) {
  info(`no se pudo leer el mensaje de commit (${error.message}); se permite para no romper el commit.`);
  process.exit(0);
}

apply(
  "commit-msg",
  currentBranch(repoRoot()),
  [checkCommitMessage(raw), checkNoAiAttribution(raw)],
  { hatch: { active: hatchActive("SOFKA_ASDD_GUARD_MSG_DISABLE"), varName: "SOFKA_ASDD_GUARD_MSG_DISABLE" } }
);
