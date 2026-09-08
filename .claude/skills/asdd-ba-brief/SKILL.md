---
name: asdd-ba-brief
description: Construye el brief del flujo BA standalone, insumo para la EDT. Se activa dentro de asdd-ba-functional-architect.
---

> Rutas en **Layout B** (carpeta por nodo) — ver `.claude/reference/ba/asdd-ba-specs-layout.md`.

Skill de construcción de brief del `asdd-ba-functional-architect`. Produce el documento de encuadre que responde qué se construye, para quién, con qué restricciones y en qué dominio — el punto de partida antes de descomponer en EDT.

## Cuándo se activa

- El AF trabaja **standalone** y aún no existe un brief para el feature/proyecto.
- Se necesita fijar alcance, objetivos y restricciones antes de producir la EDT.

Si el equipo ASDD está orquestando (ciclo del equipo, fase Especificar), el brief lo produce `asdd-producto` (skill `pm`) — este skill es para el flujo standalone del AF. **Mismo artefacto y ruta** (`docs/specs/_proyecto/brief-{feature}.md`), sin duplicar formato.

## Fuentes

- Documentación del cliente en `inputs/{feature}/` (RFP, BRD, actas, transcripciones).
- Input directo del AF (conocimiento tácito, contexto de reuniones).
- `docs/lecciones/` — lecciones de proyectos previos (si existen) que informen restricciones o riesgos conocidos.

## Estructura del brief (fija)

```
# Brief — {feature/proyecto}

| Campo | Valor |
|---|---|
| Fecha | {fecha} |
| Solicitante / Cliente | {rol} |
| Dominio | {sector / dominio funcional} |

## 1. ¿Qué construimos?
{alcance en 1-3 párrafos de negocio}

## 2. ¿Para quién?
{usuarios/actores principales y el valor que reciben}

## 3. Objetivos y criterios de éxito
- {objetivo} — éxito: {indicador medible}

## 4. Alcance
- **Dentro:** {capacidades incluidas}
- **Fuera (explícito):** {exclusiones}

## 5. Restricciones
{regulatorias, técnicas conocidas, de tiempo/presupuesto, de dominio}

## 6. Contexto de dominio
{reglas del sector, regulaciones, integraciones conocidas relevantes}

## 7. Supuestos y decisiones abiertas
- {supuesto} — {confirmado / PENDIENTE con dueño}
```

## Proceso

1. Leer `inputs/{feature}/` y el input del AF.
2. Consultar `docs/lecciones/` si existe (riesgos/restricciones de proyectos previos).
3. Redactar el brief sección por sección; lo que no se sabe → §7 como decisión abierta (no inventar).
4. Guardar en `docs/specs/_proyecto/brief-{feature}.md`.
5. Registrar en bitácora vía `asdd-ba-change-log` (tipo `ESTADO`: brief creado).

## Relación con la EDT

El brief es el input directo del propio `asdd-ba-functional-architect` para producir la EDT. Un brief con objetivos y restricciones claros produce una mejor descomposición; los huecos del brief (§7) se arrastran como decisiones pendientes en la EDT.

## Checklist de salida

- [ ] Responde las 4 preguntas núcleo: qué / para quién / con qué restricciones / qué dominio
- [ ] Alcance con "Dentro" y "Fuera (explícito)"
- [ ] Objetivos con criterio de éxito medible
- [ ] Lo desconocido en §7 como decisión abierta, no inventado
- [ ] Guardado en `docs/specs/_proyecto/brief-{feature}.md`; bitácora registrada (`ESTADO`)

## Anti-patterns

- **Brief sin exclusiones** — sin "Fuera de alcance" explícito, todo parece incluido → scope creep desde el día 1.
- **Objetivos sin métrica** — "mejorar la experiencia" no es un objetivo verificable.
- **Inventar restricciones o datos** — lo que no se sabe va a §7, no se rellena a ojo.
