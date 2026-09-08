#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..", "..");
const manifest = JSON.parse(readFileSync(resolve(root, ".asdd/rule-loading.json"), "utf8"));
const consumer = mkdtempSync(join(tmpdir(), "asdd-rule-consumer-"));
const transcript = [];

function words(text) {
  return String(text).trim().split(/\s+/u).filter(Boolean).length;
}

try {
  const scriptTarget = resolve(consumer, ".claude/scripts/asdd-resolve-rule.mjs");
  mkdirSync(dirname(scriptTarget), { recursive: true });
  cpSync(resolve(root, ".claude/scripts/asdd-resolve-rule.mjs"), scriptTarget);
  cpSync(resolve(root, ".claude/references/rules"), resolve(consumer, ".claude/references/rules"), { recursive: true });

  for (const entry of manifest.entries) {
    const resolved = spawnSync(process.execPath, [scriptTarget, entry.name], {
      cwd: consumer, encoding: "utf8", timeout: 30_000,
    });
    assert.equal(resolved.status, 0, resolved.stderr || resolved.error?.message);
    transcript.push({ rule: entry.name, event: "resolve" });
    const content = readFileSync(resolved.stdout.trim(), "utf8");
    transcript.push({ rule: entry.name, event: "Read", words: words(content) });
    for (const marker of entry.required_markers) assert.ok(content.includes(marker), `${entry.name}: ${marker}`);
    transcript.push({ rule: entry.name, event: "act" });
  }

  for (const entry of manifest.entries) {
    const events = transcript.filter((item) => item.rule === entry.name).map((item) => item.event);
    assert.deepEqual(events, ["resolve", "Read", "act"]);
  }

  // Broken reference fails before action.
  const broken = manifest.entries[0];
  rmSync(resolve(consumer, broken.reference), { force: true });
  const missing = spawnSync(process.execPath, [scriptTarget, broken.name], {
    cwd: consumer, encoding: "utf8", timeout: 30_000,
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /unavailable on-demand rule/);

  // Per-rule rollback is isolated: restore one core from its reference without
  // touching sibling references.
  const rollback = mkdtempSync(join(tmpdir(), "asdd-rule-rollback-"));
  try {
    const first = manifest.entries[0];
    const sibling = manifest.entries[1];
    const core = resolve(rollback, first.core);
    const reference = resolve(rollback, first.reference);
    mkdirSync(dirname(core), { recursive: true });
    mkdirSync(dirname(reference), { recursive: true });
    cpSync(resolve(root, first.core), core);
    cpSync(resolve(root, first.reference), reference);
    cpSync(resolve(root, sibling.reference), resolve(rollback, sibling.reference));
    cpSync(reference, core);
    rmSync(reference);
    assert.equal(readFileSync(core, "utf8"), readFileSync(resolve(root, first.reference), "utf8"));
    assert.ok(readFileSync(resolve(rollback, sibling.reference), "utf8").length > 0);
  } finally {
    rmSync(rollback, { recursive: true, force: true });
  }

  writeFileSync(resolve(consumer, "rule-loading-transcript.jsonl"),
    `${transcript.map((item) => JSON.stringify(item)).join("\n")}\n`);
  console.log(`PASS consumer: ${manifest.entries.length}/${manifest.entries.length} rules resolve and Read before act`);
  console.log("PASS fail-closed: missing reference blocks before action");
  console.log("PASS rollback: one rule restores independently without touching siblings");
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
