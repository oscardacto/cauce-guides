# Git Safety — núcleo always-on

Reglas universales, bloqueantes y sin degradación:

- **GS-001/002:** nunca escribir, commitear ni reescribir historia en
  `main|master|qa|dev|develop`; resolver siempre el repo efectivo, incluso con
  `cd`, `pushd`, `git -C`, repos anidados o shell ambiguo. Ante duda, bloquear.
- **GS-003:** todo `git commit` exige autorización humana explícita, vigente y
  de uso acotado. Tres modos: `command` (challenge por comando exacto — default
  y el más estricto), `branch` (cierres de worktree, ORC-011) e `intent` (la
  orden git del propio usuario en ese turno ES la autorización; sigue ligada a
  la rama, con cupo, TTL y auditoría). `intent` no cubre force push,
  `reset --hard` ni reescritura de historia: ahí rige el challenge clásico.
- **GS-004/005/006:** rama GitFlow dedicada, commit conventional, una rama por
  ciclo de cambio.
- **GS-007:** sincronizar con merge; nunca rebase de historia compartida.
- **GS-008/009:** push y MR/PR pasan por sus gates; force push y bypasses no se
  permiten salvo escape hatch explícito y auditable.
- **GS-010:** limpiar ramas/worktrees solo tras integración confirmada.

## Dos capas de enforcement

- **Git hooks nativos** (`.asdd/githooks/`, se instalan con
  `node .claude/scripts/asdd-install-githooks.mjs`): corren después de que
  git resolvió repo, rama, índice y mensaje, así que no parsean shell. Enforzan
  GS-001, GS-002, GS-004, GS-005, GS-007, GS-008, GS-010, CORE-009 y ART-001, y
  registran cada decisión —incluido el uso de un escape hatch— en
  `.claude/.runtime/git-audit.jsonl`.
- **Guards PreToolUse**: dan el mismo feedback antes de ejecutar el comando.
  Siguen siendo la primera línea, no la última.
- La **barrera** contra evasión deliberada sigue siendo server-side: protected
  branches en el remoto. Ninguna capa local la reemplaza (ADR-007).

## Carga condicional obligatoria

Antes de cualquier commit, push, MR/PR, cleanup o comando Git que cambie
estado, ejecutá `node .claude/scripts/asdd-resolve-rule.mjs asdd-git-safety`
y leé **COMPLETO**
`.claude/references/rules/asdd-git-safety.md` antes de actuar.
Si el resolver o la lectura fallan: STOP, sin operación Git.
