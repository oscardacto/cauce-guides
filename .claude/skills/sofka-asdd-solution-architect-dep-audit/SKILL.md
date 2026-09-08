---
name: sofka-asdd-solution-architect-dep-audit
description: Audita una dependencia de terceros antes de agregarla y recomienda INSTALAR, INSTALAR CON PRECAUCIÓN o NO INSTALAR.
---

## Rol

Auditor de dependencias. Evalúa salud, seguridad y versión de una librería de terceros antes de que entre al proyecto. Produce evidencia técnica para que el equipo tome la decisión correcta — nunca la toma por ellos, pero sí emite una recomendación clara.

## Cuándo activar

- El hook `dep-check` bloqueó un write sobre un manifiesto de dependencias
- El usuario invoca explícitamente: `/sofka-asdd:dep-audit {librería} [{versión}]`
- Fases: **Construir** (primario), **Diseñar** (soporte — evaluar dependencias de la solución propuesta)

## Proceso

### 1. Resolver la librería en Context7

```
mcp__context7__resolve-library-id({ libraryName: "{librería}", query: "auditar versión estable, CVEs y estado de mantenimiento de {librería}" })
```

Si Context7 no la conoce: buscar en el gestor de paquetes del stack detectado (`npm info`, `pip show`, `mvn search`, etc. via Bash).

### 2. Obtener documentación y metadatos actualizados

```
mcp__context7__get-library-docs({ libraryId: "{id}", query: "changelog security installation" })
```

Extraer: última versión estable, versiones LTS activas, fecha del último release, estado de mantenimiento.

### 3. Evaluar las 5 dimensiones

| Dimensión | Qué revisar | Señal de alarma |
|---|---|---|
| **Versión** | ¿Es la solicitada la última estable? ¿Hay una LTS anterior más madura? | Solicitan versión con 2+ releases de retraso |
| **CVEs** | Buscar en Context7 o `npm audit` / OSV Database | CRITICAL o HIGH sin parche disponible |
| **Actividad** | Commits últimos 6 meses, issues abiertos vs cerrados | Sin commits en >12 meses |
| **Deprecación** | ¿Marcada deprecated? ¿Hay sucesor oficial? | `deprecated` en npm, `security` advisory |
| **Licencia** | MIT / Apache 2 / BSD → libre · GPL → contagioso · commercial → revisar | GPL en proyecto privado o licencia restrictiva |

### 4. Emitir recomendación

- **✅ INSTALAR**: librería saludable, versión adecuada, sin CVEs críticos
- **⚠️ INSTALAR CON PRECAUCIÓN**: se puede usar pero con advertencia documentada (ej. CVE de severidad media sin explotar, versión ligeramente desactualizada, actividad baja pero proyecto estable)
- **❌ NO INSTALAR**: deprecada, CVE crítico sin parche, alternativa superior disponible, licencia incompatible

### 5. Guardar el reporte

Escribir en `docs/tech/dep-audit-{slug}-{YYYYMMDD}.md`:

```markdown
# Dep Audit — {librería} {versión solicitada}

**Fecha**: {YYYY-MM-DD}
**Stack detectado**: {npm|maven|pip|go|gem|...}
**Auditado por**: sofka-asdd-solution-architect (dep-audit)

**Recomendación**: ✅ INSTALAR | ⚠️ INSTALAR CON PRECAUCIÓN | ❌ NO INSTALAR

## Resumen ejecutivo
{2-3 oraciones: qué es la librería y veredicto en términos de negocio}

## Evaluación técnica

| Dimensión | Estado | Detalle |
|---|---|---|
| Versión solicitada | {versión} | {¿última? ¿LTS anterior disponible?} |
| Última versión estable | {versión} | Release: {fecha} |
| CVEs conocidos | {NONE/MEDIUM/HIGH/CRITICAL} | {detalle o "ninguno en el rango solicitado"} |
| Actividad del repo | {ACTIVO/BAJO/INACTIVO} | {último commit, issues} |
| Deprecación | {NO/SÍ} | {sucesor oficial si aplica} |
| Licencia | {MIT/Apache/GPL/...} | {compatible con el proyecto: sí/no/revisar} |

## Versión recomendada
{versión exacta sugerida con justificación — puede diferir de la solicitada}

## Alternativas (si ❌ NO INSTALAR)
- {alternativa 1} — {por qué es mejor}
- {alternativa 2}

---
<!-- Si el equipo decide proceder contra la recomendación ❌, completar: -->
<!-- override: accepted -->
<!-- override_reason: "<razón técnica documentada>" -->
<!-- override_approved_by: "<nombre>" -->
```

## Cuándo NO invocar

- La "dependencia" es un módulo interno del proyecto — solo analiza librerías de terceros
- Ya existe un reporte reciente (< 7 días) en `docs/tech/dep-audit-{slug}-*.md` — releer el existente antes de regenerar
- Se está actualizando un patch/minor de una dep ya auditada — no requiere nuevo audit

## Anti-patterns

- **Recomendación sin evidencia** — "esta librería parece buena" sin datos de Context7 o el gestor de paquetes. Cada dimensión de la tabla debe tener datos reales.
- **Bloquear sin alternativa** — si la recomendación es ❌, SIEMPRE proponer al menos una alternativa viable. Un NO sin alternativa es una recomendación incompleta.
- **Ignorar la licencia** — en proyectos privados, GPL contagia el código propiedad. No es opcional revisarla.
- **Confundir última versión con mejor versión** — a veces la LTS N-1 es más estable que la latest. Documentar el trade-off.
