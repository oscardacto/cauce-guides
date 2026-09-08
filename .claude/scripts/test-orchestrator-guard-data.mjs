#!/usr/bin/env node
/**
 * Test de regresión — excepción de dominio Smart Data en el orchestrator-guard
 * (ADR-011). Uso: node .claude/scripts/test-orchestrator-guard-data.mjs
 *
 * Los artefactos smart-data-eng-* bajo docs/specs/ y docs/architecture/ son
 * documentos vivos: el orquestador los actualiza con Edit/Write en los
 * Procedimientos C y Sync y en Publish (ADR-011). Esta suite protege esa
 * excepción Y su acotamiento — sin ella, la próxima auditoría la remueve
 * (es lo que pasó con la cláusula #8 del artifact-name-guard, ADR-003 Am. 3).
 *
 * D1 — Edit  docs/specs/smart-data-eng-discovery-fincondor.md          → permite
 * D2 — Edit  docs/architecture/smart-data-eng-design-fincondor.md      → permite
 * D3 — Edit  docs/specs/contracts/smart-data-eng-contract-silver-…     → permite
 * D4 — Edit  docs/specs/2026-08-20-001-SPECIFY-001-brief-x.md          → DENIEGA
 * D5 — Edit  src/servicio.ts                                           → DENIEGA
 * D6 — Write docs/otro/smart-data-eng-falso-x.md                       → DENIEGA (fuera de las raíces)
 *
 * D4–D6 son la prueba de que la grieta quedó acotada: solo el contrato Data
 * bajo las dos raíces declaradas entra por la excepción.
 */

import { getOrchestratorGuardDecision } from "../hooks/sofka-asdd-orchestrator-guard.mjs";

let passed = 0;
let failed = 0;

function assert(label, ok, detail = "") {
  if (ok) {
    console.log(`    ✅ ${label}`);
    passed++;
  } else {
    console.error(`    ❌ FAIL: ${label}${detail ? `  →  ${detail}` : ""}`);
    failed++;
  }
}

function decide(toolName, filePath) {
  return getOrchestratorGuardDecision({
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolName === "Write"
      ? { file_path: filePath, content: "x" }
      : { file_path: filePath, old_string: "a", new_string: "b" },
    cwd: process.cwd(),
  });
}

const CASES = [
  ["D1", "Edit", "docs/specs/smart-data-eng-discovery-fincondor.md", "allow"],
  ["D2", "Edit", "docs/architecture/smart-data-eng-design-fincondor.md", "allow"],
  ["D3", "Edit", "docs/specs/contracts/smart-data-eng-contract-silver-x-1.0.0.md", "allow"],
  ["D4", "Edit", "docs/specs/2026-08-20-001-SPECIFY-001-brief-x.md", "deny"],
  ["D5", "Edit", "src/servicio.ts", "deny"],
  ["D6", "Write", "docs/otro/smart-data-eng-falso-x.md", "deny"],
];

for (const [id, tool, filePath, expected] of CASES) {
  console.log(`${id}: ${tool} ${filePath} → ${expected === "allow" ? "permite" : "DENIEGA"}`);
  const r = decide(tool, filePath);
  if (expected === "allow") {
    assert("decisión null (permite, sin output)", r === null, `result=${JSON.stringify(r)?.slice(0, 160)}`);
  } else {
    assert("decisión deny", r?.decision === "deny", `result=${JSON.stringify(r)?.slice(0, 160)}`);
    assert("razón cita ORC-000", /ORC-000/.test(r?.reason ?? ""), r?.reason?.slice(0, 120));
  }
}

console.log(`\n=== Resultado: ${passed} PASS / ${failed} FAIL ===`);
process.exit(failed > 0 ? 1 : 0);
