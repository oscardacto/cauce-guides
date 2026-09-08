#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  approveActiveChallenge,
  approveAmendedChallenge,
  AUTHORIZATIONS_PATH,
  CHALLENGE_PATH,
  consumeApprovalEligibility,
  issueChallenge,
  readJson,
} from "./lib/asdd-plan-authorization-lib.mjs";

const USAGE = "usage: plan-authorization.mjs issue [--plan-json '<json>']"
  + " | approve --challenge-id <uuid>"
  + " | amend --challenge-id <uuid> --confirm-unchanged"
  + " | status";

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const action = process.argv[2];
try {
  if (action === "issue") {
    const inlinePlan = process.argv[3] === "--plan-json" ? process.argv[4] : null;
    if (process.argv[3] && !inlinePlan) {
      throw new Error("usage: plan-authorization.mjs issue [--plan-json '<json>']");
    }
    const input = JSON.parse(inlinePlan ?? readFileSync(0, "utf8"));
    const result = issueChallenge(input);
    console.log(JSON.stringify({ challenge_id: result.challenge_id, plan_hash: result.plan_hash, expires_at: result.expires_at }));
  } else if (action === "approve") {
    // ORC-010-E: el `ok` inequívoco lo consume el hook UserPromptSubmit. Esta
    // forma cubre solo la cola larga ("joya", "va"): exige que el hook haya
    // marcado el turno elegible para ESE challenge, y se consume una sola vez.
    const challengeId = flag("--challenge-id");
    if (!challengeId) throw new Error("approve requires --challenge-id <uuid>");
    consumeApprovalEligibility(challengeId);
    console.log(JSON.stringify({ authorizations: approveActiveChallenge().map((item) => item.authorization_id) }));
  } else if (action === "amend") {
    // ORC-010-E: el usuario aprobó con una corrección que no cambia agentes,
    // scope[], commands[] ni budget. Aprueba el lote original tal cual; la
    // corrección viaja en el prompt del agente. Si el envelope cambia, el
    // camino correcto es emitir un challenge nuevo, no este comando.
    const challengeId = flag("--challenge-id");
    if (!challengeId) throw new Error("amend requires --challenge-id <uuid>");
    if (!process.argv.includes("--confirm-unchanged")) {
      throw new Error("amend requires --confirm-unchanged: the correction must not change agents, scope, commands or budget");
    }
    console.log(JSON.stringify({ authorizations: approveAmendedChallenge(challengeId).map((item) => item.authorization_id) }));
  } else if (action === "status") {
    const result = {};
    try { result.challenge = readJson(CHALLENGE_PATH); } catch { result.challenge = null; }
    try { result.authorizations = readJson(AUTHORIZATIONS_PATH); } catch { result.authorizations = null; }
    console.log(JSON.stringify(result, null, 2));
  } else {
    throw new Error(USAGE);
  }
} catch (error) {
  console.error(`plan-authorization: ${error.message}`);
  process.exit(1);
}
