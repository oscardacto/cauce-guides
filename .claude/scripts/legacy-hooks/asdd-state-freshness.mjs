#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/asdd-state-freshness.mjs
//
// Hook SessionStart — Tier C: ORC-007
// Lee .asdd-run.json en la raíz del proyecto y, si hay un run en estado
// no-complete, inyecta un recordatorio para que el orquestador retome desde
// el estado persistido en lugar de reiniciar desde cero.
//
// Si .asdd-run.json no existe o status === "complete" → no emite nada.
//
// Configuración (bloque `env` en .claude/settings.json):
//   ASDD_STATE_FRESHNESS_DISABLE=1  escape hatch auditable
// -----------------------------------------------------------------------------

import { readFileSync, existsSync } from "node:fs";
import { execSync as exec } from "node:child_process";
import { join } from "node:path";

function run(cmd) {
  try {
    return exec(cmd, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

function getRepoRoot() {
  return run("git rev-parse --show-toplevel") ?? process.cwd();
}

function main() {
  if (process.env.ASDD_STATE_FRESHNESS_DISABLE === "1") {
    process.exit(0);
  }

  const repoRoot = getRepoRoot();
  const statePath = join(repoRoot, ".asdd-run.json");

  if (!existsSync(statePath)) {
    process.exit(0);
  }

  let state;
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    process.exit(0);
  }

  if (state.status === "complete") {
    process.exit(0);
  }

  // Sanitiza valores interpolados para evitar inyección de newlines o strings muy largos
  function safe(v, max = 200) {
    return String(v ?? "").replace(/[\r\n]/g, " ").slice(0, max);
  }

  // Hay un run no terminado — inyectar recordatorio ORC-007
  const runId      = safe(state.run_id      ?? "(desconocido)");
  const status     = safe(state.status      ?? "(desconocido)");
  const phase      = safe(state.current_phase ?? state.phase ?? "(desconocida)");
  const resumeHint = state.resume_hint ? safe(state.resume_hint) : null;

  const lines = [
    "## ORC-007 — Run ASDD en progreso detectado (.asdd-run.json)",
    `  run_id: ${runId}`,
    `  status: ${status}`,
    `  fase actual: ${phase}`,
    resumeHint ? `  próximo paso: ${resumeHint}` : null,
    "",
    "INSTRUCCIÓN OBLIGATORIA (ORC-007):",
    "Antes de cualquier acción, leer .asdd-run.json para determinar el estado del workflow.",
    "  - Si la fase está 'complete' → NO reinvocar; leer artefactos directamente.",
    "  - Si está 'in_progress' → continuar desde completed_steps + pending_steps.",
    "  - Si está 'pending' → invocar normalmente.",
    "Ejecutar /asdd:resume para reconstruir el contexto mínimo.",
    "Ver asdd-checkpoint-resume.md para el protocolo completo.",
  ].filter(l => l !== null);

  console.log(lines.join("\n"));
  process.exit(0);
}

main();
