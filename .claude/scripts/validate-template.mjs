#!/usr/bin/env node
// validate-template.mjs — Cross-OS agentic config validator for ASDD template
// No external npm dependencies — uses Node stdlib only
// Exit code: 1 if any structural error; 0 if only warnings (unless --strict)

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeContextBudget } from './lib/asdd-context-budget-lib.mjs';
import { parseFrontmatter } from './lib/asdd-frontmatter-lib.mjs';
import { evaluateRunReconciliation } from './lib/asdd-run-reconciliation-lib.mjs';
import { normalizeForHash } from './lib/asdd-hash-normalize-lib.mjs';
import { hookEntryRef } from './lib/asdd-hook-entry-lib.mjs';

// CLI parsing
const ARGS = new Set(process.argv.slice(2));
const STRICT = ARGS.has('--strict');
const SILENT = ARGS.has('--silent');
const JSON_MODE = ARGS.has('--json');
const HELP = ARGS.has('--help') || ARGS.has('-h');

if (HELP) {
  const usage = [
    'Usage: node .claude/scripts/validate-template.mjs [flags]',
    '',
    'Flags:',
    '  --strict   Treat warnings as errors (exit 1 on any warn)',
    '  --silent   Only print errors (hide warns and ok checks)',
    '  --json     Emit findings as JSON array to stdout; human text goes to stderr',
    '  --help     Show this help',
    '',
    'Env:',
    '  ASDD_SKIP_VALIDATION=1   Skip all checks, exit 0',
    '',
  ].join(os.EOL);
  process.stdout.write(usage);
  process.exit(0);
}

if (process.env.ASDD_SKIP_VALIDATION === '1') {
  process.stdout.write(`[skip] ASDD_SKIP_VALIDATION=1 — validation bypassed${os.EOL}`);
  process.exit(0);
}

// Colors (disabled on CI / non-TTY)
const USE_COLOR = process.stdout.isTTY && !process.env.CI && !process.env.NO_COLOR;
const paint = (code) => (s) => (USE_COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = { red: paint(31), green: paint(32), yellow: paint(33), gray: paint(90), bold: paint(1) };

// Helpers
// ROOT se deriva de la ubicación de ESTE archivo, no de process.cwd(): el validador
// vive en .claude/scripts/, así que la raíz del proyecto está dos niveles arriba.
// Con process.cwd() una invocación desde un subdirectorio hacía fallar todos los
// exists() y muchos checks devolvían '(skipped)' con ok:true — verde sobre un árbol
// roto. Mismo patrón que asdd-run-bootstrap.mjs y asdd-resolve-workspace.mjs.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const p = (...segs) => path.join(ROOT, ...segs);
const exists = (f) => fs.existsSync(f);
// Normalizado cross-OS (CRLF→LF + strip BOM) — ver asdd-hash-normalize-lib.mjs.
// Aplica a TODOS los consumidores de read(): hashing SHA-256, JSON.parse y el
// parser de frontmatter. Ninguno de esos consumidores depende de line-endings
// crudos (lines() ya usa split(/\r?\n/), wordCount ya usa split(/\s+/u), y el
// frontmatter parser ya es CRLF-aware), así que normalizar acá no cambia su
// comportamiento — solo hace que el hashing sea determinista cross-OS.
const read = (f) => normalizeForHash(fs.readFileSync(f, 'utf8'));

// Remediación única para los 3 mismatch de SHA-256. Sin esto, personalizar una
// referencia de regla —algo que el template no prohíbe— produce un fallo sin salida
// documentada, y en la instalación (post_install con must_pass + on_fail: rollback)
// aborta la adopción sin decir qué hacer. El regenerador se distribuye, así que la
// instrucción es ejecutable tanto en el template como en un proyecto consumidor.
const HASH_REMEDIATION =
  'si el cambio en el archivo es intencional, regenerá los hashes con '
  + '`node .claude/scripts/asdd-regen-hashes.mjs` (en el repo template: `npm run hash:regen`). '
  + 'Nunca calcular el hash a mano con sha256sum/certutil/Get-FileHash: no normalizan EOL ni BOM y '
  + 'contaminan el manifiesto';
const lines = (s) => s.split(/\r?\n/);
const listDir = (d) => (exists(d) ? fs.readdirSync(d, { withFileTypes: true }) : []);

function walk(dir, filter = () => true) {
  const out = [];
  if (!exists(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (filter(full)) out.push(full);
    }
  }
  return out;
}

// Allowlist data-driven de skills/mcpServers provistos por dependencias
// externas condicionales (ej. Databricks AI Dev Kit), declaradas en
// .asdd/cli-contract.json → conditional_install[]. Estos paquetes NO
// se distribuyen con el template — están documentados explícitamente para
// que los checks de referencias no los reporten como rotos, sin debilitar
// la validación para ningún otro skill/mcpServer no declarado aquí.
function loadConditionalInstallAllowlist() {
  const allow = { skills: new Set(), mcpServers: new Set() };
  const f = p('.asdd/cli-contract.json');
  if (!exists(f)) return allow;
  try {
    const contract = JSON.parse(read(f));
    const entries = Array.isArray(contract.conditional_install) ? contract.conditional_install : [];
    for (const entry of entries) {
      for (const s of entry.provides_skills || []) allow.skills.add(s);
      for (const m of entry.provides_mcp_servers || []) allow.mcpServers.add(m);
    }
  } catch {
    // JSON inválido ya se reporta por el check 'cli-contract' — degradar a allowlist vacía
  }
  return allow;
}
const CONDITIONAL_INSTALL_ALLOWLIST = loadConditionalInstallAllowlist();

// Check registry
const checks = [];
const check = (name, level, fn) => checks.push({ name, level, fn });

// 1. YAML frontmatter válido (strict)
check('yaml-frontmatter', 'error', () => {
  const targets = [
    ...walk(p('.claude/agents'), (f) => f.endsWith('.md')),
    ...walk(p('.claude/skills'), (f) => f.endsWith('SKILL.md')),
    ...walk(p('.claude/commands'), (f) => f.endsWith('.md')),
  ];
  const details = [];

  for (const f of targets) {
    const parsed = parseFrontmatter(read(f));
    if (!parsed.ok) details.push(`${path.relative(ROOT, f)} — ${parsed.error}`);
  }
  return {
    ok: details.length === 0,
    message: `YAML frontmatter valid in ${targets.length} files`,
    details,
  };
});

// 2. Formato de skills (strict): cada skill en .claude/skills/{nombre}/SKILL.md
check('skills-structure', 'error', () => {
  const skillsDir = p('.claude/skills');
  if (!exists(skillsDir)) {
    return { ok: true, message: '.claude/skills not present (nothing to validate)' };
  }
  const details = [];
  // No .md files should be at the top level of .claude/skills
  for (const ent of listDir(skillsDir)) {
    const full = path.join(skillsDir, ent.name);
    if (ent.isFile() && ent.name.endsWith('.md')) {
      details.push(`skills/${ent.name} — must live in skills/{name}/SKILL.md`);
    } else if (ent.isDirectory()) {
      const skillFile = path.join(full, 'SKILL.md');
      if (!exists(skillFile)) {
        details.push(`skills/${ent.name}/ — missing SKILL.md`);
      }
    }
  }
  return {
    ok: details.length === 0,
    message: `skill directories follow {name}/SKILL.md convention`,
    details,
  };
});

// 3. Coherencia .asdd/asdd.lock (warn)
check('asdd-counts', 'warn', () => {
  const folder = p('.asdd');
  const f = p('.asdd/asdd.lock');
  if (!exists(folder)) {
    return { ok: false, message: '.asdd/ folder not present' };
  }
  if (!exists(f)) {
    return {
      ok: false,
      message: '.asdd/asdd.lock not present (expected inside .asdd/ folder)',
    };
  }
  let manifest;
  try {
    manifest = JSON.parse(read(f));
  } catch (e) {
    return { ok: false, message: `.asdd/asdd.lock is not valid JSON: ${e.message}` };
  }
  const claude = manifest?.variants?.claude;
  if (!claude) return { ok: true, message: '.asdd/asdd.lock has no variants.claude (skip)' };
  const fsCounts = {
    agents: walk(p('.claude/agents'), (fn) => fn.endsWith('.md')).length,
    skills: listDir(p('.claude/skills')).filter((e) => e.isDirectory()).length,
    rules: walk(p('.claude/rules'), (fn) => fn.endsWith('.md')).length,
    commands: walk(p('.claude/commands'), (fn) => fn.endsWith('.md')).length,
  };
  const details = [];
  for (const k of ['agents', 'skills', 'rules', 'commands']) {
    if (typeof claude[k] === 'number' && claude[k] !== fsCounts[k]) {
      details.push(`${k}: manifest=${claude[k]} vs filesystem=${fsCounts[k]}`);
    }
  }
  return {
    ok: details.length === 0,
    message: 'manifest counts match filesystem',
    details,
  };
});

// 4. Referencias cruzadas skills (strict)
//
// Cubre los TRES sitios donde un nombre de skill se convierte en una carga real, y solo
// esos: el `skills:` del frontmatter (eager), los marcadores `[SKILL: x]` de los
// phase-specs (carga en punto de uso) y el `capabilities[]` del manifiesto — este último
// en el check `conditional-capability-loading`.
//
// La resolución acá es EXACTA a propósito. `agent-skill-references` (check 15h) acepta
// resolución por sufijo porque mira prosa, donde un `hifi-builder` suelto es una
// referencia legible a un skill que existe. En un sitio de carga esa tolerancia es un
// falso OK: `asdd-load-capability.mjs` y `asdd-resolve-capability.mjs`
// exigen `^asdd-[a-z0-9-]+$` y no truncan, así que un alias que el validador
// bendecía por sufijo fallaba en runtime con `skill name must use asdd-* naming`.
// Ese desacuerdo entre validador y loader es lo que dejó 18 skills — los 6 dominios de
// `domain-expert` incluidos — invocables solo por un nombre que ningún camino canónico
// podía cargar (B6). El loader es la autoridad; este check habla su idioma.
check('skill-references', 'error', () => {
  // Los phase-specs son sitios de carga igual que los agentes: su frontmatter declara
  // skills eager y su cuerpo emite marcadores. Quedaban afuera del walk.
  const LOAD_SITE_DIRS = ['.claude/agents', '.claude/atf-web-steps', '.claude/ba-steps'];
  const MARKER_DIRS = [...LOAD_SITE_DIRS, '.claude/skills', '.claude/commands', '.claude/reference', '.claude/references'];
  const details = [];

  const resolves = (s) =>
    CONDITIONAL_INSTALL_ALLOWLIST.skills.has(s) || exists(p('.claude/skills', s, 'SKILL.md'));

  for (const dir of LOAD_SITE_DIRS) {
    for (const f of walk(p(dir), (fn) => fn.endsWith('.md'))) {
      const parsed = parseFrontmatter(read(f));
      if (!parsed.ok) continue; // already reported by check 1
      const skills = parsed.data.skills;
      if (!Array.isArray(skills)) continue;
      for (const s of skills) {
        if (resolves(s)) continue;
        details.push(
          `${path.relative(ROOT, f)} references skill "${s}" (not found at .claude/skills/${s}/SKILL.md)`,
        );
      }
    }
  }

  // Marcadores `[SKILL: x | args...]`. NO se saltean los code fences: la mayoría de los
  // marcadores viven dentro de un bloque de código con sus argumentos debajo, y son
  // sitios de carga reales, no ejemplos.
  const seen = new Set();
  for (const dir of MARKER_DIRS) {
    for (const f of walk(p(dir), (fn) => fn.endsWith('.md'))) {
      const rel = path.relative(ROOT, f);
      lines(read(f)).forEach((ln, i) => {
        for (const m of ln.matchAll(/\[SKILL:\s*([A-Za-z0-9._-]+)/g)) {
          const s = m[1];
          if (resolves(s)) continue;
          const key = `${rel}:${s}`;
          if (seen.has(key)) continue;
          seen.add(key);
          details.push(
            `${rel}:${i + 1} marcador [SKILL: ${s}] no resuelve — el loader exige el nombre canónico completo del directorio`,
          );
        }
      });
    }
  }

  return {
    ok: details.length === 0,
    message: `all skill references resolve`,
    details,
  };
});

// 5. Referencias MCPs (strict)
check('mcp-references', 'error', () => {
  const mcpFile = p('.mcp.json');
  let servers = new Set();
  if (exists(mcpFile)) {
    try {
      const json = JSON.parse(read(mcpFile));
      servers = new Set(Object.keys(json.mcpServers || {}));
    } catch (e) {
      return { ok: false, message: `.mcp.json invalid JSON: ${e.message}` };
    }
  }
  const agents = walk(p('.claude/agents'), (f) => f.endsWith('.md'));
  const details = [];
  for (const f of agents) {
    const parsed = parseFrontmatter(read(f));
    if (!parsed.ok) continue;
    const refs = parsed.data.mcpServers;
    if (!Array.isArray(refs)) continue;
    for (const name of refs) {
      if (CONDITIONAL_INSTALL_ALLOWLIST.mcpServers.has(name)) continue;
      if (!servers.has(name)) {
        details.push(
          `${path.relative(ROOT, f)} references mcpServer "${name}" (not defined in .mcp.json)`,
        );
      }
    }
  }
  return {
    ok: details.length === 0,
    message: `all mcpServers references resolve`,
    details,
  };
});

// 6. JSON válido (strict)
check('json-files', 'error', () => {
  const targets = [
    '.mcp.json',
    '.claude/settings.json',
    '.claude/settings.local.json',
    '.asdd/asdd.lock',
    '.asdd/cli-contract.json',
    '.asdd/checklist.json',
  ];
  const details = [];
  for (const rel of targets) {
    const f = p(rel);
    if (!exists(f)) continue;
    try {
      JSON.parse(read(f));
    } catch (e) {
      details.push(`${rel} — ${e.message}`);
    }
  }
  return {
    ok: details.length === 0,
    message: 'JSON config files parse correctly',
    details,
  };
});

// 7. Hooks ejecutables (strict en Unix; skip en Windows)
// Se lee el modo del ÍNDICE DE GIT, no el del working tree.
//
// La versión anterior usaba `fs.statSync().mode & 0o100` y se auto-salteaba en
// Windows, donde ese bit no significa nada. El efecto era que el check no podía
// fallar nunca en Windows: un hook agregado desde ahí entra al índice como 100644,
// nadie lo ve, y como este repo no tiene CI el problema aparecía recién en un
// checkout de Linux, donde el hook no arranca.
//
// El modo del índice (`git ls-files -s`) sí es legible y significativo en las tres
// plataformas: es el bit que git va a materializar en el checkout de cualquier SO.
// Verificarlo ahí hace el check cross-OS de verdad, sin skip.
check('hooks-executable', 'error', () => {
  let raw;
  try {
    raw = execSync('git ls-files -s -- .claude/hooks', {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // git ausente o directorio sin repo (un consumidor puede instalar ASDD fuera
    // de git). Se saltea diciendo POR QUÉ — nunca un ok mudo.
    return { ok: true, message: 'git no disponible o directorio sin repo — modo del índice no verificable (skip)' };
  }

  // Formato de `git ls-files -s`: "<mode> <object> <stage>\t<path>"
  const indexed = new Map();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [meta, relPath] = line.split('\t');
    if (!relPath) continue;
    indexed.set(relPath, meta.trim().split(/\s+/)[0]);
  }

  // Excluir .claude/hooks/_lib/ — subcarpeta reservada para módulos compartidos
  // (ES modules importados por los hooks), no son hooks ejecutables por sí mismos.
  const isHook = (rel) => rel.endsWith('.mjs') && !rel.startsWith('.claude/hooks/_lib/');
  const details = [];
  let checked = 0;

  for (const [rel, mode] of indexed) {
    if (!isHook(rel)) continue;
    checked += 1;
    if (mode !== '100755') {
      details.push(`${rel} — modo ${mode} en el índice de git, se esperaba 100755 (arreglo cross-OS: git update-index --chmod=+x ${rel} · en Linux/macOS también sirve chmod +x)`);
    }
  }

  // Un hook en disco pero sin trackear no tiene modo en el índice. No es un error
  // (todavía no se commiteó), pero se cuenta en el mensaje para que sea visible:
  // es el momento exacto en que un hook nuevo creado en Windows toma modo 100644.
  const onDisk = walk(p('.claude/hooks'), (f) => f.endsWith('.mjs') && !f.includes(`${path.sep}_lib${path.sep}`));
  const untracked = onDisk
    .map((f) => path.relative(ROOT, f).replaceAll('\\', '/'))
    .filter((rel) => !indexed.has(rel));

  const suffix = untracked.length > 0
    ? `; ${untracked.length} sin trackear aún (${untracked.slice(0, 3).join(', ')})`
    : '';

  return {
    ok: details.length === 0,
    message: `${checked} hook(s) con bit de ejecución en el índice de git${suffix}`,
    details,
  };
});

// 8. Rules ≤ 100 líneas (warn)
check('rules-size', 'warn', () => {
  let maxLines = 100;
  try {
    const lock = JSON.parse(read(p('.asdd/asdd.lock')));
    if (typeof lock?.validation?.rules_size_max === 'number') {
      maxLines = lock.validation.rules_size_max;
    }
  } catch { /* lock unreadable — use default */ }
  const rules = walk(p('.claude/rules'), (f) => f.endsWith('.md'));
  const details = [];
  for (const f of rules) {
    const n = lines(read(f)).length;
    if (n > maxLines) {
      details.push(`${path.relative(ROOT, f)} — ${n} lines (max ${maxLines})`);
    }
  }
  return {
    ok: details.length === 0,
    message: `${rules.length} rule file(s) within size budget`,
    details,
  };
});

// 9. Sin rutas hardcodeadas (strict) — solo archivos trackeados por git
check('no-hardcoded-paths', 'error', () => {
  const patterns = [/\/Users\//, /\/home\/[a-zA-Z0-9_-]+\//, /C:\\Users\\/];
  const details = [];

  // Directories excluded from the scan (same as the original filesystem scan).
  const excluded = new Set(['node_modules', '.git', 'docs', 'dist', 'build']);

  // Pragma de escape: el check no distingue prosa de código, así que un comentario
  // que cita una ruta de ejemplo daba violación. Castigar la documentación empuja a
  // no documentar, así que se permite marcar la línea (o la inmediatamente anterior)
  // con ALLOW_MARKER. Definido UNA vez y usado por las dos ramas — si solo lo tuviera
  // el fast-path, el comportamiento cambiaría según si hay git disponible.
  const ALLOW_MARKER = 'asdd-allow-abs-path';
  const scanContent = (rel, content) => {
    const ls = content.split(/\r?\n/);
    ls.forEach((ln, i) => {
      if (!patterns.some((re) => re.test(ln))) return;
      if (ln.includes(ALLOW_MARKER)) return;
      if (i > 0 && ls[i - 1].includes(ALLOW_MARKER)) return;
      details.push(`${rel}:${i + 1}`);
    });
  };

  // Obtain git-tracked files so gitignored files (e.g. settings.local.json)
  // with local absolute paths don't trigger false positives.
  let trackedFiles;
  try {
    const out = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
    trackedFiles = new Set(
      out.trim().split(/\r?\n/).filter((f) => {
        if (!/\.(md|mjs|json|ya?ml|js|ts)$/.test(f)) return false;
        // Skip files under excluded top-level directories
        const topDir = f.split('/')[0];
        return !excluded.has(topDir);
      })
    );
  } catch {
    trackedFiles = null; // not a git repo — fall back to full scan
  }

  if (trackedFiles !== null) {
    // Fast path: only check tracked files with relevant extensions
    for (const rel of trackedFiles) {
      const full = path.join(ROOT, rel);
      let content;
      try { content = read(full); } catch { continue; }
      scanContent(rel, content);
    }
  } else {
    // Fallback: filesystem scan (no git)
    const allowedDots = new Set(['.claude', '.mcp.json', '.asdd', '.gitlab-ci.yml', '.github']);

    function scan(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith('.') && !allowedDots.has(ent.name)) continue;
        const full = path.join(dir, ent.name);
        const rel = path.relative(ROOT, full);
        if (excluded.has(rel.split(path.sep)[0])) continue;
        if (ent.isDirectory()) { scan(full); continue; }
        if (!ent.isFile() || !/\.(md|mjs|json|ya?ml|js|ts)$/.test(ent.name)) continue;
        let content;
        try { content = read(full); } catch { continue; }
        scanContent(rel, content);
      }
    }
    scan(ROOT);
  }

  return {
    ok: details.length === 0,
    message: `no hardcoded absolute paths in tracked config files (escape hatch: mark the line or the one above with ${ALLOW_MARKER})`,
    details: details.slice(0, 20),
  };
});

// 10. CLAUDE.md ≤ 200 líneas (warn)
check('claude-md-size', 'warn', () => {
  const f = p('CLAUDE.md');
  if (!exists(f)) return { ok: true, message: 'CLAUDE.md not present (skip)' };
  const n = lines(read(f)).length;
  return {
    ok: n <= 200,
    message: `CLAUDE.md has ${n} lines (budget 200)`,
    details: n > 200 ? [`${n} lines > 200 (consider moving content to skills)`] : [],
  };
});

// 11. CLI contract v1.0 (strict)
check('cli-contract', 'error', () => {
  const f = p('.asdd/cli-contract.json');
  if (!exists(f)) {
    return { ok: false, message: '.asdd/cli-contract.json not present' };
  }
  let contract;
  try {
    contract = JSON.parse(read(f));
  } catch (e) {
    return { ok: false, message: `.asdd/cli-contract.json invalid JSON: ${e.message}` };
  }
  const details = [];
  if (!contract.contract_version || !/^\d+\.\d+\.\d+$/.test(contract.contract_version)) {
    details.push(`contract_version must be SemVer (got: ${contract.contract_version})`);
  }
  const requiredBlocks = ['template', 'compatibility', 'personalize', 'clean', 'create_dirs', 'post_install'];
  for (const block of requiredBlocks) {
    if (!(block in contract)) details.push(`missing required block: ${block}`);
  }
  if (Array.isArray(contract.personalize)) {
    contract.personalize.forEach((entry, idx) => {
      const requiredFields = ['id', 'file', 'json_path', 'type', 'required'];
      for (const fieldName of requiredFields) {
        if (!(fieldName in entry)) {
          details.push(`personalize[${idx}] missing field: ${fieldName}`);
        }
      }
    });
  } else {
    details.push('personalize must be an array');
  }
  details.push(
    ...validateTemplateVersionSync(contract?.template?.version),
    ...validateMinCliVersion(contract?.compatibility?.min_cli_version),
    ...validateMinCliVersionReview(contract?.compatibility?.min_cli_version_reviewed_at),
  );
  return {
    ok: details.length === 0,
    message: 'cli-contract.json is valid v1.0 contract',
    details,
  };
});

// validateTemplateVersionSync checks that every place declaring the template version agrees
// with `.asdd/asdd.lock`, which is the authoritative one — the CLI reads it to
// decide whether a project is out of date, and the changelog check below already treats it
// as the source of truth.
//
// It exists because the version is duplicated in four files and a release bumps them by
// hand. Nothing verified they agreed, and the two readers disagree silently when they
// drift: the CLI compares the consumer's lock against the remote lock to offer an upgrade,
// while the contract's own `template.version` is what gets recorded at install time. A
// mismatch means a project can install "3.5.1" and still be told it is on "3.5.0", or the
// reverse — an upgrade loop that never converges.
//
// Reported as details of the contract check rather than as a separate check because the
// contract is where the drift is introduced and where a maintainer looks to fix it.
function validateTemplateVersionSync(contractVersion) {
  const lockPath = p('.asdd/asdd.lock');
  if (!exists(lockPath)) {
    return ['.asdd/asdd.lock not present — cannot verify template.version sync'];
  }
  let lock;
  try {
    lock = JSON.parse(read(lockPath));
  } catch {
    // Invalid lock JSON is already reported by the json-files check; do not double-report.
    return [];
  }
  const authoritative = lock?.version;
  if (!authoritative || !/^\d+\.\d+\.\d+$/.test(String(authoritative))) {
    return [`asdd.lock version must be strict SemVer X.Y.Z (got: ${authoritative})`];
  }

  const details = [];
  if (!contractVersion) {
    details.push('cli-contract.json template.version is missing');
  } else if (String(contractVersion) !== String(authoritative)) {
    details.push(
      `template.version "${contractVersion}" != asdd.lock version "${authoritative}" ` +
        `(the lock is authoritative)`,
    );
  }

  // The claude variant carries its own copy, read when reporting per-variant state.
  const variantVersion = lock?.variants?.claude?.version;
  if (variantVersion && String(variantVersion) !== String(authoritative)) {
    details.push(
      `asdd.lock variants.claude.version "${variantVersion}" != version "${authoritative}"`,
    );
  }

  // package.json is the version a maintainer sees first and the easiest to forget.
  const pkgPath = p('package.json');
  if (exists(pkgPath)) {
    try {
      const pkg = JSON.parse(read(pkgPath));
      if (pkg?.version && String(pkg.version) !== String(authoritative)) {
        details.push(
          `package.json version "${pkg.version}" != asdd.lock version "${authoritative}"`,
        );
      }
    } catch {
      // Reported by json-files.
    }
  }
  return details;
}

// MAX_CLI_MAJOR pins the highest CLI major series that exists. The CLI is pre-1.0 and will
// be for the foreseeable future, so a floor of 1.x or above cannot be satisfied by any
// released binary. Raise this deliberately, in the same change that ships a CLI on the new
// major — never to make a failing validation pass.
const MAX_CLI_MAJOR = 0;

// validateMinCliVersion enforces the rules for compatibility.min_cli_version.
//
// This field is a hard gate on the CLI side: from CLI 0.9.6 on, a consumer whose CLI is below
// the floor does NOT get the structure applied. That makes a wrong value here far more
// expensive than a wrong value in any other contract field — it does not degrade an install,
// it blocks it, for everyone who pulls this branch.
//
// It went unvalidated until the gate was implemented, and in that time it drifted to "2.0.0",
// a floor no released CLI can satisfy. Had the gate shipped against that value, every consumer
// on this branch would have been blocked at once. These rules exist so that specific accident
// cannot happen again.
//
// The rules, and why each one:
//
//   - Present and strict `X.Y.Z`. A missing floor silently disables the gate; a loose value
//     ("0.9", "latest") is read by the CLI as "cannot compare" and also disables it. Both
//     fail open, which is safe for the consumer but means the protection is not there while
//     appearing to be.
//   - No channel suffix (`0.9.6-dev`). The CLI compares numeric cores and ignores suffixes
//     precisely so one floor binds on dev, qa and prod alike. A suffix here would suggest a
//     per-channel floor that does not exist.
//   - Major no greater than MAX_CLI_MAJOR. This is the rule that catches the "2.0.0" class
//     of error: a floor above every released CLI.
//
// What this cannot check offline is the tighter rule that matters most in practice: the floor
// must never exceed the CLI version already released on the channel this branch feeds
// (dev → dev, qa → qa, main → prod). Raising the floor before that CLI is published blocks
// every consumer of the branch. That ordering is a release-process rule, documented in
// ASDD-VERSIONING.md.
// validateMinCliVersionReview enforces that the CLI floor gets reviewed when the template
// gains functionality, and that the conclusion of that review is written down.
//
// Why a rule like this is needed at all. min_cli_version couples two independently versioned
// repositories, and nothing put a human in the loop: it sat at "2.0.0" across the 3.4.0 and
// 3.5.0 releases because no release step ever asked about it. The validator cannot verify the
// floor is CORRECT — it has no idea what the CLI supports. What it can do is make the
// omission impossible: force the question at the moments it matters and require the answer to
// be recorded.
//
// The mechanism is a review watermark. `min_cli_version_reviewed_at` is the template version
// in which the floor was last consciously reviewed, WHETHER OR NOT the value changed —
// re-affirming "0.9.6 is still right" is a valid review and must be recorded as one.
//
// The threshold is MINOR, not PATCH, and that is the whole design decision. Under SemVer a
// MINOR bump means new functionality, which is exactly when the template might start
// depending on a CLI capability that did not exist before; a PATCH cannot, by definition. So
// a minor or major bump requires the watermark to move to the new version, and a patch
// release does not pay a cost it cannot owe.
//
// What this rule does NOT do, stated so nobody mistakes it for more than it is: it cannot
// tell whether the declared floor actually matches what the CLI supports. That needs a
// cross-repo assertion — the CLI released on a channel must satisfy the floor on the branch
// feeding it — which requires both repositories in one job. Until that exists, this rule is
// the guardrail: it converts "nobody looked for three releases" into a blocking error.
function validateMinCliVersionReview(reviewedAt) {
  const lockPath = p('.asdd/asdd.lock');
  if (!exists(lockPath)) return [];
  let current;
  try {
    current = JSON.parse(read(lockPath))?.version;
  } catch {
    return []; // reported by json-files
  }
  if (!current || !/^\d+\.\d+\.\d+$/.test(String(current))) return []; // reported above

  if (reviewedAt === undefined || reviewedAt === null || String(reviewedAt).trim() === '') {
    return [
      'compatibility.min_cli_version_reviewed_at is required — it records the template version ' +
        'in which min_cli_version was last reviewed (set it to the current version and explain ' +
        'the decision in ASDD-CHANGELOG.md)',
    ];
  }
  const reviewed = String(reviewedAt).trim();
  if (!/^\d+\.\d+\.\d+$/.test(reviewed)) {
    return [
      `compatibility.min_cli_version_reviewed_at must be strict SemVer X.Y.Z (got: "${reviewed}")`,
    ];
  }

  const details = [];
  const cmp = compareSemver(reviewed, String(current));
  if (cmp > 0) {
    details.push(
      `compatibility.min_cli_version_reviewed_at "${reviewed}" is ahead of the current version ` +
        `"${current}" — a future release cannot have reviewed the floor`,
    );
    return details;
  }

  // The coherence rule: functionality was added since the last review.
  const [rMajor, rMinor] = reviewed.split('.').map(Number);
  const [cMajor, cMinor] = String(current).split('.').map(Number);
  if (cMajor > rMajor || (cMajor === rMajor && cMinor > rMinor)) {
    details.push(
      `min_cli_version was last reviewed at template ${reviewed}, but this release is ${current}: ` +
        `a MINOR/MAJOR bump adds functionality that may require a newer CLI. Review the floor — ` +
        `raise min_cli_version, or re-affirm the current value — then set ` +
        `min_cli_version_reviewed_at to "${current}" and record the decision in ASDD-CHANGELOG.md`,
    );
  }

  // The review has to be traceable to a release and its rationale readable where humans look.
  const changelogPath = p('ASDD-CHANGELOG.md');
  if (!exists(changelogPath)) return details;
  const section = changelogSection(read(changelogPath), reviewed);
  if (section === null) {
    details.push(
      `ASDD-CHANGELOG.md has no "## [${reviewed}]" section, so the min_cli_version review ` +
        `recorded for that version is not traceable`,
    );
  } else if (!section.includes('min_cli_version')) {
    details.push(
      `ASDD-CHANGELOG.md section [${reviewed}] does not mention min_cli_version — the review ` +
        `has to state what was decided and why, where a reader will find it`,
    );
  }
  return details;
}

// changelogSection returns the body of the "## [version]" section, or null when absent. The
// body ends at the next "## " heading so a mention in a later release cannot satisfy an
// earlier one.
function changelogSection(text, version) {
  const rows = lines(text);
  const escaped = version.replace(/\./g, '\\.');
  const startRe = new RegExp(`^##\\s*\\[${escaped}\\]`);
  let start = -1;
  for (let i = 0; i < rows.length; i++) {
    if (startRe.test(rows[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < rows.length; i++) {
    if (/^##\s/.test(rows[i])) break;
    body.push(rows[i]);
  }
  return body.join('\n');
}

// compareSemver returns -1, 0 or 1 comparing X.Y.Z triples numerically.
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

function validateMinCliVersion(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return ['compatibility.min_cli_version is required (the CLI gate reads it; absent means no gate)'];
  }
  const raw = String(value).trim();
  if (!/^\d+\.\d+\.\d+$/.test(raw)) {
    return [
      `compatibility.min_cli_version must be strict SemVer X.Y.Z with no prefix or channel suffix (got: "${raw}")`,
    ];
  }
  const major = Number(raw.split('.')[0]);
  if (major > MAX_CLI_MAJOR) {
    return [
      `compatibility.min_cli_version = "${raw}" requires CLI major ${major}, but no CLI above ` +
        `${MAX_CLI_MAJOR}.x exists — this floor would block every consumer of this branch`,
    ];
  }
  return [];
}

// `clean.files_to_remove` es la clave más destructiva del contrato: el CLI la aplica
// con `os.RemoveAll` INCONDICIONAL después del copy loop (internal/app/files_to_remove.go),
// sin comparar contenido ni hash. Y cumple dos funciones a la vez —excluir del destino y
// limpiar artefactos de instalaciones viejas, porque no existe `remove_on_upgrade`—, así
// que no se puede vaciar ni dejar crecer sin criterio.
//
// Este check existe porque la clave driftea de dos formas, y las dos ya pasaron:
//
//   1. COLISIÓN con `distribution`: la entrada copia y después borra, anulando en silencio
//      una decisión de distribución. Pasó con `ASDD-MEMORY.md` y `.claude/docs/migrations/`.
//   2. RUTA QUE EL CONSUMIDOR ESCRIBE: la entrada le destruye trabajo propio en cada
//      upgrade. Pasó con `.asdd-run.json` (checkpoint de corrida, ORC-007) y `docs/runs/`
//      (manifiestos que escribe el hook distribuido asdd-run-manifest.mjs).
//
// La detección de (2) se limita a los árboles EJECUTABLES distribuidos (`hooks/`,
// `scripts/`), que son los que escriben. La prosa se deja afuera a propósito: una guía que
// menciona una ruta no es evidencia de que algo escriba ahí, y meterla solo genera ruido.
check('clean-files-to-remove-safety', 'error', () => {
  const contractPath = p('.asdd/cli-contract.json');
  if (!exists(contractPath)) return { ok: true, message: 'cli-contract not present (skip)' };
  let contract;
  try { contract = JSON.parse(read(contractPath)); } catch {
    return { ok: true, message: 'cli-contract JSON invalid (reported by cli-contract)' };
  }
  const entries = Array.isArray(contract.clean?.files_to_remove)
    ? contract.clean.files_to_remove.map((e) => String(e?.path ?? '').replace(/^\.\//u, '')).filter(Boolean)
    : [];
  if (entries.length === 0) {
    return { ok: true, message: 'clean.files_to_remove vacío — nada que verificar' };
  }
  const distribution = Array.isArray(contract.distribution)
    ? contract.distribution.map((item) => String(item).replace(/^\.\//u, ''))
    : [];
  const covered = (target) => distribution.some((entry) =>
    entry === target || (entry.endsWith('/') && target.startsWith(entry))
  );

  const details = [];
  let collisions = 0;
  for (const target of entries) {
    if (covered(target)) {
      collisions += 1;
      details.push(
        `"${target}" está en distribution Y en clean.files_to_remove — el CLI lo copia y después lo borra, `
        + 'así que la entrada de distribución no tiene ningún efecto. Quitá una de las dos'
      );
    }
  }

  // Los dos árboles ejecutables que el CLI entrega. Dos exclusiones, las dos por la misma
  // razón —nombrar una ruta es su trabajo, no evidencia de que escriban en ella—:
  //   · el contrato se referencia a sí mismo con TODAS estas rutas;
  //   · `validate-template.mjs` es un verificador: nombra cada ruta que valida, y de hecho
  //     valida `.claude/evals/` y `ASDD-VERSIONING.md`. Sin esta exclusión el check reporta
  //     esas dos como si algún artefacto escribiera ahí, que es falso.
  const EXEC_TREES = ['.claude/hooks/', '.claude/scripts/'];
  const SCAN_EXCLUDE = new Set(['.claude/scripts/validate-template.mjs']);
  const TEXT_RE = /\.(mjs|cjs|js)$/;
  const sources = [];
  for (const entry of distribution) {
    if (!EXEC_TREES.some((t) => entry === t || entry.startsWith(t))) continue;
    const abs = p(entry);
    if (!exists(abs)) continue;
    if (entry.endsWith('/')) {
      for (const f of walk(abs, (fn) => TEXT_RE.test(fn))) sources.push(f);
    } else if (TEXT_RE.test(entry) && !SCAN_EXCLUDE.has(entry)) {
      sources.push(abs);
    }
  }

  const writers = new Map(); // ruta -> Set(archivos ejecutables que la nombran)
  for (const f of sources) {
    let content;
    try { content = read(f); } catch { continue; }
    for (const target of entries) {
      const needle = target.endsWith('/') ? target.slice(0, -1) : target;
      if (!content.includes(needle)) continue;
      if (!writers.has(target)) writers.set(target, new Set());
      writers.get(target).add(path.relative(ROOT, f).replaceAll('\\', '/'));
    }
  }
  for (const [target, refs] of [...writers].sort((a, b) => a[0].localeCompare(b[0]))) {
    const list = [...refs].sort().slice(0, 3).join(', ');
    const more = refs.size > 3 ? ` (+${refs.size - 3} más)` : '';
    details.push(
      `"${target}" lo nombra runtime distribuido (${list}${more}) — si un artefacto del consumidor `
      + 'escribe ahí, el os.RemoveAll del upgrade le destruye su propio contenido. Quitá la entrada '
      + 'o restringila a nombres de archivo exactos del mantenedor'
    );
  }

  return {
    ok: details.length === 0,
    message: `clean.files_to_remove: ${entries.length} entrada(s) verificada(s) contra ${sources.length} fuente(s) ejecutable(s) distribuida(s)`
      + ` — ${collisions} colisión(es) con distribution, ${writers.size} ruta(s) nombrada(s) por runtime distribuido`,
    details,
  };
});

// Runtime scripts referenced by distributed hooks/rules/agents must also be
// copied by the CLI. Repository-local tests are insufficient: a consumer can
// otherwise install valid hooks whose imports or documented commands are absent.
//
// El set requerido se DERIVA, no se declara. La versión anterior era una lista
// hardcodeada de 11 rutas, así que solo crecía si alguien se acordaba de editarla:
// se mantuvo verde mientras se agregaban 4 artefactos de runtime nuevos y un archivo
// de config, porque por construcción no puede detectar drift. Ahora se recorren los
// artefactos que `distribution` realmente entrega, se extraen las referencias a
// `.claude/scripts/**` y `.claude/hooks/**` que existen en disco, y se exige que cada
// una esté cubierta. Las 11 originales quedan como PISO, para que el check no pueda
// volverse más débil que antes si la derivación no encontrara nada.
//
// Solo se exigen rutas que EXISTEN en disco: una mención a una ruta inexistente es
// una referencia colgante — otro defecto, y no el que este check persigue.
check('cli-runtime-distribution', 'error', () => {
  const contractPath = p('.asdd/cli-contract.json');
  if (!exists(contractPath)) return { ok: true, message: 'cli-contract not present (skip)' };
  let contract;
  try { contract = JSON.parse(read(contractPath)); } catch {
    return { ok: true, message: 'cli-contract JSON invalid (reported by cli-contract)' };
  }
  const distribution = Array.isArray(contract.distribution)
    ? contract.distribution.map((item) => String(item).replace(/^\.\//u, ''))
    : [];

  // Piso histórico: dependencias de runtime confirmadas manualmente.
  const REQUIRED_FLOOR = [
    '.claude/ba-steps/',
    '.claude/references/',
    '.claude/scripts/lib/',
    '.claude/scripts/asdd-artifact-name.mjs',
    '.claude/scripts/asdd-commit-authorization.mjs',
    '.claude/scripts/asdd-load-capability.mjs',
    '.claude/scripts/asdd-plan-authorization.mjs',
    '.claude/scripts/asdd-resolve-capability.mjs',
    '.claude/scripts/asdd-resolve-rule.mjs',
    '.claude/scripts/asdd-route-request.mjs',
    '.claude/scripts/validate-template.mjs',
  ];

  // Exenciones EXPLÍCITAS: rutas referenciadas desde artefactos distribuidos que
  // deliberadamente NO se distribuyen. No se absorben en silencio — el mensaje del
  // check las lista siempre, porque los `details` solo se imprimen cuando falla.
  // Removerlas de este mapa es la acción que cierra la decisión pendiente.
  const DEFERRED = new Map([
    ['.claude/scripts/asdd-run-test-suites.mjs', 'runner de suites: tooling de mantenedor, decidido NO distribuir'],
    ['.claude/scripts/asdd-test-baseline.json', 'baseline de suites: tooling de mantenedor, decidido NO distribuir'],
    ['.claude/scripts/asdd-gen-provenance.mjs', 'generador de provenance: necesita la historia completa del repo, que un consumidor no tiene — decidido NO distribuir'],
  ]);

  // Categoría distinta de DEFERRED: la ruta aparece en un artefacto de runtime, pero
  // como CITA DE PROCEDENCIA de una decisión de diseño ("ver los tests R3b.* en …"),
  // no como comando que alguien deba ejecutar. No es una dependencia de runtime del
  // consumidor. Se mantiene aparte para no diluir la señal de F-2, y visible en el
  // mensaje: la alternativa correcta a futuro es reescribir la cita sin la ruta.
  const CITED_ONLY = new Map([
    ['.claude/scripts/test-git-guards-cwd.mjs', 'cita de procedencia en el rationale de git-safety, no instrucción ejecutable'],
  ]);

  const covered = (target) => distribution.some((entry) =>
    entry === target || (entry.endsWith('/') && target.startsWith(entry))
  );

  // SIN exclusiones de prosa, a propósito.
  //
  // Hubo una para `docs/testing/` y `ASDD-CHANGELOG.md` mientras esos documentos de
  // auditoría e historia se distribuían: citaban tooling de mantenedor por su ruta como
  // objeto de análisis, no como dependencia, y sin excluirlos el check emitía 9 hallazgos
  // que eran todos citas.
  //
  // Ambos salieron de `distribution`, así que la exclusión quedó obsoleta — y era
  // activamente dañina: `docs/testing/` sigue aportando las 6 semillas de config de ATF,
  // que SÍ hay que barrer y quedaban fuera por el prefijo. Si alguien vuelve a distribuir
  // prosa de auditoría, el check se inundará de nuevo: ese ruido es la señal correcta
  // ("estás distribuyendo documentos de auditoría"), no algo que haya que silenciar.
  const PROSE_PREFIXES = [];

  // Archivos de texto que el CLI entrega: sobre esos se buscan las referencias.
  const TEXT_RE = /\.(md|mjs|js|json|ya?ml)$/;
  const scanTargets = new Set();
  let proseSkipped = 0;
  const addTarget = (abs) => {
    const rel = path.relative(ROOT, abs).replaceAll('\\', '/');
    if (PROSE_PREFIXES.some((pre) => rel.startsWith(pre))) {
      proseSkipped += 1;
      return;
    }
    scanTargets.add(abs);
  };
  for (const entry of distribution) {
    const abs = p(entry);
    if (!exists(abs)) continue;
    if (entry.endsWith('/')) {
      for (const f of walk(abs, (fn) => TEXT_RE.test(fn))) addTarget(f);
    } else if (TEXT_RE.test(entry)) {
      addTarget(abs);
    }
  }

  // Se cubren los tres árboles ejecutables de `.claude/`. `tools/` entra aunque hoy
  // se distribuya como directorio completo: si esa entrada se estrechara, este check
  // es lo que detecta las referencias que quedaron colgando.
  // Extensiones ordenadas de más larga a más corta: la alternación de regex es
  // ordenada, así que `js` antes de `json` truncaría `x.json` a `x.js` —una ruta que
  // no existe— y la referencia desaparecería del barrido en silencio.
  const REF_RE = /(?:\.claude\/)(?:scripts|hooks|tools)\/[\w./-]*\.(?:json|mjs|cjs|js)/g;
  const derived = new Map(); // ruta -> Set(archivos que la referencian)
  for (const f of scanTargets) {
    let content;
    try { content = read(f); } catch { continue; }
    REF_RE.lastIndex = 0;
    let m;
    while ((m = REF_RE.exec(content)) !== null) {
      const ref = m[0];
      if (!exists(p(ref))) continue;
      if (!derived.has(ref)) derived.set(ref, new Set());
      derived.get(ref).add(path.relative(ROOT, f).replaceAll('\\', '/'));
    }
  }

  const details = [];
  for (const target of REQUIRED_FLOOR) {
    if (!covered(target)) {
      details.push(`.asdd/cli-contract.json — distribution omite la dependencia de runtime del piso "${target}"`);
    }
  }

  const deferredHits = [];
  const citedHits = [];
  for (const [ref, referrers] of [...derived].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (covered(ref)) continue;
    if (DEFERRED.has(ref)) {
      deferredHits.push(`${ref} (${DEFERRED.get(ref)})`);
      continue;
    }
    if (CITED_ONLY.has(ref)) {
      citedHits.push(ref);
      continue;
    }
    const from = [...referrers].slice(0, 2).join(', ');
    details.push(`.asdd/cli-contract.json — distribution omite "${ref}", referenciada desde ${from}`);
  }

  // Una exención que ya nadie referencia es basura acumulada: se avisa para que se
  // borre, sin hacer fallar la corrida.
  const staleExemptions = [...DEFERRED.keys(), ...CITED_ONLY.keys()]
    .filter((k) => !derived.has(k) || covered(k));

  const parts = [`${derived.size} ruta(s) de runtime referenciada(s) desde ${scanTargets.size} artefacto(s) distribuido(s)`];
  if (deferredHits.length > 0) parts.push(`${deferredHits.length} DIFERIDA(S) por decisión pendiente: ${deferredHits.join(' · ')}`);
  if (citedHits.length > 0) parts.push(`${citedHits.length} solo citada(s) como procedencia: ${citedHits.join(', ')}`);
  if (staleExemptions.length > 0) parts.push(`${staleExemptions.length} exención(es) obsoleta(s) para limpiar: ${staleExemptions.join(', ')}`);
  if (proseSkipped > 0) parts.push(`${proseSkipped} archivo(s) de prosa de auditoría fuera del barrido (${PROSE_PREFIXES.join(', ')})`);

  return {
    ok: details.length === 0,
    message: parts.join('; '),
    details,
  };
});

// 12. Markers integrity — every start has matching end (strict)
check('markers-integrity', 'error', () => {
  const markerRe = /<!--\s*asdd:([a-z0-9-]+):(start|end)\s*-->/g;
  const targets = [
    ...walk(p('.'), (f) => f.endsWith('.md') && !path.relative(ROOT, f).replaceAll('\\', '/').startsWith('docs/audit/')),
  ];
  const details = [];
  for (const f of targets) {
    let content;
    try { content = read(f); } catch { continue; }
    const found = { start: new Map(), end: new Map() };
    let m;
    while ((m = markerRe.exec(content)) !== null) {
      const [, id, kind] = m;
      found[kind].set(id, (found[kind].get(id) || 0) + 1);
    }
    const rel = path.relative(ROOT, f);
    for (const [id, startCount] of found.start) {
      const endCount = found.end.get(id) || 0;
      if (startCount !== endCount) {
        details.push(`${rel} — marker "${id}" has ${startCount} start(s) but ${endCount} end(s)`);
      }
    }
    for (const [id, endCount] of found.end) {
      if (!found.start.has(id)) {
        details.push(`${rel} — orphan end marker "${id}" (no matching start)`);
      }
    }
  }
  return {
    ok: details.length === 0,
    message: 'all asdd markers are balanced',
    details,
  };
});

// 13. Consistencia CHANGELOG ↔ asdd.lock (warn)
//    Verifica que la versión declarada en el lock tenga una sección
//    correspondiente en ASDD-CHANGELOG.md. Permissive: no compara
//    semánticamente ni valida que el bump sea correcto, solo existencia.
check('changelog-consistency', 'warn', () => {
  const lockPath = p('.asdd/asdd.lock');
  const changelogPath = p('ASDD-CHANGELOG.md');

  if (!exists(lockPath)) {
    return { ok: true, message: '.asdd/asdd.lock not present (skip)' };
  }

  let manifest;
  try {
    manifest = JSON.parse(read(lockPath));
  } catch {
    return { ok: true, message: 'lock JSON invalid (reported by json-files)' };
  }

  const currentVersion = manifest?.version;
  if (!currentVersion || !/^\d+\.\d+\.\d+/.test(currentVersion)) {
    return { ok: true, message: 'lock has no valid SemVer version (skip)' };
  }

  if (!exists(changelogPath)) {
    return {
      ok: false,
      message: `ASDD-CHANGELOG.md not found (recommended per ASDD-VERSIONING.md)`,
      details: [
        `lock.version declares "${currentVersion}" but ASDD-CHANGELOG.md does not exist`,
      ],
    };
  }

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^##\\s*\\[${escapeRegex(currentVersion)}\\]`, 'm');
  const changelog = read(changelogPath);

  if (!pattern.test(changelog)) {
    return {
      ok: false,
      message: `ASDD-CHANGELOG.md has no section matching lock.version`,
      details: [
        `lock.version = "${currentVersion}" but no "## [${currentVersion}]" section found in ASDD-CHANGELOG.md`,
      ],
    };
  }

  return { ok: true, message: `ASDD-CHANGELOG.md section [${currentVersion}] matches lock.version` };
});

// 14. Naming convention — template prefix + project prefix (strict)
check('naming-convention', 'error', () => {
  const lockPath = p('.asdd/asdd.lock');
  let manifest;
  try {
    manifest = exists(lockPath) ? JSON.parse(read(lockPath)) : null;
  } catch {
    return { ok: true, message: 'lock JSON invalid (reported by json-files)' };
  }

  const projectName = manifest?.project?.name;
  const templatePrefix = 'asdd-';

  let validPrefixes;
  if (!projectName) {
    validPrefixes = [templatePrefix];
  } else {
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(projectName)) {
      return {
        ok: false,
        message: `project.name "${projectName}" does not match /^[a-z][a-z0-9-]{1,30}$/`,
        details: [`fix .asdd/asdd.lock → project.name`],
      };
    }
    validPrefixes = [templatePrefix, `${projectName}-`];
  }

  const hasValidPrefix = (name) => validPrefixes.some((pref) => name.startsWith(pref));
  const details = [];

  for (const f of walk(p('.claude/agents'), (fn) => fn.endsWith('.md'))) {
    const name = path.basename(f, '.md');
    if (!hasValidPrefix(name)) {
      details.push(`agent "${name}" — expected prefix: ${validPrefixes.join(' or ')}`);
    }
  }

  for (const ent of listDir(p('.claude/skills'))) {
    if (ent.isDirectory() && !hasValidPrefix(ent.name)) {
      details.push(`skill "${ent.name}" — expected prefix: ${validPrefixes.join(' or ')}`);
    }
  }

  const commandsDir = p('.claude/commands');
  if (exists(commandsDir)) {
    for (const ent of listDir(commandsDir)) {
      if (!ent.isDirectory()) continue;
      const ns = ent.name;
      const validCommandNs = ns === 'asdd' || (projectName && ns === projectName);
      if (!validCommandNs) {
        const expected = projectName ? `"asdd" or "${projectName}"` : `"asdd"`;
        details.push(`command namespace "${ns}/" — expected: ${expected}`);
      }
    }
  }

  // Excluir .claude/hooks/_lib/ — módulos compartidos, no hooks (naming propio).
  for (const f of walk(p('.claude/hooks'), (fn) => fn.endsWith('.mjs') && !fn.includes(`${path.sep}_lib${path.sep}`))) {
    const name = path.basename(f, '.mjs');
    if (!hasValidPrefix(name)) {
      details.push(`hook "${name}" — expected prefix: ${validPrefixes.join(' or ')}`);
    }
  }

  for (const f of walk(p('.claude/rules'), (fn) => fn.endsWith('.md'))) {
    const name = path.basename(f, '.md');
    if (!hasValidPrefix(name)) {
      details.push(`rule "${name}" — expected prefix: ${validPrefixes.join(' or ')}`);
    }
  }

  return {
    ok: details.length === 0,
    message: `all artifacts follow naming convention (${validPrefixes.join(' or ')})`,
    details,
  };
});

// 15. Broken internal references in skills (warn)
check('broken-skill-references', 'warn', () => {
  const skillsDir = p('.claude/skills');
  if (!exists(skillsDir)) {
    return { ok: true, message: '.claude/skills not present (nothing to validate)' };
  }
  const refPattern = /\b(reference|templates|examples)\/([\w.-]+\.(?:md|json|yaml|yml|txt))/g;
  const details = [];
  for (const ent of listDir(skillsDir)) {
    if (!ent.isDirectory()) continue;
    const skillDir = path.join(skillsDir, ent.name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!exists(skillFile)) continue;
    const content = read(skillFile);
    let m;
    refPattern.lastIndex = 0;
    while ((m = refPattern.exec(content)) !== null) {
      const relRef = m[0];
      const absRef = path.join(skillDir, relRef);
      if (!exists(absRef) && !exists(absRef + '.template')) {
        details.push(`.claude/skills/${ent.name}/SKILL.md → "${relRef}" (not found)`);
      }
    }
  }
  return {
    ok: details.length === 0,
    message: 'all internal skill file references resolve',
    details,
  };
});

// 15b. Reference path integrity (error) — agents/commands citing reference/{domain}/X.md must exist
// Red de seguridad anti-orfandad: si un agente o command referencia por path un archivo bajo
// .claude/reference/ (2 niveles: dominio + archivo), el archivo destino debe existir. Atrapa el
// caso en que una regla se elimina o mueve sin actualizar sus lectores runtime (ADR-005 Enmienda 1).
// ALCANCE: lectores runtime en agents, commands y rules. NO escanea docs/, changelog ni ADRs;
// esas referencias suelen ser históricas/descriptivas por diseño.
check('reference-path-integrity', 'error', () => {
  // Matches domain references and on-demand rule references, with or without
  // the `.claude/` prefix.
  const refPattern = /(?:\.claude\/)?(reference|references)\/([\w-]+)\/([\w.-]+\.(?:md|json|yaml|yml|txt))/g;
  // Referencias directas a `.claude/rules/*.md` — un solo nivel, sin carpeta de dominio en
  // el medio, así que `refPattern` no las matchea. Sin esto, una regla que se borra o se
  // renombra sin actualizar su lector queda huérfana y ningún check lo atrapa (ver
  // `.claude/rules/asdd-spec-guard.md` en el historial).
  const rulesRefPattern = /\.claude\/rules\/([\w.-]+\.md)/g;

  const targets = [];
  const agentsDir = p('.claude/agents');
  if (exists(agentsDir)) {
    targets.push(...walk(agentsDir, (fn) => fn.endsWith('.md')));
  }
  const commandsDir = p('.claude/commands');
  if (exists(commandsDir)) {
    targets.push(...walk(commandsDir, (fn) => fn.endsWith('.md')));
  }
  const rulesDir = p('.claude/rules');
  if (exists(rulesDir)) {
    targets.push(...walk(rulesDir, (fn) => fn.endsWith('.md')));
  }
  // Los steps tambien apuntan a reference/: son el unico puntero a varios
  // archivos de dominio y quedaban fuera del escaneo.
  for (const stepsDir of ['.claude/atf-web-steps', '.claude/ba-steps']) {
    const dir = p(stepsDir);
    if (exists(dir)) targets.push(...walk(dir, (fn) => fn.endsWith('.md')));
  }

  const details = [];
  const seenPaths = new Set();
  for (const f of targets) {
    const content = read(f);
    let m;
    refPattern.lastIndex = 0;
    while ((m = refPattern.exec(content)) !== null) {
      const raw = m[0];
      const rel = raw.startsWith('.claude/') ? raw : `.claude/${raw}`;
      const abs = p(rel);
      if (exists(abs)) {
        seenPaths.add(rel);
        continue;
      }
      details.push(`${path.relative(ROOT, f)} → "${rel}" (not found)`);
    }
    rulesRefPattern.lastIndex = 0;
    while ((m = rulesRefPattern.exec(content)) !== null) {
      const rel = `.claude/rules/${m[1]}`;
      const abs = p(rel);
      if (exists(abs)) {
        seenPaths.add(rel);
        continue;
      }
      details.push(`${path.relative(ROOT, f)} → "${rel}" (not found)`);
    }
  }
  return {
    ok: details.length === 0,
    message: `all conditional reference paths in agents/commands/rules/steps resolve (${seenPaths.size} distinct paths checked)`,
    details,
  };
});

// 15b. Conditional rule loading contract (ADR-017/B5)
check('conditional-rule-loading', 'error', () => {
  const manifestPath = p('.asdd/rule-loading.json');
  if (!exists(manifestPath)) return { ok: true, message: 'rule-loading manifest not present (skipped)', details: [] };
  const details = [];
  let manifest;
  try { manifest = JSON.parse(read(manifestPath)); }
  catch (error) { return { ok: false, message: `rule-loading manifest invalid JSON: ${error.message}`, details: [] }; }
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    return { ok: false, message: 'rule-loading manifest must be schema v1 with entries', details: [] };
  }
  const names = new Set();
  const paths = new Set();
  const wordCount = (text) => String(text).trim().split(/\s+/u).filter(Boolean).length;
  const resolveSafe = (rel, label) => {
    if (typeof rel !== 'string' || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
      details.push(`${label}: unsafe project-relative path`);
      return null;
    }
    const abs = p(rel);
    if (!(abs === ROOT || abs.startsWith(`${ROOT}${path.sep}`))) {
      details.push(`${label}: path escapes project`);
      return null;
    }
    return abs;
  };
  for (const entry of manifest.entries) {
    if (!entry || !/^asdd-[a-z0-9-]+$/.test(entry.name ?? '')) {
      details.push('entry has invalid canonical name');
      continue;
    }
    if (names.has(entry.name)) details.push(`${entry.name}: duplicate name`);
    names.add(entry.name);
    if (typeof entry.trigger !== 'string' || entry.trigger.trim().length === 0) {
      details.push(`${entry.name}: trigger must be non-empty`);
    }
    if (!Array.isArray(entry.required_markers) || entry.required_markers.length === 0) {
      details.push(`${entry.name}: required_markers must be non-empty`);
    }
    const core = resolveSafe(entry.core, `${entry.name}.core`);
    const reference = resolveSafe(entry.reference, `${entry.name}.reference`);
    for (const rel of [entry.core, entry.reference]) {
      if (paths.has(rel)) details.push(`${entry.name}: duplicate path ${rel}`);
      paths.add(rel);
    }
    if (!core || !reference) continue;
    if (!exists(core)) { details.push(`${entry.name}: core missing (${entry.core})`); continue; }
    if (!exists(reference)) { details.push(`${entry.name}: reference missing (${entry.reference})`); continue; }
    const coreText = read(core);
    const referenceText = read(reference);
    const referenceHash = createHash('sha256').update(referenceText).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(entry.reference_sha256 ?? '') || entry.reference_sha256 !== referenceHash) {
      details.push(`${entry.name}: reference SHA-256 mismatch — ${HASH_REMEDIATION}`);
    }
    if (!coreText.includes(entry.reference) || !/le[ée]\s+\*\*COMPLETO\*\*/iu.test(coreText)) {
      details.push(`${entry.name}: core lacks explicit complete reader for ${entry.reference}`);
    }
    const invocation = `node .claude/scripts/asdd-resolve-rule.mjs ${entry.name}`;
    if (!coreText.includes(invocation)) {
      details.push(`${entry.name}: core lacks exact resolver invocation`);
    }
    if (wordCount(referenceText) <= wordCount(coreText)) {
      details.push(`${entry.name}: reference is not more detailed than core`);
    }
    for (const marker of entry.required_markers ?? []) {
      if (!coreText.includes(marker)) details.push(`${entry.name}: core missing marker ${marker}`);
      if (!referenceText.includes(marker)) details.push(`${entry.name}: reference missing marker ${marker}`);
    }
  }
  return {
    ok: details.length === 0,
    message: `${manifest.entries.length} compact rule core(s) have explicit, non-orphan readers`,
    details,
  };
});

// 15c. Lazy capability loading contract (ADR-017/B6)
check('conditional-capability-loading', 'error', () => {
  const manifestPath = p('.asdd/capability-loading.json');
  if (!exists(manifestPath)) return { ok: true, message: 'capability-loading manifest not present (skipped)', details: [] };
  const details = [];
  let manifest;
  try { manifest = JSON.parse(read(manifestPath)); }
  catch (error) { return { ok: false, message: `capability-loading manifest invalid JSON: ${error.message}`, details: [] }; }
  if (manifest.schema_version !== 1 || !manifest.agents || typeof manifest.agents !== 'object') {
    return { ok: false, message: 'capability-loading manifest must be schema v1 with agents', details: [] };
  }
  const globalPairs = new Set();
  for (const [agent, config] of Object.entries(manifest.agents)) {
    if (!/^asdd-[a-z0-9-]+$/u.test(agent)) {
      details.push(`${agent}: invalid canonical agent name`);
      continue;
    }
    const agentPath = p('.claude/agents', `${agent}.md`);
    if (!exists(agentPath)) { details.push(`${agent}: agent file missing`); continue; }
    const text = read(agentPath);
    const parsed = parseFrontmatter(text);
    if (!parsed.ok) continue;
    const eager = Array.isArray(parsed.data.skills) ? parsed.data.skills : [];
    const maxEager = Number(config.max_eager_skills);
    if (!Number.isInteger(maxEager) || maxEager < 0 || maxEager > 1) {
      details.push(`${agent}: max_eager_skills must be integer 0..1`);
    } else if (eager.length > maxEager) {
      details.push(`${agent}: ${eager.length} eager skills exceed manifest max ${maxEager}`);
    }
    const maxDependencies = Number(config.max_dependencies);
    if (!Number.isInteger(maxDependencies) || maxDependencies !== 1) {
      details.push(`${agent}: max_dependencies must be 1 for schema v1`);
    }
    // La capability solo se registra por la rama Bash de assertAuthorizedOperation:
    // un agente del manifiesto sin Bash no puede cargarla y el gate le rechaza todo
    // Write/Edit con capability-not-loaded.
    const declaredTools = Array.isArray(parsed.data.tools)
      ? parsed.data.tools
      : (Array.isArray(parsed.data['allowed-tools']) ? parsed.data['allowed-tools'] : []);
    if (!declaredTools.includes('Bash')) {
      details.push(`${agent}: agent in capability-loading manifest must declare Bash to load its capability`);
    }
    if (!Array.isArray(config.capabilities) || config.capabilities.length === 0) {
      details.push(`${agent}: capabilities must be non-empty`);
      continue;
    }
    if (!text.includes('## Carga bajo demanda de capacidades')
      || !text.includes('node .claude/scripts/asdd-load-capability.mjs')
      || !text.includes('`dependencies`')) {
      details.push(`${agent}: agent lacks explicit loader/dependency reader contract`);
    }
    const local = new Set();
    for (const capability of config.capabilities) {
      if (!/^asdd-[a-z0-9-]+$/u.test(capability)) {
        details.push(`${agent}: invalid capability ${capability}`);
        continue;
      }
      if (local.has(capability)) details.push(`${agent}: duplicate capability ${capability}`);
      local.add(capability);
      const pair = `${agent}:${capability}`;
      if (globalPairs.has(pair)) details.push(`${agent}: duplicate agent/capability pair ${capability}`);
      globalPairs.add(pair);
      if (!exists(p('.claude/skills', capability, 'SKILL.md'))) {
        details.push(`${agent}: capability missing .claude/skills/${capability}/SKILL.md`);
      }
    }
  }
  return {
    ok: details.length === 0,
    message: `${Object.keys(manifest.agents).length} agent capability catalog(s) have explicit non-orphan loaders`,
    details,
  };
});

// 15d. Thin coordinator + point-of-use phase-spec contract (ADR-017/B7)
check('thin-coordinator-loading', 'error', () => {
  const manifestPath = p('.asdd/coordinator-loading.json');
  if (!exists(manifestPath)) return { ok: true, message: 'coordinator-loading manifest not present (skipped)', details: [] };
  const details = [];
  let manifest;
  try { manifest = JSON.parse(read(manifestPath)); }
  catch (error) { return { ok: false, message: `coordinator-loading manifest invalid JSON: ${error.message}`, details: [] }; }
  if (manifest.schema_version !== 1 || !manifest.coordinators || typeof manifest.coordinators !== 'object') {
    return { ok: false, message: 'coordinator-loading manifest must be schema v1 with coordinators', details: [] };
  }
  const policyPath = p('.asdd/context-budget.json');
  const policy = exists(policyPath) ? JSON.parse(read(policyPath)) : {};
  const configured = new Set(policy.coordinators ?? []);
  const declared = new Set(Object.keys(manifest.coordinators));
  for (const name of configured) if (!declared.has(name)) details.push(`${name}: budget coordinator missing manifest entry`);
  for (const name of declared) if (!configured.has(name)) details.push(`${name}: manifest coordinator missing from context budget`);
  const routePaths = new Set();
  const wordCount = (text) => String(text).trim().split(/\s+/u).filter(Boolean).length;
  const safePath = (rel, label) => {
    if (typeof rel !== 'string' || path.isAbsolute(rel) || rel.split(/[\\/]/u).includes('..')) {
      details.push(`${label}: unsafe project-relative path`);
      return null;
    }
    const absolute = p(rel);
    if (!(absolute === ROOT || absolute.startsWith(`${ROOT}${path.sep}`))) {
      details.push(`${label}: path escapes project`);
      return null;
    }
    return absolute;
  };
  for (const [name, config] of Object.entries(manifest.coordinators)) {
    const core = safePath(config.core, `${name}.core`);
    const rollback = safePath(config.rollback_source, `${name}.rollback_source`);
    if (!core || !rollback || !exists(core) || !exists(rollback)) {
      details.push(`${name}: core or rollback source missing`);
      continue;
    }
    const coreText = read(core);
    const rollbackText = read(rollback);
    const parsed = parseFrontmatter(coreText);
    const max = Number(config.max_core_words);
    if (!Number.isInteger(max) || max <= 0 || max > 2_500 || wordCount(coreText) > max) {
      details.push(`${name}: core ${wordCount(coreText)} words exceeds valid max ${config.max_core_words}`);
    }
    if (!parsed.ok || !Array.isArray(parsed.data.tools) || parsed.data.tools.includes('all')) {
      details.push(`${name}: tools must be an explicit allowlist without all`);
    } else if (JSON.stringify(parsed.data.tools) !== JSON.stringify(config.tools)) {
      details.push(`${name}: frontmatter tools differ from manifest allowlist`);
    }
    if (!coreText.includes('leé **COMPLETO**')) details.push(`${name}: core lacks complete-read contract`);
    for (const marker of config.required_core_markers ?? []) {
      if (!coreText.includes(marker)) details.push(`${name}: core missing marker ${marker}`);
    }
    if (wordCount(rollbackText) <= wordCount(coreText)) details.push(`${name}: rollback source is not more detailed than core`);
    const rollbackHash = createHash('sha256').update(rollbackText).digest('hex');
    if (rollbackHash !== config.rollback_sha256) details.push(`${name}: rollback SHA-256 mismatch — ${HASH_REMEDIATION}`);
    if (!Array.isArray(config.routes) || config.routes.length === 0) {
      details.push(`${name}: routes must be non-empty`);
      continue;
    }
    const routeNames = new Set();
    for (const route of config.routes) {
      if (!/^[a-z0-9-]+$/u.test(route.name ?? '') || routeNames.has(route.name)) {
        details.push(`${name}: invalid or duplicate route ${route.name}`);
      }
      routeNames.add(route.name);
      const routePath = safePath(route.path, `${name}.${route.name}`);
      if (!routePath || !exists(routePath)) { details.push(`${name}.${route.name}: phase spec missing`); continue; }
      if (routePaths.has(route.path)) details.push(`${name}.${route.name}: duplicate phase path ${route.path}`);
      routePaths.add(route.path);
      if (!coreText.includes(route.path)) details.push(`${name}.${route.name}: core lacks explicit route path`);
      const routeText = read(routePath);
      const routeParsed = parseFrontmatter(routeText);
      if (!routeParsed.ok) details.push(`${name}.${route.name}: invalid phase-spec frontmatter (${routeParsed.error})`);
      const routeHash = createHash('sha256').update(routeText).digest('hex');
      if (routeHash !== route.sha256) details.push(`${name}.${route.name}: SHA-256 mismatch — ${HASH_REMEDIATION}`);
      if (!Array.isArray(route.required_markers) || route.required_markers.length === 0) {
        details.push(`${name}.${route.name}: required_markers must be non-empty`);
      }
      for (const marker of route.required_markers ?? []) {
        if (!routeText.includes(marker)) details.push(`${name}.${route.name}: missing marker ${marker}`);
      }
    }
  }
  return {
    ok: details.length === 0,
    message: `${declared.size} thin coordinator(s) have bounded tools and ${routePaths.size} non-orphan phase route(s)`,
    details,
  };
});

// 16. model_strategy en asdd.lock (error)
check('model-strategy', 'error', () => {
  // Valida el bloque model_strategy en asdd.lock si está presente
  // Si no está presente, el check pasa (es opcional para backwards compat)
  const lockFile = p('.asdd/asdd.lock');
  if (!exists(lockFile)) return { ok: true, details: [] };

  let lock;
  try { lock = JSON.parse(read(lockFile)); } catch { return { ok: true, details: [] }; }

  const ms = lock.model_strategy;
  if (!ms) return { ok: true, details: [] }; // opcional — backwards compat

  const VALID_MODELS = new Set(['haiku', 'sonnet', 'opus']);
  const BLOCKED_HAIKU = new Set(['design', 'verify']); // fases donde haiku está prohibido
  const KNOWN_PHASES = new Set(['specify', 'analyze', 'design', 'build', 'verify', 'document']);

  const details = [];

  if (ms.orchestrator_default !== 'sonnet') {
    details.push('model_strategy.orchestrator_default: debe ser sonnet');
  }

  // Validar phase_default
  if (ms.phase_default) {
    for (const [phase, model] of Object.entries(ms.phase_default)) {
      if (!KNOWN_PHASES.has(phase)) {
        details.push(`model_strategy.phase_default: fase desconocida "${phase}". Valores válidos: ${[...KNOWN_PHASES].join(', ')}`);
      }
      if (!VALID_MODELS.has(model)) {
        details.push(`model_strategy.phase_default.${phase}: modelo inválido "${model}". Valores válidos: haiku, sonnet, opus`);
      }
      if (BLOCKED_HAIKU.has(phase) && model === 'haiku') {
        details.push(`model_strategy.phase_default.${phase}: "haiku" no está permitido en la fase "${phase}" — riesgo de razonamiento insuficiente en decisiones críticas`);
      }
    }
  }

  // Validar agent_pinning — keys deben coincidir con agentes existentes
  if (ms.agent_pinning && typeof ms.agent_pinning === 'object') {
    const agentFiles = new Set(
      listDir(p('.claude/agents'))
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => e.name.replace('.md', ''))
    );
    for (const [agent, model] of Object.entries(ms.agent_pinning)) {
      if (!agentFiles.has(agent)) {
        details.push(`model_strategy.agent_pinning: agente "${agent}" no existe en .claude/agents/`);
      }
      if (!VALID_MODELS.has(model)) {
        details.push(`model_strategy.agent_pinning.${agent}: modelo inválido "${model}". Valores válidos: haiku, sonnet, opus`);
      }
    }
  }

  // Validar skill_override — keys deben tener formato "{agente}.{skill}"
  if (ms.skill_override && typeof ms.skill_override === 'object') {
    for (const [key, model] of Object.entries(ms.skill_override)) {
      if (!key.includes('.')) {
        details.push(`model_strategy.skill_override: key "${key}" debe tener formato "{agente}.{skill}"`);
      }
      if (!VALID_MODELS.has(model)) {
        details.push(`model_strategy.skill_override.${key}: modelo inválido "${model}". Valores válidos: haiku, sonnet, opus`);
      }
    }
  }

  return { ok: details.length === 0, message: 'model_strategy configuration is valid', details };
});

// 17. routing config en asdd.lock (error)
check('routing-config', 'error', () => {
  const lockFile = p('.asdd/asdd.lock');
  if (!exists(lockFile)) return { ok: true, details: [], message: 'asdd.lock not found — skipped' };

  let lock;
  try { lock = JSON.parse(read(lockFile)); } catch { return { ok: true, details: [], message: 'lock parse error — skipped' }; }

  const routing = lock.routing;
  if (!routing) return { ok: true, details: [], message: 'routing not configured — skipped (optional)' };

  const VALID_MODES = new Set(['adaptive', 'always_full']);
  const details = [];

  if (!VALID_MODES.has(routing.mode)) {
    details.push(`routing.mode: valor inválido "${routing.mode}". Valores válidos: adaptive, always_full`);
  }

  if (typeof routing.always_full !== 'boolean') {
    details.push(`routing.always_full: debe ser boolean (true o false)`);
  }

  if (routing.mode === 'adaptive') {
    if (!exists(p('.claude/rules/asdd-routing-heuristics.md'))) {
      details.push(`routing.mode es "adaptive" pero no existe .claude/rules/asdd-routing-heuristics.md — requerido`);
    }
    if (!Array.isArray(routing.hard_exclusions) || routing.hard_exclusions.length === 0) {
      details.push(`routing.hard_exclusions: debe ser un array no vacío cuando mode es "adaptive"`);
    }
    const expectedDepths = ['TRIVIAL', 'LIGHT', 'MEDIUM', 'FULL'];
    if (JSON.stringify(routing.depths) !== JSON.stringify(expectedDepths)) {
      details.push(`routing.depths: debe declarar ${expectedDepths.join('/')}`);
    }
    if (typeof routing.confidence_threshold !== 'number' || routing.confidence_threshold <= 0 || routing.confidence_threshold >= 1) {
      details.push('routing.confidence_threshold: debe ser número entre 0 y 1');
    }
    if (!Number.isInteger(routing.policy_version) || routing.policy_version < 1) {
      details.push('routing.policy_version: debe ser entero >= 1');
    }
  }

  return {
    ok: details.length === 0,
    details,
    message: details.length === 0 ? 'routing configuration is valid' : undefined
  };
});

// 17a. Runtime budgets for model/fan-out/turns/retries (ADR-019/B8)
check('subagent-budget', 'error', () => {
  const policyPath = p('.asdd/subagent-budget.json');
  const lockPath = p('.asdd/asdd.lock');
  const settingsPath = p('.claude/settings.json');
  if (!exists(policyPath)) return { ok: false, details: ['subagent-budget.json is required'] };
  const details = [];
  let policy, lock, settings;
  try { policy = JSON.parse(read(policyPath)); lock = JSON.parse(read(lockPath)); settings = JSON.parse(read(settingsPath)); }
  catch (error) { return { ok: false, details: [`budget configuration invalid JSON: ${error.message}`] }; }
  if (policy.schema_version !== 1 || policy.enforcement !== 'blocking') details.push('budget policy must be schema v1 with blocking enforcement');
  if (settings.model !== policy.model_ids?.sonnet) details.push('settings model must equal the configured Sonnet orchestrator default');
  if (lock.routing?.subagent_budget_ref !== '.asdd/subagent-budget.json') details.push('routing must reference subagent-budget.json');
  if (JSON.stringify(policy.precedence) !== JSON.stringify(['skill_override', 'agent_pinning', 'phase_default', 'agent_frontmatter'])) details.push('model precedence differs from ADR-019');
  if (policy.high_risk?.required_route !== 'FULL' || policy.high_risk?.required_model !== 'opus' || policy.high_risk?.escalate_before_tools !== true) details.push('high-risk must require FULL/Opus before tools');
  if (policy.launch_marker !== '[ASDD-BUDGET route={route} phase={phase} model={model} max_turns={max_turns} retries={retries}]') details.push('launch marker differs from runtime contract');
  const gateText = read(p('.claude/hooks/asdd-plan-gate.mjs'));
  if (!gateText.includes('consumeBudgetedLaunchAuthorization')) details.push('plan gate does not enforce budgeted launch binding');
  const expected = {
    TRIVIAL: [0, 0, null, 0], LIGHT: [1, 1, [10, 20], 1],
    MEDIUM: [2, 2, [20, 35], 1], FULL: [3, 3, [30, 50], 1],
  };
  for (const [route, [agents, concurrent, turns, retries]] of Object.entries(expected)) {
    const value = policy.routes?.[route];
    if (!value || value.max_agents !== agents || value.max_concurrent !== concurrent || value.max_retries !== retries) details.push(`${route}: fan-out/retry budget mismatch`);
    const actualTurns = value?.turns ? [value.turns.min, value.turns.max] : null;
    if (JSON.stringify(actualTurns) !== JSON.stringify(turns)) details.push(`${route}: turn budget mismatch`);
  }
  const forbidden = new Set(policy.telemetry?.forbidden_fields ?? []);
  for (const key of ['prompt', 'output', 'command', 'tool_input']) if (!forbidden.has(key)) details.push(`telemetry must forbid ${key}`);
  for (const entry of listDir(p('.claude/agents')).filter((item) => item.isFile() && item.name.endsWith('.md'))) {
    const parsed = parseFrontmatter(read(p('.claude/agents', entry.name)));
    const turns = Number(parsed.data.maxTurns);
    if (!Number.isInteger(turns) || turns < 1 || turns > 50) details.push(`${entry.name}: maxTurns must be within absolute 1..50 cap`);
  }
  return { ok: details.length === 0, message: 'Sonnet default and TRIVIAL/LIGHT/MEDIUM/FULL budgets are blocking', details };
});

// 17b. budget estático de contexto (error)
check('context-budget', 'error', () => {
  const policyPath = p('.asdd/context-budget.json');
  if (!exists(policyPath)) return { ok: false, details: ['.asdd/context-budget.json — política requerida'] };
  let policy;
  try { policy = JSON.parse(read(policyPath)); } catch (error) { return { ok: false, details: [`context-budget.json — JSON inválido: ${error.message}`] }; }
  if (policy.schema_version !== 2) return { ok: false, details: ['context-budget.json — schema_version debe ser 2'] };
  let report;
  try { report = analyzeContextBudget(ROOT, policy); } catch (error) {
    return { ok: false, details: [`context-budget.json — ${error.message}`] };
  }
  const errors = report.violations.filter((item) => item.status === 'error');
  const excepted = report.violations.filter((item) => item.status === 'excepted');
  return {
    ok: errors.length === 0,
    message: errors.length === 0 ? `${report.summary.measured} payloads medidos por capas; ${excepted.length} excepción(es) vigente(s)` : undefined,
    details: errors.map((item) => item.kind === 'integrity'
      ? `${item.id} — ${item.reason} (${item.path})`
      : `${item.id} — ${item.value} > ${item.limit} palabras (+${item.over_by})`),
  };
});

// 17b.1. Targets confirmados de ADR-017 durante migración (warning)
// 18b. Presupuesto de las descripciones always-on (warning) — piso de contexto
//
// El runtime inyecta nombre + descripcion de cada skill, agent y command en el
// system prompt de toda sesion, para que el modelo pueda elegir sin leer el
// cuerpo. Es el rubro mas caro del piso always-on y hasta esta version no lo
// medía nadie: la descripcion solo tiene que DISCRIMINAR, el detalle vive en el
// cuerpo del artefacto. Los limites por tipo salen de
// `.asdd/context-budget.json → targets.*_description_chars`; el total
// contra `always_on_words` lo mide `.claude/tools/measure-context-footprint.mjs`.
check('skill-description-budget', 'error', () => {
  let targets;
  try { targets = JSON.parse(read(p('.asdd/context-budget.json')))?.targets; }
  catch { /* sin presupuesto declarado */ }
  if (!targets) return { ok: true, message: 'context-budget.json ausente o inválido (skipped)', details: [] };

  const surfaces = [
    { key: 'skill_description_chars', label: 'skill', files: exists(p('.claude/skills'))
      ? listDir(p('.claude/skills')).filter((e) => e.isDirectory())
          .map((e) => ({ name: e.name, file: p('.claude/skills', e.name, 'SKILL.md') }))
      : [] },
    { key: 'agent_description_chars', label: 'agent', files: exists(p('.claude/agents'))
      ? walk(p('.claude/agents'), (fn) => fn.endsWith('.md'))
          .map((file) => ({ name: path.basename(file, '.md'), file }))
      : [] },
    { key: 'command_description_chars', label: 'command', files: exists(p('.claude/commands'))
      ? walk(p('.claude/commands'), (fn) => fn.endsWith('.md'))
          .map((file) => ({ name: path.basename(file, '.md'), file }))
      : [] },
  ];

  const details = [];
  const summary = [];
  for (const surface of surfaces) {
    const target = targets[surface.key];
    if (!target || typeof target.limit !== 'number') continue;
    let measured = 0;
    let total = 0;
    for (const entry of surface.files) {
      if (!exists(entry.file)) continue;
      const parsed = parseFrontmatter(read(entry.file));
      if (!parsed.ok || typeof parsed.data.description !== 'string') continue;
      const length = parsed.data.description.length;
      measured += 1;
      total += length;
      if (length > target.limit) details.push(`${surface.label} ${entry.name}: ${length} chars > ${target.limit}`);
    }
    if (measured) summary.push(`${surface.label} ${measured} (prom. ${Math.round(total / measured)}/${target.limit})`);
  }

  return {
    ok: details.length === 0,
    message: summary.length ? `descripciones always-on — ${summary.join(' · ')}` : 'sin targets de descripcion declarados',
    details,
  };
});

check('context-budget-targets', 'warn', () => {
  const policyPath = p('.asdd/context-budget.json');
  if (!exists(policyPath)) return { ok: true, message: 'policy missing; reported by context-budget' };
  try {
    const report = analyzeContextBudget(ROOT, JSON.parse(read(policyPath)));
    const warnings = report.violations.filter((item) => item.status === 'warning');
    return {
      ok: warnings.length === 0,
      message: warnings.length === 0
        ? 'ADR-017 transition targets satisfied'
        : `${warnings.length} deuda(s) visible(s) en etapa warning`,
      details: warnings.map((item) => `${item.id} — ${item.value} > ${item.limit} (+${item.over_by})`),
    };
  } catch {
    return { ok: true, message: 'invalid policy; reported by context-budget' };
  }
});

// 17c. Estado ASDD reconciliado con INDEX y Git (error)
check('asdd-run-reconciliation', 'error', () => {
  const state = p('.asdd-run.json');
  if (!exists(state)) {
    const report = evaluateRunReconciliation(ROOT, null);
    return { ok: true, message: `${report.reason} — skipped` };
  }
  try {
    const run = JSON.parse(read(state));
    const report = evaluateRunReconciliation(ROOT, run, { require_provenance: true });
    const details = [...report.errors, ...report.drift];
    if (details.length) return { ok: false, message: 'run/INDEX reconciliation failed', details };
    if (report.outcome === 'skipped') {
      return { ok: true, message: `run ${run.run_id}: ${report.reason} — skipped` };
    }
    return {
      ok: true,
      message: `run ${run.run_id} reconciled with ${report.index_terminal.length} terminal slice(s)`,
    };
  } catch (error) {
    return { ok: false, details: [`reconciliation error: ${error.message}`] };
  }
});

// 18. settings.local.json no debe estar trackeado en git (error)
//     Guard preventivo: settings.local.json es configuración local por
//     convención (gitignored). Si aparece trackeado, un release lo
//     distribuiría con permisos/paths del ambiente de un developer
//     (el error histórico del commit 7cd7db6 no debe repetirse).
check('settings-local-not-tracked', 'error', () => {
  const rel = '.claude/settings.local.json';
  let tracked;
  try {
    tracked = execSync(`git ls-files -- "${rel}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // git no disponible o no es un repo — nada que validar
    return { ok: true, message: 'git not available or not a repo (skipped)' };
  }
  if (tracked) {
    return {
      ok: false,
      message: `${rel} is TRACKED in git — must be local-only`,
      details: [
        `${rel} — remove from the index: git rm --cached ${rel} (file stays on disk) and verify .gitignore covers it`,
      ],
    };
  }
  return { ok: true, message: `${rel} is not tracked in git` };
});

// 19. Artifact naming convention — sequential suffix {NNN} or run-traceable prefix (warn)
//     Verifica que los artefactos de documentación en docs/ sigan uno de los
//     dos patrones válidos definidos en naming-convention.md §3.7:
//       - Legado:   {tipo}-{feature}-{NNN}.md  (sufijo -NNN, tres dígitos)
//       - Run-trazable: {YYYY-MM-DD-NNN}-{PHASE}-{SEQ}-{slug}.md
//     Ambos son válidos. Los artefactos existentes no se renombran (D6).
//     Solo aplica si docs/ existe (proyectos consumidores); en el template se omite.
check('artifact-naming-convention', 'warn', () => {
  const docsDir = p('docs');
  if (!exists(docsDir)) {
    return { ok: true, message: 'docs/ not present (skip — template environment)' };
  }
  const details = [];
  // Patrón legado: termina en -NNN (tres dígitos)
  const hasLegacySuffix = (name) => /\-\d{3}$/.test(name);
  // Patrón run-trazable: empieza con YYYY-MM-DD-NNN-PHASE-SEQ-slug
  const hasRunPrefix = (name) => /^\d{4}-\d{2}-\d{2}-\d{3}-[A-Z]+-\d{3}-.+/.test(name);
  // Un nombre es válido si cumple cualquiera de los dos patrones
  const isValidArtifactName = (name) => hasLegacySuffix(name) || hasRunPrefix(name);
  const errorMsg = 'naming inválido: usar sufijo legado -NNN o prefijo run {run_id}-{PHASE}-{SEQ}-{slug}. Ver naming-convention.md §3.7';

  // docs/specs/: all .md except brief-* must follow a valid pattern
  const specsDir = p('docs', 'specs');
  if (exists(specsDir)) {
    for (const f of walk(specsDir, (fn) => fn.endsWith('.md'))) {
      const name = path.basename(f, '.md');
      if (!/^brief-/.test(name) && !isValidArtifactName(name)) {
        details.push(`${path.relative(ROOT, f)} — ${errorMsg}`);
      }
    }
  }

  // docs/testing/: report-* and tdd-evidence-* must follow a valid pattern
  const testingDir = p('docs', 'testing');
  if (exists(testingDir)) {
    for (const f of walk(testingDir, (fn) => fn.endsWith('.md'))) {
      const name = path.basename(f, '.md');
      if (/^(report-|tdd-evidence-)/.test(name) && !isValidArtifactName(name)) {
        details.push(`${path.relative(ROOT, f)} — ${errorMsg}`);
      }
    }
  }

  // docs/security/: review-* must follow a valid pattern
  const securityDir = p('docs', 'security');
  if (exists(securityDir)) {
    for (const f of walk(securityDir, (fn) => fn.endsWith('.md'))) {
      const name = path.basename(f, '.md');
      if (/^review-/.test(name) && !isValidArtifactName(name)) {
        details.push(`${path.relative(ROOT, f)} — ${errorMsg}`);
      }
    }
  }

  // docs/qa/: tdd-audit-* must follow a valid pattern
  const qaDir = p('docs', 'qa');
  if (exists(qaDir)) {
    for (const f of walk(qaDir, (fn) => fn.endsWith('.md'))) {
      const name = path.basename(f, '.md');
      if (/^tdd-audit-/.test(name) && !isValidArtifactName(name)) {
        details.push(`${path.relative(ROOT, f)} — ${errorMsg}`);
      }
    }
  }

  return {
    ok: details.length === 0,
    message: details.length === 0
      ? 'doc artifacts follow naming convention (§3.7 — legado -NNN o run-trazable prefix)'
      : `${details.length} doc artifact(s) con naming inválido`,
    details,
  };
});

// 20. Run manifest naming (error)
//     Verifica que docs/runs/ tenga manifests con naming correcto y que el
//     run activo (.asdd-run.json) tenga su manifest sincronizado.
//     Skip si docs/runs/ no existe (backwards-compatible, igual que check 19
//     salta cuando docs/ no existe).
check('run-manifest-naming', 'error', () => {
  const runsDir = p('docs', 'runs');
  if (!exists(runsDir)) {
    return { ok: true, message: 'docs/runs/ not present (skip — no manifests generated yet)' };
  }

  const details = [];
  // Regex para run_id válido: YYYY-MM-DD-NNN
  const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{3}$/;
  // Manifest también cumple el contrato universal; SEQ 000 queda reservado.
  const MANIFEST_NAME_RE = /^(\d{4}-\d{2}-\d{2}-\d{3})-([A-Z]+)-000-run-manifest\.md$/;
  const LEGACY_MANIFEST_NAME_RE = /^(\d{4}-\d{2}-\d{2}-\d{3})-manifest\.md$/;
  // Regex para artefacto de run: {run_id}-{PHASE}-{SEQ}-{slug}.md
  // Excepciones: ADR-*, y paths que comiencen con docs/testing/atf/ o docs/qa/atf/
  const ARTIFACT_RE = /^\d{4}-\d{2}-\d{2}-\d{3}-[A-Z]+-\d{3}-.+\.md$/;

  // 1. Naming de cada archivo en docs/runs/
  const manifestFiles = walk(runsDir, (f) => f.endsWith('.md'));
  for (const f of manifestFiles) {
    const base = path.basename(f);
    if (!MANIFEST_NAME_RE.test(base) && !LEGACY_MANIFEST_NAME_RE.test(base)) {
      details.push(
        `docs/runs/${base} — nombre inválido. Formato esperado: {run_id}-{PHASE}-000-run-manifest.md`,
      );
    }
  }

  // 2. Si .asdd-run.json existe: su run_id debe tener manifest en docs/runs/
  const runFile = p('.asdd-run.json');
  if (exists(runFile)) {
    let run;
    try {
      run = JSON.parse(read(runFile));
    } catch {
      run = null;
    }
    if (run && typeof run.run_id === 'string' && RUN_ID_RE.test(run.run_id)) {
      const manifestRel = typeof run.manifest_path === 'string' ? run.manifest_path : null;
      const candidates = manifestRel
        ? [manifestRel]
        : [`docs/runs/${run.run_id}-SPECIFY-000-run-manifest.md`, `docs/runs/${run.run_id}-manifest.md`];
      if (!candidates.some((candidate) => exists(p(...candidate.split('/'))))) {
        details.push(
          `${candidates[0]} — falta (run activo sin manifest sincronizado). ` +
          `El hook asdd-run-manifest.mjs lo genera en SessionStart.`,
        );
      }
    }
  }

  // 3. Naming de artefactos referenciados en manifests
  //    Leemos cada manifest y buscamos líneas con rutas de artefactos (backtick paths).
  //    Excluimos: ADR-*, docs/testing/atf/*, docs/qa/atf/*, y artefactos efímeros.
  const EXCEPTIONS_RE = /ADR-|docs\/testing\/atf\/|docs\/qa\/atf\//;
  for (const f of manifestFiles) {
    const base = path.basename(f);
    const m = MANIFEST_NAME_RE.exec(base) ?? LEGACY_MANIFEST_NAME_RE.exec(base);
    if (!m) continue; // nombre inválido ya reportado arriba
    const runId = m[1];
    const content = read(f);
    // Extraer rutas en backticks: `some/path/to/file.md`
    const artRe = /`([^`]+\.md)`/g;
    let match;
    while ((match = artRe.exec(content)) !== null) {
      const artPath = match[1];
      // Saltar excepciones
      if (EXCEPTIONS_RE.test(artPath)) continue;
      const artBase = artPath.split('/').pop() ?? artPath;
      // Solo validar si el basename parece ser un artefacto de run (empieza con el run_id)
      if (!artBase.startsWith(runId + '-')) continue;
      if (!ARTIFACT_RE.test(artBase)) {
        details.push(
          `docs/runs/${base} → artefacto \`${artBase}\` — ` +
          `no cumple patrón {run_id}-{PHASE}-{SEQ}-{slug}.md. Ver naming-convention.md §3.7`,
        );
      }
    }
  }

  return {
    ok: details.length === 0,
    message:
      details.length === 0
        ? 'run manifests naming and sync OK'
        : `${details.length} run manifest issue(s)`,
    details,
  };
});

// 22. Hooks registrados en settings.json (error)
//     Cruza .claude/hooks/*.mjs contra los `command` del bloque "hooks" de
//     settings.json. Falla si un hook en disco no está registrado (hook muerto,
//     p.ej. #3596 analyze-guard) o si una ruta registrada no existe en disco.
check('hooks-registration', 'error', () => {
  const hooksDir = p('.claude/hooks');
  const settingsFile = p('.claude/settings.json');
  if (!exists(settingsFile)) return { ok: true, message: 'settings.json not present (skipped)' };
  if (!exists(hooksDir)) return { ok: true, message: '.claude/hooks not present (skipped)' };
  let settings;
  try {
    settings = JSON.parse(read(settingsFile));
  } catch (e) {
    return { ok: false, message: `settings.json invalid JSON: ${e.message}` };
  }

  const registered = new Set();
  const registeredRefs = [];
  const groups = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
  for (const event of Object.keys(groups)) {
    const matchers = Array.isArray(groups[event]) ? groups[event] : [];
    for (const matcher of matchers) {
      const hs = matcher && Array.isArray(matcher.hooks) ? matcher.hooks : [];
      for (const h of hs) {
        // Acepta forma shell (`command` con la ruta embebida) y forma exec
        // (`command: "node"` + la ruta en `args`), ver
        // lib/asdd-hook-entry-lib.mjs.
        const ref = hookEntryRef(h);
        if (ref) {
          const m = ref.match(/\.claude\/hooks\/([\w.-]+\.mjs)/);
          if (m) {
            registered.add(m[1]);
            registeredRefs.push({ event, file: m[1] });
          }
        }
      }
    }
  }

  // ADR-018: production dispatchers register one process and import guard
  // modules explicitly. Imported hook modules are live even though they are
  // intentionally absent as separate settings commands.
  for (const entry of [...registered]) {
    const entryPath = path.join(hooksDir, entry);
    if (!exists(entryPath)) continue;
    const importRe = /from\s+["']\.\/(asdd-[\w.-]+\.mjs)["']/g;
    let match;
    const source = read(entryPath);
    while ((match = importRe.exec(source)) !== null) registered.add(match[1]);
  }

  const details = [];
  // (a) cada ruta registrada debe existir en disco
  for (const { event, file } of registeredRefs) {
    if (!exists(path.join(hooksDir, file))) {
      details.push(`settings.json [${event}] → .claude/hooks/${file} — registered but missing on disk`);
    }
  }
  // (b) cada hook en disco debe estar registrado
  // Excluir .claude/hooks/_lib/ — módulos compartidos importados por los hooks, no hooks.
  const onDisk = walk(hooksDir, (f) => f.endsWith('.mjs') && !f.includes(`${path.sep}_lib${path.sep}`)).map((f) => path.basename(f));
  for (const file of onDisk) {
    if (!registered.has(file)) {
      details.push(
        `.claude/hooks/${file} — on disk but NOT registered in settings.json "hooks" (dead hook). Register it or remove the file if obsolete.`,
      );
    }
  }
  return {
    ok: details.length === 0,
    message: `${onDisk.length} hook(s) cross-checked against settings.json`,
    details,
  };
});

// 23. Integridad de referencias a agentes/skills (error)
//     Valida que las invocaciones de agentes/skills y los identificadores
//     asdd-* citados en commands/rules/agents/skills resuelvan a un
//     artefacto instalado. Excluye .claude/evals (fixtures congelados, deuda
//     aparte). Atrapa la clase de #3596/#3597/#3610: agentes/skills fantasma e
//     identidades deprecadas (qa-engineer / ux-ui / asdd-expert) que quedaron
//     colgando tras una poda incompleta.
check('agent-skill-references', 'error', () => {
  const agentSet = new Set(
    listDir(p('.claude/agents'))
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name.replace(/\.md$/, '')),
  );
  const skillSet = new Set(listDir(p('.claude/skills')).filter((e) => e.isDirectory()).map((e) => e.name));

  // Resolución por prefijo y por sufijo (los skills se nombran {agente}-{skill}).
  const isAgent = (n) =>
    agentSet.has(n) || agentSet.has(`asdd-${n}`) || [...agentSet].some((a) => a.endsWith(`-${n}`));
  const skillResolves = (n) =>
    skillSet.has(n) ||
    skillSet.has(`asdd-${n}`) ||
    [...skillSet].some((s) => s.endsWith(`-${n}`)) ||
    CONDITIONAL_INSTALL_ALLOWLIST.skills.has(n);

  // Identidades deprecadas tras podas incompletas (qa-engineer/ux-ui/asdd-expert,
  // en forma bare, con prefijo asdd-, o con sufijo de skill). El lookbehind
  // evita falsos positivos por substring (p.ej. asdd-atf-api-qa-engineer es válido).
  const depRe =
    /(?<![a-z0-9-])(?:asdd-)?(?:qa-engineer|ux-ui|asdd-expert)(?:-[a-z0-9-]+)?(?![a-z0-9-])/g;

  const targets = [
    ...walk(p('.claude/commands'), (f) => f.endsWith('.md')),
    ...walk(p('.claude/rules'), (f) => f.endsWith('.md')),
    ...walk(p('.claude/agents'), (f) => f.endsWith('.md')),
    ...walk(p('.claude/skills'), (f) => f.endsWith('SKILL.md')),
  ];

  const details = [];
  const seen = new Set();
  const push = (rel, lineNo, tok, kind) => {
    const key = `${rel}:${lineNo}:${tok}`;
    if (seen.has(key)) return;
    seen.add(key);
    details.push(`${rel}:${lineNo} — ${kind}: \`${tok}\``);
  };

  const isDeprecated = (s) =>
    /^(?:asdd-)?(?:qa-engineer|ux-ui|asdd-expert)(?:-[a-z0-9-]+)?$/.test(s);

  for (const f of targets) {
    const rel = path.relative(ROOT, f);
    const isCmdOrRule = /[\\/]\.claude[\\/](?:commands|rules)[\\/]/.test(f);
    const ls = lines(read(f));
    let inFence = false;
    ls.forEach((ln, i) => {
      if (/^\s*```/.test(ln)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;
      const lineNo = i + 1;
      let m;
      // (a) Identidades deprecadas (qa-engineer/ux-ui/asdd-expert) — en TODA la
      //     config de producción. Cubre el purge de #3610 (verificable cross-dir).
      depRe.lastIndex = 0;
      while ((m = depRe.exec(ln)) !== null) {
        push(rel, lineNo, m[0], 'identidad deprecada');
      }
      // (b) Invocaciones de agente/skill que no resuelven — solo en commands/rules
      //     (superficie accionable de invocación, AC2).
      if (!isCmdOrRule) return;
      const agentRe = /(?:invocar|consultar|invoca|consulta|agente|sub-?agente|directo a)\s+`@?([a-z][a-z0-9-]*)`/gi;
      while ((m = agentRe.exec(ln)) !== null) {
        const n = m[1];
        if (isDeprecated(n)) continue;
        if (!isAgent(n) && !skillResolves(n)) push(rel, lineNo, n, 'agente invocado inexistente');
      }
      const skillRe = /\bskills?\s+`@?([a-z][a-z0-9-]*)`/gi;
      while ((m = skillRe.exec(ln)) !== null) {
        const n = m[1];
        if (isDeprecated(n)) continue;
        if (!skillResolves(n)) push(rel, lineNo, n, 'skill inexistente');
      }
    });
  }
  return {
    ok: details.length === 0,
    message:
      details.length === 0
        ? 'all agent/skill references resolve to installed artifacts'
        : `${details.length} broken agent/skill reference(s)`,
    details,
  };
});

// Agentes con capacidad de escritura NO deben fijar permissionMode restrictivo.
// El gate de aprobación es del orquestador (ORC-010-A) y de la prosa/skills,
// no del permission mechanic. Un agente con Write o Edit en tools[] y
// permissionMode: plan (u otro modo restrictivo) crea un candado mecánico
// redundante que hace inoperable al agente para su rol de escritura.
// Referencia: ADR-003 §Amendment 2 — 2026-07-02.
check('agent-permission-mode', 'error', () => {
  const agentsDir = p('.claude/agents');
  if (!fs.existsSync(agentsDir)) {
    return { ok: true, message: '.claude/agents/ not present (skip)' };
  }
  const RESTRICTIVE_MODES = new Set(['plan', 'readonly', 'ask']);
  const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit']);
  const targets = walk(agentsDir, (f) => f.endsWith('.md'));
  const details = [];
  for (const f of targets) {
    const parsed = parseFrontmatter(read(f));
    if (!parsed.ok) continue; // ya lo captura yaml-frontmatter
    const fm = parsed.data;
    const mode = fm.permissionMode;
    if (!mode || !RESTRICTIVE_MODES.has(String(mode).toLowerCase())) continue;
    const toolsField = fm.tools;
    if (!Array.isArray(toolsField)) continue;
    const writeTools = toolsField.filter((t) => WRITE_TOOLS.has(String(t)));
    if (writeTools.length > 0) {
      const rel = path.relative(ROOT, f);
      details.push(
        `${rel} — agente con capacidad de escritura (tools: ${writeTools.join(', ')}) no debe fijar permissionMode: ${mode} — el gate de aprobación es del orquestador (ORC-010-A) y de la prosa/skills, no del permission mechanic`
      );
    }
  }
  return {
    ok: details.length === 0,
    message:
      details.length === 0
        ? `no agent with Write/Edit tools declares restrictive permissionMode (${targets.length} agents checked)`
        : `${details.length} agent(s) with write capability and restrictive permissionMode`,
    details,
  };
});

// 23a-bis. Contrato agente↔skill: `allowed-tools` filtra, nunca amplía.
//
// El campo `allowed-tools` de un SKILL.md es un subconjunto de los `tools` de su
// agente dueño, no una concesión: un skill que declara una tool que su agente no
// tiene queda inejecutable en ese paso. Estaba pasando en el árbol sin que nada
// lo detectara (`tech-lead-new-bug` declaraba Write sin Write ni Bash en el
// agente, así que no podía escribir su reporte por ninguna vía). Este check
// vuelve verificable un contrato que hasta ahora era una suposición.
check('skill-tools-subset-of-agent', 'warn', () => {
  const agentsDir = p('.claude/agents');
  const skillsDir = p('.claude/skills');
  if (!fs.existsSync(agentsDir) || !fs.existsSync(skillsDir)) {
    return { ok: true, message: 'agents/ o skills/ ausente (skip)' };
  }

  // Mapa agente → set de tools declaradas.
  const agentTools = new Map();
  for (const f of walk(agentsDir, (x) => x.endsWith('.md'))) {
    const parsed = parseFrontmatter(read(f));
    if (!parsed.ok) continue;
    const nombre = String(parsed.data.name || path.basename(f, '.md'));
    const tools = Array.isArray(parsed.data.tools) ? parsed.data.tools.map(String) : null;
    if (tools) agentTools.set(nombre, new Set(tools));
  }

  const details = [];
  let revisados = 0;
  for (const dir of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const skillFile = path.join(skillsDir, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const parsed = parseFrontmatter(read(skillFile));
    if (!parsed.ok) continue;
    const allowed = parsed.data['allowed-tools'];
    if (!Array.isArray(allowed)) continue; // el campo es opcional

    // El dueño se deduce del naming `asdd-{rol}-{skill}`: se busca el
    // agente cuyo nombre sea el prefijo más largo del nombre del skill.
    let dueño = null;
    for (const nombre of agentTools.keys()) {
      if (dir.name.startsWith(`${nombre}-`) && (!dueño || nombre.length > dueño.length)) dueño = nombre;
    }
    if (!dueño) continue; // skills compartidos o sin agente deducible

    revisados += 1;
    const disponibles = agentTools.get(dueño);
    const faltantes = allowed
      .map(String)
      // Las tools MCP no se otorgan por `tools:` sino por `mcpServers:` del
      // agente, así que no participan de esta comparación.
      .filter((t) => !t.startsWith('mcp__'))
      .filter((t) => !disponibles.has(t));
    if (faltantes.length) {
      details.push(
        `${dir.name} — declara ${faltantes.join(', ')} en allowed-tools y su agente ${dueño} no las tiene en tools`
      );
    }
  }

  return {
    ok: details.length === 0,
    message:
      details.length === 0
        ? `allowed-tools ⊆ tools del agente dueño en los ${revisados} skills con dueño deducible`
        : `${details.length} skill(s) declaran tools que su agente no puede otorgar`,
    details,
  };
});

// 23a-ter. Los comandos que una regla declara obligatorios deben estar en el
// allow-list de permisos.
//
// `asdd-git-safety` exige ejecutar su resolver antes de cualquier
// operación git que cambie estado. Ese comando no estaba permitido, así que el
// primer paso mandatorio del protocolo costaba una confirmación al usuario en
// cada ciclo. Una regla que obliga a correr algo y una capa de permisos que lo
// interrumpe son una contradicción detectable.
check('mandated-commands-allowlisted', 'error', () => {
  const settingsFile = p('.claude/settings.json');
  if (!fs.existsSync(settingsFile)) return { ok: true, message: 'settings.json ausente (skip)' };

  let settings;
  try {
    settings = JSON.parse(read(settingsFile));
  } catch {
    return { ok: true, message: 'settings.json inválido (lo reporta otro check)' };
  }
  const allow = (settings.permissions?.allow || []).map(String);

  // Comandos que las reglas núcleo declaran obligatorios antes de operar.
  const mandados = [
    'node .claude/scripts/asdd-resolve-rule.mjs',
    'node .claude/scripts/asdd-artifact-name.mjs',
    'node .claude/scripts/asdd-load-capability.mjs',
  ];

  const details = [];
  for (const cmd of mandados) {
    const cubierto = allow.some((entry) => {
      const m = /^Bash\((.*)\)$/.exec(entry);
      if (!m) return false;
      const patron = m[1].replace(/:\*$/, '').trim();
      return cmd.startsWith(patron) || patron.startsWith(cmd);
    });
    if (!cubierto) details.push(`${cmd} — declarado obligatorio por una regla y ausente de permissions.allow`);
  }

  return {
    ok: details.length === 0,
    message:
      details.length === 0
        ? `los ${mandados.length} comandos mandatorios de reglas están en el allow-list`
        : `${details.length} comando(s) mandatorio(s) sin entrada en el allow-list`,
    details,
  };
});

// 23b. Worktree opt-in contract (ADR-010)
check('worktree-opt-in-contract', 'error', () => {
  const developerAgents = [
    p('.claude/agents/asdd-developer-frontend.md'),
    p('.claude/agents/asdd-developer-backend.md'),
  ];
  const details = [];

  for (const file of developerAgents) {
    if (!exists(file)) continue;
    const content = read(file);
    const parsed = parseFrontmatter(content);
    if (!parsed.ok) continue;
    if (parsed.data.isolation === 'worktree') {
      details.push(`${path.relative(ROOT, file)}: isolation: worktree no puede ser default (ADR-010)`);
    }
    if (!/trabaja por defecto sobre la rama de trabajo actual/i.test(content)) {
      details.push(`${path.relative(ROOT, file)}: falta contrato explícito de ejecución sobre rama actual`);
    }
  }

  const rule = p('.claude/references/rules/asdd-orchestration-worktree.md');
  if (exists(rule)) {
    const content = read(rule);
    if (!/2 o más developers en paralelo/i.test(content) || !/usuario solicita explícitamente/i.test(content)) {
      details.push(`${path.relative(ROOT, rule)}: faltan triggers opt-in explícito/paralelismo`);
    }
  }

  return details.length
    ? { ok: false, message: 'worktree opt-in contract violated', details }
    : { ok: true, message: 'developer worktree isolation is opt-in (ADR-010)' };
});

// 21. Validacion estructural de .asdd-run.json contra asdd-run.schema.json (A6 — Bug A)
check('asdd-run-json-schema', 'warn', () => {
  const runFile = p('.asdd-run.json');
  if (!exists(runFile)) {
    return { ok: true, message: '.asdd-run.json not present (skip)' };
  }

  let run;
  try {
    run = JSON.parse(read(runFile));
  } catch (e) {
    return { ok: false, message: `.asdd-run.json — JSON parse error: ${e.message}`, details: [] };
  }

  const REQUIRED_FIELDS = ['run_id', 'feature', 'started_at', 'last_checkpoint', 'status', 'phases', 'context_summary', 'resume_hint'];
  const STATUS_ENUM = new Set(['in_progress', 'complete', 'blocked']);
  const PHASE_ENUM = new Set(['specify', 'analyze', 'design', 'build', 'verify', 'document']);

  const details = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in run)) {
      details.push(`.asdd-run.json — campo requerido ausente: "${field}"`);
    }
  }

  // Check status enum
  if ('status' in run && !STATUS_ENUM.has(run.status)) {
    details.push(`.asdd-run.json — status "${run.status}" fuera del enum permitido [${[...STATUS_ENUM].join(', ')}]`);
  }

  // Check current_phase enum (field is optional but must match enum if present)
  if ('current_phase' in run && run.current_phase !== null && run.current_phase !== undefined) {
    if (!PHASE_ENUM.has(run.current_phase)) {
      details.push(
        `.asdd-run.json — current_phase "${run.current_phase}" fuera del enum permitido [${[...PHASE_ENUM].join(', ')}] — escribir siempre en inglés (ORC-007 + Bug A ítem A3)`
      );
    }
  }

  return {
    ok: details.length === 0,
    message:
      details.length === 0
        ? '.asdd-run.json estructura válida (campos requeridos + enum de status y current_phase)'
        : `${details.length} problema(s) estructural(es) en .asdd-run.json`,
    details,
  };
});

// Corpus compartido por los checks de portabilidad cross-OS (36 y 38): fuentes
// JS/MJS bajo .claude/. Se excluye node_modules por si un consumidor lo anida.
const portabilitySources = () =>
  walk(p('.claude'), (f) => /\.(mjs|js)$/.test(f) && !f.includes(`${path.sep}node_modules${path.sep}`));

// Devuelve el argumento balanceado de una llamada, dado el índice de su '('.
function balancedArg(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(openIdx + 1, i);
    }
  }
  return text.slice(openIdx + 1);
}

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// 36. Hashing de contenido de disco siempre normalizado (strict)
//
// La regla NO es "¿usa createHash?". De los archivos que hashean, solo los que
// hashean CONTENIDO LEÍDO DE DISCO deben normalizar: con core.autocrlf=true el
// working tree materializa CRLF en Windows y LF en Linux/CI, así que el mismo blob
// de Git produce dos huellas distintas. Los que hashean un string en memoria (el
// comando de un commit, el JSON de un plan) NO deben normalizar: su hash tiene que
// ser sensible a cada byte, porque su función es detectar que el comando o el plan
// cambió. Un check que solo buscara `createHash` produciría falsos positivos sobre
// esos y se desactivaría por ruido.
//
// Criterio implementado, a nivel de EXPRESIÓN (no de archivo): se marca un
// `.update(...)` cuando el valor hasheado deriva de una lectura cruda de disco
// (`readFileSync` / `readFile`) y no pasa por la lib de normalización
// (`normalizeForHash` / `normalizeBufferForHash` / `readNormalized`) ni por un
// equivalente local (CRLF->LF).
// Se cubren dos formas: la lectura inline dentro del `.update(...)`, y el
// identificador simple cuya asignación en el mismo archivo lee crudo de disco.
//
// Forma 3 — helper local de UN salto: `const h = (x) => createHash(...).update(x)`.
// El `.update()` vive dentro del helper, así que las formas 1 y 2 no pueden decidir
// nada ahí: lo que importa es qué recibe cada call site. Se reconoce el helper solo
// cuando su cuerpo es exactamente esa cadena y hashea su propio parámetro, y la
// verificación se traslada a sus invocaciones aplicándoles el criterio de la forma 1.
// Deliberadamente NO se correlacionan identificadores en los call sites: el mismo
// nombre de variable reaparece en funciones distintas del archivo y la primera
// asignación que matchee suele ser de otro scope, lo que produciría falsos positivos
// sobre hashes en memoria — el modo de falla que desactiva estos checks.
//
// LIMITACIÓN CONOCIDA Y ACEPTADA: esto es análisis de strings, no un parser. Si el
// contenido se hashea a través de más de un salto (reasignación, propiedad de objeto,
// o dos funciones intermedias), la correlación no ocurre. Esos sitios NO se reportan
// como verificados: se cuentan aparte y el conteo va en el mensaje del check, porque
// "no pude correlacionarlo" no es lo mismo que "está normalizado". Las tres formas
// cubiertas son las que produjeron los defectos reales de esta clase.
check('hash-eol-normalization', 'error', () => {
  const libRel = '.claude/scripts/lib/asdd-hash-normalize-lib.mjs';
  if (!exists(p(libRel))) {
    return {
      ok: false,
      message: `falta ${libRel} — fuente única de verdad de "qué bytes se hashean"`,
      details: [],
    };
  }

  const RAW_READ_RE = /\breadFileSync\s*\(|\breadFile\s*\(/;
  // Las tres puertas de entrada de la lib. `normalizeBufferForHash` es la variante byte a
  // byte para contenido que no se puede asumir texto; cuenta igual que las otras dos, y
  // omitirla acá convertiría a cada uno de sus call sites en un falso positivo.
  const LIB_NORM_RE = /normalize(?:Buffer)?ForHash|readNormalized/;
  // Equivalente local: CRLF->LF explícito. Necesario para cp-enricher.js, que es
  // CommonJS y no puede importar la lib (ESM), así que normaliza inline.
  const LOCAL_NORM_RE = /replaceAll\(\s*(['"])\\r\\n\1|replace\(\s*\/\\r\\n\/g/;
  const PRAGMA = 'asdd-hash-raw-bytes';
  const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
  // Forma 3 — `const h = (x) => createHash(...).update(x)`. Los grupos 2 y 3 deben
  // coincidir: el helper tiene que hashear su propio parámetro, sin transformarlo.
  const HELPER_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*createHash\s*\([^)]*\)\s*\.update\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g;

  const normalized = (expr) => LIB_NORM_RE.test(expr) || LOCAL_NORM_RE.test(expr);
  const isProse = (line) => {
    const t = (line ?? '').trim();
    return t.startsWith('//') || t.startsWith('*');
  };

  const details = [];
  const unresolved = [];
  let sites = 0;

  for (const f of portabilitySources()) {
    let src;
    try { src = read(f); } catch { continue; }
    if (!src.includes('createHash')) continue;
    const rel = path.relative(ROOT, f).replaceAll('\\', '/');
    const srcLines = src.split('\n');

    // Helpers de un salto declarados en este archivo (forma 3).
    const helpers = new Map();
    HELPER_RE.lastIndex = 0;
    let hm;
    while ((hm = HELPER_RE.exec(src)) !== null) {
      if (hm[2] === hm[3]) helpers.set(hm[1], hm[2]);
    }
    const helperParams = new Set(helpers.values());

    for (let i = src.indexOf('.update('); i !== -1; i = src.indexOf('.update(', i + 1)) {
      const ln = lineOf(src, i);
      // La prosa que documenta el idioma peligroso no es un sitio de hashing. Sin
      // este filtro el conteo se infla con los comentarios de este mismo check y
      // deja de significar algo.
      if (isProse(srcLines[ln - 1])) continue;
      sites += 1;
      const arg = balancedArg(src, i + '.update'.length);
      if (srcLines[ln - 1] && srcLines[ln - 1].includes(PRAGMA)) continue;

      // Forma 1 — lectura cruda inline dentro del .update(...)
      if (RAW_READ_RE.test(arg)) {
        if (!normalized(arg)) {
          details.push(`${rel}:${ln} — hashea lectura cruda de disco sin normalizar EOL/BOM`);
        }
        continue;
      }

      // Forma 2 — identificador simple asignado desde una lectura cruda
      const ident = arg.trim();
      if (!IDENT_RE.test(ident)) continue;
      const assign = new RegExp(`(?:const|let|var)\\s+${ident}\\s*=\\s*([\\s\\S]*?);`).exec(src);
      if (assign) {
        if (RAW_READ_RE.test(assign[1]) && !normalized(assign[1])) {
          details.push(`${rel}:${ln} — hashea "${ident}", leído crudo de disco sin normalizar EOL/BOM`);
        }
        continue;
      }

      // Forma 3 — el .update() es el cuerpo de un helper reconocido: la decisión
      // se toma en sus call sites, más abajo. No es un sitio sin correlacionar.
      if (helperParams.has(ident)) continue;

      unresolved.push(`${rel}:${ln} — hashea "${ident}": sin asignación correlacionable ni helper reconocido`);
    }

    // Forma 3 — call sites de cada helper, con el criterio de la forma 1.
    for (const [name, param] of helpers) {
      const callRe = new RegExp(`(?:^|[^\\w$.])${name}\\s*\\(`, 'g');
      let cm;
      while ((cm = callRe.exec(src)) !== null) {
        const openIdx = cm.index + cm[0].length - 1;
        const cln = lineOf(src, openIdx);
        if (isProse(srcLines[cln - 1])) continue;
        if (srcLines[cln - 1] && srcLines[cln - 1].includes(PRAGMA)) continue;
        const callArg = balancedArg(src, openIdx);
        if (RAW_READ_RE.test(callArg) && !normalized(callArg)) {
          details.push(`${rel}:${cln} — pasa una lectura cruda de disco a ${name}(${param}), que la hashea sin normalizar EOL/BOM`);
        }
      }
    }
  }

  // El conteo de sitios sin correlacionar va en el MESSAGE, no en details: los
  // details solo se imprimen cuando el check falla, y un sitio no correlacionado
  // no debe leerse como verificado ni hacer fallar la corrida.
  const coverage = unresolved.length === 0
    ? `${sites} sitio(s) de hashing revisado(s), todos correlacionados`
    : `${sites} sitio(s) de hashing revisado(s), ${unresolved.length} SIN CORRELACIONAR (${unresolved.slice(0, 3).map((u) => u.split(' — ')[0]).join(', ')})`;

  return {
    ok: details.length === 0,
    message: `${coverage}; contenido de disco normalizado cross-OS (escape: ${PRAGMA})`,
    details: [...details, ...unresolved].slice(0, 20),
  };
});

// 37. Hooks de settings.json en forma exec, no shell (strict)
//
// En forma shell (`"command": "node $CLAUDE_PROJECT_DIR/..."`) el comando sin comillas
// se rompe por word-splitting con cualquier ruta que contenga un espacio. "OneDrive -
// Empresa" es universal en laptops corporativas, así que un solo path con espacio
// rompería los hooks a la vez y de forma silenciosa. La forma exec (`"command": "node"`
// + `"args": [...]`) pasa los argumentos sin shell y es inmune.
//
// Este check solo LEE settings.json — nunca lo escribe (es operación humana).
check('hook-command-shape', 'error', () => {
  const rel = '.claude/settings.json';
  const f = p(rel);
  if (!exists(f)) return { ok: true, message: `${rel} not present (skip)` };

  let settings;
  try {
    settings = JSON.parse(read(f));
  } catch (e) {
    return { ok: false, message: `${rel} — JSON parse error: ${e.message}`, details: [] };
  }

  const details = [];
  let entries = 0;
  const hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};

  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      details.push(`hooks.${event} — debe ser un array de grupos`);
      continue;
    }
    groups.forEach((group, gi) => {
      const list = group && Array.isArray(group.hooks) ? group.hooks : null;
      if (!list) {
        details.push(`hooks.${event}[${gi}] — falta el array "hooks"`);
        return;
      }
      list.forEach((h, hi) => {
        entries += 1;
        const at = `hooks.${event}[${gi}].hooks[${hi}]`;
        if (!h || typeof h !== 'object') {
          details.push(`${at} — entrada inválida`);
          return;
        }
        if (h.type !== 'command') {
          details.push(`${at} — type debe ser "command" (encontrado: ${JSON.stringify(h.type)})`);
          return;
        }
        const cmd = typeof h.command === 'string' ? h.command : '';
        if (!cmd) {
          details.push(`${at} — falta "command"`);
          return;
        }
        // Rechazo explícito de la forma shell.
        if (/\s/.test(cmd) || cmd.includes('CLAUDE_PROJECT_DIR')) {
          details.push(`${at} — forma shell prohibida ("${cmd}"): usar "command": "node" + "args": [...]`);
          return;
        }
        if (/[\\/]/.test(cmd)) {
          details.push(`${at} — "command" debe ser un ejecutable simple sin separadores de ruta (encontrado: "${cmd}")`);
          return;
        }
        if (!Array.isArray(h.args) || h.args.length === 0) {
          details.push(`${at} — falta "args" como array no vacío`);
          return;
        }
        const first = String(h.args[0] ?? '');
        if (!first.includes('${CLAUDE_PROJECT_DIR}')) {
          details.push(`${at} — args[0] debe referenciar \${CLAUDE_PROJECT_DIR} (encontrado: "${first}")`);
          return;
        }
        // Un hook que apunta a un archivo inexistente falla en silencio: peor que no tenerlo.
        const scriptRel = first.replace('${CLAUDE_PROJECT_DIR}', '').replace(/^[\\/]+/, '');
        if (!exists(p(scriptRel))) {
          details.push(`${at} — el script apuntado no existe en disco: ${scriptRel}`);
        }
      });
    });
  }

  return {
    ok: details.length === 0,
    message: `${entries} hook(s) de ${rel} en forma exec con script existente`,
    details: details.slice(0, 20),
  };
});

// 38. Separador de ruta seguro cross-OS (warn)
//
// Nace en 'warn' a propósito: es el check con riesgo real de falsos positivos, porque
// distinguir "ruta nativa" de "string posix legítimo" no se puede hacer con certeza sin
// dataflow. Se promueve a 'error' en otra pasada, después de validarlo en la práctica.
//
// El defecto que persigue: en Windows `relative()` y `join()` devuelven '\', así que
// comparar contra un literal con '/' NUNCA matchea. Según de qué lado falle el booleano
// el efecto se invierte: si decide "¿puedo leer esto?" bloquea de forma visible y se
// nota; si decide "¿esto me concierne?", el guard no dispara y la gobernanza desaparece
// sin ningún mensaje. Tres hooks de gobernanza estuvieron así.
//
// El otro lado legítimo: cuando el string posix viene de un manifiesto, config, env var,
// output de git, regex de comando shell o URL, el '/' es CORRECTO y OBLIGATORIO. Esos
// sitios viven en el allowlist de abajo (a nivel de archivo) o se excluyen por
// evidencia de normalización en la propia expresión.
check('path-separator-safety', 'warn', () => {
  // Archivos donde el '/' es legítimo: el otro lado del booleano es un string posix
  // que NO viene de la API de path del SO.
  const ALLOWLIST = new Map([
    // Rutas de artefacto leídas de .asdd-run.json (posix por contrato del manifiesto).
    ['.claude/scripts/asdd-run-manifest.mjs', 'rutas docs/ desde .asdd-run.json'],
    // Ya normaliza a posix antes de comparar prefijos de artifact-dir.
    ['.claude/scripts/asdd-run-bootstrap.mjs', 'normaliza a posix antes de comparar'],
    ['.claude/scripts/lib/asdd-run-reconciliation-lib.mjs', 'rutas posix del INDEX/manifiesto'],
    // Compara output de `git ls-files` (siempre posix) y rutas de manifiestos.
    ['.claude/scripts/validate-template.mjs', 'output de git ls-files y manifiestos, ya posix'],
    // Regexes que deben matchear el allowlist de comandos shell de settings.json.
    ['.claude/hooks/asdd-orchestrator-guard.mjs', 'regexes de comandos shell del allowlist'],
  ]);
  // NO hay allowlist por prefijo. Existió una para `.claude/tools/` completo, que
  // dejaba 88 archivos —el runtime ATF Web, el cuerpo de código más grande del repo—
  // fuera del check de un solo golpe y sin razón por archivo. Se midió al removerla:
  // 0 hallazgos, porque `tools/lib/paths.js` usa `path.join` en todo, cada
  // `startsWith('/')` de ahí es una ruta de URL y los resultados de `relative()` se
  // normalizan antes de escribirse a JSON. Una exención nueva se declara por ARCHIVO
  // en el ALLOWLIST de arriba, con su razón — nunca por prefijo.
  const PRAGMA = 'asdd-posix-path';

  // Concatenar una ruta nativa con '/'.
  const CONCAT_RE = /\b(?:resolve|join)\s*\([^;]*?\)\s*\+\s*['"`]\//;
  // relative(...) comparado contra un literal con '/'.
  const RELATIVE_RE = /\brelative\s*\([^;]*?\)[^;]{0,120}?\.startsWith\s*\(\s*['"`][^'"`]*\//;
  // .startsWith(`${var}/`) — receptor capturado para descartar los ya-posix.
  const TEMPLATE_RE = /([A-Za-z_$][\w$.]*)\.startsWith\s*\(\s*`\$\{[^}]+\}\//;
  // Evidencia de normalización a posix en la MISMA expresión.
  const POSIX_FIX_RE = /replaceAll\(\s*(['"])\\\\\1|replace\(\s*\/\\\\\/g|split\(\s*sep\s*\)\s*\.join|\.posix\b/;

  const details = [];
  let scanned = 0;

  for (const f of portabilitySources()) {
    const rel = path.relative(ROOT, f).replaceAll('\\', '/');
    if (ALLOWLIST.has(rel)) continue;
    let src;
    try { src = read(f); } catch { continue; }
    scanned += 1;

    src.split('\n').forEach((ln, i) => {
      const trimmed = ln.trim();
      // Prosa: los comentarios citan el idioma peligroso para explicarlo.
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      if (ln.includes(PRAGMA)) return;
      if (POSIX_FIX_RE.test(ln)) return;

      if (CONCAT_RE.test(ln)) {
        details.push(`${rel}:${i + 1} — concatena una ruta nativa con '/': en Windows el separador es '\\'`);
        return;
      }
      if (RELATIVE_RE.test(ln)) {
        details.push(`${rel}:${i + 1} — relative() comparado contra un literal con '/': nunca matchea en Windows`);
        return;
      }
      const m = TEMPLATE_RE.exec(ln);
      // Un receptor cuyo nombre ya declara posix (ej. relPosix) está normalizado.
      if (m && !/posix/i.test(m[1])) {
        details.push(`${rel}:${i + 1} — startsWith con '/' interpolado sobre "${m[1]}": normalizar a posix antes de comparar`);
      }
    });
  }

  return {
    ok: details.length === 0,
    message: `${scanned} fuente(s) sin idiomas de separador inseguro (allowlist: ${ALLOWLIST.size} archivo(s); escape: ${PRAGMA})`,
    details: details.slice(0, 20),
  };
});

// 39. Frescura del provenance publicado (error)
//
// El cuarto artefacto generado del repo, junto a rule-loading, capability-loading y
// coordinator-loading, y con la misma clase de defecto: un archivo que alguien tiene que
// regenerar y que nadie ve cuando quedó viejo. Los otros tres ya tienen su check acá; no
// tenerlo para este era la inconsistencia.
//
// Por qué acá y no solo en `npm test`. La suite ya lo verifica, pero cuesta ~245 s y es el
// gate de pre-release — el que se saltea cuando hay prisa. Este validador cuesta ~10 s, es
// el paso 7 de la regla de integridad y corre en todo repo. El costo de agregarlo es ~2 s.
//
// Qué NO hace, a propósito: no compara el provenance contra el working tree. La ventana del
// generador son las ramas distribuibles, así que cualquier archivo distribuido con cambios
// sin mergear quedaría reportado como faltante y el check estaría rojo durante todo
// desarrollo normal — el modo de falla que desactiva un check por ruido. Delega en el
// generador, que compara contra lo mismo que publicaría, y por eso se mantiene verde en una
// rama de trabajo mientras el archivo esté al día respecto del remoto.
//
// Tres desenlaces, por exit code del generador: 0 al día, 1 desactualizado, 2 imposible de
// determinar (sin contrato o sin historia). El 2 se salta: un proyecto consumidor no recibe
// ni el generador ni el provenance, y un clon shallow no tiene con qué responder.
check('provenance-freshness', 'error', () => {
  const generatorRel = '.claude/scripts/asdd-gen-provenance.mjs';
  const provenanceRel = '.asdd/asdd-provenance.json';
  if (!exists(p(generatorRel))) {
    return { ok: true, message: `${generatorRel} no presente (skipped) — tooling de mantenedor, no se distribuye`, details: [] };
  }
  if (!exists(p(provenanceRel))) {
    return { ok: true, message: `${provenanceRel} no presente (skipped)`, details: [] };
  }

  const run = spawnSync(process.execPath, [p(generatorRel), '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (run.error) {
    return { ok: false, message: `no se pudo ejecutar ${generatorRel}: ${run.error.message}`, details: [] };
  }
  if (run.status === 2) {
    const reason = (run.stderr || '').split('\n').find((l) => l.startsWith('INDETERMINADO:')) ?? 'sin historia disponible';
    return { ok: true, message: `frescura no determinable (skipped) — ${reason.replace('INDETERMINADO: ', '')}`, details: [] };
  }
  if (run.status !== 0) {
    return {
      ok: false,
      message: `${provenanceRel} está desactualizado — correr \`npm run provenance:regen\` y commitear`,
      details: (run.stderr || '').split('\n').filter(Boolean).slice(-2),
    };
  }

  let paths = 0;
  try {
    paths = Object.keys(JSON.parse(read(p(provenanceRel))).files ?? {}).length;
  } catch {
    return { ok: false, message: `${provenanceRel} no se pudo parsear`, details: [] };
  }
  return { ok: true, message: `${provenanceRel} al día — ${paths} ruta(s) con procedencia publicada`, details: [] };
});

// 40. Coherencia de `moves` (error)
//
// `moves` declara que una ruta que el template entregaba en un lugar ahora la entrega en
// otro. No es lo que dispara el borrado —de eso se encarga el CLI comparando lo que entregó
// antes contra lo que distribuye ahora— sino lo que permite decirle al consumidor ADÓNDE fue
// su archivo. Una declaración incoherente no rompe nada: produce un mensaje equivocado, que
// es peor que no dar ninguno.
//
// El primer check es de UBICACIÓN, y existe por un precedente concreto: `files_to_remove` se
// declaró bajo `clean` mientras el CLI lo leía en la raíz, así que el campo nunca se llenó y
// la clave estuvo inerte durante meses sin un solo error. Una clave que el CLI no lee es
// indistinguible de una clave que no existe, y nada lo delata.
check('moves-coherence', 'error', () => {
  const contractPath = p('.asdd/cli-contract.json');
  if (!exists(contractPath)) return { ok: true, message: 'cli-contract not present (skip)', details: [] };
  let contract;
  try {
    contract = JSON.parse(read(contractPath));
  } catch {
    return { ok: true, message: 'cli-contract JSON invalid (reported by cli-contract)', details: [] };
  }

  const details = [];

  // Ubicación: el CLI lee `moves` en la raíz. Declararlo en otro lado lo vuelve inerte.
  for (const [container, label] of [[contract.clean, 'clean'], [contract.distribution, 'distribution']]) {
    if (container && typeof container === 'object' && !Array.isArray(container) && 'moves' in container) {
      details.push(`\`${label}.moves\` no lo lee ningún CLI — la clave va en la raíz del contrato`);
    }
  }

  const moves = contract.moves ?? [];
  if (!Array.isArray(moves)) {
    return { ok: false, message: '`moves` tiene que ser un array', details: [] };
  }
  if (moves.length === 0 && details.length === 0) {
    return { ok: true, message: '`moves` no declarado (skipped)', details: [] };
  }

  const distribution = contract.distribution ?? [];
  const distDirs = distribution.filter((e) => e.endsWith('/'));
  const distFiles = new Set(distribution.filter((e) => !e.endsWith('/')));
  const distributed = (path) => distFiles.has(path) || distDirs.some((d) => path.startsWith(d));

  const seen = new Set();
  for (const [i, m] of moves.entries()) {
    const at = `moves[${i}]`;
    if (!m || typeof m !== 'object') { details.push(`${at} no es un objeto`); continue; }
    if (!m.from || !m.to) { details.push(`${at} necesita \`from\` y \`to\``); continue; }
    if (m.from === m.to) { details.push(`${at} declara from === to (${m.from})`); continue; }
    if (m.from.endsWith('/') !== m.to.endsWith('/')) {
      details.push(`${at} mezcla directorio y archivo: ${m.from} -> ${m.to}`);
    }
    if (seen.has(m.from)) details.push(`${at} repite el origen ${m.from}`);
    seen.add(m.from);

    // El origen NO puede seguir distribuyéndose: si el template todavía lo entrega ahí, no
    // se movió, y el CLI nunca lo va a ver como una ruta que salió de la distribución.
    // Para un directorio se prueba con una ruta ficticia debajo, que es la forma en que el
    // CLI resuelve la pertenencia de cualquier archivo suyo.
    const fromProbe = m.from.endsWith('/') ? `${m.from}cualquier-archivo` : m.from;
    if (distributed(fromProbe)) {
      details.push(`${at} declara movido ${m.from}, pero \`distribution\` todavía lo entrega ahí`);
    }
    // El destino SÍ tiene que existir, o el mensaje apunta a un archivo que no está. Se
    // acepta que lo cubra `distribution` o que esté en disco: un directorio puede quedar
    // cubierto por un prefijo más alto de la lista.
    if (!distributed(m.to) && !exists(p(m.to))) {
      details.push(`${at} apunta a ${m.to}, que el template no distribuye`);
    }
  }

  return {
    ok: details.length === 0,
    message: details.length === 0
      ? `${moves.length} movimiento(s) declarado(s), coherentes con la distribución`
      : `${details.length} incoherencia(s) en ${moves.length} movimiento(s) declarado(s)`,
    details,
  };
});

// 41. Regresión de `distribution` (error)
//
// `distribution` es la lista de lo que el template entrega. Desde que el CLI borra del
// proyecto del consumidor lo que dejó de estar en esa lista, sacar una ruta de acá ya no
// significa «dejo de actualizarla»: significa eliminarla de todos los proyectos que la
// tenían. Una entrada que se cae por accidente —un conflicto de merge resuelto de menos,
// una reescritura de la lista— no produce hoy ninguna señal.
//
// El único check que podía verlo exige que otro artefacto distribuido nombre la ruta por su
// path, así que solo alcanza a dependencias de runtime bajo `.claude/{scripts,hooks,tools}/`:
// un agente, una skill, una regla o un documento que nadie referencia se cae en silencio.
// Ya pasó: `.claude/scripts/asdd-resolve-workspace.mjs` se entregó en v3.3.0, salió de
// la lista al resolver un merge y estuvo ausente tres releases seguidas sin un solo error.
//
// LA PREGUNTA
//
// Por cada ruta que el template alguna vez entregó: ¿la distribución de hoy la sigue
// cubriendo, la reubica con un `moves` declarado, o hay una razón escrita de por qué se
// retiró? Si ninguna de las tres, es una regresión.
//
// LA VENTANA: TAGS Y TIPS DE LAS RAMAS DISTRIBUIBLES
//
// Los tags son las releases. Los tips entran porque el CLI instala por canal → rama, así que
// lo que hay en un tip ya es lo que alguien recibe hoy: comparar contra el tip detecta la
// caída en el momento en que se introduce, antes de que exista un tag. Los tags aportan la
// profundidad, y hace falta: una caída que ya se publicó es invisible para cualquier
// comparación contra la versión inmediatamente anterior, porque ahí ya faltaba.
//
// SE COMPARAN RUTAS, NO ENTRADAS
//
// Comparar las dos listas entrada por entrada produce falsos positivos por granularidad:
// `.asdd/` dejó de declararse como directorio y pasó a 15 archivos enumerados, lo que
// entrada-contra-entrada lee como la caída de todo el árbol. Cada entrada histórica se
// expande a los archivos que existían en ese ref y la comparación es por ruta exacta.
//
// QUÉ NO MIDE, A PROPÓSITO
//
// Un archivo retirado DENTRO de un directorio que se sigue distribuyendo no es un hallazgo:
// la declaración no cambió, el archivo se retiró. Son ~75 rutas de historia acumulada, todas
// visibles en git, y medirlas obliga a expandir el árbol completo de cada ref — cuatro veces
// el costo de este check por una lista sobre la que no hay nada que decidir.
//
// COSTO
//
// Dos etapas, para no pagar la expansión completa: primero se comparan las listas, y solo
// las entradas que hoy no están cubiertas se expanden, con pathspec. ~1,7 s.
check('distribution-regression', 'error', () => {
  const contractRel = '.asdd/cli-contract.json';
  const contractPath = p(contractRel);
  if (!exists(contractPath)) return { ok: true, message: 'cli-contract not present (skip)', details: [] };

  // El validador se distribuye, así que este check también corre en el proyecto del
  // consumidor — donde sus propios tags SÍ contienen un cli-contract.json, porque el contrato
  // viene en la distribución. La comparación daría hallazgos ciertos pero ajenos: son
  // releases del template, no suyas, y no hay nada que él pueda hacer con ellas. La presencia
  // del tooling de mantenedor es lo que distingue un repo del otro.
  const maintainerOnly = '.claude/scripts/asdd-gen-provenance.mjs';
  if (!exists(p(maintainerOnly))) {
    return {
      ok: true,
      message: `${maintainerOnly} no presente (skipped) — la historia de releases del template no es la de este repo`,
      details: [],
    };
  }

  let contract;
  try {
    contract = JSON.parse(read(contractPath));
  } catch {
    return { ok: true, message: 'cli-contract JSON invalid (reported by cli-contract)', details: [] };
  }
  const stripDot = (e) => String(e).replace(/^\.\//u, '');
  const distribution = Array.isArray(contract.distribution) ? contract.distribution.map(stripDot) : [];
  if (distribution.length === 0) {
    return { ok: true, message: '`distribution` vacío o ausente (reported by cli-contract)', details: [] };
  }

  // Retiros DELIBERADOS: rutas que el template entregó y decidió dejar de entregar. No se
  // absorben en silencio — el mensaje del check las lista siempre, porque los `details` solo
  // se imprimen cuando el check falla. Una entrada acá es una decisión con su razón, no un
  // silenciador; borrarla es lo que reabre el hallazgo. Una clave terminada en `/` cubre todo
  // lo que haya debajo.
  const RETIRED = new Map([
    ['.asdd/checklist.json',
      'checklist ejecutable de la instalación: el CLI la lee del clon del template, el consumidor no necesita una copia — retiro documentado en .claude/docs/migrations/3.3-to-3.4.md'],
    ['ASDD-CHANGELOG.md',
      'historia de versiones del template, no del proyecto que lo adopta'],
    ['docs/architecture/decisions/ADR-020-workspace-multirepo-y-worktree-gestionado.md',
      'la feature de worktree multi-repo se revirtió y el ADR se borró con ella — retiro documentado en .claude/docs/migrations/3.3-to-3.4.md'],
  ]);

  // argv separado y sin shell: un string de shell corre bajo cmd.exe en Windows y la sintaxis
  // POSIX se pierde en silencio. Devuelve null en vez de tirar: no poder leer la historia es
  // un skip, no un hallazgo.
  const git = (args, input) => {
    const r = spawnSync('git', args, {
      cwd: ROOT,
      input,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    if (r.error || r.status !== 0 || !r.stdout) return null;
    return r.stdout;
  };

  // Un solo spawn para todas las refs. `origin/x` y la rama local `x` entran las dos cuando
  // existen: es una unión, y la pertenencia se decide después por ruta exacta.
  const BRANCHES = ['dev', 'qa', 'main'];
  const refsOut = git(['for-each-ref', '--sort=v:refname', '--format=%(refname)',
    'refs/tags',
    ...BRANCHES.flatMap((b) => [`refs/remotes/origin/${b}`, `refs/heads/${b}`]),
  ]);
  if (refsOut === null) {
    return { ok: true, message: 'git no disponible o sin refs (skipped)', details: [] };
  }
  const allRefs = refsOut.toString('utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  // Tags primero y tips al final: el ref que se reporta por ruta es el último que la entregó,
  // y un tip que todavía la entrega es un dato más urgente que el tag donde apareció.
  const refs = [
    ...allRefs.filter((r) => r.startsWith('refs/tags/')),
    ...allRefs.filter((r) => !r.startsWith('refs/tags/')),
  ];
  if (refs.length === 0) {
    return { ok: true, message: 'sin tags ni ramas distribuibles (skipped) — clon sin historia', details: [] };
  }

  const batch = git(['cat-file', '--batch'],
    Buffer.from(`${refs.map((r) => `${r}:${contractRel}`).join('\n')}\n`, 'utf8'));
  if (batch === null) {
    return { ok: true, message: 'no se pudo leer la historia del contrato (skipped)', details: [] };
  }

  // `--batch` responde en el orden de la entrada, un registro por línea pedida:
  // "<oid> blob <bytes>\n<contenido>\n", o "<spec> missing\n" cuando esa ref no tiene el
  // archivo. El tamaño viene en BYTES, así que el recorrido es sobre el Buffer: el contrato
  // tiene texto acentuado y contar caracteres desalinearía todos los registros siguientes.
  const historic = new Map();
  let at = 0;
  for (const ref of refs) {
    const nl = batch.indexOf(0x0a, at);
    if (nl < 0) break;
    const header = batch.subarray(at, nl).toString('utf8').split(' ');
    const size = header.length === 3 && header[1] === 'blob' ? Number(header[2]) : NaN;
    if (!Number.isFinite(size)) {
      at = nl + 1;
      continue;
    }
    const body = batch.subarray(nl + 1, nl + 1 + size).toString('utf8');
    at = nl + 1 + size + 1;
    try {
      const old = JSON.parse(normalizeForHash(body));
      if (Array.isArray(old.distribution) && old.distribution.length > 0) {
        historic.set(ref, old.distribution.map(stripDot));
      }
    } catch {
      // Un contrato inválido en la historia ya no se puede arreglar y no es lo que este
      // check persigue.
    }
  }
  if (historic.size === 0) {
    return {
      ok: true,
      message: `ninguna de las ${refs.length} ref(s) publicó un contrato con distribución (skipped)`,
      details: [],
    };
  }

  const distDirs = distribution.filter((e) => e.endsWith('/'));
  const distFiles = new Set(distribution.filter((e) => !e.endsWith('/')));
  const covers = (target) => distFiles.has(target) || distDirs.some((d) => target.startsWith(d));

  const moves = Array.isArray(contract.moves)
    ? contract.moves.filter((m) => m && typeof m === 'object' && m.from && m.to)
    : [];
  const destinationOf = (target) => {
    for (const m of moves) {
      if (m.from === target) return m.to;
      if (m.from.endsWith('/') && target.startsWith(m.from)) return m.to + target.slice(m.from.length);
    }
    return null;
  };

  // Etapa 1 — comparación de listas. Una entrada histórica de directorio cuenta como cubierta
  // solo si algún directorio de hoy es su prefijo: si dejó de declararse como directorio hay
  // que abrirla para saber qué quedó afuera.
  const suspect = new Map();
  for (const [ref, entries] of historic) {
    const open = entries.filter((e) => (e.endsWith('/')
      ? !distDirs.some((d) => e.startsWith(d))
      : !covers(e)));
    if (open.length > 0) suspect.set(ref, open);
  }

  // Etapa 2 — solo esas entradas se expanden a los archivos que existían en ese ref. El
  // pathspec es lo que mantiene el costo acotado; sin él habría que listar el árbol completo.
  // `-z` evita el quoting de git para nombres no ASCII, que devolvería rutas inexistentes.
  const published = new Map();
  let notExpanded = 0;
  for (const [ref, open] of suspect) {
    const out = git(['ls-tree', '-r', '--name-only', '-z', ref, '--', ...open]);
    if (out === null) {
      notExpanded += 1;
      continue;
    }
    for (const target of out.toString('utf8').split('\0')) {
      if (target) published.set(target, ref);
    }
  }

  const details = [];
  const retiredHits = [];
  let stillCovered = 0;
  let relocated = 0;
  for (const [target, ref] of [...published].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (covers(target)) {
      stillCovered += 1;
      continue;
    }
    const to = destinationOf(target);
    if (to !== null && covers(to)) {
      relocated += 1;
      continue;
    }
    const reason = RETIRED.get(target)
      ?? [...RETIRED].find(([k]) => k.endsWith('/') && target.startsWith(k))?.[1];
    if (reason !== undefined) {
      retiredHits.push(`${target} (${reason})`);
      continue;
    }
    const where = ref.replace(/^refs\/(?:tags|remotes|heads)\//u, '');
    details.push(to !== null
      ? `${contractRel} — ${target} se entregó en ${where} y hoy no se distribuye; su \`moves\` apunta a ${to}, que tampoco se distribuye`
      : `${contractRel} — ${target} se entregó en ${where} y hoy no se distribuye ni tiene \`moves\` que la reubique: el upgrade la va a borrar de todo proyecto que la tenga`);
  }

  // Una razón de retiro que ya no corresponde a ninguna ruta publicada, o que apunta a algo
  // que hoy volvió a distribuirse, es basura acumulada: se avisa sin hacer fallar la corrida.
  const staleRetired = [...RETIRED.keys()].filter((k) => (k.endsWith('/')
    ? ![...published.keys()].some((target) => target.startsWith(k))
    : !published.has(k) || covers(k)));

  // Las tres salidas van en el mensaje y no en cada `detail`: con un directorio caído los
  // hallazgos son decenas y la remediación es la misma para todos. La tercera obliga a
  // escribir una razón porque es la única que no se puede verificar sola.
  if (details.length > 0) {
    return {
      ok: false,
      message: `${details.length} ruta(s) que el template entregó y hoy no declara`
        + ' — restaurar la entrada en `distribution`, declarar el `moves` que la reubica,'
        + ` o registrar el retiro con su razón en RETIRED (${path.relative(ROOT, fileURLToPath(import.meta.url)).replaceAll('\\', '/')})`,
      details,
    };
  }

  const parts = [`${published.size} ruta(s) publicada(s) bajo declaraciones que hoy cambiaron`
    + `, sobre ${historic.size} contrato(s) de la historia`];
  if (stillCovered > 0) parts.push(`${stillCovered} sigue(n) cubierta(s) con otra granularidad`);
  if (relocated > 0) parts.push(`${relocated} reubicada(s) por \`moves\``);
  if (retiredHits.length > 0) parts.push(`${retiredHits.length} RETIRO(S) deliberado(s): ${retiredHits.join(' · ')}`);
  if (staleRetired.length > 0) parts.push(`${staleRetired.length} retiro(s) obsoleto(s) para limpiar: ${staleRetired.join(', ')}`);
  if (notExpanded > 0) parts.push(`${notExpanded} ref(s) que no se pudieron expandir`);

  return { ok: true, message: parts.join('; '), details: [] };
});

// Run
const results = [];
for (const c0 of checks) {
  let r;
  try {
    r = c0.fn();
  } catch (e) {
    r = { ok: false, message: `check threw: ${e.message}` };
  }
  results.push({ ...c0, result: r });
}

let errors = 0;
let warns = 0;
let oks = 0;

// Output helper: in JSON mode, human text goes to stderr; otherwise stdout.
const humanOut = JSON_MODE ? process.stderr : process.stdout;

// JSON findings accumulator (only populated when --json is active).
const jsonFindings = [];

// Extracts a file path from the beginning of a detail string.
// Most detail strings follow the pattern: "rel/path — description"
// Returns empty string when no path can be identified.
function extractPath(detail) {
  // Pattern: something that looks like a file path (contains / or . and no spaces before the separator)
  const m = detail.match(/^([^\s].*?)\s+—\s+/);
  if (!m) return '';
  const candidate = m[1];
  // Accept as path if it contains a slash, a dot-extension, or looks like a known prefix
  if (/[/\\]/.test(candidate) || /\.\w+$/.test(candidate)) return candidate;
  return '';
}

for (const { name, level, result } of results) {
  const failed = !result.ok;
  const tag = failed ? (level === 'error' ? c.red('ERR ') : c.yellow('WARN')) : c.green(' OK ');
  if (failed) {
    if (level === 'error') errors++;
    else warns++;
  } else {
    oks++;
  }
  const showOk = !SILENT && !failed;
  const showWarn = !SILENT || level === 'error';
  if (failed ? showWarn : showOk) {
    humanOut.write(`[${tag}] ${c.bold(name)} — ${result.message}${os.EOL}`);
    if (failed && Array.isArray(result.details)) {
      for (const d of result.details) {
        humanOut.write(`       ${c.gray('·')} ${d}${os.EOL}`);
      }
    }
  }

  // Accumulate JSON findings for --json mode.
  if (JSON_MODE && failed) {
    const jsonLevel = level === 'error' ? 'error' : 'warn';
    const details = Array.isArray(result.details) ? result.details : [];
    if (details.length === 0) {
      // No per-file details — emit one finding with empty path and the check message.
      jsonFindings.push({ path: '', issue: `${name} — ${result.message}`, level: jsonLevel });
    } else {
      for (const d of details) {
        const filePath = extractPath(d);
        // Build issue text: strip the leading path+separator if it was extracted.
        const issueDetail = filePath
          ? d.slice(filePath.length).replace(/^\s+—\s+/, '').trim()
          : d;
        jsonFindings.push({ path: filePath, issue: `${name} — ${issueDetail}`, level: jsonLevel });
      }
    }
  }
}

const summary = `${oks} ok, ${warns} warn, ${errors} error`;
if (!SILENT) {
  humanOut.write(os.EOL + c.bold(`Summary: ${summary}`) + os.EOL);
}

if (JSON_MODE) {
  process.stdout.write(JSON.stringify(jsonFindings, null, 2) + os.EOL);
}

if (errors > 0) process.exit(1);
if (STRICT && warns > 0) process.exit(1);
process.exit(0);
