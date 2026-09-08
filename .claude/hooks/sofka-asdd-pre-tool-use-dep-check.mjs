#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/sofka-asdd-pre-tool-use-dep-check.mjs
//
// Hook PreToolUse que enforza el principio ASDD "Dep Audit First" (#3493):
// bloquea Write|Edit sobre archivos de manifiesto de dependencias cuando se
// detecta una dependencia nueva o un upgrade de major version, hasta que el
// solution-architect emita un reporte de auditoría.
//
// Archivos monitoreados (cualquier stack):
//   package.json · requirements.txt · pom.xml · build.gradle · go.mod
//   Gemfile · *.csproj · pyproject.toml · Cargo.toml · composer.json
//
// Lógica de detección:
//   - Nueva dependencia: clave/módulo que NO existía en el archivo actual en disco.
//   - Major upgrade: versión major del nuevo contenido > versión major del actual.
//   - Patch/minor upgrades: ignorados (no disparan el guard).
//
// Política de reporte:
//   El guard busca docs/tech/dep-audit-{nombre}-*.md (hasta 7 días de antigüedad).
//   - Sin reporte: BLOQUEA — "ejecutá /sofka-asdd:dep-audit {nombre}".
//   - Reporte con recomendación ✅ o ⚠️: PERMITE.
//   - Reporte con recomendación ❌ Y sin override: BLOQUEA con instrucciones.
//   - Reporte con ❌ + "override: accepted": PERMITE (deja rastro en el bloqueo).
//
// Desactivación temporal:
//   En .claude/settings.json → "env": { "ASDD_DEP_GUARD_ENABLED": "false" }
//   O: export ASDD_DEP_GUARD_ENABLED=false
//
// Protocolo (Claude Code PreToolUse hooks):
//   - Entrada: JSON por stdin con { tool_name, tool_input, cwd, ... }.
//   - Bloquear: stdout con { "decision": "block", "reason": "..." }, exit 0.
//   - Permitir: exit 0 sin output.
// -----------------------------------------------------------------------------

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";

// ---- Config -----------------------------------------------------------------

const ENABLED = process.env.ASDD_DEP_GUARD_ENABLED !== "false";
const AUDIT_DIR = process.env.ASDD_DEP_AUDIT_DIR || "docs/tech";
const AUDIT_MAX_AGE_DAYS = parseInt(process.env.ASDD_DEP_AUDIT_MAX_AGE || "7", 10);

const DEP_MANIFESTS = new Set([
  "package.json",
  "requirements.txt",
  "requirements-dev.txt",
  "requirements-prod.txt",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "go.mod",
  "Gemfile",
  "pyproject.toml",
  "Cargo.toml",
  "composer.json",
]);

// ---- Helpers ----------------------------------------------------------------

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function parseInput(raw) {
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch {
    // JSON malformado con contenido no-vacío: fallar CERRADO (#3639).
    process.stderr.write(
      "[pre-tool-use-dep-check] ERROR: stdin contiene JSON malformado — bloqueando por seguridad.\n"
    );
    process.exit(2);
  }
}

function isDepManifest(filePath) {
  const name = basename(filePath);
  if (DEP_MANIFESTS.has(name)) return true;
  // *.csproj
  if (extname(name) === ".csproj") return true;
  return false;
}

function readFileSafe(path) {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

// ---- Dependency parsers per format ------------------------------------------

function extractDepsPackageJson(content) {
  try {
    const obj = JSON.parse(content);
    const deps = {};
    for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      if (obj[section]) Object.assign(deps, obj[section]);
    }
    return deps;
  } catch { return {}; }
}

function extractDepsRequirements(content) {
  const deps = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*([>=<!~^]+\s*[\d.*]+)?/);
    if (match) deps[match[1].toLowerCase()] = match[2]?.trim() || "*";
  }
  return deps;
}

function extractDepsPomXml(content) {
  const deps = {};
  const re = /<artifactId>([^<]+)<\/artifactId>/g;
  let m;
  while ((m = re.exec(content))) deps[m[1]] = "*";
  return deps;
}

function extractDepsGoMod(content) {
  const deps = {};
  for (const line of content.split("\n")) {
    const m = line.trim().match(/^([^\s]+)\s+v?([\d.]+)/);
    if (m && !line.trim().startsWith("//")) deps[m[1]] = m[2];
  }
  return deps;
}

function extractDepsGemfile(content) {
  const deps = {};
  for (const line of content.split("\n")) {
    const m = line.trim().match(/^gem\s+['"]([^'"]+)['"]/);
    if (m) deps[m[1]] = "*";
  }
  return deps;
}

function extractDepsCsproj(content) {
  const deps = {};
  const re = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g;
  let m;
  while ((m = re.exec(content))) deps[m[1]] = m[2];
  return deps;
}

function extractDepsCargoToml(content) {
  const deps = {};
  for (const line of content.split("\n")) {
    const m = line.match(/^([a-z0-9_-]+)\s*=\s*["']([^"']+)["']/);
    if (m) deps[m[1]] = m[2];
  }
  return deps;
}

function extractDeps(filePath, content) {
  const name = basename(filePath);
  if (name === "package.json" || name === "composer.json") return extractDepsPackageJson(content);
  if (name.startsWith("requirements")) return extractDepsRequirements(content);
  if (name === "pom.xml") return extractDepsPomXml(content);
  if (name.startsWith("build.gradle")) return extractDepsGoMod(content); // rough
  if (name === "go.mod") return extractDepsGoMod(content);
  if (name === "Gemfile") return extractDepsGemfile(content);
  if (extname(name) === ".csproj") return extractDepsCsproj(content);
  if (name === "Cargo.toml" || name === "pyproject.toml") return extractDepsCargoToml(content);
  return {};
}

// ---- Version comparison -----------------------------------------------------

function parseMajor(versionStr) {
  if (!versionStr) return null;
  const cleaned = String(versionStr).replace(/^[^0-9]*/, "");
  const major = parseInt(cleaned.split(".")[0], 10);
  return isNaN(major) ? null : major;
}

function isMajorUpgrade(oldVer, newVer) {
  const oldMajor = parseMajor(oldVer);
  const newMajor = parseMajor(newVer);
  if (oldMajor === null || newMajor === null) return false;
  return newMajor > oldMajor;
}

// Detect new deps or major upgrades. Returns array of { name, oldVer, newVer, reason }.
function detectChanges(oldDeps, newDeps) {
  const changes = [];
  for (const [name, newVer] of Object.entries(newDeps)) {
    if (!(name in oldDeps)) {
      changes.push({ name, oldVer: null, newVer, reason: "new" });
    } else if (isMajorUpgrade(oldDeps[name], newVer)) {
      changes.push({ name, oldVer: oldDeps[name], newVer, reason: "major-upgrade" });
    }
  }
  return changes;
}

// ---- Audit report lookup ----------------------------------------------------

const AUDIT_MAX_AGE_MS = AUDIT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

function slugify(name) {
  return name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}

function findAuditReport(cwd, depName) {
  const auditDir = resolve(cwd, AUDIT_DIR);
  if (!existsSync(auditDir)) return null;

  const slug = slugify(depName);
  let entries;
  try { entries = readdirSync(auditDir); } catch { return null; }

  const now = Date.now();
  const candidates = entries
    .filter((e) => e.startsWith(`dep-audit-${slug}-`) && e.endsWith(".md"))
    .map((e) => ({ name: e, path: join(auditDir, e) }))
    .filter(({ path }) => {
      try {
        const age = now - statSync(path).mtimeMs;
        return age <= AUDIT_MAX_AGE_MS;
      } catch { return false; }
    })
    .sort((a, b) => b.name.localeCompare(a.name)); // more recent first

  return candidates.length > 0 ? candidates[0].path : null;
}

function parseAuditReport(reportPath) {
  const content = readFileSafe(reportPath);
  if (!content) return null;

  const rec = content.match(/\*\*Recomendaci[oó]n\*\*\s*[:：]\s*(.+)/i)?.[1]?.trim() ?? "";
  const override = /^\s*override\s*:\s*accepted/im.test(content);
  const overrideReason = content.match(/^\s*override_reason\s*:\s*(.+)/im)?.[1]?.trim();

  let verdict = "unknown";
  if (/✅/.test(rec) || /INSTALAR(?!\s+CON)/i.test(rec)) verdict = "ok";
  else if (/⚠/.test(rec) || /CON\s+PRECAUCI/i.test(rec)) verdict = "warn";
  else if (/❌/.test(rec) || /NO\s+INSTALAR/i.test(rec)) verdict = "fail";

  return { verdict, override, overrideReason, reportPath };
}

// ---- Main -------------------------------------------------------------------

export function getDependencyGuardDecision(input, environment = process.env) {
  if (environment.ASDD_DEP_GUARD_ENABLED === "false") return null;
  const toolName = input.tool_name || input.toolName || "";
  if (!["Write", "Edit"].includes(toolName)) return null;

  const toolInput = input.tool_input || input.toolInput || {};
  const rawPath = toolInput.file_path || toolInput.path || toolInput.filePath || "";
  if (!rawPath || !isDepManifest(rawPath)) return null;

  const cwd = input.cwd || process.cwd();
  const absPath = rawPath.startsWith("/") ? rawPath : resolve(cwd, rawPath);

  // New content being written
  const newContent = toolInput.content ?? toolInput.new_string ?? "";
  if (!newContent) return null;

  // Existing content on disk
  const oldContent = readFileSafe(absPath) ?? "";
  const oldDeps = extractDeps(absPath, oldContent);
  const newDeps = extractDeps(absPath, newContent);

  const changes = detectChanges(oldDeps, newDeps);
  if (changes.length === 0) return null;

  // Evaluate each changed dep
  const blocking = [];
  const overridden = [];

  for (const change of changes) {
    const reportPath = findAuditReport(cwd, change.name);
    if (!reportPath) {
      blocking.push({ ...change, auditStatus: "missing" });
      continue;
    }
    const report = parseAuditReport(reportPath);
    if (!report) {
      blocking.push({ ...change, auditStatus: "unreadable" });
      continue;
    }
    if (report.verdict === "fail" && !report.override) {
      blocking.push({ ...change, auditStatus: "negative", reportPath: report.reportPath });
      continue;
    }
    if (report.verdict === "fail" && report.override) {
      overridden.push({ ...change, overrideReason: report.overrideReason });
    }
    // ok / warn / fail+override → allow (fall through)
  }

  if (blocking.length === 0) return null;

  // Build block message
  const lines = [
    "[ASDD DEP-AUDIT] Dependencias detectadas que requieren auditoría del arquitecto:",
    "",
  ];

  for (const dep of blocking) {
    const label = dep.reason === "new"
      ? `  • ${dep.name} ${dep.newVer ?? ""} — NUEVA dependencia`
      : `  • ${dep.name} ${dep.oldVer} → ${dep.newVer} — UPGRADE MAJOR`;

    if (dep.auditStatus === "missing") {
      lines.push(label);
      lines.push(`    Sin reporte de auditoría. Ejecutá: /sofka-asdd:dep-audit ${dep.name}`);
    } else if (dep.auditStatus === "negative") {
      lines.push(label);
      lines.push(`    Reporte: ❌ NO INSTALAR (${dep.reportPath}).`);
      lines.push(`    Para hacer override, agregá al reporte:`);
      lines.push(`      override: accepted`);
      lines.push(`      override_reason: "<razón técnica documentada>"`);
      lines.push(`      override_approved_by: "<nombre>"`);
    } else {
      lines.push(label);
      lines.push(`    Reporte no legible. Re-ejecutá: /sofka-asdd:dep-audit ${dep.name}`);
    }
    lines.push("");
  }

  if (overridden.length > 0) {
    lines.push(`Dependencias con override aceptado (pasan con advertencia):`);
    for (const dep of overridden) {
      lines.push(`  • ${dep.name} — override: ${dep.overrideReason ?? "sin razón documentada"}`);
    }
    lines.push("");
  }

  lines.push(`Skill del arquitecto: sofka-asdd-solution-architect (dep-audit)`);
  lines.push(`Desactivar guard: ASDD_DEP_GUARD_ENABLED=false`);

  return { decision: "deny", reason: lines.join("\n") };
}

function main() {
  if (!ENABLED) process.exit(0);
  const result = getDependencyGuardDecision(parseInput(readStdin()));
  if (!result) process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.decision,
      permissionDecisionReason: result.reason,
    },
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
