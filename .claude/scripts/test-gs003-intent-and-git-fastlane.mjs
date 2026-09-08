#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Cobertura del desatasco del flujo git (commit / push / MR).
//
// Cuatro defectos que hacían que un pedido explícito del usuario no pudiera
// completarse en un turno:
//
//   F1  GS-003 era insatisfacible en el turno en que el usuario lo ordena: el
//       challenge no existe todavía y `classifyApprovalIntent` nunca clasifica
//       una orden imperativa como aprobación. Modo `intent`.
//   F2  La vía rápida git emitía el token con `commands: []` (ADR-020 §4) y
//       `assertAuthorizedOperation` trata ese arreglo como allow-list cerrada,
//       así que denegaba el propio `git commit` que venía a habilitar — sin
//       salida, porque `issueChallenge` tampoco admite declararlo (GS-003).
//   F4  El token era de uso único: la 2ª operación del mismo pedido moría en
//       `authorization-replay`, que el plan-gate convierte en DENY duro.
//   F5  El orquestador no podía emitir el challenge de commit sin comerse un
//       prompt de permisos, siendo el paso que la propia regla le manda.
// -----------------------------------------------------------------------------
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { issueIntentCommitPreauthorization } from "./lib/asdd-intent-commit-preauth-lib.mjs";
import { getOperationAuthorizationDecision } from "../hooks/asdd-plan-authorization-operation.mjs";
import { getOrchestratorGuardDecision } from "../hooks/asdd-orchestrator-guard.mjs";
import { getPlanGateDecision } from "../hooks/asdd-plan-gate.mjs";
import {
  AUTHORIZATIONS_PATH,
  CHALLENGE_PATH,
  PROJECT_ROOT,
  approveActiveChallenge,
  consumeLaunchAuthorization,
  issueChallenge,
} from "./lib/asdd-plan-authorization-lib.mjs";
import {
  DIRECT_LIGHT_AUTHORIZATION_PATH,
  clearDirectLightAuthorization,
  consumeDirectLightAuthorization,
  issueDirectLightAuthorization,
  releaseDirectLightAuthorization,
} from "./lib/asdd-direct-light-authorization-lib.mjs";
import {
  authorizationPath as COMMIT_AUTHORIZATION_PATH,
  challengePath as COMMIT_CHALLENGE_PATH,
  consumeCommitAuthorization,
  issueIntentCommitAuthorization,
  issueCommitChallenge,
} from "./lib/asdd-commit-authorization-lib.mjs";

let failures = 0;
const assert = (name, condition) => {
  if (condition) console.log(`✅ ${name}`);
  else { failures += 1; console.error(`❌ ${name}`); }
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const paths = [
  CHALLENGE_PATH, AUTHORIZATIONS_PATH, DIRECT_LIGHT_AUTHORIZATION_PATH,
  COMMIT_CHALLENGE_PATH, COMMIT_AUTHORIZATION_PATH,
];
const backup = new Map(paths.map((p) => [p, existsSync(p) ? readFileSync(p, "utf8") : null]));
const clean = () => { for (const p of paths) rmSync(p, { force: true }); };

// El resultado NO puede depender de en qué fase esté el `.asdd-run.json` del
// repositorio: `issueDirectLightAuthorization` deriva `token.phase` de
// `activeRunScope()`, que lo lee del disco, y los marcadores ASDD-BUDGET de esta
// suite declaran `phase=build`. Con el run visible, cualquier suite anterior que
// mueva la fase rompe esta por un motivo ajeno a lo que prueba. Se oculta el run
// mientras corre: sin él, `activeRunScope()` devuelve null y la lib cae a su
// propio default "build". Mismo aislamiento que test-direct-light-authorization.
const RUN_STATE_PATH = resolve(PROJECT_ROOT, ".asdd-run.json");
const runStateBackup = existsSync(RUN_STATE_PATH) ? readFileSync(RUN_STATE_PATH, "utf8") : null;
rmSync(RUN_STATE_PATH, { force: true });

const AGENT = "asdd-tech-lead";
const BRANCH = "fix/suite-gs003-intent";

const currentBranchName = () => execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}).trim();

const gitOpsRoute = {
  depth: "LIGHT", risk: "low", confidence: 0.93,
  requires_plan: false, requires_confirmation: false,
  reasons: ["git_operation"], fast_lane: "git_ops",
};

// Lote mínimo válido con `commands: []`, exactamente la forma que produce la
// vía rápida git.
const gitPlan = {
  request_id: "gs003-intent-suite",
  task: "git operation fast lane",
  budget_policy_version: 1,
  route: "LIGHT", phase: "build", risk: "low", confidence: 0.93, max_concurrent: 1,
  agents: [{
    agent: AGENT,
    capability: "asdd-tech-lead-commit",
    scope: [], commands: [],
    model: "sonnet", max_turns: 20, retries: 0,
  }],
};

const operation = (command) => ({
  tool_name: "Bash",
  tool_input: { command },
  agent_id: "runtime-agent-gs003",
  agent_type: AGENT,
});

/** Deja una autorización viva, con lanzamiento consumido y capability cargada. */
function grantGitOpsAuthorization({ fastLane = "git_ops" } = {}) {
  clean();
  issueChallenge(gitPlan);
  approveActiveChallenge();
  // El sello viaja en la MISMA escritura que consume el lanzamiento: sellarlo
  // aparte costaba un segundo rename sobre authorizations.json y en Windows eso
  // da EPERM (lo detectó test-runtime-efficiency-consumer-e2e).
  consumeLaunchAuthorization(AGENT, new Date(), { fastLane });
  // El agente carga su capability aprobada, como exige el propio hook.
  getOperationAuthorizationDecision(
    operation("node .claude/scripts/asdd-load-capability.mjs asdd-tech-lead-commit"),
  );
}

try {
  // --- F1: GS-003 modo intent ------------------------------------------------
  console.log("\nF1: la orden explícita del usuario ES la autorización");
  clean();
  assert("sin autorización, un commit no pasa",
    throws(() => consumeCommitAuthorization({ branch: BRANCH, command: 'git commit -m "x"' })));

  const intent = issueIntentCommitAuthorization({ branch: BRANCH, prompt: "commiteá y pusheá" });
  assert("la pre-autorización nace aprobada, sin challenge intermedio",
    intent.scope === "intent" && intent.approved_by === "user-prompt-intent" && intent.used_at === null);
  assert("no deja un challenge pendiente que otra cosa pueda aprobar",
    !existsSync(COMMIT_CHALLENGE_PATH));
  assert("guarda el prompt hasheado como evidencia, no en claro",
    typeof intent.prompt_hash === "string" && intent.prompt_hash.length === 64);

  assert("el commit en la rama ordenada pasa en el MISMO turno",
    !throws(() => consumeCommitAuthorization({ branch: BRANCH, command: 'git commit -m "x"' })));
  assert("y es de uso único: el segundo commit ya no pasa",
    throws(() => consumeCommitAuthorization({ branch: BRANCH, command: 'git commit -m "y"' })));

  clean();
  issueIntentCommitAuthorization({ branch: BRANCH, prompt: "commiteá" });
  assert("no sirve para OTRA rama",
    throws(() => consumeCommitAuthorization({ branch: "fix/otra", command: 'git commit -m "x"' })));
  assert("no sirve para un comando que no es git commit",
    throws(() => consumeCommitAuthorization({ branch: BRANCH, command: "git push origin HEAD" })));

  clean();
  const vencida = issueIntentCommitAuthorization(
    { branch: BRANCH, prompt: "commiteá" },
    new Date(Date.now() - 3600_000),
  );
  assert("vence por TTL", vencida.scope === "intent"
    && throws(() => consumeCommitAuthorization({ branch: BRANCH, command: 'git commit -m "x"' })));

  assert("una rama vacía nunca produce autorización",
    throws(() => issueIntentCommitAuthorization({ branch: "", prompt: "commiteá" })));

  console.log("\nF1-bis: qué turnos merecen pre-autorización y cuáles no");
  const preauth = (prompt, route = gitOpsRoute) => {
    clean();
    return issueIntentCommitPreauthorization({ prompt, route });
  };
  assert("una orden de commit del usuario la merece",
    preauth("commitea y pushea los cambios") !== null);
  assert("un turno que la máquina se inyecta a sí misma NO",
    preauth("<task-notification> el agente commitea los cambios") === null);
  assert("mencionar git sin ordenar commitear NO",
    preauth("subí la rama al remoto") === null);
  assert("una ruta que no es la vía rápida git NO",
    preauth("commitea los cambios", { ...gitOpsRoute, fast_lane: null }) === null);
  assert("preguntar por commits NO es ordenarlos",
    preauth("¿cuántos commits tiene la rama?") === null);

  const protegidas = process.env.ASDD_PROTECTED_BRANCHES;
  try {
    // La rama real de la suite pasa a ser "protegida" para el guard.
    process.env.ASDD_PROTECTED_BRANCHES = currentBranchName();
    assert("en una rama protegida NO se pre-autoriza (manda GS-001)",
      preauth("commitea los cambios") === null);
  } finally {
    if (protegidas === undefined) delete process.env.ASDD_PROTECTED_BRANCHES;
    else process.env.ASDD_PROTECTED_BRANCHES = protegidas;
  }

  console.log("\nF1-ter: el modo `command` clásico no cambia");
  clean();
  issueCommitChallenge({ branch: BRANCH, command: 'git commit -m "z"' });
  assert("un challenge sin aprobar sigue sin autorizar nada",
    throws(() => consumeCommitAuthorization({ branch: BRANCH, command: 'git commit -m "z"' })));

  // --- F2: la vía rápida deja de bloquear el comando que habilita ------------
  console.log("\nF2: fast_lane git_ops desbloquea el comando, sin abrir la puerta");
  grantGitOpsAuthorization({ fastLane: null });
  assert("SIN el sello, `git commit` muere en command-mismatch (el deadlock)",
    getOperationAuthorizationDecision(operation('git commit -m "x"'))?.decision === "deny");

  grantGitOpsAuthorization();
  for (const cmd of ['git commit -m "x"', "git push -u origin HEAD", "git add src/a.ts",
    "glab mr create --source-branch x", "gh pr create --base dev"]) {
    assert(`con el sello pasa: ${cmd.slice(0, 34)}`,
      getOperationAuthorizationDecision(operation(cmd)) === null);
  }

  for (const cmd of ["git push --force origin HEAD", "git push --force-with-lease origin HEAD",
    "git reset --hard HEAD~3", 'git commit --no-verify -m "x"', "git push origin --delete rama",
    "git branch -D otra", "git filter-branch --all", "git checkout -- .",
    "git checkout .", "git restore src/a.ts"]) {
    assert(`sigue denegado: ${cmd.slice(0, 34)}`,
      getOperationAuthorizationDecision(operation(cmd))?.decision === "deny");
  }

  // Agujero preexistente que esta suite destapó: `SAFE_GIT_READ_RE` aceptaba
  // cualquier `git branch`, así que el borrado forzado de ramas pasaba como
  // lectura para CUALQUIER subagente bajo CUALQUIER lote — sin vía rápida y
  // contra lo que manda GS-010.
  console.log("\nF2-bis: `git branch` mutante ya no pasa como lectura");
  grantGitOpsAuthorization({ fastLane: null });
  for (const cmd of ["git branch -D otra", "git branch -d otra", "git branch -m viejo nuevo",
    "git branch --delete otra", "git branch --set-upstream-to=origin/dev"]) {
    assert(`mutación denegada sin declararla: ${cmd.slice(0, 32)}`,
      getOperationAuthorizationDecision(operation(cmd))?.decision === "deny");
  }
  for (const cmd of ["git branch", "git branch -a", "git branch --list", "git branch -r"]) {
    assert(`consulta sigue permitida: ${cmd}`,
      getOperationAuthorizationDecision(operation(cmd)) === null);
  }
  assert("un comando NO git tampoco entra por la vía rápida",
    getOperationAuthorizationDecision(
      operation("node .claude/scripts/asdd-resolve-workspace.mjs"),
    )?.decision === "deny");

  // --- F4: cupo por pedido ---------------------------------------------------
  console.log("\nF4: un pedido con varias operaciones alcanza para todas");
  clean();
  const tres = issueDirectLightAuthorization({
    prompt: "commitea, pushea y crea el MR", route: gitOpsRoute,
  });
  assert("tres operaciones pedidas → cupo 3", tres?.max_uses === 3);
  assert("TTL de la vía git = 900 s, no 300",
    Math.round((Date.parse(tres.expires_at) - Date.parse(tres.issued_at)) / 1000) === 900);

  const uno = issueDirectLightAuthorization({ prompt: "commiteá", route: gitOpsRoute });
  assert("una sola operación pedida → cupo 1", uno?.max_uses === 1);

  const cuatro = issueDirectLightAuthorization({
    prompt: "commitea, pushea, crea el MR y mergea", route: gitOpsRoute,
  });
  assert("el cupo nunca pasa de 3", cuatro?.max_uses === 3);

  console.log("\nF4-bis: el cupo se consume de a uno y el token sobrevive");
  clean();
  issueDirectLightAuthorization({ prompt: "commitea, pushea y crea el MR", route: gitOpsRoute });
  const launch = {
    agent: AGENT,
    toolInput: {
      model: "sonnet",
      prompt: "[ASDD-BUDGET route=LIGHT phase=build model=sonnet max_turns=20 retries=0]\n"
        + "node .claude/scripts/asdd-load-capability.mjs asdd-tech-lead-commit",
    },
  };
  const usos = [];
  for (let i = 0; i < 4; i += 1) {
    const consumed = consumeDirectLightAuthorization(launch);
    usos.push(Boolean(consumed));
    if (consumed) {
      assert(`uso ${i + 1} propaga fast_lane al plan`, consumed.fast_lane === "git_ops");
      releaseDirectLightAuthorization();
    }
  }
  assert("los 3 lanzamientos del pedido pasan y el 4º no",
    usos[0] && usos[1] && usos[2] && !usos[3]);
  assert("agotado el cupo, el token se libera del disco",
    !existsSync(DIRECT_LIGHT_AUTHORIZATION_PATH));

  clean();
  issueDirectLightAuthorization({ prompt: "commiteá", route: gitOpsRoute });
  consumeDirectLightAuthorization(launch);
  releaseDirectLightAuthorization();
  assert("con cupo 1 se libera en el primer uso (sin regresión)",
    !existsSync(DIRECT_LIGHT_AUTHORIZATION_PATH));

  console.log("\nF4-ter: los 3 lanzamientos pasan por el plan-gate REAL");
  // `LIGHT.max_agents = 1` no es obstáculo, y por eso el presupuesto no se
  // toca: cada lanzamiento sintetiza su propio lote de UN agente. Lo que fallaba
  // era el token de uso único, no el techo de agentes. Este caso lo fija: si
  // alguien "arregla" el presupuesto en vez del token, esta prueba lo delata.
  clean();
  issueDirectLightAuthorization({ prompt: "commitea, pushea y crea el MR", route: gitOpsRoute });
  const lanzar = (skill) => getPlanGateDecision({
    tool_name: "Agent",
    tool_input: {
      subagent_type: AGENT, model: "sonnet",
      prompt: "[ASDD-BUDGET route=LIGHT phase=build model=sonnet max_turns=20 retries=0]\n"
        + `node .claude/scripts/asdd-load-capability.mjs asdd-tech-lead-${skill}`,
    },
  });
  assert("commit, pre-push y create-mr se lanzan en el mismo turno",
    ["commit", "pre-push", "create-mr"].every((skill) => lanzar(skill) === null));
  assert("un cuarto lanzamiento ya no entra", lanzar("gitflow")?.decision === "deny");

  // --- F5: el challenge de commit no cuesta un prompt de permisos -----------
  //
  // El objetivo de F5 lo absorbió el refactor de control-plane que entró por
  // `dev` (5113932, «clasificar por plano en vez de por sintaxis»): en vez de
  // una función más en el guard, `issue` es una entrada del manifiesto
  // CONTROL_PLANE. Esta sección deja de probar código propio y pasa a fijar el
  // contrato que ese manifiesto le da a GS-003 — que es lo que le importa al
  // flujo git, venga de donde venga la implementación.
  console.log("\nF5: el orquestador puede emitir el challenge que la regla le manda");
  const guard = (command) => getOrchestratorGuardDecision(
    { tool_name: "Bash", tool_input: { command }, cwd: process.cwd() }, {},
  );
  const commitAuth = (sub) => `node .claude/scripts/asdd-commit-authorization.mjs ${sub}`;

  assert("`issue` se permite — es el paso que GS-003 le manda al orquestador",
    guard(commitAuth("issue")) === null);
  // Más estricto que la versión que este trabajo había propuesto: `deny` en vez
  // de `ask`, y `issue-worktree` tampoco pasa desde el hilo principal
  // («GS-003: solo `issue` desde el orquestador», manifiesto de control-plane).
  for (const sub of ["approve", "status", "--help", "issue-worktree"]) {
    assert(`\`${sub}\` se deniega`, guard(commitAuth(sub))?.decision === "deny");
  }
  assert("no sirve de vehículo para sustitución de comandos",
    guard(`${commitAuth("issue")} $(whoami)`)?.decision === "deny");
  // La clasificación es POR SEGMENTO: encadenar algo peligroso se deniega por
  // el segmento peligroso, no por el hecho de encadenar.
  for (const cola of ["rm -rf /tmp/x", 'git commit -m "x"', "npm publish",
    "node .claude/scripts/asdd-regen-hashes.mjs"]) {
    assert(`encadenar \`${cola.slice(0, 22)}\` se deniega`,
      guard(`${commitAuth("issue")} && ${cola}`)?.decision === "deny");
  }
  assert("encadenar una lectura pura sí pasa (el orquestador puede leer)",
    guard(`${commitAuth("issue")} && cat README.md`) === null);
} finally {
  clearDirectLightAuthorization();
  clean();
  for (const [p, content] of backup) {
    if (content !== null) {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
    }
  }
  if (runStateBackup !== null) writeFileSync(RUN_STATE_PATH, runStateBackup);
}

if (failures) process.exit(1);
console.log("\nGS-003 intent + vía rápida git: OK");
