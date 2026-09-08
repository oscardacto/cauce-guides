#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getPlanGateDecision } from "../hooks/asdd-plan-gate.mjs";
import { getOperationAuthorizationDecision } from "../hooks/asdd-plan-authorization-operation.mjs";
import {
  AUTHORIZATIONS_PATH,
  CHALLENGE_PATH,
  PROJECT_ROOT,
} from "./lib/asdd-plan-authorization-lib.mjs";
import {
  DIRECT_LIGHT_AUTHORIZATION_PATH,
  clearDirectLightAuthorization,
  issueDirectLightAuthorization,
} from "./lib/asdd-direct-light-authorization-lib.mjs";

let failures = 0;
const assert = (name, condition) => {
  if (condition) console.log(`✅ ${name}`);
  else { failures += 1; console.error(`❌ ${name}`); }
};

const paths = [CHALLENGE_PATH, AUTHORIZATIONS_PATH, DIRECT_LIGHT_AUTHORIZATION_PATH];
const backup = new Map(paths.map((path) => [path, existsSync(path) ? readFileSync(path, "utf8") : null]));
const fixture = resolve(PROJECT_ROOT, ".claude", ".runtime", "direct-light-test.md");

// El resultado de esta suite NO debe depender de en qué fase esté el
// .asdd-run.json activo del repositorio (ver docs/testing/...preexisting-test
// -suite-defects.md, hallazgo A). issueDirectLightAuthorization deriva
// token.phase de `activeRunScope()`, que lee ese archivo del disco real.
// Aislamos la suite ocultando temporalmente el run activo: sin él,
// activeRunScope() retorna null y la lib cae a su propio default `"build"`
// (ver asdd-direct-light-authorization-lib.mjs), que resuelve a
// model=sonnet por asdd.lock.model_strategy.phase_default — el mismo
// modelo que esta suite declara en su marcador de budget. Así la suite queda
// determinista sin importar la fase del run de trabajo de otra persona, y sin
// tocar la lib bajo prueba.
const RUN_STATE_PATH = resolve(PROJECT_ROOT, ".asdd-run.json");
const runStateBackup = existsSync(RUN_STATE_PATH) ? readFileSync(RUN_STATE_PATH, "utf8") : null;

function cleanRuntime() {
  for (const path of paths) rmSync(path, { force: true });
}

try {
  rmSync(RUN_STATE_PATH, { force: true });
  cleanRuntime();
  mkdirSync(dirname(fixture), { recursive: true });
  writeFileSync(fixture, "fixture\n");
  const scope = ".claude/.runtime/direct-light-test.md";
  const route = {
    depth: "LIGHT",
    risk: "low",
    confidence: 0.9,
    requires_plan: false,
    requires_confirmation: false,
    reasons: ["atomic_scoped_change"],
  };
  const token = issueDirectLightAuthorization({ prompt: `corrige ${scope}`, route }, new Date("2026-07-20T10:00:00Z"));
  assert("LIGHT atómico crea token de scope exacto", token?.scope?.[0] === scope);

  const launch = {
    tool_name: "Agent",
    tool_input: {
      subagent_type: "asdd-producto",
      model: "sonnet",
      prompt: [
        `[ASDD-BUDGET route=LIGHT phase=${token.phase} model=sonnet max_turns=10 retries=0]`,
        "node .claude/scripts/asdd-load-capability.mjs asdd-producto-pm",
        scope,
      ].join("\n"),
    },
  };
  const launchDecision = getPlanGateDecision(launch, new Date("2026-07-20T10:00:01Z"));
  assert("Agent LIGHT atómico se autoautoriza sin challenge/ok", launchDecision === null);
  assert("challenge sintético se consume inmediatamente", !existsSync(CHALLENGE_PATH));
  assert("token directo es de uso único", !existsSync(DIRECT_LIGHT_AUTHORIZATION_PATH));

  const absoluteLoader = `node ${PROJECT_ROOT}/.claude/scripts/asdd-load-capability.mjs asdd-producto-pm`;
  const loaderDecision = getOperationAuthorizationDecision({
    tool_name: "Bash",
    tool_input: { command: absoluteLoader },
    agent_id: "agent-direct-light",
    agent_type: "asdd-producto",
  }, process.env, { now: new Date("2026-07-20T10:00:02Z") });
  assert("loader absoluto del proyecto equivale al loader relativo", loaderDecision === null);

  const editDecision = getOperationAuthorizationDecision({
    tool_name: "Edit",
    tool_input: { file_path: fixture },
    agent_id: "agent-direct-light",
    agent_type: "asdd-producto",
  }, process.env, { now: new Date("2026-07-20T10:00:03Z") });
  assert("Edit queda limitado al archivo exacto del prompt", editDecision === null);

  const outsideDecision = getOperationAuthorizationDecision({
    tool_name: "Edit",
    tool_input: { file_path: resolve(PROJECT_ROOT, "README.md") },
    agent_id: "agent-direct-light",
    agent_type: "asdd-producto",
  }, process.env, { now: new Date("2026-07-20T10:00:04Z") });
  assert("Edit fuera del scope directo se deniega", outsideDecision?.decision === "deny");

  issueDirectLightAuthorization({ prompt: `corrige ${scope}`, route }, new Date("2026-07-20T10:01:00Z"));
  issueDirectLightAuthorization({
    prompt: "explica el estado",
    route: { depth: "TRIVIAL", risk: "low", reasons: ["read_only_query"] },
  }, new Date("2026-07-20T10:01:01Z"));
  assert("un prompt posterior invalida el token LIGHT anterior", !existsSync(DIRECT_LIGHT_AUTHORIZATION_PATH));

  // ORC-010-F — operaciones git. El token habilita SOLO el lanzamiento: sin
  // scope no autoriza ni un Write, y los comandos git siguen bajo GS-003/008/009.
  cleanRuntime();
  const gitToken = issueDirectLightAuthorization({
    prompt: "hacé commit de los cambios",
    route: { depth: "LIGHT", risk: "low", confidence: 0.93, requires_plan: false, requires_confirmation: false, reasons: ["git_operation"], fast_lane: "git_ops" },
  }, new Date("2026-07-20T10:02:00Z"));
  assert("operación git crea token sin scope", Array.isArray(gitToken?.scope) && gitToken.scope.length === 0);
  assert("operación git no declara comandos en el token", gitToken?.fast_lane === "git_ops");

  const gitLaunch = getPlanGateDecision({
    tool_name: "Agent",
    tool_input: {
      subagent_type: "asdd-tech-lead",
      model: "sonnet",
      prompt: [
        `[ASDD-BUDGET route=LIGHT phase=${gitToken.phase} model=sonnet max_turns=10 retries=0]`,
        "node .claude/scripts/asdd-load-capability.mjs asdd-tech-lead-commit",
      ].join("\n"),
    },
  }, new Date("2026-07-20T10:02:01Z"));
  assert("Agent de operación git no dispara plan-gate", gitLaunch === null);

  const gitWrite = getOperationAuthorizationDecision({
    tool_name: "Edit",
    tool_input: { file_path: resolve(PROJECT_ROOT, "README.md") },
    agent_id: "agent-git-ops",
    agent_type: "asdd-tech-lead",
  }, process.env, { now: new Date("2026-07-20T10:02:02Z") });
  assert("token git no autoriza escrituras", gitWrite?.decision === "deny");

  // Mover/renombrar declara un destino que todavía no existe: sin admitirlo, la
  // operación moría en el hook de autorización.
  cleanRuntime();
  const moveToken = issueDirectLightAuthorization({
    prompt: `mové ${scope} a .claude/.runtime/direct-light-moved.md`,
    route: { ...route, fast_lane: "atomic" },
  }, new Date("2026-07-20T10:03:00Z"));
  assert("mover autoriza origen y destino", moveToken?.scope?.length === 2
    && moveToken.scope.includes(scope)
    && moveToken.scope.includes(".claude/.runtime/direct-light-moved.md"));

  cleanRuntime();
  const deepToken = issueDirectLightAuthorization({
    prompt: "mové el archivo a carpeta/inexistente/profunda/x.md",
    route: { ...route, fast_lane: "atomic" },
  }, new Date("2026-07-20T10:03:01Z"));
  assert("destino con carpeta inexistente falla cerrado", deepToken === null);

  cleanRuntime();
  const wideToken = issueDirectLightAuthorization({
    prompt: "actualizá docs/a.md docs/b.md docs/c.md docs/d.md",
    route: { ...route, fast_lane: "atomic" },
  }, new Date("2026-07-20T10:03:02Z"));
  assert("más de 3 scopes no entra en vía rápida", wideToken === null);

  // B16 — el fallback al artefacto del run solo es observable con un run ACTIVO.
  // El aislamiento de la cabecera de esta suite lo borra a propósito; este bloque
  // instala uno propio, acotado, y lo desmonta al terminar.
  cleanRuntime();
  const b16Spec = resolve(PROJECT_ROOT, "docs", "specs", "b16-spec-del-run.md");
  mkdirSync(dirname(b16Spec), { recursive: true });
  writeFileSync(b16Spec, "# spec del run activo\n");
  writeFileSync(RUN_STATE_PATH, JSON.stringify({
    current_phase: "build",
    phases: { build: { artifacts: ["docs/specs/b16-spec-del-run.md"] } },
  }));
  const b16 = (prompt) => {
    clearDirectLightAuthorization();
    return issueDirectLightAuthorization({ prompt, route: { ...route, fast_lane: "atomic" } });
  };
  try {
    assert("archivo de raíz CLAUDE.md se resuelve como scope exacto",
      b16("actualizá CLAUDE.md")?.scope?.[0] === "CLAUDE.md");
    assert("archivo de raíz package.json se resuelve como scope exacto",
      b16("corregí package.json")?.scope?.[0] === "package.json");
    assert("ruta nombrada inexistente NO hereda el artefacto del run",
      b16("editá docs/no-existe-jamas/archivo.md") === null);
    assert("un número de versión NO se lee como ruta y no mata la vía rápida",
      b16("subí la versión a 4.0.0")?.scope?.[0] === "docs/specs/b16-spec-del-run.md");
    assert("prompt sin rutas sigue heredando el artefacto del run",
      b16("seguí con lo que estabas")?.scope?.[0] === "docs/specs/b16-spec-del-run.md");
    assert("ruta anidada existente sigue resolviendo",
      b16("editá .claude/hooks/asdd-plan-gate.mjs")?.scope?.[0]
        === ".claude/hooks/asdd-plan-gate.mjs");

    // ── Los negativos que P1(b) existe para cerrar ────────────────────────
    // Un token con punto, sin directorio y que no existe es PROSA. No puede
    // volverse scope (autorizaría crear un archivo en la raíz) ni contar como
    // mención (mataría la vía rápida). Los tres primeros disparan además la rama
    // creatable, porque `copy`, `borrá` y `renombrá` están en FILE_OP.
    const prosaConPunto = [
      "cambiá el copy de la home, dice claude.ai",
      "borrá Node.js del readme",
      "renombrá la variable Foo.bar en el hook",
      "usá Node.js en el script y arreglá el bug",
      "el error dice Error.captureStackTrace, arreglalo",
    ];
    for (const prompt of prosaConPunto) {
      const token = b16(prompt);
      assert(`prosa con punto no autoriza crear en la raíz: ${prompt}`,
        token !== null && token.scope.length === 1
          && token.scope[0] === "docs/specs/b16-spec-del-run.md");
    }

    // Y el destino a crear de verdad —con carpeta— sigue funcionando.
    assert("destino a crear CON directorio sí entra como scope",
      (() => {
        const token = b16("mové docs/specs/b16-spec-del-run.md docs/specs/b16-nueva.md");
        return token !== null
          && token.scope.includes("docs/specs/b16-spec-del-run.md")
          && token.scope.includes("docs/specs/b16-nueva.md");
      })());
  } finally {
    clearDirectLightAuthorization();
    rmSync(b16Spec, { force: true });
    rmSync(RUN_STATE_PATH, { force: true });
  }
} finally {
  rmSync(fixture, { force: true });
  cleanRuntime();
  for (const [path, content] of backup) {
    if (content !== null) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
  }
  if (runStateBackup !== null) {
    mkdirSync(dirname(RUN_STATE_PATH), { recursive: true });
    writeFileSync(RUN_STATE_PATH, runStateBackup);
  } else {
    rmSync(RUN_STATE_PATH, { force: true });
  }
}

if (failures) process.exit(1);
console.log("\nDirect LIGHT authorization: OK");
