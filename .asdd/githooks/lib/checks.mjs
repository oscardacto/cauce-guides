// -----------------------------------------------------------------------------
// checks.mjs — validaciones reutilizables de los git hooks nativos ASDD.
//
// Cada check devuelve { ok, rule, message } y no imprime ni termina el proceso:
// la decisión de bloquear la toma el hook, que es quien conoce su contrato de
// exit code. Así los checks son testeables sin spawnear git.
// -----------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  activeRun,
  gitflowPrefixes,
  isMergeInProgress,
  mergeHeadHasPath,
  protectedBranches,
  repoRoot,
  stagedFiles,
} from "./facts.mjs";

const ok = (rule) => ({ ok: true, rule, message: "" });
const fail = (rule, message) => ({ ok: false, rule, message });

/** GS-001 — no commitear/mergear directamente en rama protegida. */
export function checkProtectedBranch(branch, env = process.env) {
  if (!branch) return ok("GS-001"); // detached HEAD: no hay rama que proteger
  const list = protectedBranches(env);
  if (!list.includes(branch)) return ok("GS-001");
  return fail(
    "GS-001",
    `rama protegida '${branch}'. Creá una feature branch antes de commitear.\n` +
      `  Prefijos válidos: ${gitflowPrefixes(env).join(" ")}\n` +
      `  Protegidas: ${list.join(", ")} (configurable con ASDD_PROTECTED_BRANCHES)`
  );
}

/** GS-004 — naming GitFlow de la rama de trabajo. */
export function checkBranchNaming(branch, env = process.env) {
  if (!branch) return ok("GS-004");
  const list = protectedBranches(env);
  if (list.includes(branch)) return ok("GS-004"); // las protegidas no llevan prefijo
  const prefixes = gitflowPrefixes(env);
  if (!prefixes.some((p) => branch.startsWith(p))) {
    return fail("GS-004", `la rama '${branch}' no usa un prefijo GitFlow (${prefixes.join(" ")}).`);
  }
  if (branch.length > 60) {
    return fail("GS-004", `el nombre de rama '${branch}' excede 60 caracteres (${branch.length}).`);
  }
  return ok("GS-004");
}

/** GS-005 — conventional commits. Acepta el formato de merge de ORC-011-D. */
const CONVENTIONAL_RE =
  /^(feat|fix|refactor|test|docs|chore|perf|ci|build|style|revert|merge)(\([^)]+\))?!?: .+/;

export function checkCommitMessage(rawMessage) {
  const lines = String(rawMessage || "")
    .split(/\r?\n/)
    .filter((l) => !l.startsWith("#"));
  const subject = (lines.find((l) => l.trim().length > 0) || "").trim();

  if (!subject) return fail("GS-005", "el mensaje de commit está vacío.");
  // Los merges que genera git ("Merge branch 'x'") son legítimos y no llevan prefijo.
  if (/^Merge (branch|remote-tracking branch|tag|pull request)\b/.test(subject)) return ok("GS-005");
  if (/^Revert "/.test(subject)) return ok("GS-005");
  if (!CONVENTIONAL_RE.test(subject)) {
    return fail(
      "GS-005",
      `el asunto no sigue conventional commits.\n` +
        `  Recibido: ${subject}\n` +
        `  Esperado: tipo(scope opcional): descripción — tipos: feat fix refactor test docs chore perf ci build style revert merge`
    );
  }
  if (subject.length > 100) {
    return fail("GS-005", `el asunto tiene ${subject.length} caracteres; máximo 100.`);
  }
  return ok("GS-005");
}

/** CORE-009 — prohibida la atribución de IA en la historia del repo. */
const AI_ATTRIBUTION_RE =
  /(co-authored-by:\s*(claude|anthropic)|generated with \[?claude|🤖\s*generated|assisted by claude)/i;

export function checkNoAiAttribution(rawMessage) {
  if (AI_ATTRIBUTION_RE.test(String(rawMessage || ""))) {
    return fail("CORE-009", "el mensaje incluye atribución de IA (Co-Authored-By / Generated with).");
  }
  return ok("CORE-009");
}

/**
 * ART-001 — naming de artefactos de run para archivos NUEVOS bajo docs/**.
 *
 * Aplica solo a archivos agregados (A/C/R): la regla habla de "todo archivo
 * nuevo generado por un agente bajo docs/**". Modificar un archivo existente
 * —incluidos los que el template distribuye con nombres legacy— no se bloquea.
 * Esa distinción es la que la capa PreToolUse no puede hacer, porque solo ve
 * una llamada a Write sin saber si el archivo ya existía en el índice.
 */
const ART001_PATTERN =
  /^(\d{4}-\d{2}-\d{2}-\d{3})-([A-Z]+)-(\d{3})-([a-z0-9]+(?:[.-][a-z0-9]+)*)\.([a-z0-9]{1,10})$/;

export function checkArtifactNaming(cwd = repoRoot(), env = process.env) {
  if (env.ASDD_ARTIFACT_NAME_GUARD_ENABLED === "false") return ok("ART-001");

  const merging = isMergeInProgress(cwd);

  const nuevos = stagedFiles(cwd)
    .filter((e) => ["A", "C", "R"].includes(e.status))
    .filter((e) => e.file.startsWith("docs/"))
    // .gitkeep y READMEs de estructura no son artefactos de run
    .filter((e) => !/(^|\/)(\.gitkeep|README\.md)$/.test(e.file))
    // la zona de ejemplos del template es material didáctico, no artefacto
    .filter((e) => !e.file.startsWith("docs/.example/"))
    // durante un merge, "added" contra HEAD no significa nuevo: si el archivo
    // ya existía en MERGE_HEAD, es historia legítima que trae el otro padre.
    .filter((e) => !(merging && mergeHeadHasPath(cwd, e.file)));

  if (nuevos.length === 0) return ok("ART-001");

  const run = activeRun(cwd);
  const malos = nuevos.filter((e) => !ART001_PATTERN.test(path.basename(e.file)));
  if (malos.length === 0) {
    if (!run) {
      return fail(
        "ART-001",
        `hay ${nuevos.length} artefacto(s) nuevo(s) bajo docs/ pero no hay run activo (.asdd-run.json).\n` +
          `  El nombre no puede validarse contra un run inexistente.`
      );
    }
    const mismatch = nuevos.filter((e) => {
      const m = path.basename(e.file).match(ART001_PATTERN);
      return m && m[1] !== run.run_id;
    });
    if (mismatch.length) {
      return fail(
        "ART-001",
        `run_id incorrecto en:\n${mismatch.map((e) => `    ${e.file}`).join("\n")}\n` +
          `  run activo: ${run.run_id}`
      );
    }
    return ok("ART-001");
  }

  const hint = run ? "" : " (además no hay run activo)";
  return fail(
    "ART-001",
    `estos archivos nuevos bajo docs/ no siguen {run_id}-{PHASE}-{SEQ}-{slug}.{ext}${hint}:\n` +
      malos.map((e) => `    ${e.file}`).join("\n") +
      `\n  Generá el nombre con: node .claude/scripts/asdd-artifact-name.mjs --phase {fase} --slug {descripcion}`
  );
}

/**
 * Integridad de las reglas normativas (referencias con hash declarado).
 *
 * Los hashes de `.asdd/rule-loading.json` solo se verificaban al correr
 * el validador del template a mano, y no hay CI. Si algo reescribe una regla,
 * nada lo detecta en el flujo normal. Este check corre antes del push, que es
 * el momento en que un cambio local pasa a afectar a otros.
 */
export function checkRuleIntegrity(cwd = repoRoot()) {
  const manifests = ["rule-loading.json", "coordinator-loading.json"];
  const drift = [];
  for (const name of manifests) {
    const p = path.join(cwd, ".asdd", name);
    if (!existsSync(p)) continue;
    let doc;
    try {
      doc = JSON.parse(readFileSync(p, "utf8"));
    } catch (error) {
      return fail("SYS-INTEGRITY", `${name} no es JSON válido: ${error.message}`);
    }
    for (const entry of doc.entries || []) {
      const declared = entry.reference_sha256 || entry.sha256;
      const target = entry.reference || entry.path;
      if (!declared || !target) continue;
      const abs = path.join(cwd, target);
      if (!existsSync(abs)) {
        drift.push(`${target} — declarado en ${name} y ausente en disco`);
        continue;
      }
      const raw = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
      const actual = createHash("sha256").update(raw).digest("hex");
      if (actual !== declared) drift.push(`${target} — hash distinto al declarado en ${name}`);
    }
  }
  if (drift.length === 0) return ok("SYS-INTEGRITY");
  return fail(
    "SYS-INTEGRITY",
    `la integridad de las reglas normativas no coincide con su manifiesto:\n` +
      drift.map((d) => `    ${d}`).join("\n") +
      `\n  Si el cambio es intencional: npm run hash:regen y volvé a commitear.`
  );
}

/** Rutas cuyo cambio altera el propio enforcement: se registran siempre. */
const ENFORCEMENT_PATHS = [
  ".claude/hooks/",
  ".claude/rules/",
  ".claude/references/rules/",
  ".claude/agents/",
  ".claude/settings.json",
  ".asdd/githooks/",
  ".asdd/rule-loading.json",
  ".asdd/coordinator-loading.json",
];

export function enforcementPathsTouched(cwd = repoRoot()) {
  return stagedFiles(cwd)
    .map((e) => e.file)
    .filter((f) => ENFORCEMENT_PATHS.some((p) => f.startsWith(p)));
}

export { ART001_PATTERN, CONVENTIONAL_RE, ENFORCEMENT_PATHS };
