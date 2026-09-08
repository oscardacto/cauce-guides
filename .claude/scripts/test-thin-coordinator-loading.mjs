#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseFrontmatter } from "./lib/sofka-asdd-frontmatter-lib.mjs";
import { readNormalized } from "./lib/sofka-asdd-hash-normalize-lib.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const manifest = JSON.parse(readNormalized(resolve(root, ".sofka-asdd/coordinator-loading.json")));
const transcript = [];
const words = (text) => String(text).trim().split(/\s+/u).filter(Boolean).length;

function consume(base, name, routeName) {
  const config = manifest.coordinators[name];
  const route = config.routes.find((item) => item.name === routeName);
  assert.ok(route, `${name}: unknown route ${routeName}`);
  const core = readNormalized(resolve(base, config.core));
  transcript.push({ coordinator: name, route: routeName, event: "Read-core" });
  assert.ok(core.includes(route.path), `${name}: core routes ${route.path}`);
  const detail = readNormalized(resolve(base, route.path));
  transcript.push({ coordinator: name, route: routeName, event: "Read-phase" });
  assert.equal(
    createHash("sha256").update(detail).digest("hex"),
    route.sha256,
    `${name}.${routeName}: SHA-256 integrity`,
  );
  for (const marker of route.required_markers) assert.ok(detail.includes(marker), `${name}.${routeName}: ${marker}`);
  transcript.push({ coordinator: name, route: routeName, event: "act" });
}

for (const [name, config] of Object.entries(manifest.coordinators)) {
  const coreText = readFileSync(resolve(root, config.core), "utf8");
  const frontmatter = parseFrontmatter(coreText);
  assert.ok(frontmatter.ok, `${name}: valid core frontmatter`);
  assert.deepEqual(frontmatter.data.tools, config.tools, `${name}: exact tool allowlist`);
  assert.ok(!config.tools.includes("all"), `${name}: tools all forbidden`);
  assert.ok(words(coreText) <= config.max_core_words, `${name}: thin core budget`);
  for (const route of config.routes) consume(root, name, route.name);
}

for (const [name, config] of Object.entries(manifest.coordinators)) {
  for (const route of config.routes) {
    const events = transcript
      .filter((item) => item.coordinator === name && item.route === route.name)
      .map((item) => item.event);
    assert.deepEqual(events, ["Read-core", "Read-phase", "act"]);
  }
}

// Every declared rollback source is immutable and matches its manifest digest.
for (const [name, config] of Object.entries(manifest.coordinators)) {
  const rollback = readNormalized(resolve(root, config.rollback_source));
  assert.equal(
    createHash("sha256").update(rollback).digest("hex"),
    config.rollback_sha256,
    `${name}: rollback SHA-256 integrity`,
  );
}

// Broken phase path fails before act in an isolated consumer.
const brokenRoot = mkdtempSync(join(tmpdir(), "asdd-b7-broken-"));
try {
  const [name, config] = Object.entries(manifest.coordinators)[0];
  const route = config.routes[0];
  for (const path of [config.core, route.path]) {
    mkdirSync(dirname(resolve(brokenRoot, path)), { recursive: true });
    cpSync(resolve(root, path), resolve(brokenRoot, path));
  }
  rmSync(resolve(brokenRoot, route.path));
  const before = transcript.length;
  assert.throws(() => consume(brokenRoot, name, route.name), /ENOENT/);
  assert.ok(!transcript.slice(before).some((item) => item.event === "act"));
} finally {
  rmSync(brokenRoot, { recursive: true, force: true });
}

// A phase retaining its markers but changing content also fails before act.
const mutatedRoot = mkdtempSync(join(tmpdir(), "asdd-b7-mutated-"));
try {
  const [name, config] = Object.entries(manifest.coordinators)[0];
  const route = config.routes[0];
  for (const path of [config.core, route.path]) {
    mkdirSync(dirname(resolve(mutatedRoot, path)), { recursive: true });
    cpSync(resolve(root, path), resolve(mutatedRoot, path));
  }
  appendFileSync(resolve(mutatedRoot, route.path), "\n<!-- unauthorized mutation -->\n");
  const before = transcript.length;
  assert.throws(() => consume(mutatedRoot, name, route.name), /SHA-256 integrity/);
  assert.ok(!transcript.slice(before).some((item) => item.event === "act"));
} finally {
  rmSync(mutatedRoot, { recursive: true, force: true });
}

// Per-coordinator rollback restores one core without touching its sibling.
const rollbackRoot = mkdtempSync(join(tmpdir(), "asdd-b7-rollback-"));
try {
  const entries = Object.entries(manifest.coordinators);
  const [name, config] = entries[0];
  const [siblingName, sibling] = entries[1];
  for (const path of [config.core, config.rollback_source, sibling.core]) {
    mkdirSync(dirname(resolve(rollbackRoot, path)), { recursive: true });
    cpSync(resolve(root, path), resolve(rollbackRoot, path));
  }
  const siblingBefore = readFileSync(resolve(rollbackRoot, sibling.core), "utf8");
  cpSync(resolve(rollbackRoot, config.rollback_source), resolve(rollbackRoot, config.core));
  assert.equal(readFileSync(resolve(rollbackRoot, config.core), "utf8"), readFileSync(resolve(root, config.rollback_source), "utf8"), `${name}: restored`);
  assert.equal(readFileSync(resolve(rollbackRoot, sibling.core), "utf8"), siblingBefore, `${siblingName}: untouched`);
} finally {
  rmSync(rollbackRoot, { recursive: true, force: true });
}

const routeCount = Object.values(manifest.coordinators).reduce((sum, item) => sum + item.routes.length, 0);
console.log(`PASS thin coordinators: 2/2 cores and ${routeCount}/${routeCount} phase routes Read before act`);
console.log("PASS least privilege: exact allowlists and no tools: all");
console.log("PASS anti-orphan: missing or mutated phase blocks before act; rollback digests are valid");
console.log("PASS rollback: one coordinator restores independently without touching its sibling");
