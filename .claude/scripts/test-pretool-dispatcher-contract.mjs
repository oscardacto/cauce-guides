#!/usr/bin/env node

// S1 executable oracle for ADR-018. This is not the production dispatcher.
// B3 must satisfy these merge, execution and fail-closed properties.

import assert from "node:assert/strict";

const rank = { allow: 0, ask: 1, defer: 2, deny: 3 };

function normalizeResult(id, result) {
  if (!result || !Object.hasOwn(rank, result.decision)) {
    return {
      decision: "deny",
      reasons: [`guard-error:${id}:invalid-result`],
      effects: [],
    };
  }
  const reasons = Array.isArray(result.reasons)
    ? result.reasons
    : [result.reason].filter(Boolean);
  return {
    decision: result.decision,
    reasons,
    effects: Array.isArray(result.effects) ? result.effects : [],
  };
}

async function evaluate(guards, event) {
  const outcomes = [];
  for (const guard of guards) {
    try {
      outcomes.push({ id: guard.id, ...normalizeResult(guard.id, await guard.check(event)) });
    } catch {
      outcomes.push({
        id: guard.id,
        decision: "deny",
        reasons: [`guard-error:${guard.id}:exception`],
        effects: [],
      });
    }
  }
  const highest = Math.max(...outcomes.map((item) => rank[item.decision]));
  const winners = outcomes.filter((item) => rank[item.decision] === highest);
  return {
    decision: winners[0]?.decision ?? "allow",
    reasons: winners.flatMap((item) => item.reasons),
    effects: outcomes.flatMap((item) => item.effects),
    executed: outcomes.map((item) => item.id),
  };
}

const calls = [];
const allApplicable = await evaluate(
  [
    { id: "first-deny", check: () => (calls.push("first-deny"), { decision: "deny", reason: "D-1", effects: ["audit-1"] }) },
    { id: "second-deny", check: () => (calls.push("second-deny"), { decision: "deny", reason: "D-2", effects: ["consume-2"] }) },
    { id: "late-allow", check: () => (calls.push("late-allow"), { decision: "allow", effects: ["audit-3"] }) },
  ],
  {},
);
assert.deepEqual(calls, ["first-deny", "second-deny", "late-allow"]);
assert.equal(allApplicable.decision, "deny");
assert.deepEqual(allApplicable.reasons, ["D-1", "D-2"]);
assert.deepEqual(allApplicable.effects, ["audit-1", "consume-2", "audit-3"]);

const precedence = await evaluate(
  [
    { id: "allow", check: () => ({ decision: "allow", reason: "A" }) },
    { id: "ask", check: () => ({ decision: "ask", reason: "Q" }) },
    { id: "defer", check: () => ({ decision: "defer", reason: "F" }) },
  ],
  {},
);
assert.equal(precedence.decision, "defer");
assert.deepEqual(precedence.reasons, ["F"]);

const exception = await evaluate(
  [
    { id: "broken", check: () => { throw new Error("secret must not leak"); } },
    { id: "sibling", check: () => ({ decision: "allow" }) },
  ],
  {},
);
assert.equal(exception.decision, "deny");
assert.deepEqual(exception.reasons, ["guard-error:broken:exception"]);
assert.deepEqual(exception.executed, ["broken", "sibling"]);

const invalid = await evaluate(
  [{ id: "invalid", check: () => ({ decision: "approve", reason: "unsafe" }) }],
  {},
);
assert.equal(invalid.decision, "deny");
assert.deepEqual(invalid.reasons, ["guard-error:invalid:invalid-result"]);

console.log("PASS precedence: deny > defer > ask > allow");
console.log("PASS completeness: every applicable guard executes after deny");
console.log("PASS deterministic reasons: all winning reasons retain guard order");
console.log("PASS effects: all declared effects retain guard order for central handling");
console.log("PASS fail-closed: exception and invalid result become stable deny");
