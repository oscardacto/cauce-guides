const DEPTHS = ["TRIVIAL", "LIGHT", "MEDIUM", "FULL"];
const SENSITIVE = /\b(auth|login|mfa|oauth|jwt|pagos?|payment|pii|pci|hipaa|kyc|compliance|cifrado|encryption|pipeline|contrato público|public contract)\b/i;
const ASDD = /\b(spec|adr|historia de usuario|user story|criterios? de aceptación|brief|sign[- ]?off|bounded context)\b/i;
const QUERY = /^[¿?¡!\s]*(qué|que|cómo|como|dónde|donde|cuál|cual|lista|listar|explica|explicar|muestra|mostrar|revisa|consult|find|show|explain|where|what|how)(?=\s|$)/i;
const WRITE = /\b(cambia|cambiar|cambiá|actualiza|actualizar|actualizá|renombra|renombrar|renombrá|corrige|corregir|corregí|mueve|mover|mové|agrega|agregar|agregá|crea|crear|creá|implementa|implementar|implementá|refactoriza|refactorizar|refactorizá|optimiza|optimizar|optimizá|elimina|eliminar|eliminá|borra|borrar|borrá|copia|copiar|copiá|ajusta|ajustar|ajustá|saca|sacar|sacá|quita|quitar|quitá|fix|update|rename|add|create|implement|refactor|optimize|delete|move|copy)(?![\p{L}\p{N}_])/iu;
const NEW_FEATURE = /\b(nueva? funcionalidad|nuevo módulo|feature|implementar .+ (sistema|módulo|servicio|flujo)|crear .+ (api|servicio|módulo))\b/i;
const BUG_SYMPTOM = /\b(a veces|no funciona|falla|error|bug|incorrecto|inesperado|queda vacío|intermitente)\b/i;
const FILE = /(?:^|\s)(?:[\w.-]+\/)+[\w.-]+|\b[\w.-]+\.(?:js|ts|tsx|jsx|py|java|go|md|json|ya?ml)\b/i;
const PATH_TOKEN = /(?:^|\s)(?:[\w.-]+\/)+[\w.-]+/g;
const EXPLICIT_READ_ONLY = /\b(read[- ]?only|solo lectura|modo estrictamente de lectura|sin modificar archivos?|no (?:crees?|crear|modifiques?|modificar|edites?|editar|escribas?|escribir) archivos?)\b/i;
const BROAD_READ_ONLY = /\b(auditor[ií]a|audita|analiza|análisis|contradicciones?|inconsistencias?|lee (?:en orden|todo|todos?|el paquete)|revisa (?:varios|todo|todos?|el paquete))\b/i;
// Operaciones git: tienen su propio gate específico (GS-003 commit, GS-008
// push, GS-009 MR/PR) que muestra el comando exacto antes de pedir
// confirmación. Pagar además la ceremonia ORC-010 significa dos
// confirmaciones para una sola operación — y el lote ORC-010 ni siquiera
// puede declarar `git commit` (issueChallenge lo rechaza por GS-003).
const GIT_OPS = /\b(commit|commite(a|ar|á)?|push|pushe(a|ar|á)?|merge request|pull request|MR|PR|rebase|stash|cherry[- ]pick|gitflow|checkout|(?:crear?|nueva) rama|rama nueva)(?![\p{L}\p{N}_])/iu;
// Reescritura de historia y force push nunca entran en vía rápida: caen al
// flujo normal y fuerzan confirmación explícita.
const DANGEROUS_GIT =
  /--force|force[- ]push|\bgit\s+\S*\s*-f\b|reset\s+--hard|filter-branch|filter-repo|\bsquash\b|\brebase\b|\breescrib[\p{L}]*\s+(la\s+)?historia\b|rewrite history/iu;
// Borrado/limpieza de ramas y worktrees (GS-010): tampoco entra en vía rápida,
// exige el mismo plan + confirmación explícita que el resto de operaciones
// destructivas de git.
const DESTRUCTIVE_CLEANUP =
  /\b(?:borr[aá]r?|elimin[aá]r?|limpi[aá]r?|prune|remove)\s+(?:la\s+|las\s+|los\s+)?(?:rama|ramas|branch(?:es)?|worktrees?)\b|\bbranch\s+-D\b/i;
// Mover/renombrar/copiar declara rutas destino que todavía no existen: el
// scope del token directo tiene que admitirlas (ver direct-light lib).
export const FILE_OP = /\b(mueve|mover|mové|renombra|renombrar|renombrá|copia|copiar|copiá|borra|borrar|borrá|elimina|eliminar|eliminá|move|rename|copy|delete)(?![\p{L}\p{N}_])/iu;

const NEGATED_WRITE = /\b(?:no|sin)\s+(?:cre(?:ar|as?|es?)|modific(?:ar|as?|es?)|edit(?:ar|as?|es?)|escrib(?:ir|as?|es?))(?:\s+(?:ni|o)\s+(?:cre(?:ar|as?|es?)|modific(?:ar|as?|es?)|edit(?:ar|as?|es?)|escrib(?:ir|as?|es?)))*\b/gi;
// Operaciones de control de versiones. La versión previa perdía las
// formulaciones más comunes —incluidas las que el propio recordatorio del hook
// usa como ejemplo, "hacer commit" y "sube la rama"— porque `haz(?:er)?` cubre
// "haz" y el typo "hazer" pero no "hacer", y porque el opcional de "subir" era
// `los?`. Se agregan además los comandos git literales y las formas en inglés.
const GIT_OPS_RE = new RegExp(
  [
    // comandos git literales y CLIs de MR/PR
    String.raw`\bgit\s+(?:commit|push|merge|rebase|checkout\s+-b|switch\s+-c|tag|revert|cherry-pick|branch\b)`,
    String.raw`\b(?:glab\s+mr\s+(?:create|update)|gh\s+pr\s+(?:create|edit)|az\s+repos\s+pr\s+create)\b`,
    // español: commit
    String.raw`\bcommitea[rnd]?\w*\b`,
    String.raw`\b(?:haz|hac[eé]r?|hagamos|prepar[aá]?(?:r|me)?|arm[aá]?(?:r)?|gener[aá]?(?:r)?)\s+(?:el\s+|un\s+|los\s+)?commits?\b`,
    // español: push / subir
    String.raw`\bpushea[rnd]?\w*\b`,
    String.raw`\b(?:haz|hac[eé]r?|hagamos)\s+(?:el\s+)?push\b`,
    String.raw`\bsub(?:e|i|ir|amos)\s+(?:los?\s+|las?\s+|el\s+)?(?:cambios|rama|branch|commits?)\b`,
    // español: MR / PR
    String.raw`\b(?:crea|crear|abre|abrir|genera|generar|arma|armar)\s+(?:el\s+|la\s+|un[ao]?\s+)?(?:MR|PR|merge[\s-]?request|pull[\s-]?request)\b`,
    // español: otras operaciones de historia y ramas
    String.raw`\b(?:mergea|mergear|fusiona|fusionar)\b`,
    String.raw`\b(?:rebase[ao]?r?)\b`,
    String.raw`\b(?:revert[ií]|revertir|revierte)\s+(?:\w+\s+){0,2}(?:commit|cambio|merge)\b`,
    // prompts de una sola palabra: "commit", "push", "commit y push". No hay
    // ambigüedad posible cuando el pedido completo es el sustantivo.
    String.raw`^\s*(?:commit|push|mr|pr|commit\s+y\s+push|commitear|pushear)\s*[.!]*\s*$`,
    String.raw`\b(?:borr[aá]|borrar|elimin[aá]|eliminar|limpi[aá]|limpiar)\s+(?:la\s+|las\s+)?ramas?\b`,
    String.raw`\bcrea(?:r)?\s+(?:una?\s+)?(?:rama|branch|tag)\b`,
    String.raw`\bgitflow\b|\bpre[-\s]push\b|\bworktrees?\b`,
    // inglés
    String.raw`\b(?:commit|push)\s+(?:the\s+|these\s+|my\s+)?(?:changes?|branch|code|work)\b`,
    String.raw`\b(?:make|create|do)\s+(?:a\s+|the\s+)?commit\b`,
    String.raw`\b(?:create|open|raise)\s+(?:a\s+|the\s+)?(?:PR|MR|pull\s?request|merge\s?request)\b`,
  ].join("|"),
  "i",
);

// Turnos que la máquina se inyecta a sí misma: notificaciones de fin de
// subagente, recordatorios del sistema y eventos de cron. No son pedidos del
// usuario y no deben clasificarse como intención — en la sesión del 2026-08-18
// una notificación que contenía "pushea" se clasificó MEDIUM con plan
// requerido, mientras el pedido real del usuario cayó en LIGHT.
const AUTOMATED_TURN_RE =
  /<task-notification>|\[SYSTEM NOTIFICATION\s*-\s*NOT USER INPUT\]|<system-reminder>|<local-command-stdout>/i;

export function isAutomatedTurn(raw) {
  return AUTOMATED_TURN_RE.test(String(raw ?? ""));
}

// Los documentos de prueba pueden envolver el request real en una sección
// "Prompt para copiar". Enrutar el wrapper completo introduce falsos positivos
// desde sus criterios de aceptación (por ejemplo `cloud` o `ADR`).
function unwrapPromptDocument(raw) {
  const original = String(raw ?? "");
  if (!/^##\s+Prompt para copiar\s*$/im.test(original)) return original;
  const match = original.match(/^##\s+Prompt para copiar\s*$[\s\S]*?```(?:text)?\s*\n([\s\S]*?)\n```/im);
  return match?.[1] ?? original;
}

function nextDepth(depth) {
  return DEPTHS[Math.min(DEPTHS.indexOf(depth) + 1, DEPTHS.length - 1)];
}

function detectDomain(text) {
  if (/\b(data lake|lakehouse|medallion|databricks|etl|elt|warehouse)\b/i.test(text)) return "data";
  if (/\b(terraform|kubernetes|kubectl|cloud|aws|azure|gcp|pipeline)\b/i.test(text)) return "platform";
  if (/\b(css|ui|frontend|react|angular|vue|botón|pantalla)\b/i.test(text)) return "frontend";
  if (/\b(api|backend|database|base de datos|servicio|controller)\b/i.test(text)) return "backend";
  return "general";
}

export function routeRequest(raw, options = {}) {
  const text = unwrapPromptDocument(raw).trim().slice(0, 50_000);
  if (!text) throw new Error("request text is required");
  const reasons = [];
  const sensitive = SENSITIVE.test(text);
  const hasAsdd = ASDD.test(text);
  const query = QUERY.test(text) && !WRITE.test(text);
  const file = FILE.test(text);
  const feature = NEW_FEATURE.test(text);
  const bug = BUG_SYMPTOM.test(text);
  const write = WRITE.test(text.replace(NEGATED_WRITE, ""));
  const explicitReadOnly = EXPLICIT_READ_ONLY.test(text) && !write;
  const broadReadOnly = explicitReadOnly && BROAD_READ_ONLY.test(text);
  // Un turno que la máquina se inyecta a sí misma no expresa intención del
  // usuario, y una auditoría declarada de solo lectura no deja de serlo por
  // mencionar gitflow o un MR: en ambos casos el léxico no debe ganarle a la
  // intención declarada (defecto ya diagnosticado en VERIFY-003).
  const dangerousGit = DANGEROUS_GIT.test(text) || DESTRUCTIVE_CLEANUP.test(text);
  const gitOps =
    GIT_OPS_RE.test(text) && !isAutomatedTurn(raw) && !explicitReadOnly && !dangerousGit;
  let depth;
  let confidence;

  if (options.always_full || feature || (sensitive && write)) {
    depth = "FULL"; confidence = 0.95;
    reasons.push(options.always_full ? "policy_always_full" : feature ? "new_feature" : "sensitive_write");
  } else if (explicitReadOnly) {
    depth = broadReadOnly ? "LIGHT" : "TRIVIAL";
    confidence = 0.96;
    reasons.push(broadReadOnly ? "bounded_read_only_audit" : "explicit_read_only");
  } else if (dangerousGit) {
    // Fuera de la vía rápida ORC-010-F y nunca TRIVIAL: reescritura de historia
    // exige plan + confirmación explícita. No puede caer al branch `query`.
    depth = "MEDIUM"; confidence = 0.95; reasons.push("dangerous_git");
  } else if (gitOps) {
    // Va antes de `query` a propósito: "revisá los cambios y hacé el commit"
    // empieza con un verbo de consulta pero termina en una operación vcs.
    // ORC-010-F vía rápida: la operación tiene su propio gate (GS-003/008/009)
    // y no paga la ceremonia del plan-gate — por eso LIGHT, no MEDIUM.
    // DANGEROUS_GIT queda excluido arriba para no fast-trackear force-push ni
    // reescritura de historia.
    depth = "LIGHT"; confidence = 0.93; reasons.push("git_operation");
  } else if (query) {
    depth = "TRIVIAL"; confidence = 0.95; reasons.push("read_only_query");
  } else if (hasAsdd) {
    depth = "FULL"; confidence = 0.95; reasons.push("asdd_artifact");
  } else if (GIT_OPS.test(text) && !dangerousGit) {
    depth = "LIGHT"; confidence = 0.93; reasons.push("git_operation");
  } else if (write && file && !bug) {
    depth = "LIGHT"; confidence = 0.9; reasons.push("atomic_scoped_change");
  } else if ((bug && file) || (write && /\b(módulo|module|varios|multiple|refactor|optimiza)\b/i.test(text))) {
    depth = "MEDIUM"; confidence = 0.82; reasons.push(bug ? "scoped_bug" : "bounded_multi_component_change");
  } else if (bug || write) {
    depth = "MEDIUM"; confidence = 0.62; reasons.push(bug ? "unlocated_behavior" : "ambiguous_change");
  } else {
    depth = "TRIVIAL"; confidence = 0.55; reasons.push("uncertain_read_or_conversation");
  }

  const threshold = Number(options.confidence_threshold ?? 0.7);
  if (confidence < threshold) {
    const previous = depth;
    depth = nextDepth(depth);
    reasons.push(`low_confidence_escalation:${previous}->${depth}`);
  }
  const budget = SUBAGENT_BUDGET.routes[depth];
  return {
    schema_version: 1,
    depth,
    // Los nombres de archivo son scope, no señales de dominio (por ejemplo
    // `contexto-ux-ui.md` no convierte una auditoría general en frontend).
    domain: detectDomain(text.replace(PATH_TOKEN, " ")),
    risk: sensitive ? "high" : depth === "FULL" ? "medium" : "low",
    confidence,
    requires_plan: depth === "MEDIUM" || depth === "FULL",
    requires_confirmation: depth === "FULL" || sensitive || dangerousGit,
    // Vía rápida ORC-010-F: rutas que ya tienen su gate propio o un scope
    // exacto resoluble no pagan la ceremonia del plan-gate. `null` = flujo
    // normal.
    fast_lane: reasons.includes("git_operation")
      ? "git_ops"
      : reasons.includes("atomic_scoped_change")
        ? "atomic"
        : null,
    required_capabilities: depth === "TRIVIAL" ? ["read"] : depth === "LIGHT" && explicitReadOnly ? ["read", "analyze"] : depth === "LIGHT" ? ["write_scoped"] : depth === "MEDIUM" ? ["explore", "write_scoped", "verify"] : ["specify", "design", "build", "verify"],
    reasons,
    policy_version: 1,
    budget_policy_version: SUBAGENT_BUDGET.schema_version,
    subagent_budget: {
      max_agents: budget.max_agents,
      max_concurrent: budget.max_concurrent,
      turns: budget.turns,
      max_retries: budget.max_retries,
    },
  };
}
import { SUBAGENT_BUDGET } from "./sofka-asdd-subagent-budget-lib.mjs";
export { GIT_OPS_RE };
