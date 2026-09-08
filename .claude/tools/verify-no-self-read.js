#!/usr/bin/env node
/**
 * verify-no-self-read.js — Enforcement programático de REGLA 1 (ANTI-SELF-READ).
 *
 * Detecta cuántas veces el agente leyó specs grandes y estables (orchestrator.md,
 * executor.md, executor.md) durante la sesión. Cualquiera leído >1
 * vez constituye violación de REGLA 1 y representa overhead de tokens evitable
 * (~1400-2100 tokens/violación).
 *
 * Fuente de verdad: las transcripciones JSONL de Claude Code en
 * `${USERPROFILE}/.claude/projects/{slug}/*.jsonl`. Cada línea es un evento; los
 * tool_use de tipo `Read` tienen `tool_input.file_path` con el path leído.
 *
 * Si el transcript no está accesible (path desconocido, permisos, sandboxing) →
 * exit 2 SKIPPED (no falla el run).
 *
 * Uso:
 *   node .claude/tools/verify-no-self-read.js --run-id=<id>
 *   node .claude/tools/verify-no-self-read.js --run-id=<id> --transcript-dir=<path>
 *   node .claude/tools/verify-no-self-read.js --run-id=<id> --since=<ISO timestamp>
 *
 * Exit codes:
 *   0 — sin violaciones
 *   1 — al menos 1 violación detectada (imprime detalle JSON y registra report)
 *   2 — transcript no accesible (SKIPPED, no falla)
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const TRACKED_FILES = [
  'asdd-atf-web-qa-engineer.md',  // coordinador unificado (antes orchestrator.md)
  'execute.md',                         // phase-spec executor (antes executor.md)
  'enrich.md',                          // phase-spec cp-enricher (antes cp-enricher.md)
  'design.md',                          // phase-spec design-team
  'strategize.md',                      // phase-spec strategist
  'diagnose.md',                        // phase-spec diagnostician
];

function parseArgs() {
  const out = { runId: null, transcriptDir: null, since: null };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--run-id='))         out.runId = a.slice(9);
    else if (a.startsWith('--transcript-dir=')) out.transcriptDir = a.slice(17);
    else if (a.startsWith('--since='))     out.since = a.slice(8);
  }
  if (!out.runId) {
    process.stderr.write('[verify-no-self-read] --run-id requerido\n');
    process.exit(2);
  }
  return out;
}

function defaultTranscriptDir() {
  const home = os.homedir();
  const projects = path.join(home, '.claude', 'projects');
  if (!fs.existsSync(projects)) return null;
  // Slug que usa Claude Code: lowercase + cualquier no-alfanumérico → '-'
  // Ejemplo: 'D:\Repos\My Proj' → 'd--repos-my-proj'
  const cwd = process.cwd().toLowerCase().replace(/[^a-z0-9]/g, '-');
  const candidates = fs.readdirSync(projects);
  let exact = candidates.find(c => c.toLowerCase() === cwd);
  if (exact) return path.join(projects, exact);
  // Fallback: prefijo más largo común
  let best = null, bestLen = 0;
  for (const c of candidates) {
    const cl = c.toLowerCase();
    if (cwd.startsWith(cl) || cl.startsWith(cwd)) {
      const len = Math.min(cl.length, cwd.length);
      if (len > bestLen) { best = c; bestLen = len; }
    }
  }
  return best ? path.join(projects, best) : null;
}

function listJsonlSorted(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files;
}

function scanFile(jsonlPath, sinceMs) {
  const reads = []; // [{ file_path, ts }]
  let raw;
  try { raw = fs.readFileSync(jsonlPath, 'utf8'); } catch { return reads; }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    // Tolerancia a múltiples shapes de transcripción
    const tsStr = ev.timestamp || ev.created_at || ev.ts || null;
    const tsMs  = tsStr ? Date.parse(tsStr) : null;
    if (sinceMs && tsMs && tsMs < sinceMs) continue;
    const candidates = [];
    if (ev.tool_use) candidates.push(ev.tool_use);
    if (ev.tool_input && ev.tool_name) candidates.push({ name: ev.tool_name, input: ev.tool_input });
    if (ev.message?.content) {
      for (const c of (Array.isArray(ev.message.content) ? ev.message.content : [])) {
        if (c.type === 'tool_use') candidates.push({ name: c.name, input: c.input });
      }
    }
    for (const tu of candidates) {
      const name = tu.name || tu.tool_name;
      const input = tu.input || tu.tool_input || {};
      if (name !== 'Read') continue;
      const fp = input.file_path || input.path;
      if (typeof fp !== 'string') continue;
      reads.push({ file_path: fp, ts: tsStr });
    }
  }
  return reads;
}

function basenameNorm(p) {
  return p.replace(/\\/g, '/').split('/').pop();
}

function main() {
  const args = parseArgs();
  const tdir = args.transcriptDir || defaultTranscriptDir();
  const sinceMs = args.since ? Date.parse(args.since) : null;

  const files = listJsonlSorted(tdir);
  if (!files.length) {
    process.stdout.write(JSON.stringify({
      status: 'SKIPPED',
      reason: 'No JSONL transcripts found',
      transcript_dir: tdir
    }, null, 2) + '\n');
    process.exit(2);
  }

  // Solo el JSONL más reciente (la sesión actual). Si la sesión spans múltiples → ampliar con --since.
  const allReads = scanFile(files[0].path, sinceMs);

  const counts = {};
  for (const tracked of TRACKED_FILES) counts[tracked] = [];
  for (const r of allReads) {
    const bn = basenameNorm(r.file_path);
    if (TRACKED_FILES.includes(bn)) counts[bn].push(r);
  }

  const violations = [];
  for (const [file, reads] of Object.entries(counts)) {
    if (reads.length > 1) {
      violations.push({
        file,
        read_count: reads.length,
        estimated_overhead_tokens: reads.length === 2 ? '~1400-2100' : `~${(reads.length - 1) * 1700}`,
        first_read_ts: reads[0].ts,
        last_read_ts:  reads[reads.length - 1].ts
      });
    }
  }

  const report = {
    run_id: args.runId,
    transcript_file: files[0].path,
    tracked_files: TRACKED_FILES,
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.length])),
    violations,
    status: violations.length ? 'VIOLATION' : 'OK',
    checked_at: new Date().toISOString()
  };

  // Persistir reporte (no fatal si falla)
  try {
    const out = path.resolve(`docs/testing/atf-web/${args.runId}/anti_self_read_report.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  } catch { /* ignore */ }

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(violations.length ? 1 : 0);
}

main();
