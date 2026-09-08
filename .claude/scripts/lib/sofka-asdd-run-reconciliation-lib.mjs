import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { VALID_PHASES, resolveActivePhase } from "../../hooks/_lib/run-phase-resolver.mjs";

const SLICE_PATTERN = /\b(?:DOC-\d+|SPIKE-\d+[A-Z]?|[BSD]\d+(?:\/S\d+)?)\b/u;
const TERMINAL_STATUS = /^(?:done|corrected_by_.+)$/u;

export function sliceId(text) {
  return String(text ?? "").match(SLICE_PATTERN)?.[0] ?? null;
}

function indexRequirement(state) {
  const active = resolveActivePhase(state);
  const analyzeStatus = state.phases?.analyze?.status;
  const activeOrder = active ? VALID_PHASES.indexOf(active) : -1;
  if (analyzeStatus === "complete" || activeOrder >= VALID_PHASES.indexOf("design")) {
    return { required: true, active_phase: active, reason: "analyze-complete-or-later" };
  }
  if (active === "analyze") return { required: false, active_phase: active, reason: "analyze-in-progress" };
  return { required: false, active_phase: active, reason: "before-analyze-complete" };
}

function resolveIndex(root, indexRef) {
  if (typeof indexRef !== "string" || !indexRef.trim()) {
    return { error: "build.index_ref — falta o no existe" };
  }
  if (isAbsolute(indexRef)) return { error: "build.index_ref — debe ser una ruta relativa dentro del proyecto" };
  const path = resolve(root, indexRef);
  const rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return { error: "build.index_ref — ruta fuera del proyecto" };
  }
  const normalized = rel.replaceAll(sep, "/");
  if (!normalized.startsWith("docs/specs/") || !/-index\.md$/u.test(normalized)) {
    return { error: "build.index_ref — debe apuntar a docs/specs/*-index.md" };
  }
  if (!existsSync(path)) return { error: `build.index_ref — no existe: ${normalized}` };
  return { path, relative: normalized };
}

export function parseIndex(text) {
  const rows = [];
  const errors = [];
  for (const line of String(text).split(/\r?\n/u)) {
    if (!line.trimStart().startsWith("|")) continue;
    const columns = line.split("|").map((value) => value.trim());
    if (!/^\d+[A-Z]?$/u.test(columns[1] ?? "")) continue;
    const id = sliceId(columns[2]);
    if (!id) continue;
    const status = String(columns[4] ?? "").toLowerCase();
    if (!status || status === "estado") {
      errors.push(`INDEX slice ${id} has no status`);
      continue;
    }
    rows.push({ id, status });
  }
  if (rows.length === 0) errors.push("INDEX has no planned slices");
  const duplicates = [...new Set(rows.map((row) => row.id).filter((id, index, all) => all.indexOf(id) !== index))];
  for (const id of duplicates) errors.push(`INDEX duplicate slice: ${id}`);
  return { rows, errors };
}

export function evaluateRunReconciliation(root, state, provenance = {}) {
  if (!state) {
    return {
      schema_version: 2,
      outcome: "skipped",
      reason: "no-active-run",
      required: false,
      drift: [],
      errors: [],
    };
  }
  const requirement = indexRequirement(state);
  const build = state.phases?.build;
  const hasIndexRef = Boolean(build && Object.hasOwn(build, "index_ref"));
  const indexRef = build?.index_ref;
  if (!hasIndexRef && !requirement.required) {
    return {
      schema_version: 2,
      run_id: state.run_id,
      outcome: "skipped",
      reason: requirement.reason,
      required: false,
      active_phase: requirement.active_phase,
      drift: [],
      errors: [],
    };
  }

  const resolved = resolveIndex(root, indexRef);
  if (resolved.error) {
    return {
      schema_version: 2,
      run_id: state.run_id,
      outcome: "error",
      reason: requirement.reason,
      required: requirement.required,
      active_phase: requirement.active_phase,
      index_ref: indexRef ?? null,
      drift: [],
      errors: [resolved.error],
    };
  }

  const parsed = parseIndex(readFileSync(resolved.path, "utf8"));
  const terminal = parsed.rows.filter((item) => TERMINAL_STATUS.test(item.status)).map((item) => item.id);
  const pending = parsed.rows.filter((item) => !TERMINAL_STATUS.test(item.status)).map((item) => item.id);
  const completed = (state.phases?.build?.completed_steps ?? []).map(sliceId).filter(Boolean);
  const declaredPending = (state.phases?.build?.pending_steps ?? []).map(sliceId).filter(Boolean);
  const drift = [
    ...terminal.filter((id) => !completed.includes(id)).map((id) => `INDEX terminal but state incomplete: ${id}`),
    ...declaredPending.filter((id) => terminal.includes(id)).map((id) => `state pending but INDEX terminal: ${id}`),
  ];
  const prior = state.reconciliation;
  if (provenance.require_provenance && (!prior?.branch || !prior?.head_commit)) {
    drift.push("reconciliation — falta proveniencia branch/head_commit");
  }
  if (prior?.branch && provenance.branch && prior.branch !== provenance.branch) {
    drift.push(`state branch differs: ${prior.branch} != ${provenance.branch}`);
  }
  if (prior?.head_commit && provenance.head_commit && provenance.is_ancestor?.(prior.head_commit) === false) {
    drift.push("state head_commit is not an ancestor of current HEAD");
  }
  const errors = [...parsed.errors];
  return {
    schema_version: 2,
    run_id: state.run_id,
    outcome: errors.length ? "error" : drift.length ? "drift" : "checked",
    reason: "index-present",
    required: requirement.required,
    active_phase: requirement.active_phase,
    branch: provenance.branch ?? null,
    head_commit: provenance.head_commit ?? null,
    index_ref: resolved.relative,
    index_terminal: terminal,
    index_pending: pending,
    drift,
    errors,
  };
}

export function writeReconciledState(statePath, state, report, now = new Date()) {
  if (report.outcome === "skipped") return false;
  if (report.errors.length) throw new Error(report.errors.join("; "));
  const build = state.phases.build ?? (state.phases.build = {});
  const previousCompleted = build.completed_steps ?? [];
  const retained = previousCompleted.filter((item) => !sliceId(item));
  build.completed_steps = [
    ...retained,
    ...report.index_terminal.map((id) =>
      previousCompleted.find((item) => sliceId(item) === id) ?? `${id}: reconciliado con INDEX`),
  ];
  build.pending_steps = report.index_pending.map((id) => `${id}: pendiente según INDEX`);
  state.resume_hint = report.index_pending.length
    ? `Continuar ${report.index_pending[0]} según INDEX y reconciliación.`
    : "No hay slices pendientes en el INDEX.";
  state.reconciliation = {
    schema_version: 2,
    branch: report.branch,
    head_commit: report.head_commit,
    index_ref: report.index_ref,
    reconciled_at: now.toISOString(),
  };
  state.last_checkpoint = now.toISOString();
  const temporary = `${statePath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, statePath);
  return true;
}
