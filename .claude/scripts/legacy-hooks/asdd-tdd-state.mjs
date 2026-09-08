#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/asdd-tdd-state.mjs
//
// Hook SessionStart — Tier C: ORC-009
// Lee .asdd/testing-capabilities.yaml y, si strict_tdd: true, inyecta
// el estado TDD en el contexto para que el orquestador lo forwarde a
// asdd-developer-frontend / asdd-developer-backend (Construir) y asdd-atf-api-qa-engineer (Verificar)
// sin necesidad de releer el archivo por delegación.
//
// Si strict_tdd: false o el archivo no existe → no emite nada.
//
// Configuración (bloque `env` en .claude/settings.json):
//   ASDD_TDD_STATE_DISABLE=1  escape hatch auditable
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

// Parser YAML mínimo — solo necesitamos leer claves simples key: value
// S-004: strict_tdd solo se activa si la clave está al nivel raíz (sin indentación).
// Una clave indentada (nested) no debe activar el modo TDD.
function parseYamlSimple(content) {
  const result = {};
  for (const line of content.split("\n")) {
    // Solo parsear líneas sin indentación inicial (nivel raíz)
    if (/^\s/.test(line)) continue;
    const m = line.match(/^(\w[\w.]*)\s*:\s*(.+)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim();
      // Booleans
      if (val === "true")  val = true;
      if (val === "false") val = false;
      result[key] = val;
    }
  }
  return result;
}

function main() {
  if (process.env.ASDD_TDD_STATE_DISABLE === "1") {
    process.exit(0);
  }

  const repoRoot = getRepoRoot();
  const capPath = join(repoRoot, ".asdd", "testing-capabilities.yaml");

  if (!existsSync(capPath)) {
    process.exit(0);
  }

  let cfg;
  try {
    cfg = parseYamlSimple(readFileSync(capPath, "utf8"));
  } catch {
    process.exit(0);
  }

  if (cfg.strict_tdd !== true) {
    process.exit(0);
  }

  // Sanitiza valores interpolados para evitar inyección de newlines o strings muy largos
  function safe(v, max = 200) {
    return String(v ?? "").replace(/[\r\n]/g, " ").slice(0, max);
  }

  // Clave canónica: runner.command; los demás son fallbacks para variantes históricas del archivo
  const testCommand = safe(cfg["runner.command"] ?? cfg.runner_command ?? cfg.command ?? "(ver testing-capabilities.yaml)");

  const lines = [
    "## ORC-009 — STRICT TDD MODE ACTIVO",
    `Test runner: ${testCommand}`,
    "",
    "INSTRUCCIÓN OBLIGATORIA para el orquestador:",
    "Al delegar a asdd-developer-frontend o asdd-developer-backend (Construir) o asdd-atf-api-qa-engineer (Verificar),",
    "DEBES inyectar en el prompt del sub-agente:",
    "  STRICT TDD MODE ACTIVO.",
    `  Test runner: ${testCommand}`,
    "  Seguir el módulo strict-tdd.md (developer) o strict-tdd-verify.md (QA).",
    "  No caer en flujo estándar.",
    "",
    "Ver asdd-orchestration-tdd.md § ORC-009 para el protocolo completo.",
  ];

  console.log(lines.join("\n"));
  process.exit(0);
}

main();
