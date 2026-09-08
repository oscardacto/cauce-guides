# Worktree opt-in — Guía de Configuración

Los agentes `sofka-asdd-developer-frontend` y `sofka-asdd-developer-backend`
trabajan por defecto sobre la rama actual. Desde ADR-010, worktree es opt-in.

Se activa cuando el usuario lo pide explícitamente o cuando el orquestador
lanza 2 o más developers en paralelo y ORC-011-A confirma scopes disjuntos.
Esto hace que Claude Code ejecute al agente en un git worktree aislado, protegiendo
la rama de trabajo de cambios accidentales durante implementaciones largas.

## Qué hace isolation: worktree

Claude Code crea automáticamente un worktree temporal en una rama nueva, ejecuta
el agente en ese worktree, y al finalizar limpia o integra los cambios según el
resultado. El directorio de trabajo del agente es el worktree, no la rama activa.

## Prerequisitos

```bash
# Git >= 2.5 (verifica versión)
git --version

# El repo debe tener al menos un commit
git log --oneline -1
```

## Uso en proyectos consumidores

Al invocar `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend`, Claude Code gestiona el worktree automáticamente.
No se requiere configuración adicional si el entorno cumple los prerequisitos.

Si el proyecto consumidor quiere controlar el directorio base de worktrees:

```bash
# Crear directorio para worktrees (opcional, Claude Code usa /tmp por default)
mkdir -p .worktrees
```

## Política de cleanup

Claude Code limpia el worktree automáticamente si el agente no realiza cambios.
Si hay cambios, devuelve la ruta del worktree y la rama creada para que el
desarrollador pueda revisarlos y mergear manualmente o vía PR.

## Activar isolation: worktree explícitamente

El orquestador puede solicitar aislamiento en la invocación cuando se cumple un
trigger de ADR-010. No se debe restaurar `isolation: worktree` permanentemente
en el frontmatter, porque volvería a convertirlo en default global:

```yaml
# No agregar permanentemente al agente:
isolation: worktree
```

## Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| "fatal: not a git repository" | El worktree se creó fuera del repo | Verificar que el CWD es la raíz del repo git |
| "worktree already exists" | Un worktree anterior no fue limpiado | `git worktree prune` para eliminar refs obsoletas |
| Cambios no aparecen en la rama principal | Worktree isolado por diseño | Mergear o cherry-pick desde la rama del worktree |
