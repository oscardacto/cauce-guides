---
name: asdd-ui-design-audit
description: Valida UI contra principios de diseño — jerarquía, color, Gestalt, proporción, tipografía y anti dark-patterns.
---

## Rol

Auditar componentes y vistas del proyecto contra los principios fundamentales de diseño definidos en el agente UI. Actúa como el último gate de calidad visual antes del handoff. Detecta violaciones de jerarquía, color, agrupación, proporción, tipografía y dark patterns.

## Cuándo activar

- El usuario pide validar diseño, revisar principios o auditoría visual
- Después de que `hifi-builder` o `figma-impl` completan componentes/vistas
- Antes de generar handoff a developer o QA
- Cuando el agente opera con alta autonomía estética (Flujo 3) — auditoría obligatoria
- Fase: **Verificar**

## Principios auditados

### 1. Jerarquía visual

| Criterio | Qué verificar |
|---|---|
| Punto focal | ¿La vista tiene un elemento dominante claro que guía la mirada? |
| Patrón de lectura | ¿El layout sigue patrón F (content-heavy) o Z (landing/hero)? |
| Niveles de énfasis | ¿Hay mínimo 3 niveles diferenciados (primario, secundario, terciario)? |
| Peso visual | ¿Elementos más importantes tienen mayor tamaño, contraste o posición? |
| Proporción branding/task | En vistas de task, ¿el branding ocupa menos del 20% del viewport? |
| Layout apropiado | ¿El layout corresponde al tipo de vista? (card centrado para forms, split para landing) |
| Jerarquía tipográfica | ¿Los headings bajan en peso/tamaño de h1 a h3+ de forma progresiva? |
| Jerarquía label/hint | ¿Hints y helpers son visualmente menores que labels? (tamaño y color diferenciados) |

### 2. Teoría del color

| Criterio | Qué verificar |
|---|---|
| Paleta con intención | ¿Hay color dominante, secundario y acento claramente definidos? |
| Proporción 85/10/5 | Si la marca define proporción, ¿se respeta? Dominante 85%, secundario 10%, acento 5% del viewport |
| Consistencia semántica | ¿Rojo = error, verde = éxito, amarillo = warning se respetan? |
| Saturación controlada | ¿La paleta no satura la vista con demasiados colores vibrantes? |
| Contraste funcional | ¿Los CTAs se diferencian claramente del contenido pasivo? |
| Relación fondo-contenido | ¿El fondo soporta la lectura sin competir con el contenido? |
| **Contraste del acento** | Cada uso del color de acento (5%) debe pasar 4.5:1 contra el fondo donde aparece. NUNCA "acento sobre acento" (verde lima sobre verde lima/oscuro derivado). Auditar cada instancia. |
| **Contraste de active states de nav** | Sidebar/nav/tabs en estado activo deben pasar AA 4.5:1 entre bg activo y texto. Anti-pattern típico: `bg-aqua-500 + text-white` (~2.3:1, falla). Validar cada instancia explícitamente, no asumir que "color de marca" garantiza contraste. |
| **Sistema de superficies** | ¿Hay 2-3 niveles de superficie diferenciados? ¿Hay al menos UN elemento focal (card oscuro, card tintado, hero CTA)? Anti-pattern: "todo blanco plano" |
| **Sistema de elevación** | ¿Las sombras siguen el sistema de 5 niveles? ¿Action cards usan `shadow-md` mínimo? ¿Hay diferenciación perceptible entre niveles? |

### 3. Leyes de Gestalt

| Ley | Qué verificar |
|---|---|
| Proximidad | Elementos relacionados están más cerca entre sí que de elementos no relacionados |
| Similitud | Elementos con la misma función comparten apariencia visual (color, forma, tamaño) |
| Continuidad | La mirada fluye naturalmente a lo largo de líneas y curvas implícitas |
| Cierre | Grupos de elementos se perciben como unidades completas (cards, secciones) |
| Región común | Elementos dentro de un contenedor visual se perciben como grupo |
| Card-container | Formularios deben estar envueltos en card con border/shadow como container |

### 4. Proporción, ritmo y espaciado

| Criterio | Qué verificar |
|---|---|
| Escala de espaciado | ¿Se usa una escala consistente? Preferir escala base-4 (4, 8, 12, 16, 24, 32, 48, 64) o escala áurea (×1.618) |
| Ritmo vertical | ¿El espacio entre secciones sigue un patrón predecible? Cada nivel de separación debe ser ~1.5× a 2× el anterior |
| Alineación | ¿Los elementos se alinean a un grid implícito o explícito? |
| Tamaños proporcionales | ¿Los componentes mantienen proporciones coherentes entre sí? |
| Whitespace | ¿Hay suficiente espacio negativo para respirar, o hay hacinamiento? |
| Golden ratio (1:1.618) | ¿Divisiones de layout usan proporciones armónicas? (60/40, 62/38, sidebar/content) |
| Espaciado relacional | ¿El espacio interno (padding) es menor que el espacio externo (margin/gap) entre elementos hermanos? |
| Densidad por contexto | ¿Formularios usan densidad media (gap 16-24px)? ¿Dashboards usan densidad alta (gap 8-16px)? ¿Landing usa densidad baja (gap 32-64px)? |

#### Reglas de espaciado

**Principio de proximidad interna vs externa:** El padding dentro de un componente siempre debe ser menor que el gap entre componentes hermanos. Si un card tiene `p-6` (24px), el gap entre cards debe ser >= `gap-8` (32px).

**Escala áurea aplicada (ratio 1.618):**
- Si el espacio base entre campos es 20px, el espacio entre secciones debe ser ~32px (20 × 1.618)
- Si el padding del card es 32px, el margin exterior del card debe ser ~52px (32 × 1.618)
- No requiere exactitud matemática — la proporción debe ser perceptible, no pixel-perfect

**Ritmo vertical en formularios:**
- Entre campos del mismo grupo: espacio uniforme (ej. `space-y-5` = 20px)
- Entre grupos/secciones: espacio mayor (~1.5×–2× el espacio entre campos)
- Antes del CTA: espacio igual o mayor que entre secciones
- Nunca agregar `mt-2` o `pt-2` arbitrarios que rompan el ritmo

### 4.5. Tipología de cards y afordancia

| Criterio | Qué verificar |
|---|---|
| Diferenciación visual entre tipos | ¿Action cards, info cards, status cards y empty cards se ven distintos? |
| Afordancia en default | ¿Las action cards comunican clicabilidad ANTES del hover? (chevron, arrow, botón visible) |
| Hover-only affordance | ❌ Anti-pattern: si la única señal de "es clicable" aparece en hover, fallar. El usuario que no mueve el mouse no sabe. |
| Estructura KPI completa | ¿Los KPI cards tienen los 4 elementos: icono container + eyebrow + número focal bold + delta? |
| Iconos en containers tintados | ¿Los iconos están envueltos en `<div>` con bg tintado, no sueltos? |

### 5. Tipografía con propósito

| Criterio | Qué verificar |
|---|---|
| Familias limitadas | ¿Máximo 2-3 familias tipográficas en el proyecto? |
| Roles claros | ¿Cada familia tiene un rol (display, body, mono)? |
| Escala coherente | ¿Los tamaños siguen una escala (modular o lineal)? |
| Legibilidad | ¿Line-height, letter-spacing y measure (ancho de línea) son adecuados? |
| Font import | ¿La fuente declarada en @theme está importada y aplicada en base? Verificar que font-weight alto (800/900) se renderiza correctamente |
| Personalidad | ¿La tipografía aporta carácter al proyecto, no es genérica por defecto? |
| **Distancia de peso entre niveles** | ¿Hay distancia ≥200 unidades entre niveles consecutivos? (heading 700, label 500, body 400, hint 400 con tamaño menor). Sin esto, jerarquía plana. |
| **Números focales en bold** | ¿Los números que son EL dato principal van en bold 700? ❌ Anti-pattern: usar light 300 en KPIs focales — se ven vacíos. Light solo para números decorativos/contextuales. |
| **Estructura eyebrow + número + delta** | ¿Los KPI cards tienen eyebrow uppercase tracking-wider arriba + número bold + delta con color semántico abajo? Sin esta estructura, los números se ven "flotantes". |
| **Tabular-nums** | ¿Listados de montos/fechas/métricas usan `tabular-nums`? Sin esto, los números no se alinean verticalmente. |

### 6. Anti dark-patterns

| Dark pattern | Qué detectar |
|---|---|
| Confirmshaming | Textos manipuladores en opciones de rechazo ("No, prefiero no ahorrar dinero") |
| Roach motel | Flujos fáciles de entrar, difíciles de salir (cancelar suscripción oculto) |
| Misdirection | Diseño visual que desvía atención del contenido importante hacia acciones no deseadas |
| Forced continuity | Suscripciones que no avisan antes de cobrar |
| Hidden costs | Costos que aparecen solo al final del flujo |
| Trick questions | Preguntas formuladas para confundir (doble negación en checkboxes) |
| Bait and switch | La acción hace algo diferente a lo que el usuario espera |

**Regla absoluta:** cualquier dark pattern detectado es severidad Crítica y bloquea el handoff.

### 7. Heurísticas de usabilidad (Nielsen)

| Heurística | Qué verificar |
|---|---|
| 1. Visibilidad del estado del sistema | ¿El usuario sabe qué está pasando? Indicadores de carga, progreso, step activo, estados de envío. ¿Los campos muestran errores en tiempo real (onBlur), no solo al submit? |
| 2. Correspondencia sistema-mundo real | ¿El lenguaje es natural y familiar para el usuario? ¿Iconos representan conceptos reconocibles? ¿El orden de campos sigue la lógica mental del usuario (ej. email antes que documento)? |
| 3. Control y libertad del usuario | ¿Puede deshacer, volver atrás, cancelar? ¿Hay "salida de emergencia" visible en cada paso? ¿Campos permiten corregir sin perder lo ya ingresado? |
| 4. Consistencia y estándares | ¿Botones del mismo tipo se ven igual en toda la app? ¿Labels, placeholders y errores usan el mismo patrón? ¿Patrones de interacción siguen convenciones de plataforma? |
| 5. Prevención de errores | ¿Hay validación en tiempo real antes del submit? ¿Inputs restringen caracteres inválidos (ej. solo números en documento)? ¿CTAs destructivos piden confirmación? |
| 6. Reconocimiento sobre recuerdo | ¿Opciones visibles en vez de memorizar? ¿Labels siempre visibles (no solo placeholders)? ¿Steps muestran nombre, no solo número? ¿Hints explican formato esperado? |
| 7. Flexibilidad y eficiencia | ¿Hay atajos para usuarios expertos? ¿OTP soporta paste? ¿Tab order es lógico? ¿Formularios soportan autofill del navegador? |
| 8. Diseño estético y minimalista | ¿Solo información relevante visible? ¿Sin ruido visual ni decoración innecesaria? ¿Cada elemento tiene un propósito claro? (Evaluado también en principios 1-5) |
| 9. Ayuda al usuario con errores | ¿Mensajes de error son en lenguaje claro (no códigos)? ¿Indican qué campo falló y cómo corregirlo? ¿Errores aparecen junto al campo, no en un bloque genérico arriba? |
| 10. Ayuda y documentación | ¿Hay hints/tooltips donde el campo no es autoexplicativo? ¿Links a documentación cuando aplica (ej. política de privacidad)? ¿Textos de ayuda son concisos? |

**Aplicación:** las heurísticas 1, 3, 5 y 9 son las más críticas en formularios. Evaluar cada una en el contexto del flujo completo, no campo por campo.

### 8. AI tells (signaturas de "diseño hecho por IA")

Detección automatizable de patrones que delatan output de LLM y degradan credibilidad del prototipo.

| Tell | Cómo detectar | Severidad |
|---|---|---|
| Nombres genéricos | `grep -rE "John Doe\|Sarah Chan\|Alex Smith\|Jane Doe\|Joe Bloggs" src/` | Crítica |
| Brands inventados | `grep -rE "Acme\b\|Globex\b\|Nexus\b\|Initech\b\|Cloudly\b" src/` | Crítica |
| Version labels en hero | `grep -rE "BETA\|V0\.[0-9]\|INVITE-ONLY\|EARLY ACCESS" src/views/ src/pages/` (revisar contexto) | Alta |
| Section-number eyebrows | `grep -rE "0[0-9] / [A-Z]+\|0[0-9]+ · " src/` | Alta |
| Fake "Trusted by" | `grep -rE "Trusted by\|Quietly in use" src/` (revisar logos genéricos) | Alta |
| AI-purple gradients | `grep -rE "from-purple-\|from-violet-.*to-blue" src/styles/ src/components/` (sin justificación de marca) | Media |
| Inter como display sin justificar | Verificar `--font-display` en theme.css | Media |
| Tres equal-width feature cards | Buscar grids `grid-cols-3` con cards idénticos visualmente | Baja |
| Hero gradient blob solo | Hero sin imagen/diagrama, solo gradient bg + text | Media |
| Em-dashes en marketing/landing | `grep -rE "—" src/views/landing/` (excluir vistas de Product mode) | Baja |
| Duplicate CTA intent | Buscar variantes de "Contact us / Get in touch / Let's talk" en misma vista | Media |
| Animated scroll cues | "Scroll", "↓ Scroll", iconos de mouse animados | Media |
| Div-based fake screenshots | Búsqueda manual: dashboards/terminales renderizados como divs en lugar de img | Alta |

**Aplicación:** ejecutar la lista de greps automáticos sobre `src/` antes de marcar APROBADO. Si hay matches con falsos positivos justificables (ej. "Acme" en un mock de cliente real), documentar excepción.

## Niveles de severidad

| Severidad | Criterio | Acción |
|---|---|---|
| **Crítica** | Dark pattern detectado, violación grave de jerarquía que impide uso, o falla en heurísticas 1/5/9 (sin feedback de estado, sin prevención de errores, errores no descriptivos) | Fix obligatorio |
| **Alta** | Violación de Gestalt o color que confunde la interfaz, o falla en heurísticas 3/4 (sin control/libertad, inconsistencia) | Fix recomendado |
| **Media** | Proporción inconsistente, tipografía genérica sin justificación, o falla en heurísticas 2/6/7 | Documentar |
| **Baja** | Oportunidad de mejora estética o de heurísticas 8/10 | Sugerencia |

## Formato de reporte

```markdown
# Auditoría de Diseño — {Componente/Vista}

**Fecha:** {YYYY-MM-DD}
**Flujo de origen:** {Flujo 1 / Flujo 2 / Flujo 3}
**Resultado:** {APROBADO / APROBADO CON OBSERVACIONES / NO APROBADO}

## Resumen por principio

| Principio | Estado | Hallazgos |
|---|---|---|
| Jerarquía visual | {✓/✗} | {n} |
| Teoría del color | {✓/✗} | {n} |
| Gestalt | {✓/✗} | {n} |
| Proporción y ritmo | {✓/✗} | {n} |
| Tipografía | {✓/✗} | {n} |
| Dark patterns | {✓/✗} | {n} |
| Usabilidad (Nielsen) | {✓/✗} | {n} |
| AI tells | {✓/✗} | {n} |

## Hallazgos

### [{Severidad}] {Principio} — {Título}
- **Archivo:** `{ruta}`
- **Problema:** {descripción concisa}
- **Principio violado:** {nombre y criterio específico}
- **Fix sugerido:** {instrucción concreta}
```

## Outputs

- `docs/ui/design-audit-{componente}.md` — reporte de auditoría de diseño

## Cuándo NO invocar

- Para crear componentes → usar `hifi-builder` o `figma-impl`
- Para auditar accesibilidad WCAG → usar `accessibility`
- Para auditar responsive → usar `responsive`
- Para configurar tokens → usar `design-tokens`

## Anti-patterns

- **Auditoría subjetiva** — reportar "no me gusta el color" sin referencia a un principio concreto. Cada hallazgo cita el principio y criterio violado.
- **Auditoría sin contexto de flujo** — aplicar el mismo nivel de exigencia estética al Flujo 1 (donde el UX ya decidió) y al Flujo 3 (donde el agente UI decidió). En Flujo 3, la auditoría es más exhaustiva porque las decisiones estéticas son propias.
- **Ignorar dark patterns** — enfocarse solo en estética y no revisar patrones engañosos. La sección 6 es obligatoria en toda auditoría.
- **Aprobación sin evidencia** — marcar "APROBADO" sin completar los 6 principios. Todos se evalúan en cada auditoría.
- **No validar layout vs tipo de vista** — pasar por alto que un formulario de registro usa split-screen en vez de card centrado. La auditoría debe verificar que el layout elegido es apropiado para el tipo de vista.
- **No detectar diseño tímido** — aprobar una vista "todo blanco plano, pesos uniformes, iconos sueltos, hover-only affordance". Esa ejecución tímida es el problema #1 del agente — debe flagearse como severidad Alta cuando se detecte.
- **No validar consistencia de canvas** — auditar cada vista por separado sin comparar anchos/paddings entre módulos. En pantallas 1920+ los saltos son evidentes.
- **No validar contraste del acento por instancia** — verificar solo el par dominante (CTA fill + texto encima) pero no cada uso del acento en la app. Verde sobre verde se cuela cuando solo se mira el par "oficial".
