#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/pre-tool-use-dangerous-bash.mjs
//
// Hook PreToolUse que bloquea comandos bash destructivos antes de ejecutarse.
//
// Ámbito conservador: solo bloquea 6 patrones claramente destructivos.
// - Cap de worktrees: bloquea `git worktree add` cuando hay ≥ SOFKA_ASDD_MAX_WORKTREES (default: 3) activos
// No bloquea variantes menos peligrosas (ej. `rm archivo.txt` único) para
// evitar falsos positivos que frustren al desarrollador.
//
// Protocolo (hooks PreToolUse de Claude Code):
//   - Entrada: JSON por stdin con { tool_name, tool_input, ... }.
//   - Salida (bloquear): stderr con mensaje descriptivo + exit 2 (protocolo confirmado CC PreToolUse).
//   - Salida (permitir): exit 0 sin output (o con JSON { "decision": "approve" }).
//   - Exit code 2: bloqueo silencioso (equivalente antiguo).
//
// Referencia: https://code.claude.com/docs/en/hooks
// -----------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// ---- Patrones destructivos (conservador) ------------------------------------
//
// Se listan con comentarios para que cualquier reviewer entienda por qué
// bloqueamos cada uno. Si un proyecto legítimo necesita alguno, el equipo
// debe removerlo aquí explícitamente (no vía env var).

const DANGEROUS_PATTERNS = [
  {
    // `rm -rf` en cualquier forma con rutas peligrosas: /, ~, $HOME, ., *
    // Requiere -r (o -R) y -f combinados. `rm archivo.txt` NO se bloquea.
    regex: /\brm\s+(-[rRf]+|--recursive|--force)(\s+-[rRf]+|\s+--recursive|\s+--force)*\s+/i,
    reason: "Uso de `rm -rf`: operación recursiva forzada, alto riesgo de pérdida de datos.",
  },
  {
    // git reset --hard (descarta cambios locales sin posibilidad de recuperación directa)
    regex: /\bgit\s+reset\s+--hard\b/i,
    reason: "Uso de `git reset --hard`: descarta cambios locales de forma irreversible.",
  },
  {
    // git push --force / -f / --force-with-lease sin flags de seguridad adicionales
    // Bloqueamos también --force-with-lease por política ASDD (CORE-005).
    regex: /\bgit\s+push\s+(--force\b|--force-with-lease\b|-f\b)/i,
    reason: "Uso de `git push --force`: puede sobrescribir historia compartida.",
  },
  {
    // DROP TABLE / DROP DATABASE — comandos SQL destructivos
    // Matchea en cualquier subcomando bash que los contenga (psql, mysql, etc.)
    regex: /\bDROP\s+(TABLE|DATABASE)\b/i,
    reason: "SQL destructivo: `DROP TABLE` / `DROP DATABASE` requiere revisión manual.",
  },
  {
    // chmod 777 — permisos world-writable explícitos
    regex: /\bchmod\s+(-R\s+)?0?777\b/,
    reason: "`chmod 777`: permisos world-writable, viola políticas de seguridad.",
  },
  {
    // git checkout -- . descarta todos los cambios locales no commiteados
    regex: /\bgit\s+checkout\s+--\s+\./i,
    reason: "`git checkout -- .`: descarta todos los cambios locales no commiteados de forma irrecuperable.",
  },
  {
    // git clean -fd/-fx/-fdx elimina archivos no trackeados (incluso .env)
    regex: /\bgit\s+clean\s+(-[fdxX]+|--force)/i,
    reason: "`git clean -fd`: elimina archivos no trackeados, incluyendo potencialmente .env y otros archivos sensibles.",
  },
  {
    // git stash drop elimina el stash de forma irrecuperable
    regex: /\bgit\s+stash\s+drop\b/i,
    reason: "`git stash drop`: elimina el stash de forma irrecuperable sin posibilidad de recuperación.",
  },
  {
    // curl|bash / wget|sh — ejecución de scripts remotos sin auditar (supply chain)
    regex: /\b(curl|wget)[^|]*\|\s*(sudo\s+)?(bash|sh|zsh)\b/i,
    reason: "Ejecución de script remoto sin auditar (`curl|bash`): riesgo de supply chain attack.",
  },
  {
    // `--no-verify` / `-n` salta los git hooks NATIVOS, que son la capa que
    // enforza GS-001/004/005/007/008 sin parsear shell (ADR-007 Opción D).
    // Se matchea en cualquier posición del comando, no solo como prefijo, para
    // que no baste reordenar los flags.
    regex: /\bgit\s+(commit|push|merge)\b[^|;&]*\s(--no-verify|-n)\b/i,
    reason:
      "`--no-verify` salta los git hooks nativos de ASDD, que son la única capa que valida rama, mensaje, naming e integridad sin parsear shell.",
  },
  {
    // git rebase: GS-007 lo prohíbe. El hook nativo pre-rebase lo bloquea con
    // su propio escape hatch auditable; este patrón cubre el caso en que la
    // capa nativa no esté instalada todavía.
    regex: /\bgit\s+(rebase\b|pull\s+.*--rebase\b)/i,
    hatchVar: "SOFKA_ASDD_GUARD_REBASE_DISABLE",
    reason:
      "`git rebase` está prohibido por GS-007 (sincronizar con `merge --no-ff`). Si el rebase es una decisión explícita del usuario, exportá SOFKA_ASDD_GUARD_REBASE_DISABLE=1 en la sesión — el hook nativo pre-rebase lo registra en la auditoría.",
  },
];

// ---- Lectura de stdin -------------------------------------------------------

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch (err) {
    return "";
  }
}

function parseInput(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // JSON malformado con contenido no-vacío: fallar CERRADO (#3639).
    // stdin vacío (línea anterior) es legítimo y retorna {}. Aquí el raw es no-vacío pero inválido.
    process.stderr.write(
      "[pre-tool-use-dangerous-bash] ERROR: stdin contiene JSON malformado — bloqueando por seguridad.\n"
    );
    process.exit(2);
  }
}

// ---- Worktree cap -----------------------------------------------------------

/** Cuenta el total de worktrees activos (incluye el principal). */
function getWorktreeCount() {
  try {
    const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return (out.match(/^worktree /gm) ?? []).length;
  } catch {
    return 0;
  }
}

/** Detecta un comando `git worktree add` en la cadena completa. */
function isWorktreeAdd(cmd) {
  return /(?:^|[\s;|&])git\s+worktree\s+add\b/.test(cmd);
}

// ---- Lógica principal -------------------------------------------------------

/**
 * Normaliza únicamente quoting estático que no cambia el token entregado al
 * proceso. No expande variables ni sustituciones: ante sintaxis dinámica los
 * patrones posteriores siguen siendo conservadores y no ejecutan el comando.
 */
function normalizeForClassification(command) {
  return command
    .replace(/'([A-Za-z0-9._/-]+)'/g, "$1")
    .replace(/"([A-Za-z0-9._/-]+)"/g, "$1")
    .replace(/\\([A-Za-z0-9_-])/g, "$1")
    .replace(
      /\bgit(?:\s+(?:-C\s+\S+|-c\s+\S+|--(?:git-dir|work-tree)(?:=\S+|\s+\S+)))+\s+/gi,
      "git ",
    );
}

function checkCommand(command, environment = process.env) {
  if (!command || typeof command !== "string") return null;
  const classified = normalizeForClassification(command);
  for (const { regex, reason, hatchVar } of DANGEROUS_PATTERNS) {
    if (!regex.test(classified)) continue;
    // La mayoría de los patrones no tiene escape hatch por diseño. La excepción
    // son los que la propia regla contempla: GS-007 admite rebase "si el usuario
    // lo pide explícitamente, advirtiendo el riesgo", y ese pedido explícito se
    // expresa con la variable de sesión, que el hook nativo pre-rebase audita.
    if (hatchVar && (environment[hatchVar] === "1" || environment[hatchVar] === "true")) continue;
    return reason;
  }
  return null;
}

export function getDangerousBashDecision(input, environment = process.env) {
  const toolName = input.tool_name || input.toolName || "";
  if (toolName !== "Bash") return null;

  const command = input?.tool_input?.command || input?.toolInput?.command || "";

  // Cap de worktrees (anti-loops.md — máx 3 adicionales al principal)
  if (isWorktreeAdd(command)) {
    const _parsed = parseInt(environment.SOFKA_ASDD_MAX_WORKTREES ?? "3", 10);
    const maxWorktrees = Number.isNaN(_parsed) ? 3 : _parsed; // #3643: NaN guard
    const current = getWorktreeCount();
    // current incluye el worktree principal; los adicionales = current - 1
    // Bloquear cuando ya hay maxWorktrees adicionales (current >= maxWorktrees + 1)
    if (current >= maxWorktrees + 1) {
      return { decision: "deny", reason:
        `[ASDD] Bloqueado: worktree cap excedido ` +
          `(${current - 1}/${maxWorktrees} activos).\n` +
          `Limpiar un worktree antes de crear uno nuevo:\n` +
          `  git worktree list\n` +
          `  git worktree remove <path>\n` +
          `Escape hatch: SOFKA_ASDD_MAX_WORKTREES=N en .claude/settings.json → env`
      };
    }
  }

  const reason = checkCommand(command, environment);

  if (reason) {
    return { decision: "deny", reason:
      `[ASDD] Comando bloqueado: ${reason}\n` +
      `Comando: \`${command}\`\n` +
      `Si es intencional, remueve el patrón de .claude/hooks/sofka-asdd-pre-tool-use-dangerous-bash.mjs con justificación documentada.`
    };
  }
  return null;
}

function main() {
  const result = getDangerousBashDecision(parseInput(readStdin()));
  if (!result) process.exit(0);
  process.stderr.write(`${result.reason}\n`);
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
