#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/asdd-model-strategy.mjs
//
// Hook SessionStart — Tier C: ORC-002-B
// Lee model_strategy.phase_default del lock y emite una tabla compacta de
// fase → modelo para que el orquestador la use al resolver el modelo de cada
// agente sin necesidad de leer el lock inline.
//
// Si el lock no tiene model_strategy → no emitir nada (backwards-compat).
//
// Configuración (bloque `env` en .claude/settings.json):
//   ASDD_MODEL_STRATEGY_DISABLE=1  escape hatch auditable
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

function readLock(repoRoot) {
  const lockPath = join(repoRoot, ".asdd", "asdd.lock");
  if (!existsSync(lockPath)) return null;
  try { return JSON.parse(readFileSync(lockPath, "utf8")); } catch { return null; }
}

function main() {
  if (process.env.ASDD_MODEL_STRATEGY_DISABLE === "1") {
    process.exit(0);
  }

  const repoRoot = getRepoRoot();
  const lock = readLock(repoRoot);

  if (!lock?.model_strategy?.phase_default) {
    // Sin model_strategy → sin output (backwards-compat)
    process.exit(0);
  }

  const pd = lock.model_strategy.phase_default;

  // Sanitiza valores interpolados para evitar inyección de newlines o strings muy largos
  function safe(v, max = 200) {
    return String(v ?? "").replace(/[\r\n]/g, " ").slice(0, max);
  }

  // Orden canónico de fases
  const phases = ["specify", "analyze", "design", "build", "verify", "document"];
  const activeFases = phases.filter(f => pd[f]);

  // BL-01: guard contra array vacío (Math.max() con spread vacío devuelve -Infinity)
  if (activeFases.length === 0) process.exit(0);

  // Padding dinámico: ajuste al nombre de fase más largo para que la tabla markdown no se rompa
  const maxLen = Math.max(...activeFases.map(f => f.length));
  const separator = "-".repeat(maxLen + 2);
  const rows = activeFases.map(f => `| ${f.padEnd(maxLen)} | ${safe(pd[f])} |`);

  const lines = [
    "## ORC-002-B — Model Strategy (leído de .asdd/asdd.lock)",
    "El orquestador resuelve modelo por precedencia: skill_override > agent_pinning > phase_default > frontmatter.",
    "",
    `| ${"Fase".padEnd(maxLen)} | Modelo |`,
    `|${separator}|--------|`,
    ...rows,
    "",
    "Usar estos valores al invocar agentes. Si existe skill_override o agent_pinning → tienen precedencia.",
    "Ver asdd-orchestration-ops.md § ORC-002-B para la cadena completa.",
  ];

  console.log(lines.join("\n"));
  process.exit(0);
}

main();
