#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/scripts/test-analyze-guard-domain-aware.mjs
//
// Harness de tests para la rama Data del hook analyze-guard
// (.claude/hooks/asdd-pre-tool-use-analyze-guard.mjs), según ADR-003
// "domain-aware analyze guard".
//
// Verifica los tres modos M1/M2/M3 y la ruta software original, usando fixtures
// temporales aislados en os.tmpdir() (se limpian dentro del test — no dejan
// residuos en el repo).
//
// Casos (ADR-003, matriz de decisión + RR-2):
//   (a) M2 — Write docs/specs/smart-data-eng-discovery-acme.md sin xlsx de cliente
//   (b) OK — con docs/smart-data/data/smart-data-eng-acme.xlsx presente
//   (c) Software — Write spec sin brief (comportamiento original) → exit 2
//   (d) Software — con brief presente → exit 0
//   (e) M1 — sin directorio docs/smart-data/data/ → exit 2
//   (f) Multi-palabra:
//        f1 — cliente acme-retail, .md smart-data-eng-governance-assessment-acme-retail.md
//             → exit 0 (ADR-003 §"Cliente con nombre multi-palabra", tabla decisión)
//        f2 — mismo dir, .md smart-data-eng-discovery-retail.md (solo -retail)
//             → exit 2 (ADR-003 RR-2: sufijo literal, no submatch)
//   (g) Cross-cliente — xlsx acme, .md sufijo -otro → exit 2 (M3)
//   (h) Plantilla — solo smart-data-eng-cliente.xlsx en el dir NO habilita → exit 2 (M2)
// -----------------------------------------------------------------------------

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookFile = join(
  __dirname,
  "..",
  "hooks",
  "asdd-pre-tool-use-analyze-guard.mjs"
);

let passed = 0;
let failed = 0;

function assert(condition, id, description, extra = "") {
  if (condition) {
    console.log(`  PASS [${id}] ${description}`);
    passed++;
  } else {
    console.error(
      `  FAIL [${id}] ${description}${extra ? "\n         " + extra : ""}`
    );
    failed++;
  }
}

function runHook(cwd, filePath, toolName = "Write") {
  const result = spawnSync("node", [hookFile], {
    input: JSON.stringify({
      tool_name: toolName,
      tool_input: { file_path: filePath },
      cwd,
    }),
    encoding: "utf8",
    timeout: 10000,
    cwd,
    env: { ...process.env, ASDD_ANALYZE_GUARD_ENABLED: "true" },
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

function makeTempRepo() {
  const t = mkdtempSync(join(tmpdir(), "asdd-guard-"));
  mkdirSync(join(t, "docs", "specs"), { recursive: true });
  return t;
}

function withDataDir(root, xlsxNames = []) {
  const dataDir = join(root, "docs", "smart-data", "data");
  mkdirSync(dataDir, { recursive: true });
  for (const name of xlsxNames) {
    writeFileSync(join(dataDir, name), "fixture");
  }
}

function withBrief(root, name = "brief-proyecto.md") {
  writeFileSync(
    join(root, "docs", "specs", name),
    "# Brief fixture\nEstado: aprobado\n"
  );
}

function cleanup(root) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch (_err) {
    /* ignore */
  }
}

console.log("=== Analyze Guard — Domain-Aware Tests (ADR-003) ===\n");

// ---- (a) M2 — Data spec sin xlsx de cliente (plantilla podría estar o no) ---
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx"]); // solo plantilla
  const r = runHook(t, "docs/specs/smart-data-eng-discovery-acme.md");
  assert(r.status === 2, "a", "M2 — data spec sin xlsx de cliente → exit 2",
    `status=${r.status} stderr=${r.stderr.trim()}`);
  assert(/M2\)/.test(r.stderr), "a-code", "mensaje incluye código M2");
  cleanup(t);
}

// ---- (b) OK — Data spec con xlsx de cliente presente ----------------------
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx", "smart-data-eng-acme.xlsx"]);
  const r = runHook(t, "docs/specs/smart-data-eng-discovery-acme.md");
  assert(r.status === 0, "b", "data spec con xlsx de cliente presente → exit 0",
    `status=${r.status} stderr=${r.stderr.trim()}`);
  cleanup(t);
}

// ---- (c) Software — spec sin brief → exit 2 (comportamiento original) ------
{
  const t = makeTempRepo();
  const r = runHook(t, "docs/specs/feature-login-001.md");
  assert(r.status === 2, "c", "software spec sin brief → exit 2",
    `status=${r.status} stderr=${r.stderr.trim()}`);
  assert(/WF-002 Prerrequisito/.test(r.stderr), "c-msg",
    "mensaje software menciona WF-002 Prerrequisito");
  cleanup(t);
}

// ---- (d) Software — con brief presente → exit 0 ----------------------------
{
  const t = makeTempRepo();
  withBrief(t);
  const r = runHook(t, "docs/specs/feature-login-001.md");
  assert(r.status === 0, "d", "software spec con brief presente → exit 0",
    `status=${r.status} stderr=${r.stderr.trim()}`);
  cleanup(t);
}

// ---- (e) M1 — sin directorio docs/smart-data/data/ ------------------------
{
  const t = makeTempRepo();
  // NO se crea docs/smart-data/data/
  const r = runHook(t, "docs/specs/smart-data-eng-discovery-acme.md");
  assert(r.status === 2, "e", "M1 — sin directorio data/ → exit 2",
    `status=${r.status} stderr=${r.stderr.trim()}`);
  assert(/M1\)/.test(r.stderr), "e-code", "mensaje incluye código M1");
  cleanup(t);
}

// ---- (f1) Multi-palabra — cliente acme-retail, .md multi-palabra → exit 0 --
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx", "smart-data-eng-acme-retail.xlsx"]);
  const r = runHook(
    t,
    "docs/specs/smart-data-eng-governance-assessment-acme-retail.md"
  );
  assert(r.status === 0, "f1",
    "multi-palabra — cliente acme-retail, .md sufijo -acme-retail → exit 0 (ADR-003 tabla decisión)",
    `status=${r.status} stderr=${r.stderr.trim()}`);
  cleanup(t);
}

// ---- (f2) Multi-palabra — sub-cliente 'retail' NO matchea 'acme-retail' ---
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx", "smart-data-eng-acme-retail.xlsx"]);
  const r = runHook(
    t,
    "docs/specs/smart-data-eng-discovery-retail.md"
  );
  assert(r.status === 2, "f2",
    "multi-palabra — .md con sufijo -retail NO matchea cliente acme-retail → exit 2 (RR-2)",
    `status=${r.status} stderr=${r.stderr.trim()}`);
  assert(/M3\)/.test(r.stderr), "f2-code", "mensaje incluye código M3");
  cleanup(t);
}

// ---- (g) Cross-cliente — xlsx acme, .md sufijo -otro → exit 2 (M3) --------
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx", "smart-data-eng-acme.xlsx"]);
  const r = runHook(t, "docs/specs/smart-data-eng-discovery-otro.md");
  assert(r.status === 2, "g",
    "cross-cliente — .md sufijo -otro con xlsx de acme → exit 2",
    `status=${r.status} stderr=${r.stderr.trim()}`);
  assert(/M3\)/.test(r.stderr), "g-code", "mensaje incluye código M3");
  cleanup(t);
}

// ---- (h) Plantilla — solo smart-data-eng-cliente.xlsx NO habilita ------------
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx"]); // solo la plantilla, ningún cliente
  const r = runHook(t, "docs/specs/smart-data-eng-discovery-acme.md");
  assert(r.status === 2, "h",
    "plantilla — solo smart-data-eng-cliente.xlsx en dir NO habilita → exit 2",
    `status=${r.status} stderr=${r.stderr.trim()}`);
  assert(/M2\)/.test(r.stderr), "h-code", "mensaje incluye código M2");
  cleanup(t);
}

console.log(`\n=== Resultado: ${passed} PASS / ${failed} FAIL ===`);
if (failed > 0) {
  process.exit(1);
}
