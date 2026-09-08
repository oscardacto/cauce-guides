#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/sofka-asdd-codebase-size.mjs
//
// Hook SessionStart — Tier C: ORC-001-D
// Auto-detecta `codebase_size` (small | large) usando el algoritmo 2-de-3:
//   Señal 1 — archivos fuente (find en src/ con extensiones configurables)
//   Señal 2 — commits (git rev-list --count HEAD)
//   Señal 3 — archivos docs (find en docs/)
//
// Si 2 o más señales superan sus umbrales → large; caso contrario → small.
// El resultado se inyecta como <system-reminder> para que el orquestador
// lo aplique en ORC-001-B sin ejecutar la detección inline.
//
// Configuración (bloque `env` en .claude/settings.json):
//   SOFKA_ASDD_CODEBASE_SIZE_DISABLE=1  escape hatch auditable
//
// Precedencia:
//   1. SOFKA_ASDD_CODEBASE_SIZE_DISABLE=1 → no emitir nada
//   2. project_context.maturity en .sofka-asdd/sofka-asdd.lock → usar ese valor
//   3. auto-detección 2-de-3
// -----------------------------------------------------------------------------

import { execSync as exec } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function run(cmd) {
  try {
    return exec(cmd, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

function readLock(repoRoot) {
  const lockPath = join(repoRoot, ".sofka-asdd", "sofka-asdd.lock");
  if (!existsSync(lockPath)) return null;
  try { return JSON.parse(readFileSync(lockPath, "utf8")); } catch { return null; }
}

function getRepoRoot() {
  return run("git rev-parse --show-toplevel") ?? process.cwd();
}

function detectSize(lock) {
  const thresholds = lock?.detection_thresholds?.codebase_size ?? {};
  const sourceFilesThreshold = thresholds.source_files ?? 200;
  const commitsThreshold     = thresholds.commits      ?? 300;
  const docsFilesThreshold   = thresholds.docs_files   ?? 30;
  const signalsRequired      = thresholds.signals_required ?? 2;

  // Señal 1 — archivos fuente
  // -maxdepth 25 evita descender indefinidamente en symlinks o repos muy profundos (S-003)
  // run() puede devolver null si src/ no existe → el fallback ?? "0" produce señal 0 (no activa el umbral)
  const sourceCount = parseInt(
    run('find src/ -maxdepth 25 -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.java" -o -name "*.go" \\) 2>/dev/null | wc -l') ?? "0",
    10
  );

  // Señal 2 — commits
  const commitCount = parseInt(run("git rev-list --count HEAD 2>/dev/null") ?? "0", 10);

  // Señal 3 — docs
  // -maxdepth 25 evita descender indefinidamente (S-003)
  const docsCount = parseInt(
    run("find docs/ -maxdepth 25 -type f 2>/dev/null | wc -l") ?? "0",
    10
  );

  const signals = [
    { name: "source_files", value: sourceCount, threshold: sourceFilesThreshold },
    { name: "commits",      value: commitCount, threshold: commitsThreshold },
    { name: "docs_files",   value: docsCount,   threshold: docsFilesThreshold },
  ];

  const over = signals.filter(s => s.value >= s.threshold);
  const isLarge = over.length >= signalsRequired;

  return { isLarge, signals, over, signalsRequired };
}

function main() {
  if (process.env.SOFKA_ASDD_CODEBASE_SIZE_DISABLE === "1") {
    process.exit(0);
  }

  const repoRoot = getRepoRoot();
  const lock = readLock(repoRoot);

  // Precedencia 1: override por lock
  const maturity = lock?.project_context?.maturity;
  if (maturity === "large" || maturity === "small") {
    console.log([
      `## ORC-001-D — codebase_size: ${maturity} (override por .sofka-asdd/sofka-asdd.lock → project_context.maturity)`,
      "Este valor está fijado en el lock — la auto-detección 2-de-3 no se ejecuta.",
      "El orquestador usa este valor en ORC-001-B para decidir si inyectar scope restriction en ruta LIGHT.",
    ].join("\n"));
    process.exit(0);
  }

  // Auto-detección
  const { isLarge, signals, over, signalsRequired } = detectSize(lock);
  const size = isLarge ? "large" : "small";

  const signalSummary = signals
    .map(s => `${s.name}=${s.value}`)
    .join(", ");
  const overCount = `${over.length}/${signals.length}`;

  const lines = [
    `## ORC-001-D — codebase_size: ${size} (auto-detección 2-de-3: ${signalSummary} — ${overCount} sobre umbral)`,
  ];

  if (isLarge) {
    lines.push(
      "Aplica scope restriction en ruta LIGHT (Tipos 2 y 3): anteponer sofka-asdd-explorer + inyectar bloque SCOPE RESTRICTION.",
      "Ver sofka-asdd-orchestration.md § Modulación por codebase_size y sofka-asdd-routing-heuristics-size.md."
    );
  } else {
    lines.push(
      "Sin cambios en comportamiento LIGHT — el orquestador delega directo al agente sin scope restriction adicional."
    );
  }

  console.log(lines.join("\n"));
  process.exit(0);
}

main();
