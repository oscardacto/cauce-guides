#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/sofka-asdd-user-prompt-submit.mjs
//
// Hook UserPromptSubmit: inyección MECÁNICA de delegación obligatoria (#3577) +
// confirmación de challenge estructurado ORC-010 (#3607).
//
// La causa raíz de los bugs de Javier (ORC-000 #3577) es que el enforcement de
// delegación vivía SOLO como regla en el prompt y el modelo NO infería las
// señales (Figma → ui, datos/arquitectura → solution-architect). Reforzar texto
// no alcanza. Este hook escanea el prompt del usuario por REGEX y, ante una
// señal, inyecta un system-reminder IMPERATIVO que NOMBRA LITERALMENTE al agente
// que el orquestador DEBE invocar — sin depender de inferencia del modelo.
//
// G.1 — Intención de respuesta al plan ORC-010 / ORC-010-E:
// La respuesta del usuario se clasifica con `sofka-asdd-approval-intent-lib`,
// que reconoce por RAÍZ morfológica en vez de por una lista cerrada de
// palabras. Cuatro salidas:
//   - approval     → confirma el challenge activo y genera las autorizaciones.
//   - rejection    → revoca el challenge; no queda un plan pendiente vivo.
//   - modification → marca el challenge como enmendado. NO rehace la ceremonia:
//                    si la corrección no cambia agentes/scope/comandos/budget,
//                    el orquestador ejecuta el lote original con `amend`.
//   - none         → sin efecto, salvo que el turno quede `eligible` (cola
//                    larga: "joya", "va") y el orquestador lo resuelva con
//                    `approve --challenge-id`.
// Una afirmación fuera de contexto no crea ni renueva autoridad.
//
// stdin  → JSON del evento UserPromptSubmit ({ prompt, ... }).
// stdout → texto plano; Claude Code lo inyecta como <system-reminder> en el
//          contexto ANTES de que el modelo procese el prompt del usuario.
//
// Escape hatch delegación: SOFKA_ASDD_DELEGATION_INJECT_DISABLE=1
// -----------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { routeRequest, GIT_OPS_RE, isAutomatedTurn } from "../scripts/lib/sofka-asdd-proportional-router-lib.mjs";
import { issueDirectLightAuthorization } from "../scripts/lib/sofka-asdd-direct-light-authorization-lib.mjs";
import { issueIntentCommitPreauthorization } from "../scripts/lib/sofka-asdd-intent-commit-preauth-lib.mjs";
import { classifyApprovalIntent } from "../scripts/lib/sofka-asdd-approval-intent-lib.mjs";


// --- Señales → agente obligatorio (regex, case-insensitive) ------------------
// Figma: solo las URLs reales de diseño/archivo (figma.com/design|file) o
// menciones explícitas de diseño Figma.
const FIGMA_RE = /figma\.com\/(design|file)\/|\bfigma\b.*\b(dise[ñn]o|mockup|prototipo|file|frame)\b|\b(dise[ñn]o|mockup|prototipo)\b.*\bfigma\b/i;

// Datos / arquitectura (PR2 — Capa 2 ADR-002): la regex original (DATA_ARCH_RE)
// forzaba siempre sofka-asdd-solution-architect ante señales de datos —
// mis-routeaba prompts de plataforma de datos analíticos (data lake, Medallion,
// Databricks) al architect de software. Se separa en 2 regex + rama de
// desambiguación cuando ambas matchean (ver ADR-002, .claude/docs/adoption/smart-data-integration-plan.md §B.2).

// Señales inequívocas de dominio DATOS (Medallion, lakehouse, plataforma analítica).
// "base de datos" queda deliberadamente FUERA — es señal de SOFTWARE_ARCH_RE
// (todo backend transaccional tiene BD; no es señal de plataforma analítica).
const DATA_DOMAIN_RE = /\bdata\s*warehouse\b|\bdata\s*lake\b|\blakehouse\b|\bmedallion\b|\bdatabricks\b|\b(bronze|silver|gold)\s+(layer|tier|capa)\b|\bunity\s*catalog\b|\bauto\s*loader\b|\bbigquery\b|\bsnowflake\b|\bredshift\b|\bglue\b|\bathena\b|\betl\b|\belt\b|\bpipeline de datos\b|\bstar\s*schema\b|\bhechos y dimensiones\b/i;

// Señales de ARQUITECTURA DE SOFTWARE (aplicación transaccional con persistencia).
// "backend" aislado es demasiado genérico: aparece en cambios de runtime,
// tests y routing sin que exista una decisión arquitectónica. Se conservan
// señales concretas (API, contrato, dominio, integración, persistencia).
const SOFTWARE_ARCH_RE = /\bmicroservicios?\b|\bnueva api\b|\bcontrato api\b|\bapi\s*rest\b|\bm[oó]dulo transaccional\b|\bCRUD\b|\bmodelo de dominio\b|\bintegraci[oó]n de sistemas\b|\bescalabilidad\b|\bbase de datos\b|\b(stack|tecnolog[ií]a)\b/i;

export function getDomainRouting(prompt) {
  const text = String(prompt ?? "");
  return { isData: DATA_DOMAIN_RE.test(text), isSoftware: SOFTWARE_ARCH_RE.test(text) };
}

// Cambios en autorizaciones, permisos o aprobaciones son seguridad por
// definición. Exigimos plan FULL antes incluso de explorar: una lectura amplia
// del flujo puede convertirse en investigación no acotada y consumir contexto.
const CHANGE_VERB_RE = /\b(corrige|corregir|implementa|implementar|cambia|cambiar|modifica|modificar|endurece|endurecer|asegura|asegurar)\b/i;
// No basta con una mención aislada de "aprobación": las ceremonias ORC-010
// piden aprobación de un plan y no son, por sí mismas, cambios de seguridad.
// Exigimos una señal de control de acceso o una aprobación/autorización ligada
// a la posibilidad de autorizar acciones, agentes, alcance o comandos.
const ACCESS_CONTROL_RE = /\b(permissions?|permisos?|privilegios?|roles?|acceso|comandos?\s+autorizados?|plan-authorization|challenge)\b/i;
const AUTHORIZATION_RISK_RE = /\b(aprobaci[oó]n|autorizaci[oó]n)\b[\s\S]{0,100}\b(autoriza|autorice|autorizar|acciones?|agentes?|alcance|scope|comandos?|reutili[sz]|token|challenge|binding|lote)\b|\b(autoriza|autorice|autorizar|acciones?|agentes?|alcance|scope|comandos?|reutili[sz]|token|challenge|binding|lote)\b[\s\S]{0,100}\b(aprobaci[oó]n|autorizaci[oó]n)\b/i;

// El núcleo completo ya se entrega en SessionStart (incluido post-compact).
// UserPromptSubmit solo lo repite ante una recuperación explícita para no
// pagar el mismo contexto en cada turno normal (ADR-017 / B4).
const ORC_RECOVERY_RE = /\b(reinyecta|reinyectar|recupera|recuperar|restaura|restaurar|repite|repetir)\b[\s\S]{0,80}\b(n[uú]cleo\s+orc|reglas?\s+orc|contexto\s+orc)\b|\b(n[uú]cleo\s+orc|reglas?\s+orc|contexto\s+orc)\b[\s\S]{0,80}\b(reinyecta|recupera|restaura|repite)\b/i;

export function isAuthorizationSecurityChange(prompt) {
  const text = String(prompt ?? "");
  return CHANGE_VERB_RE.test(text) && (ACCESS_CONTROL_RE.test(text) || AUTHORIZATION_RISK_RE.test(text));
}

export function getPromptInjectionProfile(prompt, {
  planAuthorizationConsumed = false,
  planIntent = "none",
  approvalEligible = false,
  route = null,
} = {}) {
  const text = String(prompt ?? "").slice(0, 50000);
  const signals = [];
  if (planAuthorizationConsumed) signals.push("plan-approved");
  if (planIntent === "rejection") signals.push("plan-rejected");
  if (planIntent === "modification") signals.push("plan-amended");
  if (approvalEligible) signals.push("plan-approval-eligible");
  if (isAuthorizationSecurityChange(text)) signals.push("authorization-security");
  if (FIGMA_RE.test(text)) signals.push("figma");
  // `isAutomatedTurn` evita inyectar la orden de delegación en turnos que la
  // máquina se genera a sí misma (notificaciones de subagente, recordatorios
  // del sistema): en la sesión del 2026-08-18 el único MEDIUM con plan
  // requerido lo produjo una notificación, no un pedido del usuario.
  if (GIT_OPS_RE.test(text) && !isAutomatedTurn(text) && (!route || route.depth !== "TRIVIAL")) {
    signals.push("git-ops");
  }
  const { isData, isSoftware } = getDomainRouting(text);
  if (isData && isSoftware) signals.push("data-software-ambiguity");
  else if (isData) signals.push("data");
  else if (isSoftware) signals.push("software");
  const recovery = ORC_RECOVERY_RE.test(text);
  if (recovery) signals.push("orc-recovery");
  return {
    mode: recovery ? "full" : signals.length ? "specialized" : "none",
    signals,
  };
}

export function getDeterministicRouteReminder(prompt) {
  const route = routeRequest(prompt);
  if (route.depth === "TRIVIAL") return [];
  const reminder = [
    "## ASDD ROUTE — resolución determinista del hook",
    `depth=${route.depth}; domain=${route.domain}; risk=${route.risk}; confidence=${route.confidence}; requires_plan=${route.requires_plan}; requires_confirmation=${route.requires_confirmation}`,
    `capabilities=${route.required_capabilities.join(",")}; reason=${route.reasons.join(",")}`,
    `subagent_budget_ceiling=max_agents:${route.subagent_budget.max_agents}, max_concurrent:${route.subagent_budget.max_concurrent}, turns:${route.subagent_budget.turns.min}-${route.subagent_budget.turns.max}, retries:${route.subagent_budget.max_retries}`,
    "El budget es un techo, no una cuota: reportá por separado agentes realmente usados. No sustituyas esta ruta por una clasificación manual.",
    "Evidencia de carga: SessionStart inyecta el núcleo compacto; `.claude/rules/` puede estar always-on por carga nativa de Claude Code y debe atribuirse así, no a SessionStart. Referencias en `.claude/references/rules/` y capabilities solo cuentan después de ejecutar su resolver/loader.",
    route.requires_plan
      ? "Antes de herramientas, presentá el plan requerido; si requires_confirmation=true, esperá una confirmación explícita del usuario (sirve cualquier afirmación clara, no una palabra en particular)."
      : route.requires_confirmation
        ? "Esta ruta no requiere plan, pero SÍ exige confirmación explícita del usuario antes de ejecutar."
        : "Esta ruta no requiere plan ni confirmación previa.",
    "",
  ];
  if (route.fast_lane === "git_ops") {
    reminder.splice(-1, 0,
      "ORC-010-F: operación git. NO presentes plan-gate ni pidas un `ok` extra: la confirmación la pide el gate específico (GS-003 commit, GS-008 push, GS-009 MR/PR) mostrando el comando exacto. Delegá directamente al agente correspondiente."
    );
  }
  if (route.required_capabilities.includes("analyze")) {
    reminder.splice(-1, 0,
      "Eficiencia read-only: después de resolver el índice, agrupá en un mismo turno las lecturas independientes; conservá el orden lógico al analizar y verificá al final el inventario completo de archivos."
    );
  }
  return reminder;
}

function readEvent() {
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function main() {
  if (process.env.SOFKA_ASDD_DELEGATION_INJECT_DISABLE === "1") {
    process.exit(0);
  }

  const event = readEvent();
  // S-002: truncar a 50000 chars para evitar DoS por prompts gigantes
  const prompt = String(event.prompt ?? event.user_prompt ?? "").slice(0, 50000);
  if (!prompt) process.exit(0);

  // G.1 / ORC-010-E: la respuesta al plan solo actúa sobre un challenge activo y
  // vigente. Recordar el consumo en el mismo turno evita que el modelo intente
  // ejecutar `approve`/`status` como si el challenge siguiera activo.
  const planAuthorization = await import("../scripts/lib/sofka-asdd-plan-authorization-lib.mjs");
  const commitAuthorization = await import("../scripts/lib/sofka-asdd-commit-authorization-lib.mjs");
  // La elegibilidad dura un turno: se limpia antes de reevaluar para que un
  // turno posterior nunca la herede.
  planAuthorization.clearApprovalEligibility();

  const { intent, eligible } = classifyApprovalIntent(prompt);
  let planAuthorizationConsumed = false;
  let approvalEligible = false;
  let amendedChallengeId = null;

  if (intent === "approval") {
    try {
      planAuthorization.approveActiveChallenge();
      planAuthorizationConsumed = true;
    } catch {
      // Una afirmación sin challenge no crea ni renueva autoridad.
    }
    try {
      commitAuthorization.approveActiveCommitChallenge();
    } catch {
      // El challenge de commit es independiente del challenge del plan.
    }
  } else if (intent === "rejection") {
    // Solo el rechazo destruye el challenge: sin esto queda un plan pendiente
    // que una afirmación posterior y descontextualizada podría aprobar.
    planAuthorization.revokeActiveChallenge();
    commitAuthorization.revokeActiveCommitChallenge();
  } else if (intent === "modification") {
    try {
      amendedChallengeId = planAuthorization.markChallengeAmended().challenge_id;
    } catch {
      // Sin challenge activo, una corrección es simplemente un request nuevo.
    }
  } else if (eligible) {
    try {
      approvalEligible = Boolean(planAuthorization.markApprovalEligible());
    } catch {
      // Sin challenge activo y vigente no hay nada que aprobar.
    }
  }

  const reminders = [];
  const deterministicRoute = routeRequest(prompt);
  const profile = getPromptInjectionProfile(prompt, {
    planAuthorizationConsumed,
    planIntent: intent,
    approvalEligible,
    route: deterministicRoute,
  });

  // LIGHT atomic_scoped_change is explicitly no-plan/no-confirmation. Persist
  // a short-lived, exact-file token so the Agent gate can synthesize the same
  // structured scope authorization without asking the user for a challenge.
  // If the prompt and active run do not resolve to exactly one existing file,
  // fail closed and retain the normal Agent gate behavior.
  let directLightAuthorization = null;
  try { directLightAuthorization = issueDirectLightAuthorization({ prompt, route: deterministicRoute }); } catch {}

  // GS-003 modo `intent` (ADR-022): cuando el usuario ordena el commit, el turno
  // YA trae la decisión humana que la regla exige. La lib decide y audita.
  const intentCommitAuthorization = issueIntentCommitPreauthorization({
    prompt, route: deterministicRoute,
  });

  // El routing proporcional no puede quedar a interpretación del modelo. Para
  // rutas no triviales se inyecta el resultado canónico antes de cualquier
  // tool. TRIVIAL conserva cero overhead por prompt (B4/ADR-017).
  reminders.push(...getDeterministicRouteReminder(prompt));

  // Solo la vía ATÓMICA, que se define por su scope de archivos exactos. El
  // token git se emite con `scope: []`, así que acá imprimía "Scope exacto:
  // undefined" y prometía un archivo inexistente; tiene su bloque propio abajo.
  if (directLightAuthorization && directLightAuthorization.fast_lane === "atomic") {
    reminders.push(
      "## ASDD LIGHT atómico — delegación autoautorizada",
      `Scope exacto: ${directLightAuthorization.scope.join(", ")}`,
      "Invocá un único agente con marcador ASDD-BUDGET LIGHT y su loader de capability; no presentes plan, challenge ni pidas confirmación.",
      "La autorización es de uso único y no permite escribir fuera del archivo indicado.",
      ""
    );
  }

  if (directLightAuthorization && directLightAuthorization.fast_lane === "git_ops") {
    reminders.push(
      "## ASDD vía rápida git — lanzamiento autoautorizado (ORC-010-F)",
      `${directLightAuthorization.max_uses} operación(es) habilitada(s): un agente por operación, cada uno con su marcador ASDD-BUDGET LIGHT y su loader de capability.`,
      "Sin plan-gate ni confirmación para lanzar: el comando lo gobiernan GS-003, GS-008 y GS-009.",
      ""
    );
  }

  if (profile.signals.includes("plan-approved")) {
    reminders.push(
      "## ASDD ORC-010-A — Lote aprobado y challenge consumido por el hook",
      "La afirmación del usuario ya consumió el challenge del plan y creó las autorizaciones internas del lote mostrado.",
      "NO ejecutes `sofka-asdd-plan-authorization.mjs approve`, `status` ni `--help`: no confirman nada y no forman parte del lote autorizado.",
      "Siguiente acción: invocá únicamente los agentes, el scope y los comandos del plan aprobado. Si hay un mismatch, detenete y pedí un plan/challenge nuevo.",
      ""
    );
  }

  if (profile.signals.includes("plan-rejected")) {
    reminders.push(
      "## ASDD ORC-010-E — Plan rechazado por el usuario",
      "El challenge del plan fue revocado por el hook. No hay lote aprobado y no queda nada pendiente de aprobar.",
      "NO invoques ningún agente. Preguntá qué hay que corregir y, si el usuario define un plan nuevo, emití un challenge nuevo.",
      ""
    );
  }

  if (profile.signals.includes("plan-amended")) {
    reminders.push(
      "## ASDD ORC-010-E — Aprobación con corrección (challenge enmendado, NO aprobado)",
      amendedChallengeId
        ? `El challenge \`${amendedChallengeId}\` sigue emitido pero quedó marcado como enmendado: la vía normal ya no puede aprobarlo.`
        : "No había un challenge activo: tratá el mensaje como un request nuevo.",
      "NO vuelvas a presentar el plan por default. Resolvé una de estas tres salidas:",
      amendedChallengeId
        ? `1. Si la corrección NO cambia agentes, scope[], commands[] ni budget → ejecutá \`node .claude/scripts/sofka-asdd-plan-authorization.mjs amend --challenge-id ${amendedChallengeId} --confirm-unchanged\` y procedé con el lote, propagando la corrección en el prompt del agente.`
        : "1. (No aplica: no hay challenge activo.)",
      "2. Si la corrección SÍ cambia el envelope (agentes, scope, comandos o budget) → emití un challenge nuevo con el delta ya incorporado y preguntale al usuario, en una línea, si quiere ver el plan revisado o que procedas directo.",
      "3. Si no podés determinar cuál de los dos casos es → preguntá. Nunca ejecutes el lote original sin resolver 1 o 2.",
      ""
    );
  }

  if (profile.signals.includes("plan-approval-eligible")) {
    reminders.push(
      "## ASDD ORC-010-E — Turno elegible para aprobación",
      "El prompt del usuario no es una afirmación inequívoca, pero hay un challenge activo y vigente y el turno quedó marcado como elegible.",
      "Si interpretás que el usuario aprobó el plan tal cual fue presentado: ejecutá `node .claude/scripts/sofka-asdd-plan-authorization.mjs approve --challenge-id <challenge_id>` y recién entonces invocá el lote.",
      "Si NO es una aprobación: respondé sin aprobar nada. La elegibilidad se consume una sola vez y no sobrevive al turno.",
      ""
    );
  }

  if (profile.signals.includes("authorization-security")) {
    reminders.push(
      "## ASDD SECURITY / ORC-010 — Cambio de autorización detectado (inyección mecánica del hook)",
      "Ruta FULL obligatoria: ANTES de Read/Glob/Grep/Bash/Agent, anunciá Ruta FULL y presentá el plan completo.",
      "El plan incluye **sofka-asdd-security** (threat model/autorización) y **sofka-asdd-developer-backend** (implementación/pruebas), artefactos y comandos [R/W/D].",
      "Esperá confirmación explícita del usuario antes de investigar, delegar o modificar. No hagas exploración directa previa.",
      ""
    );
  }

  if (profile.signals.includes("figma")) {
    reminders.push(
      "## ASDD ORC-000 / WF-003-A — Señal Figma detectada (inyección mecánica del hook)",
      "El prompt del usuario contiene una URL/mención de diseño Figma.",
      "DEBES delegar la extracción y el procesamiento del diseño Figma a **sofka-asdd-ui**.",
      "NO uses herramientas de Figma (mcp__figma__*) vos mismo — eso viola ORC-000 (delegación pura).",
      "El plan OBLIGATORIAMENTE incluye: **sofka-asdd-ui** (diseño Figma) + **sofka-asdd-solution-architect** (spec técnica) + **sofka-asdd-producto** (spec funcional).",
      "Anunciá cada agente con el formato ORC-008 → **@sofka-asdd-{nombre}** — {qué hará}.",
      ""
    );
  }

  if (profile.signals.includes("git-ops")) {
    reminders.push(
      "## ASDD ORC-000 / GS-003 — Operación vcs detectada (inyección mecánica del hook)",
      "El prompt del usuario indica una operación de control de versiones (hacer commit, subir cambios, crear MR/PR, gitflow, pre-push).",
      "DEBES delegar OBLIGATORIAMENTE a **sofka-asdd-tech-lead** con la skill correspondiente:",
      "  - hacer commit / commitea / prepara el commit  → skill: sofka-asdd-tech-lead-commit",
      "  - subir cambios / pushea / sube la rama        → skill: sofka-asdd-tech-lead-pre-push",
      "  - crear MR / PR / merge request / pull request → skill: sofka-asdd-tech-lead-create-mr",
      "  - rama / branch / gitflow                      → skill: sofka-asdd-tech-lead-gitflow",
      "NO invoques la skill directamente — el agente es **sofka-asdd-tech-lead**; la skill es su capability primaria.",
      "NO ejecutes operaciones vcs vos mismo — viola ORC-000 y GS-001.",
      "Anunciá con ORC-008: → @sofka-asdd-tech-lead (model: opus, skill: sofka-asdd-tech-lead-{X}) — qué hará.",
      ""
    );
    if (intentCommitAuthorization) {
      reminders.push(
        "## ASDD GS-003 — Autorización de commit YA vigente (modo `intent`)",
        `La orden del usuario pre-autorizó el commit en \`${intentCommitAuthorization.branches[0]}\`: ${intentCommitAuthorization.max_uses_per_branch} commit(s), hasta ${intentCommitAuthorization.expires_at}.`,
        "NO emitas challenge ni pidas un `ok` adicional. SÍ mostrá el comando exacto y los archivos antes de ejecutar: se elimina la espera, no la transparencia.",
        ""
      );
    }
  }

  if (profile.signals.includes("data")) {
    reminders.push(
      "## ASDD ORC-000 / WF-003-B — Señal de plataforma de datos detectada (inyección mecánica del hook)",
      "El prompt del usuario contiene una señal de plataforma de datos analíticos (data lake, data warehouse, lakehouse, Medallion, Star schema, ETL/ELT, Databricks, Unity Catalog, Auto Loader, u otro motor analítico).",
      "DEBES enrutar a **sofka-asdd-data-architect** (o **sofka-asdd-data-eng-databricks** si hay señales de pipeline/build/Auto Loader/Unity Catalog).",
      "NO uses **sofka-asdd-solution-architect** para este request — ese agente es para arquitectura de software transaccional, no plataformas de datos analíticos.",
      "NO consultes la base de datos, Redshift ni ningún sistema de datos directamente — delegá.",
      "Para la spec funcional, sumá **sofka-asdd-producto**.",
      "Anunciá cada agente con el formato ORC-008 → **@sofka-asdd-{nombre}** — {qué hará}.",
      ""
    );
  } else if (profile.signals.includes("software")) {
    reminders.push(
      "## ASDD ORC-000 / WF-003-B — Señal de arquitectura de software detectada (inyección mecánica del hook)",
      "El prompt del usuario contiene una señal de decisión de arquitectura de software transaccional (microservicios, contrato API, backend, modelo de dominio, base de datos, escalabilidad, stack/tecnología).",
      "DEBES involucrar a **sofka-asdd-solution-architect** en el plan (arquitectura/integración de sistemas).",
      "NO consultes la base de datos ni ningún sistema directamente — delegá.",
      "Para la spec funcional, sumá **sofka-asdd-producto**.",
      "Anunciá cada agente con el formato ORC-008 → **@sofka-asdd-{nombre}** — {qué hará}.",
      ""
    );
  } else if (profile.signals.includes("data-software-ambiguity")) {
    reminders.push(
      "## AMBIGÜEDAD DATOS↔SOFTWARE — el prompt matchea ambas taxonomías (ADR-002, inyección mecánica del hook)",
      "El prompt del usuario contiene señales tanto de plataforma de datos analíticos (data lake, data warehouse, Medallion, ETL, etc.) como de arquitectura de software transaccional (base de datos, microservicios, backend, etc.).",
      "ANTES de elegir agente, PREGUNTÁ al usuario UNA sola vez: '¿Este request es sobre plataforma de datos/analytics (Data), o arquitectura de software transaccional (Software)?'.",
      "Sin respuesta clara → repetí la pregunta; NO auto-elijas el agente.",
      "Según la respuesta: Data → **sofka-asdd-data-architect** (o **sofka-asdd-data-eng-databricks**). Software → **sofka-asdd-solution-architect**.",
      ""
    );
  }

  // NÚCLEO ORC — SessionStart/post-compact lo entrega por defecto. En
  // UserPromptSubmit solo reaparece ante recuperación explícita.
  const nucleoOrc = [
    "## NÚCLEO ORC — cumplir en cada turno (enforcement automático WI #3607)",
    "ORC-001/001-B: resolvé TRIVIAL/LIGHT/MEDIUM/FULL; baja confianza escala solo un nivel; seguridad nunca degrada.",
    "ORC-000: TRIVIAL y LIGHT read-only con inventario cerrado pueden usar 0 subagentes y tools locales de lectura. Todo cambio LIGHT y todo MEDIUM/FULL se delega; Bash solo admite la allow-list local read-only.",
    "ORC-010-F: vía rápida — LIGHT atomic_scoped_change usa autorización interna de scope exacto y las operaciones git quedan bajo GS-003/008/009; invocá el agente directamente sin plan ni challenge.",
    "ORC-010-A: antes de MOSTRAR un plan que espera confirmación, emití exactamente el challenge canónico con `node .claude/scripts/sofka-asdd-plan-authorization.mjs issue --plan-json '<plan-json>'`; no verifiques scripts ni explores primero.",
    "ORC-010-A: todo agente listado en `.sofka-asdd/capability-loading.json` declara una `capability` primaria; una segunda solo aparece como `dependencies` explícita. Debe cargar la primaria con `sofka-asdd-load-capability.mjs` antes de Edit/Write/Bash sensible.",
    "ART-001/002: antes del plan reservá rutas exactas; todo artefacto nuevo en docs/** usa {run_id}-{PHASE}-{SEQ}-{slug}.{ext}. El agente no inventa nombres; código queda excluido.",
    "ORC-002-C: el challenge declara route/phase/risk/confidence/max_concurrent y cada agente model/max_turns/retries. El prompt Agent incluye el marcador ASDD-BUDGET exacto; mismatch exige plan nuevo.",
    "ORC-010: salvo LIGHT atomic_scoped_change autoautorizado, ANTES de invocar cualquier agente presentá el plan-gate (agentes, artefactos,",
    "  comandos [R/W/D]) y validá V1-V5. Tipos 4/FULL/CLI → esperá confirmación explícita del usuario (cualquier afirmación clara).",
    "ORC-008: anunciá cada agente antes de invocarlo: → @sofka-asdd-X (model: Y, skill: Z) — qué hará.",
    "ORC-007: leé .asdd-run.json al inicio/post-compact; fase complete → no reinvocar.",
    "",
  ];
  if (profile.mode === "full") reminders.unshift(...nucleoOrc);

  if (reminders.length) console.log(reminders.join("\n"));
  process.exit(0);
}

// The module is also imported by routing regression tests. Execute the stdin
// protocol only when Claude Code launches this file as a hook command.
if (process.argv[1]?.replaceAll("\\", "/").endsWith(".claude/hooks/sofka-asdd-user-prompt-submit.mjs")) {
  await main();
}
