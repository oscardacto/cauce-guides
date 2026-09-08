#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  evaluateRunReconciliation,
  parseIndex,
  sliceId,
  writeReconciledState,
} from "./lib/sofka-asdd-run-reconciliation-lib.mjs";

const root = mkdtempSync(join(tmpdir(), "asdd-reconciliation-"));
const put = (path, content) => {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
  return full;
};
const state = (currentPhase, analyzeStatus = "pending", indexRef) => ({
  run_id: "2026-07-18-999",
  current_phase: currentPhase,
  phases: {
    specify: { status: currentPhase === "specify" ? "in_progress" : "complete" },
    analyze: { status: analyzeStatus },
    design: { status: currentPhase === "design" ? "in_progress" : "pending" },
    build: {
      status: currentPhase === "build" ? "in_progress" : "pending",
      ...(indexRef ? { index_ref: indexRef } : {}),
      completed_steps: [],
      pending_steps: [],
    },
  },
  resume_hint: "fixture",
});

assert.equal(evaluateRunReconciliation(root, null).reason, "no-active-run");
assert.equal(evaluateRunReconciliation(root, state("specify")).outcome, "skipped");
const specifyComplete = state(null);
specifyComplete.phases.specify.status = "complete";
assert.equal(evaluateRunReconciliation(root, specifyComplete).outcome, "skipped");
assert.equal(evaluateRunReconciliation(root, state("analyze", "in_progress")).outcome, "skipped");

const analyzeComplete = evaluateRunReconciliation(root, state("analyze", "complete"));
assert.equal(analyzeComplete.outcome, "error");
assert.match(analyzeComplete.errors[0], /build\.index_ref/u);
const designMissing = evaluateRunReconciliation(root, state("design", "complete"));
assert.equal(designMissing.required, true);
assert.equal(designMissing.outcome, "error");

put("docs/specs/brief.md", "# not an index");
const fakeIndex = evaluateRunReconciliation(root, state("specify", "pending", "docs/specs/brief.md"));
assert.equal(fakeIndex.outcome, "error");
assert.match(fakeIndex.errors[0], /\*-index\.md/u);
const emptyIndexState = state("specify");
emptyIndexState.phases.build.index_ref = "";
assert.equal(evaluateRunReconciliation(root, emptyIndexState).outcome, "error");
const outside = evaluateRunReconciliation(root, state("specify", "pending", "../outside-index.md"));
assert.equal(outside.outcome, "error");
assert.match(outside.errors[0], /fuera del proyecto/u);

const indexText = `# INDEX

| Orden | Slice | Área | Estado |
|---:|---|---|---|
| 1 | SPIKE-1 — original | qa | corrected_by_SPIKE-1R |
| 1R | SPIKE-1R — corrected | qa | done |
| 2 | S1 — contract | security | pending |
`;
put("docs/specs/2026-07-18-999-ANALYZE-001-fixture-index.md", indexText);
const earlyIndex = state(
  "specify",
  "pending",
  "docs/specs/2026-07-18-999-ANALYZE-001-fixture-index.md",
);
earlyIndex.phases.build.completed_steps = ["SPIKE-1: done", "SPIKE-1R: done"];
earlyIndex.phases.build.pending_steps = ["S1: pending"];
const earlyChecked = evaluateRunReconciliation(root, earlyIndex);
assert.equal(earlyChecked.outcome, "checked");
assert.equal(earlyChecked.required, false);
const validState = state(
  "build",
  "complete",
  "docs/specs/2026-07-18-999-ANALYZE-001-fixture-index.md",
);
validState.phases.build.completed_steps = [
  "SPIKE-1: corrected baseline",
  "SPIKE-1R: reconciliado con INDEX",
];
validState.phases.build.pending_steps = ["S1: pendiente según INDEX"];
const checked = evaluateRunReconciliation(root, validState, {
  branch: "feature/test",
  head_commit: "abc",
});
assert.equal(checked.outcome, "checked");
assert.deepEqual(checked.index_terminal, ["SPIKE-1", "SPIKE-1R"]);
assert.deepEqual(checked.index_pending, ["S1"]);
assert.equal(sliceId("SPIKE-1R dispatcher"), "SPIKE-1R");
const missingProvenance = evaluateRunReconciliation(root, validState, { require_provenance: true });
assert(missingProvenance.drift.includes("reconciliation — falta proveniencia branch/head_commit"));

const driftState = structuredClone(validState);
driftState.phases.build.completed_steps = [];
driftState.phases.build.pending_steps = ["SPIKE-1R: stale", "S1: pending"];
const drift = evaluateRunReconciliation(root, driftState);
assert.equal(drift.outcome, "drift");
assert(drift.drift.includes("INDEX terminal but state incomplete: SPIKE-1R"));
assert(drift.drift.includes("state pending but INDEX terminal: SPIKE-1R"));

const duplicate = parseIndex(`${indexText}| 3 | S1 — duplicate | qa | done |\n`);
assert(duplicate.errors.includes("INDEX duplicate slice: S1"));

const statePath = put(".asdd-run.json", `${JSON.stringify(driftState)}\n`);
assert.equal(writeReconciledState(statePath, driftState, drift, new Date("2026-07-18T00:00:00Z")), true);
const written = JSON.parse(readFileSync(statePath, "utf8"));
assert.deepEqual(written.phases.build.completed_steps, [
  "SPIKE-1: reconciliado con INDEX",
  "SPIKE-1R: reconciliado con INDEX",
]);
assert.deepEqual(written.phases.build.pending_steps, ["S1: pendiente según INDEX"]);
assert.equal(written.reconciliation.schema_version, 2);

rmSync(root, { recursive: true, force: true });
console.log("PASS reconciliation: no-run/Specify/Analyze skips and post-Analyze requirement");
console.log("PASS reconciliation: index path/integrity, SPIKE-1R and corrected terminal status");
console.log("PASS reconciliation: drift detection and atomic write synchronization");
