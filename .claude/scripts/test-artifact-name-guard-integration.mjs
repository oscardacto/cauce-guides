#!/usr/bin/env node
/**
 * test-artifact-name-guard-integration.mjs
 *
 * Test de integración helper → guard (Bug A, 2026-07-07-001-BUILD-005, ítem A5).
 * Verifica que el helper de naming (sofka-asdd-artifact-name.mjs) y el guard
 * (sofka-asdd-pre-tool-use-artifact-name-guard.mjs) comparten la misma lógica
 * de resolución de fase (A2), que --dry-run no consume artifact_seq (A4), y
 * que un run cerrado degrada a warning en vez de bloquear (A7).
 *
 * Ejecutar: node .claude/scripts/test-artifact-name-guard-integration.mjs
 *
 * Casos:
 *   (1) current_phase en español ("DISENAR", no matchea el enum) con
 *       phases.design.status="in_progress" → el guard resuelve "design" por
 *       fallback y NO bloquea un archivo válido de esa fase.
 *   (2) sin current_phase, phases.build.status="in_progress" → el guard
 *       resuelve "build" por fallback.
 *   (3) --dry-run del helper no incrementa artifact_seq.
 *   (4) run status="complete" → bloquea artefactos nuevos.
 *   (5) nombre generado por el helper (fase válida) siempre pasa el guard.
 *   (6) no hay excepciones dentro de docs/**; código fuera de docs se excluye.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { deriveArtifactName } from "./lib/sofka-asdd-artifact-name-lib.mjs";
import { getArtifactNameDecision } from "../hooks/sofka-asdd-pre-tool-use-artifact-name-guard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUARD = join(__dirname, "..", "hooks", "sofka-asdd-pre-tool-use-artifact-name-guard.mjs");
const HELPER = join(__dirname, "sofka-asdd-artifact-name.mjs");

let passed = 0;
let failed = 0;

const tempDirs = [];
process.on("exit", () => {
  for (const d of tempDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
});

function makeTmpDir() {
  const d = mkdtempSync(join(tmpdir(), "artifact-guard-integration-"));
  tempDirs.push(d);
  return d;
}

function assert(label, ok, detail = "") {
  if (ok) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function writeFixture(dir, overrides = {}) {
  const base = {
    run_id: "2026-07-07-001",
    feature: "test feature",
    started_at: "2026-07-07T10:00:00Z",
    last_checkpoint: "2026-07-07T10:00:00Z",
    status: "in_progress",
    artifact_seq: 1,
    phases: {},
    context_summary: "test",
    resume_hint: "continuar",
  };
  const fixture = { ...base, ...overrides };
  writeFileSync(join(dir, ".asdd-run.json"), JSON.stringify(fixture, null, 2), "utf8");
  return fixture;
}

function runGuard(dir, filePath) {
  const payload = {
    tool_name: "Write",
    tool_input: { file_path: filePath },
    cwd: dir,
  };
  const decision = getArtifactNameDecision(payload, {});
  return decision?.decision === "deny"
    ? { status: 2, stderr: decision.reason ?? "" }
    : { status: 0, stderr: (decision?.effects ?? []).map((effect) => effect.message).join("\n") };
}

function runHelper(dir, extraArgs = []) {
  return spawnSync(process.execPath, [HELPER, ...extraArgs], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: "utf8",
    timeout: 8000,
  });
}

// ---------------------------------------------------------------------------
// Caso 1: current_phase en español (inválido) + fallback a phases.design.in_progress
// ---------------------------------------------------------------------------
console.log("\nCaso (1): current_phase español inválido → fallback a phases.*.in_progress\n");
{
  const dir = makeTmpDir();
  writeFixture(dir, {
    current_phase: "DISENAR",
    phases: { design: { status: "in_progress" } },
  });

  const filePath = join(dir, "docs", "specs", "2026-07-07-001-DESIGN-001-foo.md");
  const result = runGuard(dir, filePath);

  assert("guard exit 0 (fallback resuelve design)", result.status === 0, `exit=${result.status} stderr=${result.stderr}`);
}

// ---------------------------------------------------------------------------
// Caso 2: sin current_phase, phases.build.in_progress
// ---------------------------------------------------------------------------
console.log("\nCaso (2): sin current_phase, phases.build.status=in_progress\n");
{
  const dir = makeTmpDir();
  writeFixture(dir, {
    phases: { build: { status: "in_progress" } },
  });

  const filePath = join(dir, "docs", "specs", "2026-07-07-001-BUILD-001-foo.md");
  const result = runGuard(dir, filePath);

  assert("guard exit 0 (fallback resuelve build)", result.status === 0, `exit=${result.status} stderr=${result.stderr}`);

  const filePathWrongPhase = join(dir, "docs", "specs", "2026-07-07-001-VERIFY-001-foo.md");
  const resultWrong = runGuard(dir, filePathWrongPhase);
  assert("guard exit 2 sobre PHASE que no matchea el fallback", resultWrong.status === 2, `exit=${resultWrong.status}`);
}

// ---------------------------------------------------------------------------
// Caso 3: --dry-run no incrementa artifact_seq
// ---------------------------------------------------------------------------
console.log("\nCaso (3): --dry-run no incrementa artifact_seq\n");
{
  const dir = makeTmpDir();
  writeFixture(dir, {
    artifact_seq: 4,
    phases: { build: { status: "in_progress" } },
  });

  const result = runHelper(dir, ["--slug", "algo", "--dry-run"]);
  assert("helper exit 0 en --dry-run", result.status === 0, `exit=${result.status} stderr=${result.stderr}`);

  const name = deriveArtifactName({ run_id: "2026-07-07-001", status: "in_progress", artifact_seq: 4 }, { phase: "build", slug: "algo" }).name;
  assert("nombre calculado correctamente (SEQ 005)", name === "2026-07-07-001-BUILD-005-algo.md", `got="${name}"`);

  const afterRun = JSON.parse(readFileSync(join(dir, ".asdd-run.json"), "utf8"));
  assert("artifact_seq NO se incrementó", afterRun.artifact_seq === 4, `got=${afterRun.artifact_seq}`);
}

// ---------------------------------------------------------------------------
// Caso 4: run status=complete → guard degrada a warning (exit 0), no bloquea
// ---------------------------------------------------------------------------
console.log("\nCaso (4): run status=complete → guard bloquea artefactos nuevos\n");
{
  const dir = makeTmpDir();
  writeFixture(dir, { status: "complete" });

  const filePath = join(dir, "docs", "specs", "2026-07-07-001-BUILD-001-foo.md");
  const result = runGuard(dir, filePath);

  assert("guard exit 2 sobre run cerrado", result.status === 2, `exit=${result.status} stderr=${result.stderr}`);
  assert("stderr exige run nuevo", /run nuevo/.test(result.stderr), `stderr="${result.stderr}"`);
}

// ---------------------------------------------------------------------------
// Caso 6: cobertura universal docs/** + extensión no Markdown
// ---------------------------------------------------------------------------
console.log("\nCaso (6): todo docs/** usa naming; código queda excluido\n");
{
  const dir = makeTmpDir();
  writeFixture(dir, { artifact_seq: 2, current_phase: "design", phases: { design: { status: "in_progress" } } });
  const legacyAdr = runGuard(dir, join(dir, "docs", "adoption", "ADR-999-demo.md"));
  assert("docs/adoption ya no está exento", legacyAdr.status === 2, `exit=${legacyAdr.status}`);
  const diagram = runHelper(dir, ["--phase", "design", "--slug", "c4-contexto", "--ext", "puml"]);
  const diagramName = deriveArtifactName({ run_id: "2026-07-07-001", status: "in_progress", artifact_seq: 2 }, { phase: "design", slug: "c4-contexto", extension: "puml" }).name;
  assert("helper soporta extensión puml", diagramName === "2026-07-07-001-DESIGN-003-c4-contexto.puml", diagramName);
  assert("guard acepta diagrama universal", runGuard(dir, join(dir, "docs", "architecture", "diagrams", diagramName)).status === 0);
  assert("archivo de código fuera de docs queda excluido", runGuard(dir, join(dir, "src", "main.ts")).status === 0);
}

// ---------------------------------------------------------------------------
// Caso 5: nombre generado por el helper siempre pasa el guard
// ---------------------------------------------------------------------------
console.log("\nCaso (5): nombre generado por el helper pasa el guard (helper → guard)\n");
{
  const dir = makeTmpDir();
  writeFixture(dir, {
    artifact_seq: 0,
    phases: { verify: { status: "in_progress" } },
  });

  const helperResult = runHelper(dir, ["--slug", "reporte-qa"]);
  assert("helper exit 0", helperResult.status === 0, `exit=${helperResult.status} stderr=${helperResult.stderr}`);

  const name = deriveArtifactName({ run_id: "2026-07-07-001", status: "in_progress", artifact_seq: 0 }, { phase: "verify", slug: "reporte-qa" }).name;
  const filePath = join(dir, "docs", "specs", name);
  const guardResult = runGuard(dir, filePath);

  assert(`guard acepta "${name}"`, guardResult.status === 0, `exit=${guardResult.status} stderr=${guardResult.stderr}`);
}

// ---------------------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------------------
console.log(`\n=== Resultado: ${passed} PASS / ${failed} FAIL ===`);
if (failed > 0) {
  process.exit(1);
}
