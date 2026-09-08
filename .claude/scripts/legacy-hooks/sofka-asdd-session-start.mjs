#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/sofka-asdd-session-start.mjs
//
// Hook SessionStart: anuncia el estado git y las reglas ASDD activas al inicio
// de sesión. Refuerza GS-004 (naming) y sirve de backbone para routing forzado
// (ORC-000/ORC-001-B — ver sofka-asdd-orchestration.md + #3524/#3577).
//
// Salida por stdout → inyectada como <system-reminder> en la conversación.
// El modelo la recibe SIEMPRE al arrancar, sin que el usuario lo pida.
//
// Configuración (bloque `env` en .claude/settings.json):
//   SOFKA_ASDD_SESSION_START_DISABLE=1   escape hatch auditable
//   SOFKA_ASDD_PROTECTED_BRANCHES        lista CSV. Default: main,master,qa,dev,develop
// -----------------------------------------------------------------------------

import { execSync as exec } from "node:child_process";

const GS004_RE = /^(feature|fix|hotfix|chore|refactor|test|docs)\/.+/;

function run(cmd) {
  try {
    return exec(cmd, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

function main() {
  if (process.env.SOFKA_ASDD_SESSION_START_DISABLE === "1") {
    console.log("[session-start] Desactivado vía SOFKA_ASDD_SESSION_START_DISABLE=1.");
    process.exit(0);
  }

  const branch    = run("git symbolic-ref --short HEAD");
  const dirty     = run("git status --porcelain");
  const protected_ = (process.env.SOFKA_ASDD_PROTECTED_BRANCHES || "main,master,qa,dev,develop")
    .split(",").map(b => b.trim()).filter(Boolean);

  const out = ["## ASDD — Estado de sesión (auto-activado por hook SessionStart)"];

  if (!branch) {
    out.push("⚠ Rama: no es un repo git o HEAD está detached.");
  } else {
    const isProtected = protected_.includes(branch);
    const badNaming   = !GS004_RE.test(branch) && !isProtected;
    out.push(`🌿 Rama activa: \`${branch}\``);
    if (isProtected) out.push("  ⛔ RAMA PROTEGIDA — NO hacer commits directos (GS-001). Crear feature branch primero.");
    if (badNaming)   out.push("  ⚠ Naming (GS-004): usa prefijo feature/|fix/|hotfix/|chore/|refactor/|test/|docs/ + kebab-case.");
    out.push(dirty ? "  📝 Working tree: hay cambios sin commitear." : "  ✅ Working tree: limpio.");
  }

  out.push(
    "",
    "## ASDD — núcleo de ejecución",
    "• Resolver la profundidad con `sofka-asdd-route-request.mjs`: TRIVIAL/LIGHT/MEDIUM/FULL.",
    "• TRIVIAL: lectura o acción mecánica mínima; LIGHT: cambio atómico; MEDIUM: explorar+implementar+verificar; FULL: workflow ASDD.",
    "• Baja confianza escala exactamente un nivel; dominios sensibles solo escalan.",
    "• Antes de W/D: emitir challenge de plan; `ok` solo confirma el challenge activo. GS-003 mantiene commit explícito.",
    "• Cargar reglas y skills especializados por fase/ruta; no releer ni repetir artefactos ya persistidos.",
    "• Reglas especializadas: resolver por ruta con `sofka-asdd-resolve-rule.mjs`; controles universales permanecen en `.claude/rules/`.",
    "• Contexto: <60% normal; 60–70% leer selectivamente; 70–80% compactar al cierre de paso; >80% compactar antes de delegar."
  );

  console.log(out.join("\n"));
  process.exit(0);
}

main();
