#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/sofka-asdd-run-manifest.mjs
//
// Hook SessionStart — Tier C: naming run-trazable (Tanda 2, T4)
// Lee .asdd-run.json y renderiza/actualiza el manifest run-trazable universal.
// con un resumen legible del run: encabezado, artefactos por fase y ADRs.
//
// El hook corre en cada SessionStart (arranque, resume, compact).
// Como cada run_id produce un archivo distinto, el manifest del run anterior
// queda CONGELADO intacto cuando arranca un run nuevo (D4).
//
// Garantía: el manifest SIEMPRE se crea por hook (mecánico), no depende de
// que el agente lo recuerde (D4 del diseño "naming run-trazable").
//
// Configuración (bloque `env` en .claude/settings.json):
//   SOFKA_ASDD_RUN_MANIFEST_DISABLE=1  escape hatch auditable
// -----------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync as exec } from "node:child_process";
import { join, resolve, sep } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd) {
  try {
    return exec(cmd, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

function getRepoRoot() {
  return run("git rev-parse --show-toplevel") ?? process.cwd();
}

/** Sanitiza un valor para que sea seguro de incluir en Markdown. */
function safe(v, max = 300) {
  return String(v ?? "").replace(/[\r\n]/g, " ").slice(0, max);
}

/** Formatea una fecha ISO como legible (YYYY-MM-DD HH:MM UTC). */
function fmtDate(iso) {
  if (!iso) return "(sin fecha)";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return safe(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
           `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  } catch { return safe(iso); }
}

// ---------------------------------------------------------------------------
// Leer stdin (requerido por Claude Code hooks — puede llegar JSON de contexto)
// ---------------------------------------------------------------------------

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    if (process.stdin.isTTY) { resolve(""); return; }
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
    setTimeout(() => resolve(data), 3000);
  });
}

// ---------------------------------------------------------------------------
// Render del manifest
// ---------------------------------------------------------------------------

function renderManifest(run) {
  const lines = [];

  // ---- Encabezado ----
  lines.push(`# Run Manifest — ${safe(run.run_id)}`);
  lines.push("");
  lines.push("| Campo | Valor |");
  lines.push("|---|---|");
  lines.push(`| run_id | \`${safe(run.run_id)}\` |`);
  lines.push(`| status | ${safe(run.status ?? "(desconocido)")} |`);

  const startedAt = run.started_at ?? run.created_at ?? null;
  const updatedAt = run.updated_at ?? run.last_updated_at ?? null;
  if (startedAt) lines.push(`| Inicio | ${fmtDate(startedAt)} |`);
  if (updatedAt) lines.push(`| Última actualización | ${fmtDate(updatedAt)} |`);

  // Modelos usados
  const models = Array.isArray(run.models_used) && run.models_used.length > 0
    ? run.models_used.map((m) => safe(m)).join(", ")
    : (run.resolved_model ? safe(run.resolved_model) : null);
  if (models) lines.push(`| Modelos usados | ${models} |`);

  // Agentes usados
  const agents = Array.isArray(run.agents_used) && run.agents_used.length > 0
    ? run.agents_used.map((a) => safe(a)).join(", ")
    : null;
  if (agents) lines.push(`| Agentes usados | ${agents} |`);

  // Rama
  if (run.branch) lines.push(`| Rama | \`${safe(run.branch)}\` |`);

  lines.push("");

  // ---- Artefactos por fase ----
  lines.push("## Artefactos por fase");
  lines.push("");

  const PHASE_ORDER = ["specify", "analyze", "design", "build", "verify", "document"];

  let phases;
  if (Array.isArray(run.phases)) {
    phases = run.phases;
  } else if (run.phases && typeof run.phases === "object") {
    const ordered = PHASE_ORDER.filter((k) => k in run.phases);
    const extra = Object.keys(run.phases).filter((k) => !PHASE_ORDER.includes(k));
    phases = [...ordered, ...extra].map((k) => ({ ...run.phases[k], name: k }));
  } else {
    phases = [];
  }

  const adrLinks = [];

  if (phases.length === 0) {
    lines.push("_(sin fases registradas aún)_");
  } else {
    for (const phase of phases) {
      const phaseName = safe(phase.name ?? phase.phase ?? "desconocida");
      const phaseStatus = safe(phase.status ?? "");
      // Progreso granular: mostrar progress_note si existe, si no step_current/step_total
      let progressLabel = "";
      if (phase.progress_note) {
        progressLabel = ` · ${safe(phase.progress_note, 100)}`;
      } else if (
        typeof phase.step_current === "number" &&
        typeof phase.step_total === "number" &&
        phase.step_total > 0
      ) {
        progressLabel = ` · paso ${phase.step_current + 1}/${phase.step_total}`;
      }
      lines.push(
        `### Fase: ${phaseName}${phaseStatus ? ` (${phaseStatus}${progressLabel})` : ""}`
      );
      lines.push("");

      // Pasos completados y pendientes (cuando la fase está in_progress)
      if (Array.isArray(phase.completed_steps) && phase.completed_steps.length > 0) {
        lines.push(
          `**Completados:** ${phase.completed_steps.slice(0, 10).map((s) => safe(s)).join(", ")}`
        );
        lines.push("");
      }
      if (Array.isArray(phase.pending_steps) && phase.pending_steps.length > 0) {
        lines.push(
          `**Pendientes:** ${phase.pending_steps.slice(0, 10).map((s) => safe(s)).join(", ")}`
        );
        lines.push("");
      }

      const artifacts = Array.isArray(phase.artifacts) ? phase.artifacts : [];
      if (artifacts.length === 0) {
        lines.push("_(sin artefactos)_");
      } else {
        for (const art of artifacts) {
          const artPath = typeof art === "string" ? art : safe(art.path ?? art.file ?? art);
          const artDesc = typeof art === "object" && art.description ? ` — ${safe(art.description)}` : "";
          lines.push(`- \`${artPath}\`${artDesc}`);

          // Colectar ADRs para la sección aparte
          if (/docs\/architecture\/decisions\/ADR-/i.test(artPath)) {
            adrLinks.push(artPath);
          }
        }
      }
      lines.push("");
    }
  }

  // También buscar artefactos en steps si phases no los tiene
  const steps = Array.isArray(run.steps) ? run.steps : [];
  if (phases.length === 0 && steps.length > 0) {
    lines.push("## Artefactos por step");
    lines.push("");
    for (const step of steps) {
      const stepName = safe(step.name ?? step.step ?? step.phase ?? "desconocido");
      lines.push(`### Step: ${stepName}`);
      lines.push("");
      const arts = Array.isArray(step.artifacts) ? step.artifacts : [];
      if (arts.length === 0) {
        lines.push("_(sin artefactos)_");
      } else {
        for (const art of arts) {
          const artPath = typeof art === "string" ? art : safe(art.path ?? art.file ?? art);
          const artDesc = typeof art === "object" && art.description ? ` — ${safe(art.description)}` : "";
          lines.push(`- \`${artPath}\`${artDesc}`);
          if (/docs\/architecture\/decisions\/ADR-/i.test(artPath)) {
            adrLinks.push(artPath);
          }
        }
      }
      lines.push("");
    }
  }

  // ---- Decisiones (ADRs) ----
  // D5: el ADR conserva su nombre — solo se enlaza aquí.
  const uniqueAdrs = [...new Set(adrLinks)];
  lines.push("## Decisiones (ADRs)");
  lines.push("");
  if (uniqueAdrs.length === 0) {
    lines.push("_(sin ADRs enlazados en los artefactos de este run)_");
  } else {
    for (const adrPath of uniqueAdrs) {
      const adrName = adrPath.split("/").pop() ?? adrPath;
      lines.push(`- [${adrName}](../../${adrPath})`);
    }
  }
  lines.push("");

  // ---- Referencia ATF ----
  const runId = safe(run.run_id);
  lines.push("## Referencias adicionales");
  lines.push("");
  lines.push(`- Testing ATF: \`docs/testing/atf/${runId}/\` (si existe)`);
  lines.push(`- Reportes QA ATF: \`docs/qa/atf/${runId}/\` (si existe)`);
  lines.push("");

  // ---- Pie ----
  lines.push("---");
  lines.push("_Generado automáticamente por `sofka-asdd-run-manifest.mjs` (hook SessionStart, Tier C)._");
  lines.push("_No editar manualmente — se sobrescribe en cada sesión mientras el run esté activo._");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Leer stdin (requerido por el protocolo de hooks — ignorar el contenido)
  try { await readStdin(); } catch { /* ignorar */ }

  if (process.env.SOFKA_ASDD_RUN_MANIFEST_DISABLE === "1") {
    process.exit(0);
  }

  const repoRoot = getRepoRoot();
  const runFilePath = join(repoRoot, ".asdd-run.json");

  // Si no existe .asdd-run.json → no hay run activo → salir silencioso
  if (!existsSync(runFilePath)) {
    process.exit(0);
  }

  // Parsear JSON — ante cualquier error salir silencioso (hook NUNCA rompe arranque)
  let run;
  try {
    const raw = readFileSync(runFilePath, "utf8");
    run = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  // Validar run_id mínimo
  if (!run || typeof run.run_id !== "string" || !run.run_id.trim()) {
    process.exit(0);
  }

  const runId = run.run_id.trim();

  // Validar run_id: solo alfanuméricos, guiones y subguiones; sin separadores de path
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
    process.exit(0);
  }

  // Asegurarse de que docs/runs/ existe
  const runsDir = join(repoRoot, "docs", "runs");
  try {
    mkdirSync(runsDir, { recursive: true });
  } catch {
    process.exit(0);
  }

  // Renderizar y escribir el manifest
  const manifestRel = typeof run.manifest_path === "string" && run.manifest_path.startsWith("docs/runs/")
    ? run.manifest_path
    : `docs/runs/${runId}-SPECIFY-000-run-manifest.md`;
  const manifestPath = join(repoRoot, manifestRel);

  // Defensa en profundidad: verificar que el path resuelto está dentro de runsDir
  if (!resolve(manifestPath).startsWith(resolve(runsDir) + sep)) {
    process.exit(0);
  }
  try {
    const content = renderManifest(run);
    writeFileSync(manifestPath, content, "utf8");
  } catch {
    process.exit(0);
  }

  // Una línea corta a stdout confirmando el manifest escrito
  process.stdout.write(`[run-manifest] ${manifestRel} actualizado.\n`);
  process.exit(0);
}

main();
