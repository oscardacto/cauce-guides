#!/usr/bin/env node
/**
 * Abre de forma idempotente un run ASDD y reserva el primer artefacto con el
 * nombre universal antes de construir el plan ORC-010-A.
 *
 * Uso:
 *   node .claude/scripts/sofka-asdd-run-bootstrap.mjs \
 *     --feature aid-bancolombia --phase specify \
 *     --artifact-dir docs/specs --artifact-slug brief-aid-bancolombia
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveArtifactName } from "./lib/sofka-asdd-artifact-name-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const RUN_PATH = join(ROOT, ".asdd-run.json");
const PHASES = ["specify", "analyze", "design", "build", "verify", "document"];

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`--${key} requiere valor`);
    out[key] = value;
    index += 1;
  }
  return out;
}

function atomicWrite(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function slug(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new Error(`${label} debe estar en kebab-case ASCII`);
  }
  return normalized;
}

function today(now) {
  const date = now ? new Date(now) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("ASDD_NOW inválido");
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function walkNames(dir, names = []) {
  if (!existsSync(dir)) return names;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkNames(path, names);
    else names.push(entry.name);
  }
  return names;
}

function nextRunId(datePrefix) {
  const ids = walkNames(join(ROOT, "docs"))
    .map((name) => name.match(/^(\d{4}-\d{2}-\d{2}-\d{3})-/)?.[1])
    .filter(Boolean);
  if (existsSync(RUN_PATH)) {
    try { ids.push(JSON.parse(readFileSync(RUN_PATH, "utf8")).run_id); } catch { /* validated below */ }
  }
  const max = ids.filter((id) => id?.startsWith(`${datePrefix}-`))
    .map((id) => Number(id.slice(-3))).reduce((value, current) => Math.max(value, current), 0);
  return `${datePrefix}-${String(max + 1).padStart(3, "0")}`;
}

function newRun(feature, phase) {
  const now = new Date(process.env.ASDD_NOW || Date.now());
  const timestamp = now.toISOString();
  const phases = Object.fromEntries(PHASES.map((name) => [name, {
    status: name === phase ? "in_progress" : "pending",
    ...(name === phase ? { started_at: timestamp } : {}),
    agents_used: [], models_used: {}, completed_steps: [], pending_steps: [], artifacts: [],
  }]));
  const runId = nextRunId(today(process.env.ASDD_NOW));
  return {
    run_id: runId,
    feature,
    started_at: timestamp,
    last_checkpoint: timestamp,
    status: "in_progress",
    current_phase: phase,
    phases,
    context_summary: `Run ${feature} iniciado en fase ${phase}; contexto pendiente de síntesis.`,
    resume_hint: `Continuar fase ${phase} desde el plan aprobado.`,
    artifact_seq: 0,
    manifest_path: `docs/runs/${runId}-${phase.toUpperCase()}-000-run-manifest.md`,
    artifact_naming: {
      policy_version: 2,
      pattern: "{run_id}-{PHASE}-{SEQ}-{slug}.{ext}",
      scope: "all-agent-generated-files-under-docs",
      code_excluded: true,
      helper: ".claude/scripts/sofka-asdd-artifact-name.mjs",
    },
    blocking_issue: null,
    escalations: [],
    auto_detected: null,
  };
}

function readRun() {
  if (!existsSync(RUN_PATH)) return null;
  try { return JSON.parse(readFileSync(RUN_PATH, "utf8")); }
  catch (error) { throw new Error(`.asdd-run.json inválido: ${error.message}`); }
}

function safeArtifactDir(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/").replace(/\/$/, "");
  const target = resolve(ROOT, normalized);
  const rel = relative(ROOT, target);
  if (!normalized.startsWith("docs/") || !rel || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error("--artifact-dir debe estar dentro de docs/");
  }
  return normalized;
}

function reserve(run, { phase, artifactDir, artifactSlug, extension }) {
  const artifacts = run.phases?.[phase]?.artifacts ?? [];
  const suffix = `-${artifactSlug}.${extension}`;
  const existing = artifacts.find((item) => item.startsWith(`${artifactDir}/`) && item.endsWith(suffix));
  if (existing) return existing;

  const derived = deriveArtifactName(run, { phase, slug: artifactSlug, extension });
  const basename = derived.name;
  const refreshed = derived.run;
  const artifactPath = `${artifactDir}/${basename}`;
  refreshed.phases[phase].artifacts ??= [];
  refreshed.phases[phase].artifacts.push(artifactPath);
  refreshed.last_checkpoint = new Date(process.env.ASDD_NOW || Date.now()).toISOString();
  refreshed.resume_hint = `Crear o actualizar ${artifactPath} usando el plan aprobado.`;
  atomicWrite(RUN_PATH, refreshed);
  return artifactPath;
}

function main() {
  const args = argsOf(process.argv.slice(2));
  const feature = slug(args.feature, "--feature");
  const phase = String(args.phase ?? "").toLowerCase();
  if (!PHASES.includes(phase)) throw new Error(`--phase inválida: ${phase}`);
  const artifactDir = safeArtifactDir(args["artifact-dir"]);
  const artifactSlug = String(args["artifact-slug"] ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(artifactSlug)) {
    throw new Error("--artifact-slug debe estar en kebab-case ASCII; semver con puntos está permitido");
  }
  const extension = String(args.ext ?? "md").toLowerCase();
  if (!/^[a-z0-9]{1,10}$/.test(extension)) throw new Error("--ext inválida");

  let run = readRun();
  if (!run || run.status === "complete") {
    run = newRun(feature, phase);
    atomicWrite(RUN_PATH, run);
  } else {
    if (run.status !== "in_progress") throw new Error(`run ${run.run_id} está ${run.status}`);
    if (run.feature !== feature) throw new Error(`run activo ${run.run_id} pertenece a ${run.feature}`);
    if (run.current_phase !== phase) throw new Error(`run activo está en fase ${run.current_phase}, no ${phase}`);
    run.artifact_naming ??= newRun(feature, phase).artifact_naming;
    atomicWrite(RUN_PATH, run);
  }

  const artifactPath = reserve(readRun(), { phase, artifactDir, artifactSlug, extension });
  const finalRun = readRun();
  try {
    execFileSync(process.execPath, [join(ROOT, ".claude/hooks/sofka-asdd-run-manifest.mjs")], {
      cwd: ROOT, env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, stdio: "ignore",
    });
  } catch { /* el hook es best-effort; el run state ya quedó persistido */ }
  process.stdout.write(`${JSON.stringify({
    run_id: finalRun.run_id,
    phase,
    artifact_path: artifactPath,
    naming_pattern: finalRun.artifact_naming.pattern,
    instruction: "Incluí artifact_path exacto en scope y prompt; el agente no inventa nombres.",
  })}\n`);
}

try { main(); }
catch (error) { process.stderr.write(`run-bootstrap: ${error.message}\n`); process.exit(1); }
