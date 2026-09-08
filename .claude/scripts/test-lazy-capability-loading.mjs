#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  approveActiveChallenge,
  authorizeAgentOperation,
  consumeLaunchAuthorization,
  isAuthorizationError,
  issueChallenge,
  RUNTIME_DIR,
} from "./lib/sofka-asdd-plan-authorization-lib.mjs";
import { readNormalized } from "./lib/sofka-asdd-hash-normalize-lib.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const manifest = JSON.parse(readFileSync(resolve(root, ".sofka-asdd/capability-loading.json"), "utf8"));
// Todo agente del manifiesto, no una lista fija: un agente nuevo entra al
// manifiesto y queda cubierto sin tocar esta suite.
const migrated = Object.keys(manifest.agents).sort();
// Capability de OTRO agente, para el caso adversarial cuando el catalogo propio
// tiene solo dos entradas y no alcanza para un tercero no aprobado.
const foreignCapability = (agent) => {
  const own = new Set(manifest.agents[agent].capabilities);
  for (const [other, config] of Object.entries(manifest.agents)) {
    if (other === agent) continue;
    const candidate = config.capabilities.find((capability) => !own.has(capability));
    if (candidate) return candidate;
  }
  throw new Error(`${agent}: no foreign capability available for the adversarial case`);
};
// El agente que sostiene los casos de plan malformado necesita tres capabilities.
const adversarialAgent = migrated.find((agent) => manifest.agents[agent].capabilities.length >= 3);
assert.ok(adversarialAgent, "manifest needs one agent with three capabilities");
const clean = () => rmSync(RUNTIME_DIR, { recursive: true, force: true });
const throwsCode = (fn, code) => {
  try { fn(); return false; } catch (error) { return isAuthorizationError(error, code); }
};
const transcript = [];

try {
  for (const agent of migrated) {
    const config = manifest.agents[agent];
    assert.ok(config, `${agent}: manifest entry`);
    assert.ok(config.capabilities.length >= 2, `${agent}: catalog needs a primary and a dependency`);
    const [primary, dependency] = config.capabilities;
    const unapproved = config.capabilities[2] ?? foreignCapability(agent);
    const agentText = readFileSync(resolve(root, ".claude/agents", `${agent}.md`), "utf8");
    const frontmatter = agentText.match(/^---\s*\n([\s\S]*?)\n---/u)?.[1] ?? "";
    // Sin Bash el agente no puede correr el loader, y entonces el gate le rechaza
    // todo Write/Edit con capability-not-loaded: el toolset es parte del contrato.
    const declaredTools = frontmatter.match(/^(?:tools|allowed-tools):\s*\[(.*)\]\s*$/mu)?.[1] ?? "";
    assert.ok(
      declaredTools.split(",").map((tool) => tool.trim()).includes("Bash"),
      `${agent}: agent in the capability manifest must declare Bash to load its capability`,
    );
    const eager = frontmatter.match(/^skills:\s*\[(.*)\]\s*$/mu)?.[1] ?? "";
    const eagerCount = eager.trim() ? eager.split(",").length : 0;
    assert.ok(
      eagerCount <= config.max_eager_skills,
      `${agent}: ${eagerCount} eager skills exceed manifest max ${config.max_eager_skills}`,
    );

    clean();
    issueChallenge({
      request_id: `b6-${agent}`,
      budget_policy_version: 1,
      route: "LIGHT",
      phase: "build",
      risk: "low",
      confidence: 0.9,
      max_concurrent: 1,
      agents: [{
        agent,
        capability: primary,
        dependencies: [dependency],
        scope: [`.claude/agents/${agent}.md`],
        commands: [],
        model: "sonnet", max_turns: 20, retries: 0,
      }],
    });
    approveActiveChallenge();
    consumeLaunchAuthorization(agent);
    const operation = (capability) => ({
      agent_id: `runtime-${agent}`,
      agent_type: agent,
      tool_name: capability ? "Bash" : "Edit",
      tool_input: capability
        ? { command: `node .claude/scripts/sofka-asdd-load-capability.mjs ${capability}` }
        : { file_path: `.claude/agents/${agent}.md` },
    });

    assert.ok(throwsCode(() => authorizeAgentOperation(operation()), "capability-not-loaded"));
    const dependencyAuth = authorizeAgentOperation(operation(dependency));
    assert.ok(dependencyAuth.loaded_capabilities.includes(dependency));
    const dependencyDelivered = spawnSync(process.execPath, [
      resolve(root, ".claude/scripts/sofka-asdd-load-capability.mjs"), dependency,
    ], { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(dependencyDelivered.status, 0, dependencyDelivered.stderr);
    assert.match(dependencyDelivered.stdout, new RegExp(`ASDD capability loaded: ${dependency}`));
    assert.ok(throwsCode(() => authorizeAgentOperation(operation()), "capability-not-loaded"));
    const primaryAuth = authorizeAgentOperation(operation(primary));
    assert.equal(primaryAuth.loaded_capability, primary);
    assert.deepEqual(primaryAuth.loaded_capabilities.sort(), [dependency, primary].sort());

    const delivered = spawnSync(process.execPath, [
      resolve(root, ".claude/scripts/sofka-asdd-load-capability.mjs"), primary,
    ], { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(delivered.status, 0, delivered.stderr);
    assert.match(delivered.stdout, new RegExp(`ASDD capability loaded: ${primary}`));
    assert.match(delivered.stdout, /^<!-- ASDD capability loaded:[^\n]+-->\n---/u);
    authorizeAgentOperation(operation());
    assert.ok(throwsCode(() => authorizeAgentOperation(operation(unapproved)), "capability-mismatch"));
    transcript.push({ agent, primary, dependency, result: "resolve-load-act" });
  }

  assert.throws(() => issueChallenge({
    request_id: "b6-missing-primary",
    agents: [{ agent: adversarialAgent, scope: ["."], commands: [] }],
  }), /requires one declared capability/);
  const tech = manifest.agents[adversarialAgent].capabilities;
  assert.throws(() => issueChallenge({
    request_id: "b6-too-many-dependencies",
    agents: [{ agent: adversarialAgent, capability: tech[0], dependencies: [tech[1], tech[2]], scope: ["."], commands: [] }],
  }), /at most 1 capability dependencies/);
  assert.throws(() => issueChallenge({
    request_id: "b6-malformed-dependencies",
    agents: [{ agent: adversarialAgent, capability: tech[0], dependencies: tech[1], scope: ["."], commands: [] }],
  }), /dependencies must be a list/);

  const rollback = mkdtempSync(join(tmpdir(), "asdd-b6-rollback-"));
  try {
    const [agent, sibling] = migrated;
    const config = structuredClone(manifest);
    const siblingBefore = JSON.stringify(config.agents[sibling]);
    const path = resolve(rollback, `${agent}.md`);
    // Normalizado CRLF→LF antes de operar (agentes del template usan CRLF en
    // disco por core.autocrlf; sin esto `/^---\n/` nunca matchea y el
    // .replace() se vuelve un no-op silencioso — ver sofka-asdd-hash-normalize-lib.mjs).
    let text = readNormalized(resolve(root, ".claude/agents", `${agent}.md`));
    text = text.replace(/^---\n/u, `---\nskills: [${config.agents[agent].capabilities.join(", ")}]\n`);
    writeFileSync(path, text);
    delete config.agents[agent];
    assert.match(readFileSync(path, "utf8"), /^---\nskills:/u);
    assert.equal(JSON.stringify(config.agents[sibling]), siblingBefore);
  } finally {
    rmSync(rollback, { recursive: true, force: true });
  }

  console.log(`PASS lazy consumer: ${migrated.length}/${migrated.length} primary + approved dependency load before act`);
  console.log("PASS security: missing primary, unapproved third capability and excess dependencies fail closed");
  console.log("PASS rollback: one agent restores eager catalog without touching its sibling");
  console.log(JSON.stringify({ transcript }, null, 2));
} finally {
  clean();
}
