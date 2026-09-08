# Artefactos Efímeros — No ensuciar el proyecto

> Aplica a TODO agente. Evidencia del problema: scripts throwaway (`analyze_gaps.py`,
> `jacoco_gaps.py`, `parse_lcov.py`) abandonados en la raíz del repo.

## Principio

Todo archivo o script creado SOLO para completar o validar una tarea — que NO es
entregable, NO es documentación del proyecto, NO es código de producción ni de test —
es un **artefacto efímero**. No debe ensuciar el proyecto.

## Regla 1 — Trabajar en zona designada (PREVENCIÓN, primera opción)

Scripts de análisis, parseo, validación ad-hoc, dumps temporales → crear SIEMPRE en `.tmp/`
(raíz del repo, gitignored). NUNCA en la raíz del repo, `src/`, `docs/` ni dentro de módulos del proyecto.

```bash
mkdir -p .tmp && touch .tmp/analyze-coverage-$(date +%Y%m%d).py
```

Si trabajas en `.tmp/`, no hay nada que limpiar después — git lo ignora.

## Regla 2 — Limpiar solo lo propio, solo al terminar

Si un artefacto efímero acabó fuera de `.tmp/` (raíz, etc.), eliminarlo DESPUÉS de cumplir
su propósito y ANTES de cerrar el turno o hacer push. Eliminar con borrado simple
(`rm <archivo>`), nunca `rm -rf`.

## Regla 3 — NUNCA borrar (salvaguardas duras — no negociables)

| Señal | Acción |
|---|---|
| Archivo trackeado por git (`git ls-files <f>` lo lista) | NUNCA borrar — es entregable |
| Archivo que YA existía antes de tu turno | NUNCA borrar — no lo creaste tú |
| Dentro de `src/`, `docs/`, `.claude/`, o cualquier submódulo del proyecto | NUNCA borrar — es código/doc del proyecto |
| Cualquier duda sobre si es efímero o entregable | NO borrar — reportar al usuario y preguntar |

**Solo es elegible para borrado:** archivo NO trackeado + creado por ti en este turno +
fuera de las zonas de entregable + sin valor de reutilización.

## Regla 4 — Verificación antes de cerrar

Antes de push o de declarar la tarea completa:

```bash
# Artefactos sueltos no trackeados en la raíz (señal de basura)
git status --porcelain | grep -E '^\?\? [^/]+\.(py|sh|js|mjs|txt|log|json|csv)$'
```

Si aparece algo → decidir por archivo: mover a `.tmp/`, eliminarlo (si es tuyo y efímero),
o reportar al usuario (si hay duda). NUNCA pushear con artefactos efímeros sueltos.

## Qué SÍ es entregable (no aplica esta regla)

Código de producción, tests, migraciones de base de datos, documentación en `docs/`, runbooks,
archivos de config del proyecto, scripts reutilizables versionados (`scripts/`). Estos se commitean, no se borran.
