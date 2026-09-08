#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/asdd-orchestrator-guard.mjs
//
// Hook PreToolUse que hace cumplir ORC-000 / CORE-009 en el hilo principal:
//   - Edit / Write (hilo principal) → DENY duro: el orquestador NUNCA escribe
//     código o archivos directamente. Debe delegar a un subagente.
//   - Bash (hilo principal) → ALLOW únicamente para una allow-list estricta
//     de consultas locales de solo lectura y de control-plane del framework;
//     ASK para el resto. Esto hace ejecutable la ruta TRIVIAL sin convertir
//     Bash en un escape hatch.
//
// CONTROL-PLANE (ORC-000): los scripts propios que el orquestador debe ejecutar
// PARA PODER delegar —resolve-rule, load-capability, artifact-name,
// run-bootstrap y plan-authorization issue— no son ejecución de trabajo: son la
// preparación de la delegación. Están allow-listed porque nueve reglas de carga
// condicional y ART-003 mandan ejecutarlos. Ampliar la lista exige actualizar
// también el párrafo de ORC-000 en asdd-orchestration.md.
//
// REGLAS ASDD aplicadas:
//   - ORC-000 (Delegación proporcional): TRIVIAL puede inspeccionar archivos
//     locales; trabajo no trivial se delega.
//   - ORC-000-B (Protocolo de Fallback): cuando ningún subagente disponible
//     puede atender la tarea, el orquestador puede ejecutar directamente SOLO
//     con autorización explícita del usuario (aplica a Bash, no a Edit/Write).
//   - CORE-009: el orquestador nunca escribe ni usa tools de dominio; TRIVIAL y
//     LIGHT read-only acotado pueden ejecutarse localmente. ORC-000-B cubre el
//     fallback restante con aprobación del usuario.
//
// CRITERIO DE DETECCIÓN:
//   - El JSON de stdin de PreToolUse trae `agent_id` SOLO cuando la llamada
//     viene de un subagente worker. En el hilo principal ese campo está ausente.
//     Esto basta para distinguir orquestador vs. subagente.
//
// ROBUSTEZ:
//   - Si los hooks PreToolUse no se dispararan dentro de subagentes, el hook
//     solo vería el main thread → deny/ask solo al orquestador y NO afectaría
//     a workers. El comportamiento sigue siendo seguro.
//   - Ante error de parseo de stdin: exit 0 (no bloquea la sesión).
//
// PROTOCOLO (hooks PreToolUse de Claude Code):
//   - Entrada: JSON por stdin con { tool_name, tool_input, agent_id?, ... }.
//   - Salida (deny): JSON por stdout con
//       { "hookSpecificOutput": { "hookEventName": "PreToolUse",
//         "permissionDecision": "deny", "permissionDecisionReason": "..." } }
//   - Salida (ask): JSON por stdout con permissionDecision: "ask".
//   - Salida (allow sin output): exit 0 sin output.
//
// ESCAPE HATCH AUDITABLE:
//   - ASDD_ORCHESTRATOR_GUARD_DISABLE=1 desactiva el hook para la
//     sesión. Usar solo con autorización explícita del maintainer.
//
// Referencia: ORC-000 / ORC-000-B (asdd-orchestration.md), CORE-009 (CLAUDE.md).
// -----------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import path, { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
// El motor de comandos —parser, gramática de shell, léxico de lectura y sus
// predicados de escritura— es único y vive en _lib/. Este guard y la librería de
// autorización de subagentes leen de la misma fuente.
import {
  classifySegment,
  splitSegments,
} from "./_lib/asdd-command-plane.mjs";
import { describirHueco } from "./_lib/asdd-hueco-clasificacion.mjs";
// El reconocimiento del contrato de nombres de Smart Data es SSOT y vive en _lib/:
// lo comparten el analyze-guard, el artifact-name-guard y este hook (ADR-003).
import { isDataArtifact } from "./_lib/smart-data-naming.mjs";

// ---- Razones de decisión ----------------------------------------------------
// El escape hatch ASDD_ORCHESTRATOR_GUARD_DISABLE sigue existiendo y sigue
// documentado en la cabecera de este archivo; lo que deja de hacer es aparecer en
// el mensaje que el modelo lee, donde funcionaba como publicidad del bypass.
const DENY_REASON = (ruta) =>
  "ORC-000: el orquestador no escribe en el plano de dominio (CORE-009). " +
  `Recibido: \`${ruta || "(sin ruta)"}\`. ` +
  "→ delegá a un subagente con la capability cargada.";

// ---- Clasificación de un comando Bash del hilo principal --------------------
//
// Ya no hay allow-list por sintaxis ni `ask` como `else`: cada segmento cae en
// exactamente una clase de la partición, y `ask` solo se alcanza en `unknown` —
// la celda de fracaso declarado. El manifiesto de control-plane y el léxico de
// lectura viven en `_lib/asdd-command-plane.mjs`: agregar un script del
// framework es agregar su entrada, no editar este archivo.
//
// Redirección a stderr hacia /dev/null se sigue admitiendo porque no modifica el
// workspace; la descarta `normalizeSegment()`.

const RUN_STATE = ".asdd-run.json";

// Todo `deny` lleva tres cosas: el comando o la ruta que se recibió, la causa
// real, y la línea de camino. Un deny sin camino deja al orquestador sin salida
// y es lo que lo empuja a tantear otra forma del mismo comando.
function denyBash(veredicto) {
  const camino = veredicto.agent
    ? `→ delegá a ${veredicto.agent}.`
    : "→ usá la forma declarada en el manifiesto de control-plane, o delegá a un subagente con capability cargada.";
  return `ORC-000: ${veredicto.reason}. Recibido: \`${veredicto.segment}\`. ${camino}`;
}



function decideBash(command, cwd) {
  if (typeof command !== "string" || !command.trim() || command.length > 12_000) {
    return {
      decision: "deny",
      reason: "ORC-000: comando vacío o de longitud excesiva. → reformulá la operación o delegá a un subagente.",
    };
  }
  const segments = splitSegments(command);
  if (!segments) {
    return {
      decision: "deny",
      reason: `ORC-000: comillas o escapes sin cerrar. Recibido: \`${command.slice(0, 200)}\`. → reescribí el comando.`,
    };
  }

  const veredictos = segments.map((segment, index) => ({
    segment,
    ...classifySegment(segment, { caller: "orchestrator", root: cwd, isFirst: index === 0 }),
  }));

  // El orden importa: lo más peligroso manda sobre el resto del comando.
  const frenado = veredictos.find((v) => v.class === "dangerous")
    || veredictos.find((v) => v.class === "integrity")
    || veredictos.find((v) => v.class === "control-denied")
    || veredictos.find((v) => v.class === "domain");
  if (frenado) return { decision: "deny", reason: denyBash(frenado) };

  const sinClasificar = veredictos.find((v) => v.class === "unknown");
  if (sinClasificar) {
    // El hueco se DESCRIBE en el mensaje del `ask` y no se persiste en ningún
    // archivo (decisión del usuario, 2026-08-25): el framework no guarda datos de
    // la operación. El guide-collector lo levantará del chat cuando exista.
    return {
      decision: "ask",
      reason: describirHueco({ segmento: sinClasificar.segment, motivo: sinClasificar.reason }),
    };
  }
  return null;
}

// ORC-000-B paso 3 manda «registrar el motivo en `.asdd-run.json` bajo
// `fallback_requests[]`», y la librería de subagentes ya exime esa ruta. Se exime
// SOLO esa, resuelta contra el `cwd` del payload: `.claude/settings.local.json` y
// cualquier archivo de dominio siguen denegados.
function decideWrite(input, cwd) {
  const raw = input?.tool_input?.file_path ?? input?.tool_input?.filePath ?? input?.tool_input?.path
    ?? input?.toolInput?.file_path ?? "";
  try {
    if (raw && resolvePath(cwd, raw) === resolvePath(cwd, RUN_STATE)) return null;
  } catch { /* ruta inválida → deny */ }
  if (raw && esDocumentoVivoData(raw, cwd)) return null;
  return { decision: "deny", reason: DENY_REASON(raw) };
}

// Excepción de dominio Smart Data (ADR-011): los artefactos del flujo Data son
// DOCUMENTOS VIVOS. Su tracking se actualiza en los Procedimientos C y Sync y en
// Publish, dentro del propio protocolo de conversación del orquestador — los gaps
// se presentan uno por vez y no hay agente que medie.
//
// Acotada por ruta Y por nombre: sin las dos condiciones, cualquier archivo
// llamado smart-data-eng-* en cualquier carpeta quedaría escribible. `docs/specs/`
// cubre discovery, assessment, dictionary, build-run, validate-signoff y
// contracts/; `docs/architecture/` cubre el diseño Medallion.
const DATA_LIVING_DOC_ROOTS = ["docs/specs/", "docs/architecture/"];

function esDocumentoVivoData(raw, cwd) {
  try {
    const abs = path.isAbsolute(raw) ? raw : resolvePath(cwd, raw);
    const rel = path.relative(cwd, abs).split(path.sep).join("/");
    if (!DATA_LIVING_DOC_ROOTS.some((r) => rel.startsWith(r))) return false;
    const base = path.basename(rel);
    return base.startsWith("smart-data-eng-") && isDataArtifact(base);
  } catch {
    return false; // ruta inválida → no se exime, cae al deny
  }
}

// ---- Lectura de stdin -------------------------------------------------------

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseInput(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Si no podemos parsear, devolvemos objeto vacío — el hook no bloquea por defecto.
    return {};
  }
}

// ---- Lógica principal -------------------------------------------------------

export function getOrchestratorGuardDecision(input, environment = process.env) {
  // Escape hatch auditable — desactiva el hook para la sesión.
  if (environment.ASDD_ORCHESTRATOR_GUARD_DISABLE === "1") return null;
  const toolName = input.tool_name || input.toolName || "";

  // Solo actuamos sobre Edit, Write y Bash.
  // Otras tools (Agent, Read, Grep, Glob, Task, etc.) pasan directo —
  // el orquestador las necesita para delegar y decidir.
  const isEdit  = toolName === "Edit";
  const isWrite = toolName === "Write";
  const isBash  = toolName === "Bash";

  if (!isEdit && !isWrite && !isBash) {
    return null;
  }

  // Si la llamada viene de un subagente (agent_id presente), permitir.
  // El allow-list del subagente lo gobierna desde su frontmatter.
  const agentId = input.agent_id ?? input.agentId;
  if (agentId) {
    return null;
  }

  // Hilo principal → aplicar la decisión según la tool.
  const cwd = input.cwd || process.cwd();
  if (isEdit || isWrite) return decideWrite(input, cwd);
  return decideBash(input?.tool_input?.command || input?.toolInput?.command || "", cwd);
}

function main() {
  const result = getOrchestratorGuardDecision(parseInput(readStdin()));
  if (!result) process.exit(0);

  const payload = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.decision,
      permissionDecisionReason: result.reason,
    },
  };
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

// The module is also imported by its regression test. Execute stdin protocol
// only when Claude Code launches this file as a hook command.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
