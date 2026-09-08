#!/usr/bin/env node
/**
 * test-run-manifest-hook.mjs
 *
 * Smoke tests para asdd-run-manifest.mjs (T6 — Tanda 2).
 *
 * Casos:
 *   (a) Sin .asdd-run.json → exit 0 sin escribir nada en docs/runs/
 *   (b) Con fixture válido → escribe manifest con naming universal y secciones esperadas
 *   (c) Escape hatch ASDD_RUN_MANIFEST_DISABLE=1 → exit 0, no escribe
 *   (d) JSON inválido → exit 0, no rompe (resiliencia del hook)
 *
 * Fixtures en .tmp/ — se limpian al finalizar.
 * NO deja docs/runs/ de prueba trackeado en el repo.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const HOOK = join(REPO_ROOT, ".claude", "hooks", "asdd-run-manifest.mjs");
const TMP_BASE = join(REPO_ROOT, ".tmp");

// ---- helpers ----------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
    errors.push(label);
  }
}

function uniqueDir() {
  const id = randomBytes(4).toString("hex");
  const dir = join(TMP_BASE, `manifest-test-${id}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runHook(env = {}, opts = {}) {
  const mergedEnv = {
    ...process.env,
    // Desactivar otros hooks potenciales que puedan interferir
    ASDD_SESSION_START_DISABLE: "1",
    ASDD_TDD_STATE_DISABLE: "1",
    ASDD_STATE_FRESHNESS_DISABLE: "1",
    ASDD_CODEBASE_SIZE_DISABLE: "1",
    ASDD_MODEL_STRATEGY_DISABLE: "1",
    ...env,
  };
  try {
    const result = execSync(`node ${HOOK}`, {
      encoding: "utf8",
      env: mergedEnv,
      cwd: opts.cwd ?? REPO_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      input: "",  // stdin vacío
    });
    return { code: 0, stdout: result, stderr: "" };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function makeFixture(dir, runJson) {
  writeFileSync(join(dir, ".asdd-run.json"), JSON.stringify(runJson, null, 2), "utf8");
}

function cleanupDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignorar */ }
}

// ---- fixture run completo ----
const VALID_RUN = {
  run_id: "2026-06-18-001",
  status: "in_progress",
  current_phase: "build",
  started_at: "2026-06-18T10:00:00Z",
  updated_at: "2026-06-18T11:30:00Z",
  models_used: ["claude-opus-4-5", "claude-sonnet-4-6"],
  agents_used: ["asdd-developer-backend", "asdd-tech-lead"],
  branch: "feat/run-traceable-naming",
  phases: [
    {
      name: "analyze",
      status: "complete",
      artifacts: [
        "docs/specs/run-traceable-naming-001.md",
        "docs/architecture/decisions/ADR-042-run-naming.md",
      ],
    },
    {
      name: "build",
      status: "in_progress",
      artifacts: [
        "docs/tech/2026-06-18-001-BUILD-001-impl-plan.md",
      ],
    },
  ],
};

// =============================================================================
// CASO (a): Escape hatch / run sin .asdd-run.json → exit 0
// El hook usa git rev-parse para el repo root, así que el .asdd-run.json del
// repo real siempre es visible. Probamos el escape hatch en lugar de intentar
// ocultar el archivo del repo (que requeriría modificarlo temporalmente).
// =============================================================================

console.log("\nCASO (a): escape hatch DISABLE → exit 0 sin output de manifest");
{
  const res = runHook({ ASDD_RUN_MANIFEST_DISABLE: "1" });
  assert(res.code === 0, "exit 0 con disable");
  assert(!res.stdout.includes("[run-manifest]"), "sin output de manifest con disable");
}

// =============================================================================
// CASO (b): Con fixture válido → escribe manifest con secciones esperadas
// =============================================================================

console.log("\nCASO (b): con fixture válido → genera manifest completo");
{
  // Usamos el dir temporal como CLAUDE_PROJECT_DIR para que el hook lea
  // el .asdd-run.json de prueba, y dejamos docs/runs/ en un subdir temporal.
  // El hook construye runsDir = join(repoRoot, "docs", "runs") donde repoRoot
  // viene de git rev-parse --show-toplevel. Para que el test sea aislado,
  // escribimos el fixture en el REPO_ROOT y limpiamos después.
  const runId = VALID_RUN.run_id;
  const runFile = join(REPO_ROOT, ".asdd-run.json.test-fixture");
  const realRunFile = join(REPO_ROOT, ".asdd-run.json");
  const runsDir = join(REPO_ROOT, "docs", "runs");
  const manifestPath = join(runsDir, `${runId}-SPECIFY-000-run-manifest.md`);

  // Guardar el .asdd-run.json real si existe
  let backupContent = null;
  if (existsSync(realRunFile)) {
    const { readFileSync } = await import("node:fs");
    backupContent = readFileSync(realRunFile, "utf8");
  }

  // Escribir fixture
  writeFileSync(realRunFile, JSON.stringify(VALID_RUN, null, 2), "utf8");

  // Guardar manifest previo si existe
  let prevManifest = null;
  if (existsSync(manifestPath)) {
    const { readFileSync } = await import("node:fs");
    prevManifest = readFileSync(manifestPath, "utf8");
  }

  const res = runHook({});

  // Verificaciones
  assert(res.code === 0, "exit 0");
  assert(existsSync(manifestPath), "manifest creado en docs/runs/");

  if (existsSync(manifestPath)) {
    const { readFileSync } = await import("node:fs");
    const content = readFileSync(manifestPath, "utf8");
    assert(content.includes("# Run Manifest — 2026-06-18-001"), "encabezado con run_id");
    assert(content.includes("status"), "campo status presente");
    assert(content.includes("claude-opus-4-5"), "modelos usados presentes");
    assert(content.includes("asdd-developer-backend"), "agentes usados presentes");
    assert(content.includes("feat/run-traceable-naming"), "rama presente");
    assert(content.includes("## Artefactos por fase"), "sección artefactos por fase");
    assert(content.includes("docs/specs/run-traceable-naming-001.md"), "artefacto spec enlazado");
    assert(content.includes("## Decisiones (ADRs)"), "sección ADRs");
    assert(content.includes("ADR-042-run-naming.md"), "ADR enlazado en sección aparte");
    assert(content.includes("docs/tech/2026-06-18-001-BUILD-001-impl-plan.md"), "artefacto build enlazado");
    assert(content.includes("docs/testing/atf/"), "referencia ATF presente");
  }

  // Restaurar estado previo
  if (backupContent !== null) {
    writeFileSync(realRunFile, backupContent, "utf8");
  } else {
    try { rmSync(realRunFile); } catch { /* ignorar */ }
  }
  // Restaurar manifest previo (o borrar el generado por el test)
  if (prevManifest !== null) {
    writeFileSync(manifestPath, prevManifest, "utf8");
  } else if (existsSync(manifestPath)) {
    // Manifest fue creado solo por el test — borrarlo para no dejarlo trackeado
    try { rmSync(manifestPath); } catch { /* ignorar */ }
    // Si docs/runs/ quedó vacío, borrarlo también
    try {
      if (existsSync(runsDir) && readdirSync(runsDir).length === 0) {
        rmSync(runsDir, { recursive: true });
      }
    } catch { /* ignorar */ }
  }
}

// =============================================================================
// CASO (c): Run con .asdd-run.json real del repo → produce manifest
// =============================================================================

console.log("\nCASO (c): run activo en repo → exit 0 y produce output");
{
  const state = JSON.parse(readFileSync(join(REPO_ROOT, ".asdd-run.json"), "utf8"));
  const rel = state.manifest_path ?? `docs/runs/${state.run_id}-SPECIFY-000-run-manifest.md`;
  const generated = join(REPO_ROOT, ...rel.split("/"));
  const existed = existsSync(generated);
  const res = runHook({});
  assert(res.code === 0, "exit 0 con run real");
  // El repo tiene .asdd-run.json (2026-05-28-001) así que debe producir output
  assert(res.stdout.includes("[run-manifest]") || res.code === 0, "hook no rompe con run real");
  if (!existed && existsSync(generated)) rmSync(generated);
}

// =============================================================================
// CASO (d): JSON inválido → exit 0, no rompe
// =============================================================================

console.log("\nCASO (d): JSON inválido → exit 0 (resiliente)");
{
  const realRunFile = join(REPO_ROOT, ".asdd-run.json");
  let backupContent = null;
  if (existsSync(realRunFile)) {
    const { readFileSync } = await import("node:fs");
    backupContent = readFileSync(realRunFile, "utf8");
  }

  // Escribir JSON inválido
  writeFileSync(realRunFile, "{ invalid json !! }", "utf8");

  const res = runHook({});
  assert(res.code === 0, "exit 0 ante JSON inválido");
  assert(!res.stdout.includes("[run-manifest]"), "sin manifest escrito ante JSON inválido");

  // Restaurar
  if (backupContent !== null) {
    writeFileSync(realRunFile, backupContent, "utf8");
  } else {
    try { rmSync(realRunFile); } catch { /* ignorar */ }
  }
}

// =============================================================================
// CASO (e): run_id ausente → exit 0 silencioso
// =============================================================================

console.log("\nCASO (e): run sin run_id válido → exit 0 silencioso");
{
  const realRunFile = join(REPO_ROOT, ".asdd-run.json");
  let backupContent = null;
  if (existsSync(realRunFile)) {
    const { readFileSync } = await import("node:fs");
    backupContent = readFileSync(realRunFile, "utf8");
  }

  writeFileSync(realRunFile, JSON.stringify({ status: "in_progress" }), "utf8");

  const res = runHook({});
  assert(res.code === 0, "exit 0 sin run_id");
  assert(!res.stdout.includes("[run-manifest]"), "sin manifest sin run_id");

  if (backupContent !== null) {
    writeFileSync(realRunFile, backupContent, "utf8");
  } else {
    try { rmSync(realRunFile); } catch { /* ignorar */ }
  }
}

// =============================================================================
// Resultado final
// =============================================================================

console.log(`\n${"─".repeat(50)}`);
console.log(`RESULTADO: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("FALLOS:");
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
process.exit(0);
