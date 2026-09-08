// pre-push — GS-002 (historia inmutable), GS-008 (gate de validación) y
// verificación de integridad de las reglas normativas.
//
// Tres cosas que la capa PreToolUse no podía hacer:
//   1. Detectar un force push sin parsear flags: se compara el sha remoto con
//      el local y se pregunta a git si es ancestro. Un `--force` disfrazado en
//      un comando compuesto no cambia nada acá.
//   2. Atar el marcador GS-008 al commit que se está pusheando, para que un
//      marcador viejo no habilite un push nuevo.
//   3. Verificar los hashes de las reglas antes de que el cambio salga del
//      equipo, que es cuando pasa a afectar a otros.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { currentBranch, git, hatchActive, repoRoot } from "../lib/facts.mjs";
import { checkRuleIntegrity } from "../lib/checks.mjs";
import { apply, info } from "../lib/report.mjs";

const ZERO = /^0+$/;
const cwd = repoRoot();
const branch = currentBranch(cwd);
const env = process.env;

// Fuente unica de verdad de que cuenta como codigo fuente para GS-008. La capa
// PreToolUse (.claude/hooks/sofka-asdd-pre-push-gate.mjs) lee este MISMO archivo:
// antes cada capa tenia su lista hardcodeada y discrepaban sobre si un mismo push
// necesitaba marcador. El fallback embebido cubre el repo consumidor que todavia
// no tenga el manifiesto.
const SOURCE_EXTS_FALLBACK =
  "ts,tsx,js,jsx,mjs,cjs,py,go,java,kt,rb,rs,c,cc,cpp,h,hpp,cs,php,swift,scala,sql,sh,ps1,vue,svelte";

function manifestSourceExts() {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL("../../source-exts.json", import.meta.url), "utf8"),
    );
    if (Array.isArray(manifest?.source_extensions) && manifest.source_extensions.length > 0) {
      return manifest.source_extensions.join(",");
    }
  } catch {
    // Manifiesto ausente o ilegible: fallback embebido, nunca lista vacia.
  }
  return SOURCE_EXTS_FALLBACK;
}

const SOURCE_EXTS = String(
  env.SOFKA_ASDD_SOURCE_EXTS || manifestSourceExts()
)
  .split(",")
  .map((e) => e.trim().replace(/^\./, ""))
  .filter(Boolean);

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** Refs que se van a actualizar, ignorando borrados. */
function parseRefs(raw) {
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    })
    .filter((r) => r.localSha && !ZERO.test(r.localSha));
}

/** GS-002: si el remoto no es ancestro del local, el push reescribe historia. */
function checkNoForcePush(refs) {
  for (const r of refs) {
    if (!r.remoteSha || ZERO.test(r.remoteSha)) continue; // rama nueva
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", r.remoteSha, r.localSha], {
        cwd,
        stdio: "ignore",
        timeout: 15000,
      });
    } catch {
      return {
        ok: false,
        rule: "GS-002",
        message:
          `el push a ${r.remoteRef} no es fast-forward: reescribiría historia ya publicada.\n` +
          `  remoto ${r.remoteSha.slice(0, 8)} no es ancestro de local ${r.localSha.slice(0, 8)}.\n` +
          `  Sincronizá con merge (GS-007) en vez de forzar.`,
      };
    }
  }
  return { ok: true, rule: "GS-002", message: "" };
}

/** Archivos que cambian respecto de lo que el remoto ya tiene. */
function changedFiles(refs) {
  const out = new Set();
  for (const r of refs) {
    const range = r.remoteSha && !ZERO.test(r.remoteSha) ? `${r.remoteSha}..${r.localSha}` : r.localSha;
    const args = r.remoteSha && !ZERO.test(r.remoteSha)
      ? ["diff", "--name-only", range]
      : ["show", "--name-only", "--pretty=format:", r.localSha];
    const res = git(args, cwd);
    for (const f of String(res || "").split(/\r?\n/)) if (f.trim()) out.add(f.trim());
  }
  return [...out];
}

function isConfigOnly(files) {
  if (files.length === 0) return false;
  return files.every((f) => {
    const ext = path.extname(f).replace(/^\./, "").toLowerCase();
    return !SOURCE_EXTS.includes(ext);
  });
}

/** El comando de test declarado por el proyecto consumidor, si existe. */
function testCommand() {
  const p = path.join(cwd, ".sofka-asdd", "testing-capabilities.yaml");
  if (!existsSync(p)) return "";
  const raw = readFileSync(p, "utf8");
  // Extracción mínima de `testing.runner.command`, sin dependencia de YAML.
  const m = raw.match(/^\s*runner:\s*$[\s\S]*?^\s*command:\s*"?([^"\n#]*)"?/m);
  return (m && m[1] ? m[1] : "").trim();
}

/**
 * GS-008 — el marcador habilita el push, pero atado al commit.
 * Formato nuevo: JSON { ts, head }. Formato legado: timestamp Unix suelto.
 */
function checkPrePushMarker(refs) {
  const ttl = Number.parseInt(env.SOFKA_ASDD_PUSH_GATE_TTL || "600", 10) || 600;
  const marker = path.join(env.CLAUDE_PROJECT_DIR || cwd, ".claude", ".prepush-validated");
  if (!existsSync(marker)) {
    return {
      ok: false,
      rule: "GS-008",
      message:
        `no existe .claude/.prepush-validated: el push de código fuente exige validación previa.\n` +
        `  Ejecutá el gate: el skill sofka-asdd-tech-lead-pre-push corre build y tests y escribe el marcador.`,
    };
  }
  const raw = readFileSync(marker, "utf8").trim();
  let ts = null;
  let head = null;
  try {
    const doc = JSON.parse(raw);
    ts = Number.parseInt(doc.ts, 10);
    head = doc.head || null;
  } catch {
    ts = Number.parseInt(raw, 10);
  }
  if (!Number.isFinite(ts)) {
    return { ok: false, rule: "GS-008", message: "el marcador existe pero no tiene un timestamp legible." };
  }
  const edad = Math.floor(Date.now() / 1000) - ts;
  if (edad > ttl) {
    return {
      ok: false,
      rule: "GS-008",
      message: `el marcador está vencido (${edad}s > TTL ${ttl}s). Volvé a correr el gate pre-push.`,
    };
  }
  if (head) {
    const shas = refs.map((r) => r.localSha);
    if (!shas.some((s) => s.startsWith(head) || head.startsWith(s.slice(0, head.length)))) {
      return {
        ok: false,
        rule: "GS-008",
        message:
          `el marcador validó el commit ${head.slice(0, 8)} y estás pusheando ${shas
            .map((s) => s.slice(0, 8))
            .join(", ")}.\n  Volvé a correr el gate sobre el commit actual.`,
      };
    }
  } else {
    info("el marcador GS-008 usa el formato legado (solo timestamp): no puede atarse al commit. Considerá regenerarlo con { ts, head }.");
  }
  return { ok: true, rule: "GS-008", message: "" };
}

// ---- Ejecución --------------------------------------------------------------

const refs = parseRefs(readStdin());
if (refs.length === 0) process.exit(0); // solo borrados de rama remota

const checks = [checkNoForcePush(refs), checkRuleIntegrity(cwd)];
const files = changedFiles(refs);

if (isConfigOnly(files)) {
  info(`fast-track GS-008: los ${files.length} archivo(s) del push son configuración o documentación.`);
} else if (env.SOFKA_ASDD_PREPUSH_RUN_TESTS === "1") {
  const cmd = testCommand();
  if (!cmd) {
    checks.push({
      ok: false,
      rule: "GS-008",
      message:
        "SOFKA_ASDD_PREPUSH_RUN_TESTS=1 pero .sofka-asdd/testing-capabilities.yaml no declara testing.runner.command.",
    });
  } else {
    info(`corriendo la validación real del proyecto: ${cmd}`);
    try {
      execFileSync(cmd, { cwd, shell: true, stdio: "inherit", timeout: 1000 * 60 * 30 });
      checks.push({ ok: true, rule: "GS-008", message: "" });
    } catch {
      checks.push({ ok: false, rule: "GS-008", message: `la suite del proyecto falló: ${cmd}` });
    }
  }
} else {
  checks.push(checkPrePushMarker(refs));
}

apply("pre-push", branch, checks, {
  hatch: { active: hatchActive("SOFKA_ASDD_GUARD_PUSH_DISABLE"), varName: "SOFKA_ASDD_GUARD_PUSH_DISABLE" },
});
