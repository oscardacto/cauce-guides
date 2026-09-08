#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/scripts/test-guards-chain-data.mjs
//
// Harness de CADENA (ADR-003 §Amendment 2026-07-02): ejecuta los hooks
// PreToolUse EN SECUENCIA (analyze-guard → artifact-name-guard,
// el orden de settings.json) contra fixtures temporales para verificar:
//
//   (a) Los 6 tipos de artefactos Data (discovery, governance-assessment,
//       dictionary, design, build-run, validate-signoff) × cliente
//       `nova-foods` CON Excel presente → todos los hooks exit 0.
//   (b) Discovery >300 líneas Data → la cadena permite (exención Data).
//   (c) Regresión software: sin brief → analyze-guard bloquea.
//   (e) Regresión software: docs con 3+ segmentos sin naming de run →
//       artifact-name-guard bloquea.
//   (f) Sin Excel del cliente → analyze-guard bloquea en M2 (la cadena corta).
//   (j) Nombres inválidos del dominio (viejo sin -eng-, con prefijo de run) →
//       artifact-name-guard deniega.
//
// Los artefactos Data usan su nombre CANÓNICO `smart-data-eng-*` SIN prefijo
// de run (ADR-003 / exención de dominio del artifact-name-guard). Este harness
// es la red de contención de esa exención: no reescribirlo a nombres con
// prefijo de run — eso fue exactamente la regresión de v3.0.0 (5c425b3).
//
// Los fixtures son directorios temporales aislados (os.tmpdir) que se limpian
// dentro del harness — no dejan residuos en el repo.
// -----------------------------------------------------------------------------

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = join(__dirname, "..", "hooks");
const CHAIN = [
  "sofka-asdd-pre-tool-use-analyze-guard.mjs",
  "sofka-asdd-pre-tool-use-artifact-name-guard.mjs",
].map((n) => ({ name: n.replace(/^sofka-asdd-pre-tool-use-|\.mjs$/g, ""), path: join(HOOKS_DIR, n) }));

let passed = 0;
let failed = 0;

function assert(cond, id, description, extra = "") {
  if (cond) {
    console.log(`  PASS [${id}] ${description}`);
    passed++;
  } else {
    console.error(`  FAIL [${id}] ${description}${extra ? "\n         " + extra : ""}`);
    failed++;
  }
}

function runHook(hookPath, cwd, toolInput, toolName = "Write") {
  const result = spawnSync("node", [hookPath], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput, cwd }),
    encoding: "utf8",
    timeout: 10000,
    cwd,
    env: { ...process.env, ASDD_ANALYZE_GUARD_ENABLED: "true" },
  });
  return { status: result.status, stderr: result.stderr ?? "" };
}

/**
 * Ejecuta los hooks EN CADENA en el orden de settings.json.
 * Retorna { chainStatus: 0|2, stoppedAt: hookName | null, hooksRun: [{name,status,stderr}] }.
 * Si un hook devuelve exit != 0, la cadena se detiene ahí (semántica de PreToolUse).
 */
function runChain(cwd, toolInput) {
  const results = [];
  for (const hook of CHAIN) {
    const r = runHook(hook.path, cwd, toolInput);
    results.push({ name: hook.name, status: r.status, stderr: r.stderr.trim() });
    if (r.status !== 0) {
      return { chainStatus: r.status, stoppedAt: hook.name, hooksRun: results };
    }
  }
  return { chainStatus: 0, stoppedAt: null, hooksRun: results };
}

function makeTempRepo() {
  const t = mkdtempSync(join(tmpdir(), "asdd-chain-"));
  mkdirSync(join(t, "docs", "specs"), { recursive: true });
  writeFileSync(join(t, ".asdd-run.json"), JSON.stringify({
    run_id: "2026-07-18-001",
    feature: "smart-data-chain",
    status: "in_progress",
    current_phase: "analyze",
    artifact_seq: 0,
    phases: { analyze: { status: "in_progress", artifacts: [] } },
  }));
  return t;
}

function withDataDir(root, xlsxNames = []) {
  const dir = join(root, "docs", "smart-data", "data");
  mkdirSync(dir, { recursive: true });
  for (const n of xlsxNames) writeFileSync(join(dir, n), "fixture");
}

function withBrief(root, name = "brief-proyecto.md") {
  writeFileSync(join(root, "docs", "specs", name), "# Brief\nEstado: aprobado\n");
}

function cleanup(root) {
  try { rmSync(root, { recursive: true, force: true }); } catch (_) {}
}

console.log("=== Guards Chain — Data Exemption Tests (ADR-003 §Amendment 2026-07-02) ===\n");

const DATA_TYPES = [
  "discovery",
  "governance-assessment",
  "dictionary",
  "design",
  "build-run",
  "validate-signoff",
];
const CLIENT = "nova-foods";
const CLIENT_XLSX = `smart-data-eng-${CLIENT}.xlsx`;

// ---- (a) 6 tipos de artefactos Data en cadena → los 3 hooks exit 0 --------
for (const tipo of DATA_TYPES) {
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx", CLIENT_XLSX]);
  // Caso canónico — debe PASAR la cadena completa de guards
  const filePath = `docs/specs/smart-data-eng-${tipo}-${CLIENT}.md`;
  const r = runChain(t, {
    file_path: filePath,
    content: `# Artefacto Data\n\nContenido corto.\n`,
  });
  const label = `a-${tipo}`;
  assert(
    r.chainStatus === 0 && r.stoppedAt === null,
    label,
    `data — ${tipo}-${CLIENT} en cadena → todos los hooks exit 0`,
    `stoppedAt=${r.stoppedAt || "null"} · statuses=${r.hooksRun.map((h) => `${h.name}=${h.status}`).join(", ")}`
  );
  cleanup(t);
}

// ---- (b) Discovery >300 líneas Data → cadena permite (exención Data) ----
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx", CLIENT_XLSX]);
  const bigContent = "# Discovery\n\n" + "línea de contenido.\n".repeat(320);
  const r = runChain(t, {
    file_path: `docs/specs/smart-data-eng-discovery-${CLIENT}.md`,
    content: bigContent,
  });
  assert(
    r.chainStatus === 0 && r.stoppedAt === null,
    "b",
    "discovery > 300 líneas Data — cadena entera exit 0 (exención Data)",
    `stoppedAt=${r.stoppedAt || "null"} · statuses=${r.hooksRun.map((h) => `${h.name}=${h.status}`).join(", ")}`
  );
  cleanup(t);
}

// ---- (c) Regresión software: sin brief → analyze-guard bloquea -----------
{
  const t = makeTempRepo();
  // NO brief, NO smart-data dir → software strict
  const r = runChain(t, {
    file_path: "docs/specs/feature-login-001.md",
    content: "# Feature\n\n contenido.\n",
  });
  assert(
    r.chainStatus === 2 && r.stoppedAt === "analyze-guard",
    "c",
    "regresión software — spec sin brief → analyze-guard bloquea (cadena corta)",
    `stoppedAt=${r.stoppedAt} · statuses=${r.hooksRun.map((h) => `${h.name}=${h.status}`).join(", ")}`
  );
  cleanup(t);
}

// ---- (e) Regresión software: docs con 3+ segmentos sin naming de run ------
{
  const t = makeTempRepo();
  withBrief(t);
  mkdirSync(join(t, "docs", "otro", "subdir"), { recursive: true });
  // 3+ segmentos: docs/otro/subdir/foo.md — NO en /adoption, /testing/atf, /qa/atf, /runs
  const r = runChain(t, {
    file_path: "docs/otro/subdir/foo.md",
    content: "# Doc con path profundo\ncontenido corto.\n",
  });
  // analyze-guard: file no está en docs/specs → exit 0.
  // artifact-name: docs/ con 3+ segmentos + no exención → bloquea por naming.
  assert(
    r.chainStatus === 2 && r.stoppedAt === "artifact-name-guard",
    "e",
    "regresión software — docs/**/*.md con 3+ segmentos sin naming de run → artifact-name-guard bloquea",
    `stoppedAt=${r.stoppedAt} · statuses=${r.hooksRun.map((h) => `${h.name}=${h.status}`).join(", ")}`
  );
  cleanup(t);
}

// ---- (f) Sin Excel del cliente → analyze-guard bloquea (M2) --------------
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx"]); // solo la plantilla — sin cliente
  const r = runChain(t, {
    file_path: `docs/specs/smart-data-eng-discovery-${CLIENT}.md`,
    content: "# Discovery sin xlsx del cliente\n",
  });
  assert(
    r.chainStatus === 2 && r.stoppedAt === "analyze-guard",
    "f",
    "sin xlsx de cliente → analyze-guard bloquea M2 (cadena corta antes de los otros dos)",
    `stoppedAt=${r.stoppedAt} · statuses=${r.hooksRun.map((h) => `${h.name}=${h.status}`).join(", ")}`
  );
  const analyzeStderr = r.hooksRun.find((h) => h.name === "analyze-guard")?.stderr || "";
  assert(/M2\)/.test(analyzeStderr), "f-code", "mensaje del bloqueo incluye código M2");
  cleanup(t);
}

// ---- (g) Contrato canónico semver DC-004 CON Excel → cadena completa exit 0 (path 4 segmentos) ----
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx", CLIENT_XLSX]);
  mkdirSync(join(t, "docs", "specs", "contracts"), { recursive: true });
  const r = runChain(t, {
    file_path: `docs/specs/contracts/smart-data-eng-contract-silver-${CLIENT}-1.0.0.md`,
    content: "# Contrato Silver — nova-foods 1.0.0\n\nContenido de contrato.\n",
  });
  assert(
    r.chainStatus === 0 && r.stoppedAt === null,
    "g",
    "contrato semver DC-004 con Excel del cliente (path 4 segmentos) → los 3 hooks exit 0 en cadena",
    `stoppedAt=${r.stoppedAt || "null"} · statuses=${r.hooksRun.map((h) => `${h.name}=${h.status}`).join(", ")}`
  );
  cleanup(t);
}

// ---- (h) Contrato multi-palabra + semver — cliente acme-retail ----
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx", "smart-data-eng-acme-retail.xlsx"]);
  mkdirSync(join(t, "docs", "specs", "contracts"), { recursive: true });
  const r = runChain(t, {
    file_path: `docs/specs/contracts/smart-data-eng-contract-gold-acme-retail-2.3.1.md`,
    content: "# Contrato Gold — acme-retail 2.3.1\n",
  });
  assert(
    r.chainStatus === 0 && r.stoppedAt === null,
    "h",
    "contrato semver DC-004 cliente multi-palabra (acme-retail-2.3.1) → cadena exit 0",
    `stoppedAt=${r.stoppedAt || "null"} · statuses=${r.hooksRun.map((h) => `${h.name}=${h.status}`).join(", ")}`
  );
  cleanup(t);
}

// ---- (i) Contrato de cliente inexistente → analyze-guard M3 ----
{
  const t = makeTempRepo();
  withDataDir(t, ["smart-data-eng-cliente.xlsx", CLIENT_XLSX]); // solo nova-foods
  mkdirSync(join(t, "docs", "specs", "contracts"), { recursive: true });
  const r = runChain(t, {
    file_path: `docs/specs/contracts/smart-data-eng-contract-silver-otro-cliente-1.0.0.md`,
    content: "# Contrato para cliente NO registrado\n",
  });
  assert(
    r.chainStatus === 2 && r.stoppedAt === "analyze-guard",
    "i",
    "contrato con cliente inexistente → analyze-guard bloquea M3 (cadena corta)",
    `stoppedAt=${r.stoppedAt} · statuses=${r.hooksRun.map((h) => `${h.name}=${h.status}`).join(", ")}`
  );
  const analyzeStderr = r.hooksRun.find((h) => h.name === "analyze-guard")?.stderr || "";
  assert(/M3\)/.test(analyzeStderr), "i-code", "mensaje del bloqueo incluye código M3");
  cleanup(t);
}

// ---- (j) Nombres inválidos del dominio → artifact-name-guard DENIEGA ------
// Casos que DEBEN ser denegados — verificados contra el contrato real. Son los
// ÚNICOS dos que el contrato sí rechaza: DATA_GENERAL_RE no distingue {tipo}
// de {cliente} cuando el tipo lleva guiones internos, así que nombres "sin
// cliente" o "sin versión" PASAN — no agregarlos como casos negativos.
// Se ejecuta el artifact-name-guard directo (no la cadena): el analyze-guard
// bloquearía antes al nombre viejo por otra causa (spec sin brief) y taparía
// lo que este caso mide.
{
  const NAME_GUARD = CHAIN.find((h) => h.name === "artifact-name-guard");
  const casosInvalidos = [
    ["j-viejo", `docs/specs/smart-data-discovery-${CLIENT}.md`, "nombre viejo sin -eng- → deniega (no entra por la exención)"],
    ["j-prefijo", `docs/specs/2026-08-12-001-SPECIFY-001-smart-data-eng-discovery-${CLIENT}.md`, "nombre con prefijo de run → deniega (no entra por la exención)"],
  ];
  for (const [id, fp, descripcion] of casosInvalidos) {
    const t = makeTempRepo();
    withDataDir(t, ["smart-data-eng-cliente.xlsx", CLIENT_XLSX]);
    const r = runHook(NAME_GUARD.path, t, { file_path: fp, content: "# nombre inválido\n" });
    assert(r.status === 2, id, descripcion, `status=${r.status} · stderr=${r.stderr.trim().split("\n")[0]}`);
    cleanup(t);
  }
}

console.log(`\n=== Resultado: ${passed} PASS / ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
