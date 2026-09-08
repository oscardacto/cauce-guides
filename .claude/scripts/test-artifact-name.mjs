#!/usr/bin/env node
/**
 * test-artifact-name.mjs
 *
 * Smoke test para asdd-artifact-name.mjs
 * Ejecutar: node .claude/scripts/test-artifact-name.mjs
 *
 * Casos:
 *   (a) fixture válido (run_id, fase, artifact_seq=2) → devuelve {run_id}-{PHASE}-003-{slug}.md
 *       y deja artifact_seq=3
 *   (b) --phase explícito hace override de la fase inferida
 *   (c) json ausente → exit 1
 *   (d) status:complete → exit 1
 *   (e) slug faltante → exit 1
 *   (f) contrato Smart Data conserva semver dentro del slug
 */

import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'node:url';
import { deriveArtifactName } from './lib/asdd-artifact-name-lib.mjs';

// ---------------------------------------------------------------------------
// Utilidades de test
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    process.stdout.write(`  ✓ ${label}\n`);
    passed++;
  } else {
    process.stdout.write(`  ✗ ${label}${detail ? ' — ' + detail : ''}\n`);
    failed++;
  }
}

/** Crea un directorio temporal único para cada caso de test. */
function makeTmpDir() {
  const dir = join(tmpdir(), `asdd-test-${randomBytes(6).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Ejecuta el helper con el directorio de proyecto dado. */
function runHelper(projectDir, extraArgs = []) {
  const scriptPath = fileURLToPath(import.meta.url).replace('test-artifact-name.mjs', 'asdd-artifact-name.mjs');
  return spawnSync(
    process.execPath,
    [scriptPath, ...extraArgs],
    {
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      encoding: 'utf8',
    }
  );
}

/** Escribe un .asdd-run.json fixture en el directorio dado. */
function writeFixture(dir, overrides = {}) {
  const base = {
    run_id: '2026-06-18-001',
    feature: 'test feature',
    started_at: '2026-06-18T10:00:00Z',
    last_checkpoint: '2026-06-18T10:00:00Z',
    status: 'in_progress',
    artifact_seq: 2,
    phases: {
      design: { status: 'in_progress' },
    },
    context_summary: 'test',
    resume_hint: 'continuar',
  };
  const fixture = { ...base, ...overrides };
  writeFileSync(join(dir, '.asdd-run.json'), JSON.stringify(fixture, null, 2), 'utf8');
  return fixture;
}

// ---------------------------------------------------------------------------
// Caso (a): fixture válido → nombre correcto + artifact_seq incrementado
// ---------------------------------------------------------------------------
process.stdout.write('\nCaso (a): fixture válido, artifact_seq=2 → 003\n');
{
  const dir = makeTmpDir();
  writeFixture(dir, { artifact_seq: 2 });

  const result = runHelper(dir, ['--slug', 'mi-artefacto']);

  assert('exit code 0', result.status === 0, `exit=${result.status} stderr=${result.stderr}`);

  const name = deriveArtifactName({ run_id: '2026-06-18-001', status: 'in_progress', artifact_seq: 2 }, { phase: 'design', slug: 'mi-artefacto' }).name;
  assert('nombre = 2026-06-18-001-DESIGN-003-mi-artefacto.md', name === '2026-06-18-001-DESIGN-003-mi-artefacto.md', `got="${name}"`);

  const updated = JSON.parse(readFileSync(join(dir, '.asdd-run.json'), 'utf8'));
  assert('artifact_seq actualizado a 3', updated.artifact_seq === 3, `got=${updated.artifact_seq}`);

  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Caso (b): --phase explícito hace override
// ---------------------------------------------------------------------------
process.stdout.write('\nCaso (b): --phase explícito (build) override\n');
{
  const dir = makeTmpDir();
  writeFixture(dir, { artifact_seq: 5 });

  const result = runHelper(dir, ['--phase', 'build', '--slug', 'deploy-config']);

  assert('exit code 0', result.status === 0, `exit=${result.status} stderr=${result.stderr}`);

  const name = deriveArtifactName({ run_id: '2026-06-18-001', status: 'in_progress', artifact_seq: 5 }, { phase: 'build', slug: 'deploy-config' }).name;
  assert('nombre contiene BUILD', name === '2026-06-18-001-BUILD-006-deploy-config.md', `got="${name}"`);

  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Caso (c): json ausente → exit 1
// ---------------------------------------------------------------------------
process.stdout.write('\nCaso (c): .asdd-run.json ausente → exit 1\n');
{
  const dir = makeTmpDir();
  // NO escribir fixture

  const result = runHelper(dir, ['--slug', 'algo']);

  assert('exit code 1', result.status === 1, `exit=${result.status}`);

  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Caso (d): status:complete → exit 1
// ---------------------------------------------------------------------------
process.stdout.write('\nCaso (d): status:complete → exit 1\n');
{
  const dir = makeTmpDir();
  writeFixture(dir, { status: 'complete' });

  const result = runHelper(dir, ['--slug', 'algo']);

  assert('exit code 1', result.status === 1, `exit=${result.status}`);

  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Caso (e): slug faltante → exit 1
// ---------------------------------------------------------------------------
process.stdout.write('\nCaso (e): slug faltante → exit 1\n');
{
  const dir = makeTmpDir();
  writeFixture(dir);

  const result = runHelper(dir); // sin --slug

  assert('exit code 1', result.status === 1, `exit=${result.status}`);

  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Caso (f): semver de dominio dentro del slug
// ---------------------------------------------------------------------------
process.stdout.write('\nCaso (f): slug Smart Data con semver\n');
{
  const name = deriveArtifactName(
    { run_id: '2026-06-18-001', status: 'in_progress', artifact_seq: 6 },
    { phase: 'analyze', slug: 'smart-data-eng-contract-gold-acme-retail-2.3.1' },
  ).name;
  assert(
    'semver preservado en nombre universal',
    name === '2026-06-18-001-ANALYZE-007-smart-data-eng-contract-gold-acme-retail-2.3.1.md',
    `got="${name}"`,
  );
}

// ---------------------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------------------
process.stdout.write(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
