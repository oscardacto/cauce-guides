#!/usr/bin/env node
/**
 * test-challenge-amendment.mjs — ORC-010-E.
 *
 * Cubre las tres propiedades que hacen que una corrección no rehaga la
 * ceremonia sin aflojar el binding:
 *   1. un challenge enmendado no se aprueba por la vía normal;
 *   2. `approveAmendedChallenge` exige el challenge_id exacto y devuelve el
 *      lote ORIGINAL intacto (la corrección viaja en el prompt, no en el lote);
 *   3. la elegibilidad de la cola larga es de un solo uso y no sobrevive.
 * Y la ventana nueva del TTL al aprobar (VERIFY-003 Hueco 1).
 */
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import {
  approveActiveChallenge,
  approveAmendedChallenge,
  consumeApprovalEligibility,
  clearApprovalEligibility,
  issueChallenge,
  markApprovalEligible,
  markChallengeAmended,
  revokeActiveChallenge,
  RUNTIME_DIR,
} from "./lib/asdd-plan-authorization-lib.mjs";

let pass = 0;
let fail = 0;
const check = (id, text, fn) => {
  reset();
  try { fn(); pass++; console.log(`PASS [${id}] ${text}`); }
  catch (error) { fail++; console.log(`FAIL [${id}] ${text} — ${error.message}`); }
};
const reset = () => rmSync(RUNTIME_DIR, { recursive: true, force: true });

const PLAN = {
  request_id: "amend-test", task: "t", budget_policy_version: 1,
  route: "FULL", phase: "build", risk: "medium", confidence: 0.9, max_concurrent: 1,
  agents: [{
    agent: "asdd-developer-backend", capability: "asdd-developer-feature",
    scope: ["README.md"], commands: [], model: "sonnet", max_turns: 40, retries: 0,
  }],
};

check("AM1", "un challenge enmendado no se aprueba por la vía normal", () => {
  issueChallenge(PLAN);
  markChallengeAmended();
  assert.throws(() => approveActiveChallenge(), /amended/);
});

check("AM2", "approveAmendedChallenge devuelve el lote ORIGINAL intacto", () => {
  const challenge = issueChallenge(PLAN);
  markChallengeAmended();
  const [authorization] = approveAmendedChallenge(challenge.challenge_id);
  assert.equal(authorization.agent, "asdd-developer-backend");
  assert.deepEqual(authorization.scope, ["README.md"]);
  assert.deepEqual(authorization.commands, []);
  assert.equal(authorization.plan_hash, challenge.plan_hash);
});

check("AM3", "la enmienda exige el challenge_id exacto", () => {
  issueChallenge(PLAN);
  markChallengeAmended();
  assert.throws(() => approveAmendedChallenge("00000000-0000-0000-0000-000000000000"), /exact active challenge id/);
  assert.throws(() => approveAmendedChallenge(""), /exact active challenge id/);
});

check("AM4", "sin enmienda previa, approveAmendedChallenge falla cerrado", () => {
  const challenge = issueChallenge(PLAN);
  assert.throws(() => approveAmendedChallenge(challenge.challenge_id), /not marked as amended/);
});

check("AM5", "el rechazo revoca: no queda challenge que aprobar después", () => {
  issueChallenge(PLAN);
  assert.equal(revokeActiveChallenge(), true);
  assert.throws(() => approveActiveChallenge(), /ENOENT|missing, invalid, or expired/);
});

check("EL1", "la elegibilidad se ata al challenge activo y es de un solo uso", () => {
  const challenge = issueChallenge(PLAN);
  assert.equal(markApprovalEligible().challenge_id, challenge.challenge_id);
  consumeApprovalEligibility(challenge.challenge_id);
  assert.throws(() => consumeApprovalEligibility(challenge.challenge_id), (error) => error.code === "approval-not-eligible");
});

check("EL2", "la elegibilidad no sirve para otro challenge", () => {
  issueChallenge(PLAN);
  markApprovalEligible();
  assert.throws(() => consumeApprovalEligibility("00000000-0000-0000-0000-000000000000"), (error) => error.code === "approval-not-eligible");
});

check("EL3", "un challenge enmendado no queda elegible", () => {
  issueChallenge(PLAN);
  markChallengeAmended();
  assert.equal(markApprovalEligible(), null);
});

check("EL4", "sin marcador, consumir elegibilidad falla cerrado", () => {
  clearApprovalEligibility();
  assert.throws(() => consumeApprovalEligibility("00000000-0000-0000-0000-000000000000"), (error) => error.code === "approval-not-eligible");
});

check("TTL1", "la autorización abre ventana nueva al aprobar, no hereda el remanente", () => {
  // VERIFY-003 Hueco 1: deliberar 890s dejaba autorizaciones de 10s.
  const issuedAt = new Date();
  issueChallenge({ ...PLAN, ttl_seconds: 900 }, issuedAt);
  const approvedAt = new Date(issuedAt.getTime() + 890_000);
  const [authorization] = approveActiveChallenge(approvedAt);
  const windowSeconds = Math.round((Date.parse(authorization.expires_at) - approvedAt.getTime()) / 1000);
  assert.equal(windowSeconds, 900);
});

reset();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
