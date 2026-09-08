#!/usr/bin/env node
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const hook = resolve(root, ".claude/hooks/asdd-user-prompt-submit.mjs");
function numberArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return Number(index >= 0 ? process.argv[index + 1] : fallback);
}
const warmups = numberArg("--warmups", 5);
const samples = numberArg("--samples", 30);
if (!Number.isInteger(warmups) || warmups < 0 || !Number.isInteger(samples) || samples <= 0) {
  throw new Error("warmups/samples must be non-negative/positive integers");
}

const scenarios = {
  normal: "¿Qué hace este archivo?",
  read_only_audit: "Trabaja en modo estrictamente READ-ONLY. Audita todos los ADR y no modifiques archivos.",
  figma: "Implementá el diseño de figma.com/design/ABC123",
  authorization_security: "Corrige el flujo para que una autorización no permita comandos fuera del scope aprobado.",
  ambiguity: "Migrar la base de datos del CRM a un data warehouse",
  explicit_recovery: "Recupera el núcleo ORC completo",
};
const words = (text) => String(text).trim().split(/\s+/u).filter(Boolean).length;
const percentile = (values, q) => [...values].sort((a, b) => a - b)[Math.ceil(q * values.length) - 1];

function run(prompt) {
  return new Promise((resolveRun, rejectRun) => {
    const started = performance.now();
    let stdout = "";
    let stderr = "";
    const child = spawn(process.execPath, [hook], {
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("close", (status) => resolveRun({ status, stdout, stderr, wall_ms: performance.now() - started }));
    child.stdin.end(JSON.stringify({ prompt }));
  });
}

const results = {};
for (const [id, prompt] of Object.entries(scenarios)) {
  const measured = [];
  for (let i = 0; i < warmups + samples; i += 1) {
    const result = await run(prompt);
    if (result.status !== 0) throw new Error(`${id}: ${result.stderr || `exit ${result.status}`}`);
    if (i >= warmups) measured.push(result);
  }
  const outputs = [...new Set(measured.map((item) => item.stdout))];
  if (outputs.length !== 1) throw new Error(`${id}: nondeterministic output`);
  const times = measured.map((item) => item.wall_ms);
  results[id] = {
    injected_words: words(outputs[0]),
    output_bytes: Buffer.byteLength(outputs[0]),
    p50_ms: Number(percentile(times, 0.5).toFixed(2)),
    p95_ms: Number(percentile(times, 0.95).toFixed(2)),
  };
}

process.stdout.write(`${JSON.stringify({
  schema_version: 1,
  warmup_samples: warmups,
  measured_samples: samples,
  execution: "isolated UserPromptSubmit Node process per sample",
  results,
}, null, 2)}\n`);
