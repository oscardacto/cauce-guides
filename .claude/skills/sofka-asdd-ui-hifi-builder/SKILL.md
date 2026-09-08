---
name: sofka-asdd-ui-hifi-builder
description: Construye componentes y vistas hi-fi de producción con React, Vite y Tailwind v4.
---

## Rol

Crear componentes y vistas de interfaz hi-fi con código de producción real. Opera bajo el paradigma "Design in Code": genera HTML/React funcional en el navegador, no mockups estáticos. Cada output debe ser visualmente distintivo, técnicamente sólido y alineado a los design tokens del proyecto.

## Alcance: prototipo visual, NO sistema productivo

Esta skill produce **prototipos visuales de alta fidelidad**, no aplicaciones productivas. La diferencia es crítica para no gastar tiempo en lo que no aporta:

| ✅ Sí construir (prototipo visual) | ❌ NO construir (sistema productivo) |
|---|---|
| Estados visuales (default, hover, focus, error, loading, empty, disabled) | Integración real con backend / APIs reales |
| Validación de formato del frontend (regex de email, longitud, formato) | Validación de negocio que requiere backend (consulta de nómina, score crediticio, antigüedad real) |
| Mocks que simulan respuestas del backend (delays, success/error toggles) | Reglas de negocio complejas (cálculo real de cuota con tasa MV/NA/EA, motor de gating) |
| Estados de error simulados (servicio caído, score<500) controlados por toggle | Manejo real de errores HTTP, retries, circuit breakers |
| Cifras tabulares y formato de moneda visual (COP $1.234.567) | Cálculos financieros precisos auditables |
| Navegación y routing entre vistas | Autenticación real (JWT, refresh tokens, RBAC) |
| Iconografía, motion, jerarquía visual, copy | Persistencia en base de datos, encriptación |

**Regla:** cuando la HU dice "el sistema valida X contra el backend Y", el prototipo lo simula con mock + delay + toggle de estado. No se construye la lógica real.

**Cómo simular validaciones de negocio sin implementarlas:**

```js
// En src/mocks/business-rules.js — toggles para estresar estados
export const MOCK_USER = {
  antiguedadMeses: 18,        // toggle: 1 (bloqueado), 18 (ok)
  scoreRiesgo: 720,            // toggle: 450 (sin A/B), 720 (con A/B)
  empresaActiva: true,         // toggle para gating
  moraDias: 0,                 // toggle: 0, 30, 90+ (bloquea simular)
}
```

Cada vista debe incluir un panel/toggle "demo" visible solo en development para cambiar entre estados extremos y validar el diseño en cada caso.

## Cuándo activar

- El usuario pide construir un componente, página o vista sin URL de Figma
- Existen wireframes mid-fi del agente UX que necesitan elevarse a hi-fi
- Se reciben HU o specs escritas que describen la interfaz a construir
- Fase: **Construir**

## Enfoque Spec-First

Antes de escribir código, la skill exige o construye una especificación mínima:

| Elemento | Obligatorio | Fuente |
|---|---|---|
| Design tokens configurados (`@theme`) | Sí | `design-tokens` debe haber corrido antes |
| Lista de componentes atómicos requeridos | Sí | Extraída de specs/HU o wireframes |
| Sitemap o flujo de pantallas (si es vista completa) | Sí para vistas | HU, specs o screen-inventory del UX |
| Referencia visual (wireframe, sketch, descripción) | Recomendado | Cualquier fuente |
| Assets del cliente (logo SVG/PNG, favicon) | Sí | Proporcionado por el usuario o extraído de Figma |

Si falta algún elemento obligatorio, la skill lo solicita antes de generar código. Nunca improvisa estructura. En particular, **nunca usar texto plano como sustituto de un logo** — solicitar el asset al usuario.

## Ritual previo: "Reading the room"

Antes de Paso 0, el agente declara explícitamente cómo está leyendo el brief. Esta declaración va al inicio del primer output (ej. respuesta de "Validación de flujo previa") y orienta TODAS las decisiones estéticas posteriores.

**Formato obligatorio:**

```
Reading this as: [page kind] for [audience], with a [vibe] language,
leaning toward [system/aesthetic reference].

Mode: [Brand | Product]
DESIGN_VARIANCE: [1-10]   — basado en [razón del brief]
MOTION_INTENSITY: [1-10]  — basado en [razón del brief]
VISUAL_DENSITY: [1-10]    — basado en [razón del brief]
```

**Ejemplo de declaración correcta:**

```
Reading this as: portal de clientes fintech (libranzas Colombia) for empleados
asalariados de empresas con convenio, with a profesional-confiable language,
leaning toward Mercury/Linear (app UI moderna fintech).

Mode: Product (design SERVES the product)
DESIGN_VARIANCE: 4 — fintech regulado requiere familiaridad, no experimentación
MOTION_INTENSITY: 3 — acciones de teclado frecuentes, motion sutil
VISUAL_DENSITY: 5 — daily app rhythm, ni gallery ni cockpit
```

**Por qué:** sin declaración explícita el agente improvisa. Con declaración, las decisiones de espaciado, animación y composición tienen referencia clara. El stakeholder puede corregir EL READING antes de invertir en construcción.

### Brand vs Product Mode

Distinción crítica de diseño que cambia decisiones desde el inicio:

| Aspecto | Brand Mode | Product Mode |
|---|---|---|
| **Premisa** | "Design IS the product" | "Design SERVES the product" |
| **Casos de uso** | Landing, marketing, portfolio, hero | App UI, dashboards, formularios, herramientas |
| **Métrica de éxito** | Distinctiveness (memorable, único) | Earned familiarity (Linear/Figma/Notion patterns) |
| **DESIGN_VARIANCE típico** | 6-10 (asimetría, masonry, riesgo) | 3-5 (grids, predictibilidad) |
| **MOTION_INTENSITY típico** | 5-10 (scroll-hijack, parallax permitidos) | 1-4 (motion solo con propósito, <300ms) |
| **VISUAL_DENSITY típico** | 1-4 (gallery, espacios generosos) | 4-7 (daily app rhythm) |
| **Tipografía** | Puede usar serifs expresivos, mezclar familias | Limitada a 2 familias, una de ellas neutra |
| **Hero** | Editorial, puede ocupar viewport completo | Si existe, mínimo y funcional |
| **Iconografía** | Puede ser custom, ilustración | lucide-react o equivalente sistémico |

**Cómo elegir:**
- ¿La HU es de un módulo de aplicación (dashboard, formulario, listado)? → **Product**
- ¿La HU es landing, portfolio, página de marketing? → **Brand**
- Una app puede tener UNA sección en Brand mode (landing público) + el resto en Product mode (app privada)

**Anti-pattern:** aplicar Brand mode a una vista de Product (dashboard con scroll-hijack y heros editoriales) o Product mode a Brand (landing tímida con espaciado de app).

## Proceso de construcción

### Paso 0 — Setup del proyecto y servidor de desarrollo
Antes de construir cualquier componente:
1. Inicializar el proyecto si no existe (`npm create vite@latest . -- --template react` o `react-ts`)
2. Instalar dependencias (`npm install`)
3. **Verificar que el puerto está libre** antes de lanzar dev server — si hay otra instancia de Vite corriendo en otro proyecto, hay conflicto IPv4/IPv6:
   ```bash
   lsof -i :5173 -sTCP:LISTEN
   ```
   Si hay algo escuchando, usar `--port 5174` o matar el viejo si es seguro.
4. Verificar que `src/styles/theme.css` (tokens) esté importado en `main.jsx`/`main.tsx`
5. **Levantar el servidor de desarrollo COMO PROCESO PERSISTENTE EN BACKGROUND** con log a archivo:
   ```bash
   npm run dev > /tmp/dev-server.log 2>&1 &
   ```
   o usando `run_in_background: true` del tool Bash.
6. **Verificación obligatoria — NO basta con HTTP 200:** antes de declarar "dev server listo":
   - Ejecutar **`npx vite build`** — debe pasar con 0 errores. Esto detecta problemas que `tsc --noEmit` no ve (verbatimModuleSyntax, missing exports, imports rotos).
   - Verificar listening real: `lsof -i :5173 -sTCP:LISTEN`
   - Verificar que el HTML sirvido tiene root + main script: `curl -s http://localhost:5173/ | grep -E 'id="root"|main\.tsx'`
   - **Solo después de estos 3 chequeos** se puede reportar "dev server activo".

**Regla crítica:** HTTP 200 + "Vite ready" NO significa que la app renderice. Vite devuelve el shell HTML aunque el bundle JS falle por errores de imports. El usuario abre el navegador y ve una página blanca. El agente DEBE validar con `vite build` antes de declarar éxito.

**Anti-pattern de Ronda 2:** reportar "dev server activo en :5173, 0 errores TS" cuando en realidad el bundle fallaba por imports de interfaces sin `type` (con verbatimModuleSyntax: true). El usuario veía página en blanco. Ejecutar `vite build` lo habría detectado.

### TypeScript: imports de tipos con verbatimModuleSyntax

Los templates Vite `react-ts` activan `verbatimModuleSyntax: true` por defecto. Esto exige que **interfaces y types** se importen con `import type` separado del runtime.

```ts
// ❌ INCORRECTO — Vite build falla con MISSING_EXPORT (Producto es interface)
import { productosMock, Producto } from '../lib/mocks'

// ✅ CORRECTO — type separado
import { productosMock, type Producto } from '../lib/mocks'

// ✅ ALTERNATIVA — import type completo
import { productosMock } from '../lib/mocks'
import type { Producto } from '../lib/mocks'
```

**Auto-detección:** si `tsconfig.app.json` o `tsconfig.json` contiene `"verbatimModuleSyntax": true`, TODOS los imports de interfaces/types DEBEN usar `import type`. Es regla del proyecto, no preferencia. `tsc --noEmit` PASA aunque el código esté mal (TS borra tipos), pero `vite build` falla en runtime → página blanca para el usuario.

### Manejo de assets binarios (logos, imágenes)
Cuando el cliente provee assets (PNG, JPG, SVG, WebP):
1. Copiar al proyecto: `cp /path/to/asset.png src/assets/brand/`
2. **Usar el asset en el render directamente** — `<img src="..." />` — aunque no sea el formato ideal
3. PNG/JPG son **assets válidos** para prototipo. El formato ideal (SVG) es preferencia, no requisito
4. Si hay PNG y se quiere SVG en el futuro: usar el PNG con `<img>` + comentario `// TODO: pedir SVG cuando esté disponible`
5. **NUNCA** renderizar texto placeholder cuando el asset SÍ está disponible en el proyecto — eso es contradicción de estado

**Anti-pattern detectado en Ronda 1:** copiar los PNG a `src/assets/brand/` y renderizar `<span>MoMentum</span>` con comentario `[PENDIENTE asset] reemplazar por SVG`. Si el PNG está copiado, úsalo.

### Paso 1 — Componentes atómicos (los ladrillos)
Construir elementos base aislados: botones, inputs, cards, badges, avatars, etc.
- Un archivo por componente en `src/components/`
- Cada componente usa exclusivamente tokens de `@theme`
- Incluir todos los estados: default, hover, focus, active, disabled
- Validar en navegador antes de continuar

### Paso 2 — Composiciones (moléculas)
Combinar atómicos en bloques reutilizables: formularios, headers, navigation bars, cards con contenido.
- Importar atómicos existentes — nunca duplicar código
- Regla DRY estricta: si un patrón aparece 2+ veces, extraer a componente

### Paso 3 — Vistas completas (páginas)
Ensamblar composiciones en layouts completos.
- Consultar tabla "Reglas de composición por tipo de vista" para elegir layout
- Usar card-container como default para formularios (region común Gestalt)
- Mapear **todos** los estados del flujo end-to-end antes de construir step indicators
- Usar CSS Grid / Flexbox para layout principal
- Inyectar datos simulados para estresar el diseño (nombres largos, textos vacíos, listas de 0/1/100 items)
- Configurar enrutamiento si hay múltiples vistas

### Paso 4 — Integración multi-vista (app shell)

**Regla crítica:** cuando el proyecto tiene 2+ HU del mismo producto, todas las vistas son parte de **una sola aplicación**. No son apps independientes.

**Antes de construir la primera vista, definir:**
1. **App Shell** — el layout raíz compartido (`App.jsx`/`App.tsx`) que contiene:
   - Navegación global (sidebar, navbar o tabs según tipo de app)
   - Routing (`react-router-dom` o similar)
   - Estado global mínimo (usuario logueado, tema)
2. **Mapa de navegación** — cómo se conectan las vistas entre sí:
   - ¿Desde dónde se llega a cada vista?
   - ¿Qué CTAs en una vista apuntan a otra?
   - ¿Hay vistas públicas (login, registro) vs privadas (dashboard)?
3. **Layout compartido por zona:**
   - **Zona pública** (registro, login): sin sidebar, card centrado
   - **Zona privada** (dashboard, simulador, perfil): con sidebar/navbar, content area

| Situación | Qué hacer |
|---|---|
| Múltiples HU del mismo producto | Crear App Shell con routing. Cada HU es una ruta, no una app separada |
| Vista con CTA que lleva a otra HU | Usar `<Link>` o `navigate()`, nunca `<a href>` a página estática |
| Vistas públicas + privadas | Crear 2 layouts: `PublicLayout` (sin nav) y `PrivateLayout` (con nav). App Shell decide cuál usar |
| Dashboard con sub-secciones | Cada sub-sección (simulador, historial, perfil) es una ruta hija del layout privado |

**Regla de ruta default:** la ruta `/` de la zona privada siempre apunta al **dashboard home** (vista principal del usuario). Nunca a un módulo secundario como simulador o perfil. El dashboard es el punto de partida después del login.

#### PrivateLayout — Anatomía obligatoria

El layout privado sigue el patrón estándar de aplicaciones web. **Todos los módulos** de la zona privada comparten exactamente el mismo frame visual:

```
┌──────────────────────────────────────────────────────┐
│  Header (fijo)                                        │
│  [Logo/Marca]  [Breadcrumb]           [Avatar/Perfil] │
├────────┬─────────────────────────────────────────────┤
│        │  Page Header                                 │
│ Sidebar│  [Título]  [Descripción]        [Acciones]   │
│  (nav) │─────────────────────────────────────────────│
│        │                                              │
│  · Home│  Content Area                                │
│  · Sim.│  (cada módulo renderiza su contenido aquí)   │
│  · Hist│                                              │
│  · Perf│                                              │
│        │                                              │
├────────┴─────────────────────────────────────────────┤
│  Footer (opcional)                                    │
└──────────────────────────────────────────────────────┘
```

**Componentes del PrivateLayout:**

| Componente | Ubicación | Contenido | Responsabilidad |
|---|---|---|---|
| **Header** | Top, full-width | Logo/marca, breadcrumb, avatar, perfil, notificaciones | Siempre visible. Fijo en scroll. |
| **Sidebar** | Left, height completo | Links de navegación con iconos, indicador de ruta activa, logo colapsado | Navegación entre módulos. Colapsable en mobile (hamburger). |
| **Page Header** | Top del content area | Título de página, descripción, acciones contextuales (botones), breadcrumb | Cambia por ruta. Cada página define su título/acciones. |
| **Content Area** | Centro-derecha | El contenido específico de cada módulo | Aquí va el `<Outlet />` del router. |

**Regla del canvas consistente:** el frame (header + sidebar + page header) **nunca cambia de dimensiones** entre módulos. Solo cambia el contenido del `Content Area` y los datos del `Page Header`. El simulador, el historial, el perfil — todos se renderizan dentro del mismo frame exacto.

**Page Header — patrón por página:**

```jsx
// Cada página exporta o define su page header
<PageHeader
  title="Simulador de crédito"
  description="Calculá tu cuota mensual estimada"
  breadcrumb={['Inicio', 'Simulador']}
  actions={<Button>Nueva simulación</Button>}  // opcional
/>
```

| Elemento | Obligatorio | Descripción |
|---|---|---|
| `title` | Sí | Nombre del módulo. h1 de la página. |
| `description` | Recomendado | Breve descripción de qué hace esta sección. |
| `breadcrumb` | Sí | Ruta de navegación: Inicio > Módulo > Sub-sección |
| `actions` | Opcional | Botones de acción contextual (nuevo, exportar, filtrar) |

**Anti-patterns:**

- Construir cada HU como una app aislada con su propio `App.jsx`. Produce vistas desconectadas sin navegación compartida.
- Cambiar las dimensiones del sidebar o header entre módulos. El frame debe ser idéntico.
- No definir una ruta default — el usuario entra y ve una página vacía o un módulo secundario.
- Renderizar el simulador o sub-módulos en un canvas/lienzo diferente al del dashboard. Mismo frame, diferente contenido.

**Ejemplo de estructura:**
```
src/
├── App.jsx                   ← Shell: routing + layouts
├── layouts/
│   ├── PublicLayout.jsx      ← Sin sidebar (registro, login)
│   └── PrivateLayout.jsx     ← Sidebar + Header + Content Area
├── components/
│   ├── Sidebar.jsx           ← Navegación lateral compartida
│   ├── Header.jsx            ← Header superior compartido
│   ├── PageHeader.jsx        ← Título + descripción + breadcrumb + acciones
│   └── ...                   ← Atómicos compartidos
├── pages/
│   ├── RegisterPage.jsx      ← HU-3 (zona pública)
│   ├── DashboardPage.jsx     ← HU-5 (zona privada, ruta default "/")
│   ├── SimulatorPage.jsx     ← HU-7 (zona privada, ruta "/simulador")
│   └── ...
└── mocks/                    ← Datos simulados
```

### Limpieza de contexto
Ejecutar `/clear` después de cada paso cuando el proyecto tiene más de 5 componentes.

## Accesibilidad shift-left (requisito de BUILD, no de audit)

La accesibilidad no es algo que se audita al final — se construye desde el principio. La skill `accessibility` valida; esta skill **garantiza**. Cada componente y vista debe cumplir lo siguiente **al momento de escribirse**, no después.

### Checklist obligatorio por componente

| Componente | Requisitos a11y de build |
|---|---|
| **Input/Select/Textarea** | `<label htmlFor>` visible (no solo placeholder); `aria-invalid` cuando hay error; `aria-describedby` apuntando al error/hint; `required` propagado |
| **Button** | Texto visible o `aria-label` si solo lleva ícono; `disabled` real, no clase de estilo; `type` explícito (submit/button) |
| **Modal/Dialog** | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apuntando al título; focus-trap; foco al primer elemento al abrir; restaurar foco al cerrar; cierre con Escape |
| **Wizard/Stepper** | Anunciar cambio de paso con `aria-live="polite"`; `aria-current="step"` en el paso activo; nombre + número, no solo número |
| **Toast/Notification** | `role="status"` (informativo) o `role="alert"` (urgente); auto-dismiss respeta `prefers-reduced-motion` |
| **Tabla** | `<th scope="col">` o `scope="row"`; `<caption>` o `aria-label`; columnas numéricas con `tabular-nums` |
| **Iconografía interactiva** | `aria-label` obligatorio; iconos decorativos con `aria-hidden="true"` |
| **Focus visible** | Todo elemento interactivo con `:focus-visible` con outline/ring visible (no `outline: none` sin reemplazo) |
| **Sidebar/Nav items** | Active state debe pasar WCAG AA 4.5:1 entre bg y texto. **Validar al construir**, no en audit. Color de marca como bg no garantiza contraste con texto blanco. |

### Pares válidos para active state (sidebar oscuro con acento)

Cuando el sidebar tiene fondo oscuro de marca y el active state usa el acento secundario (típicamente aguamarina/cyan medio), el texto blanco sobre el acento **falla AA** (~2.3:1). Patrones válidos:

| Patrón | Active bg | Active text | Contraste | Cuándo usar |
|---|---|---|---|---|
| Acento + texto oscuro | aguamarina-500 (cyan medio) | dark-500 (oscuro de marca) | ~6.8:1 ✓ AAA | Default recomendado |
| Acento claro + texto oscuro | aguamarina-100 (cyan muy claro) | dark-700 | ~12:1 ✓ AAA | Si el acento medio resulta "muy chillón" |
| Transparencia + texto claro + border | bg-white/10 | white | ~3:1 (large text only) + border-l-4 acento como indicador | Diseño más sutil |

Validar contraste en cada nueva variante. NUNCA usar acento medio (cyan/aguamarina-500) como bg con texto blanco.

### Anti-pattern
- **A11y al final** — construir sin labels, sin aria-*, sin focus-trap y "después se audita". Genera retrabajo. La auditoría confirma, no construye.
- **Active state sin validar contraste** — usar color de marca como bg sin verificar que el texto pasa AA. El cyan/aguamarina medio sobre blanco falla.

## CTA deshabilitado: siempre explica su causa

**Regla:** todo botón/CTA con estado `disabled` debe comunicar **por qué** está deshabilitado. Un botón gris sin contexto es una violación de Nielsen #1 (visibilidad del estado del sistema).

### Patrón obligatorio

| Causa del disabled | Cómo comunicarlo |
|---|---|
| Formulario incompleto | Mensaje inline arriba del CTA: "Completá todos los campos obligatorios" — o tooltip on-hover |
| Validación cross-field falla (ej. referencias duplicadas, capacidad excedida) | Mensaje reactivo **debajo del campo causante** + tooltip en el CTA explicando |
| Bloqueo por estado del negocio (ej. mora > 90 días → "Simular" disabled) | Tooltip on-hover con la razón + ícono de info junto al botón |
| Loading/procesando | Spinner dentro del botón + texto "Procesando..." |
| Permiso insuficiente | Tooltip on-hover: "No tenés permiso para esta acción" |

### Anti-patterns

- **CTA gris sin causa** — botón disabled y nada explica al usuario por qué. El usuario queda perdido.
- **Error solo al intentar avanzar** — validación cross-field que no se dispara hasta que el usuario hace click en un botón que está disabled (paradoja: el botón disabled nunca dispara). Los errores bloqueantes/cross-field deben aparecer **reactivos** junto al campo causante, no detrás de un submit imposible.

### Validación cross-field reactiva

Cuando la validación depende de **múltiples campos**, el error debe aparecer en cuanto la combinación es inválida — no esperar al submit. Ejemplos:
- Confirmar contraseña ≠ contraseña → error en `onBlur` del campo de confirmación
- Dos referencias con el mismo número de documento → error junto a la segunda referencia
- Cuota mensual > 50% del salario → indicador de capacidad excedida visible **antes** del botón disabled

**Patrón:** valida reactivamente al cambiar el campo dependiente, no solo al submit.

## Guía estética por nivel de autonomía

| Flujo | Autonomía | Qué decide la skill | Qué NO decide |
|---|---|---|---|
| Flujo 1 (UX sync) | Baja | Refinamiento visual, micro-interacciones, polish hi-fi | Estructura, layout, flujo — vienen del UX |
| Flujo 3 (HU/Specs) | Alta | Tipografía, composición, motion, dirección estética completa | Contenido, lógica de negocio — vienen de las HU |

Cuando la autonomía es alta, aplicar los principios del agente:
- Elegir tipografías con personalidad (evitar genéricas sin justificación)
- Composición con intención: asimetría, espacios generosos o densidad controlada
- Motion con propósito: transiciones de entrada, hover states, scroll reveals
- Paleta con dominante + acento, no distribución tímida

## Reglas de composición por tipo de vista

| Tipo de vista | Layout default | Branding | Container |
|---|---|---|---|
| Registro / Login / Onboarding | Card centrado single-column | Mínimo: logo + tagline arriba | Card con border sutil + shadow |
| Checkout / Pago | Card centrado single-column | Mínimo | Card con border |
| Landing / Marketing | Split-screen o hero + secciones | Expandido (hasta 40% viewport) | Secciones full-width |
| Dashboard / App | Sidebar + content area | Nav bar con logo | Panels/cards por módulo |

**Regla clave:** en vistas de task (forms, checkouts, onboarding), el branding no debe superar el 20% del viewport. El usuario vino a completar una tarea, no a consumir marketing.

**Regla de header/branding sin assets:** si no se dispone del logo real del cliente, NO renderizar una barra de branding con texto placeholder ("SI", "Logo", nombre en texto). Un header con texto simulando un logo no aporta valor y ocupa espacio. En su lugar: omitir el header hasta que el asset real esté disponible, o usar un header mínimo solo con navegación funcional (back, steps).

## Canvas consistente (1920+)

En pantallas grandes (1920×1080 y superiores), TODOS los módulos del portal comparten el mismo max-width del Page container. Sin saltos de ancho entre vistas.

**Regla:**

1. **Existe UN solo max-width por defecto** para todo el contenido de PrivateLayout — recomendado `max-w-[1440px]` para fintech/SaaS modernos.
2. Variantes del Page container son EXCEPCIONES justificadas, no opciones libres:
   - `narrow` (`max-w-2xl`) — SOLO formularios single-column (perfil, configuración)
   - `default` (`max-w-[1440px]`) — TODO lo demás (dashboard, listados, simulador, catálogo)
   - `wide` (`max-w-[1600px]`) — SOLO tablas masivas justificadas
3. **Padding lateral idéntico** entre módulos (`px-6 lg:px-8`)
4. **Validar en 1920×1080 explícitamente** antes de aprobar cualquier módulo — no solo en 1280/1440

**Anti-pattern:** "cada módulo elige su ancho" — produce saltos visuales molestos entre vistas, especialmente en monitores grandes (gutters de 100px vs 200px).

## Patrones de dashboard moderno (2025-2026)

Patrones destilados de referentes contemporáneos (Mercury, Linear, Vercel, Stripe Dashboard, Notion, Credify) — aplicar en vistas tipo dashboard, listado y métricas.

### 1. Action cards con afordancia EXPLÍCITA en default

Las action cards comunican que son clicables ANTES del hover. Patrones aceptables:

| Patrón | Cuándo usar |
|---|---|
| Chevron `>` o arrow `↗` esquina superior derecha o final de row | Cards en grid o lista — más común |
| Botón secundario explícito ("Ver detalle", "Simular este crédito") | Cards con CTA principal |
| Border-left de color + título destacado | Cards de estado (status cards) |
| Icono direccional al final junto al título | Cards horizontales tipo list-item |

Anti-pattern: solo hover (cursor pointer + bg change). El usuario que NO mueve el mouse no sabe que es clicable.

### 2. Sistema de superficies MIXTAS (no todo blanco)

Una vista bien diseñada tiene **2-3 niveles de superficie**, no todo en blanco/gris. Define tu sistema en tokens:

```css
--color-surface-page: #F8FAFC;       /* fondo general */
--color-surface-card: #FFFFFF;       /* cards normales */
--color-surface-elevated: #F1F5F9;   /* cards en hover, sections destacadas */
--color-surface-dark: var(--color-primary-900);  /* hero card oscuro focal */
--color-surface-accent: var(--color-accent-50);  /* card destacada con tinte de acento */
```

**Regla:** cada vista tiene al menos UN elemento focal de superficie diferenciada (un card oscuro, un card con tinte del acento, o un hero CTA destacado). Romper la monotonía de blanco crea jerarquía visual.

Anti-pattern: TODO blanco plano — produce sensación de wireframe o de aplicación outdated.

### 3. Iconografía en containers tintados

Iconos en `<div>` con background tintado + radius medio:

```jsx
<div className="rounded-lg bg-primary-50 p-2.5">
  <Icon className="h-5 w-5 text-primary-700" strokeWidth={2} />
</div>
```

- Bg: `bg-{categoria}-50` o `bg-neutral-100` neutral
- Padding: `p-2` o `p-2.5` (8-10px)
- Icono: lucide-react stroke style, tamaño 16-24px, color `-700` para contraste
- Radius: `rounded-lg` (8px) o `rounded-xl` (12px)

Diferenciar por categoría: dashboard usa color principal, productos usa color por línea (azul para libre inversión, verde para vehículo, etc).

Anti-pattern: iconos sueltos sin contenedor — se ven flotantes y poco premium.

### 4. Estructura obligatoria de KPI card

```
┌─────────────────────────────────────────┐
│ [icono container]            [↗]        │  ← icono + afordancia (esquina sup-der)
│                                         │
│ TOTAL A PAGAR ESTE MES                  │  ← eyebrow: text-xs uppercase tracking-wider
│ $412.500                                │  ← número: text-4xl BOLD tabular-nums
│ ↗ +2.3% vs mes anterior                 │  ← delta: text-sm color semántico
└─────────────────────────────────────────┘
```

Los 4 elementos son obligatorios para que el card "se sienta completo": icono container, eyebrow, número bold focal, delta. Si falta alguno, agregar.

### 5. Sistema de elevación con shadows

| Nivel | Token | Cuándo usar |
|---|---|---|
| 0 | `shadow-none` | Background general, secciones |
| 1 | `shadow-sm` | Info cards, status cards |
| 2 | `shadow-md` | **Action cards default** — sugiere clicabilidad |
| 3 | `shadow-lg` | Action cards en hover (con lift `-translate-y-0.5`), dropdowns |
| 4 | `shadow-xl` | Modales, popovers, drawers |
| 5 | `shadow-2xl` | Modal centrado destacado |

**Regla:** action cards siempre tienen `shadow-md` mínimo en default + transición a `shadow-lg` en hover. Diferenciación entre niveles debe ser perceptible — no `shadow-sm` para todo.

### 6. Tipología de cards (visualmente distinguibles)

| Tipo | Propósito | Tratamiento visual |
|---|---|---|
| **Action card** | Lleva a otra vista al click | `shadow-md`, chevron `>` esquina, hover lift, cursor pointer |
| **Info/KPI card** | Muestra dato sin acción | `shadow-sm`, sin hover, sin cursor, estructura eyebrow+número+delta |
| **Status card** | Estado de algo (crédito al día, en mora) | Border-left de color semántico (verde/amarillo/rojo), badge con estado |
| **Empty/CTA card** | Llamada a acción cuando no hay datos | Border dashed, ícono ilustrativo grande, copy + botón centrado |
| **Hero/Focal card** | El dato más importante de la vista | Superficie diferenciada (oscura o tintada), número grande BOLD, espacio generoso |

Si dos cards diferentes lucen iguales, el usuario no sabe qué es clicable. Diferenciar SIEMPRE.

### 7. Sidebar privado: anatomía estándar

```
┌──────────────────┐
│ [Logo + descrip] │  ← logo + descriptor del portal
│                  │
│ [search opcional]│
│ ─────────────────│
│ MENÚ             │  ← group label uppercase tracking
│ ⌂ Home (activo)  │  ← icono container tintado + texto, active state
│ □ Productos      │
│ □ Simulador      │  ← items disabled con tooltip si aplica
│ □ Mis solicitudes│  ← con badge contador si hay novedades
│                  │
│ CUENTA           │
│ □ Mi perfil      │
│                  │
│ [spacer]         │
│ ┌─────────────┐  │
│ │ promo o     │  │  ← bottom area: perfil del usuario o promo card
│ │ perfil user │  │
│ └─────────────┘  │
└──────────────────┘
```

Active state: background fill con color (primary-100 o accent-100) + texto en color (primary-700) — clara diferenciación. NO solo bold del texto.

### 8. Iconos: lucide-react SIEMPRE, nunca emojis

**Anti-pattern crítico:** usar emojis (🏍️ 💼 👓 🦷) como iconografía.

Problemas:
- Renderizan diferente por SO (mac, Windows, Android)
- No se pueden tematizar (color, stroke, size)
- Problemas de accesibilidad (screen readers leen nombre Unicode)
- Rompen sensación de "design system"

**Regla:** todos los iconos del chrome/UI van de `lucide-react`. Si necesitás un concepto específico (moto, dental, óptica), buscar en lucide (`Bike`, `Stethoscope`, `Glasses`) o crear SVG inline. Emojis SOLO en contenido de usuario (chat, comentarios), NUNCA en UI chrome.

## AI tells prohibidos (signaturas de "diseño hecho por IA")

Patrones específicos que delatan output de LLM y degradan la calidad percibida. **Cero tolerancia** en cualquier vista.

### Hero y headers

- ❌ Version labels en hero: `V0.6`, `BETA`, `INVITE-ONLY`, `EARLY ACCESS` decorativos sin función
- ❌ Section-number eyebrows: `00 / INDEX`, `001 · Capabilities`, `02 — Features`
- ❌ Animated scroll cues: ratones animados, "↓ Scroll", "Scroll for more"
- ❌ Heros que no caben en viewport inicial (>2-line headline, >20-word subtext, CTA bajo el fold)

### Social proof y testimonials

- ❌ Fake "Trusted by / Quietly in use at" con logos genéricos
- ❌ Testimonials de nombres genéricos: "John Doe", "Sarah Chan", "Alex Smith", "Jane Doe"
- ❌ Brands inventados: "Acme", "Nexus", "Cloudly", "Globex", "Initech"
- ❌ Avatares con iniciales sin nombre real asociado

### Imágenes y assets

- ❌ Div-based fake screenshots: dashboards/terminals/task-lists renderizados como divs
- ❌ Captions tipo "Field notes · Photographer Name" sobre imágenes stock
- ❌ Hero solo con gradient blob (sin imagen real, sin diagrama, sin algo concreto)
- ❌ SVG decorativos hand-rolled cuando hay assets reales disponibles

### Layout y composición

- ❌ Tres feature cards de ancho IDÉNTICO en grid 3×1 (variant=baja sin asimetría)
- ❌ `border-t` + `border-b` en cada row de tabla de specs (overborder)
- ❌ Centered hero cuando DESIGN_VARIANCE > 4 (variance alta exige asimetría)
- ❌ Listas largas (>5 items) como `<ul>` con `divide-y` plano — usar card grid o disclosure

### Tipografía

- ❌ Inter como font display por default sin justificación (es genérica)
- ❌ Serif (Fraunces, Instrument Serif) sin brand justification — son cliché actual de IA
- ❌ Italics descenders sin `leading-[1.1]` mínimo + padding bottom

### Color

- ❌ Paleta beige + brass + oxblood (cliché "premium consumer" de IA — cookware, wellness)
- ❌ AI-purple gradients (#7C3AED → #2563EB) sin justificación de marca
- ❌ Más de un acento por página — un solo color saturado, usado idéntico across sections

### Copy

- ❌ Duplicate CTA intent: "Get in touch", "Contact us", "Let's talk" en la misma página
- ❌ Placeholder-as-label en formularios
- ❌ Em-dashes (`—`) **OJO contexto:** la skill original prohibe TODOS los em-dashes como "AI tell". Para proyectos en español formal/jurídico, los em-dashes son válidos. Para landing/marketing en español, evitarlos.

### Aplicación

- **Audit obligatorio antes de handoff:** grep en `src/` por los patrones de arriba (regex de nombres genéricos, brands inventados, version labels).
- **Detección automatizable:** muchos de estos son `grep -r "Lorem\|John Doe\|Sarah Chan\|Acme Inc\|Nexus\|Globex" src/`
- **Severidad:** Crítica (impacto inmediato en credibilidad del prototipo)

## Gates obligatorios pre-handoff

Antes de declarar cualquier vista "terminada" o pasar a la siguiente, ejecutar y validar:

```bash
# 1. Build pasa (detecta verbatimModuleSyntax y otros errores que tsc no ve)
npx vite build

# 2. Sin voseo argentino (si el locale es es-CO)
grep -rEn "\b(ingresá|elegí|calculá|cubrí|contactá|gestioná|activá|mirá|sumá|llamá|escribí|seleccioná|tenés|querés|podés|sabés|autorizás|comunicate|fijate|usá|verificá|continuá|completá|firmá|aceptá|enviá)\b" src/

# 3. Sin AI tells (nombres genéricos / brands inventados)
grep -rEn "John Doe|Sarah Chan|Jane Doe|Acme\b|Globex\b|Nexus\b|Initech\b" src/
```

Los 3 deben devolver **0 matches** (excepto build, que debe pasar con 0 errores). Si alguno falla, **corregir EN ESE MOMENTO** — no es "luego se arregla", es bloqueante.

Estos no son recomendaciones — son gates ejecutables. Ha sido evidencia repetida que reglas documentadas pero no enforzadas mecánicamente NO se aplican consistentemente.

## Checklist por dominio (Flujo 3)

Cuando la HU es de dominio **financiero / bancario / salud**:
- [ ] **OBLIGATORIO:** Incluir campo "Confirmar contraseña" inmediatamente después del campo de password. No es opcional — es requisito regulatorio en dominio financiero
- [ ] Link clicable a política de privacidad en checkbox de términos
- [ ] Footer con información legal
- [ ] Step indicator refleja journey completo (incluir pasos de procesamiento y resultado)
- [ ] CTA disabled-until-valid en formularios con validación
- [ ] Validación en tiempo real: errores inline al salir del campo (onBlur), no solo al submit
- [ ] Componentes Input/Select/Password deben aceptar y propagar `onBlur` sin pisar handlers internos
- [ ] Mensajes de error claros junto al campo (no códigos, no bloques genéricos arriba)

## Sistema de espaciado

Usar escala base-4 para consistencia. Cada nivel de separación debe crecer proporcionalmente (~1.5× a 2× el anterior, aproximando ratio áureo 1.618).

### Espaciado en formularios

| Zona | Token | Valor | Ejemplo Tailwind |
|---|---|---|---|
| Entre campos del mismo grupo | `--spacing-5` | 20px | `space-y-5` |
| Entre grupos/secciones | `--spacing-8` | 32px | `space-y-8` o `mt-8` |
| Padding del card container | `--spacing-8` | 32px | `p-8` |
| Margin exterior del card | `--spacing-12`+ | 48px+ | `mb-12` |
| Heading → primer campo | `--spacing-6` | 24px | `mb-6` |
| Último campo → CTA | `--spacing-6` | 24px | `mt-6` |

### Principios

- **Proximidad interna < externa:** padding de un componente siempre menor que gap entre hermanos
- **Golden ratio para divisiones:** layouts con dos zonas usan ~62/38 o ~60/40, nunca 50/50 (excepto split intencional)
- **Densidad por tipo de vista:** forms = media (gap 16–24px), dashboards = alta (8–16px), landing = baja (32–64px)
- **Ritmo constante:** no agregar `mt-2`, `pt-2` arbitrarios entre campos. Si un campo necesita más separación, moverlo a un grupo nuevo con espacio de sección
- **Whitespace es diseño:** no llenar espacio vacío con elementos decorativos. El espacio negativo guía la mirada

## Convenciones técnicas

| Aspecto | Estándar |
|---|---|
| Framework | React + Vite |
| Estilos | Tailwind v4 con `@theme` — cero valores hardcodeados |
| Componentes | Functional components, props tipadas (TypeScript si el proyecto lo usa) |
| Archivos | Un componente por archivo, nombre PascalCase (`Button.jsx`, `DashboardView.jsx`) |
| Estructura | `src/components/` (atómicos y composiciones), `src/pages/` (vistas) |
| Datos mock | Inline o en `src/mocks/` — nunca llamadas a APIs reales en prototipo |

## Formato de output por componente

```jsx
// src/components/{ComponentName}.jsx
export default function ComponentName({ variant = 'primary', ...props }) {
  return (
    // Usa clases Tailwind referenciando tokens @theme
    // Incluye estados hover/focus/active
    // Accesible: roles ARIA cuando aplica
  )
}
```

## Outputs

- `src/App.jsx` — App Shell con routing y selección de layout
- `src/layouts/{Name}Layout.jsx` — layouts compartidos (Public, Private)
- `src/components/{Name}.jsx` — componentes atómicos y composiciones
- `src/pages/{Name}Page.jsx` — vistas completas ensambladas
- `src/mocks/{name}.js` — datos simulados cuando aplica

## Cuándo NO invocar

- Si el usuario proporciona URL de Figma → usar `figma-impl`
- Si solo se necesitan tokens sin componentes → usar `design-tokens`
- Si se pide validar un componente existente → usar `design-audit`

## Reglas de jerarquía tipográfica

| Elemento | Tamaño | Peso | Color |
|---|---|---|---|
| Heading principal (h1) | `text-3xl` o mayor | `font-[700]` bold | `text-text-primary` |
| Heading secundario (h2) | `text-2xl` | `font-[600]` semibold | `text-text-primary` |
| Heading sección (h3) | `text-lg`/`text-xl` | `font-[600]` semibold | `text-text-primary` |
| **Número focal (KPI hero)** | `text-3xl`/`text-4xl`/`text-5xl` | **`font-[700]` bold** | `text-text-primary` |
| **Número decorativo/contextual** | `text-xl`/`text-2xl` | `font-[400-500]` | `text-text-primary` |
| Eyebrow / label de KPI | `text-xs`/`text-sm` | `font-[500]` + `uppercase` + `tracking-wider` | `text-text-tertiary` |
| Body / párrafo | `text-base` | `font-[400]` | `text-text-primary` |
| Label de campo | `text-sm` | `font-[500]` | `text-text-primary` |
| Hint / helper text | `text-xs` | `font-[400]` | `text-text-tertiary` |
| Error message | `text-sm` | `font-[400]` | `text-text-error` |
| Delta / cambio porcentual | `text-sm` | `font-[500]` | `text-success-700` (positivo) o `text-error-700` (negativo) |

**Reglas duras:**

1. **Distancia mínima de 200 unidades entre niveles consecutivos** de peso. Si todo está entre 500-600, el resultado se ve plano sin foco.

2. **Números focales en BOLD 700.** Cuando el número es EL dato principal de la vista o card (saldo total, cuota mensual, score, KPI de métrica), va en peso 700 + tamaño grande. NO usar light (300) para números focales — produce sensación de vacío y descuido.

3. **Light/regular SOLO para números decorativos** que acompañan otra información dominante (ej. número pequeño de contexto en una sidebar mientras el chart es el foco).

4. **Estructura "eyebrow + número + delta" obligatoria** para KPI cards:
   ```
   ┌─────────────────────────────────┐
   │ [icon container]      [→ link]  │
   │                                 │
   │ TOTAL A PAGAR ESTE MES          │ ← eyebrow: text-xs, uppercase, tracking, color tenue
   │ $412.500                        │ ← número: text-4xl, BOLD, tabular-nums
   │ ↗ +2.3% vs mes anterior         │ ← delta: text-sm, color semántico, icono
   └─────────────────────────────────┘
   ```
   Si falta el eyebrow o el delta, el card se ve incompleto.

5. **Verificar fuente importada con pesos necesarios** (400, 500, 600, 700) en `@theme`. Si falta un peso, el navegador hace fake bold (peor calidad visual).

6. **Tabular-nums obligatorio** para listados de números, montos, fechas, métricas. Sin esto, los números no se alinean verticalmente.

## Anti-patterns

- **Single-file monolítico** — construir toda la app en un solo archivo. Cada cambio fuerza reescritura completa, agota tokens y genera alucinaciones.
- **Iteración sin spec** — empezar a codificar antes de tener tokens y lista de componentes definida. Produce re-trabajo exponencial.
- **Componente isla** — crear un componente que no referencia tokens y usa valores hardcodeados. Rompe la consistencia del sistema.
- **Over-engineering estético** — en Flujo 1, rediseñar la estructura que ya definió el UX. La skill eleva, no redefine.
- **Placeholder permanente** — usar "Lorem ipsum" o imágenes placeholder sin datos mock realistas que estresen el layout.
- **Logo como texto** — usar `<h1>Nombre</h1>` o `<div>SI</div>` como sustituto de un logo real. Siempre solicitar el asset SVG/PNG al usuario. Si no se tiene, NO renderizar barra de branding con placeholder textual.
- **Header decorativo sin asset** — renderizar un header con fondo de color y texto simulando marca cuando no hay logo. Un header sin logo real es ruido visual que no aporta valor. Omitirlo hasta tener el asset.
- **Font declarada sin importar** — declarar una fuente en `@theme` pero no importarla en `index.html` ni aplicarla en `@layer base`. Causa fallback a system-ui y los pesos altos (800/900) no se renderizan correctamente.
- **Validación solo al submit** — no dar feedback hasta que el usuario presiona el botón. Viola Nielsen #1 (visibilidad del estado) y #5 (prevención de errores). Implementar validación onBlur como mínimo.
- **onBlur pisado por spread** — componentes que tienen `onBlur` interno (focus states) y luego `{...props}` pierden el handler externo. Destructurar `onBlur` explícitamente y merge con `onBlur={(e) => { internal(); external?.(e); }}`.
- **HU como apps aisladas** — construir cada HU en su propio `App.jsx` sin routing ni navegación compartida. Produce vistas desconectadas: el usuario no puede navegar del dashboard al simulador. Siempre crear un App Shell con routing cuando hay 2+ HU del mismo producto.
- **Canvas inconsistente entre módulos** — cambiar las dimensiones del sidebar, header o content area entre vistas. El frame del PrivateLayout debe ser idéntico en todos los módulos. Solo cambia el contenido del Content Area.
- **Ruta default incorrecta** — que la ruta `/` lleve al simulador o a un módulo secundario en vez del dashboard home. La primera página siempre es el home/dashboard.
- **CTA disabled sin causa visible** — botón gris sin tooltip, mensaje inline o ícono de info que explique por qué está bloqueado. Viola Nielsen #1.
- **Validación cross-field detrás de submit imposible** — error que solo se dispara al hacer click en un botón que está disabled. Paradoja: el botón nunca se puede clicar, el error nunca aparece. Validar reactivamente.
- **A11y delegada al audit** — construir sin labels/aria/focus-trap esperando que `accessibility` lo audite después. La accesibilidad es requisito de build.
- **Adivinar specs ambiguas** — resolver en silencio reglas contradictorias o info faltante en lugar de detener y escalar a `sofka-asdd-producto`.
- **Asset disponible ignorado** — copiar un PNG a `src/assets/brand/` y luego renderizar `<span>Texto</span>` con comentario `[PENDIENTE asset]`. Si el asset está copiado, úsalo. PNG es válido aunque el formato ideal sea SVG.
- **Emojis como iconografía** — usar emojis (🏍️ 💼 👓) en chrome/UI. Renderizan diferente por SO, no son tematizables, fallan accesibilidad. Usar siempre lucide-react o SVG inline.
- **Todo blanco / sin shadows** — UI completamente plana sin diferenciación de superficies ni elevación. Produce sensación de wireframe outdated. Aplicar sistema de superficies mixtas (2-3 niveles) y shadows según tipología de card.
- **Números focales en peso light** — usar `font-[300]` o `font-[400]` en números que son EL dato principal de la vista. Se ven vacíos/descuidados. Foco = bold 700.
- **Cards uniformes para todo** — info card, action card y status card con el mismo tratamiento visual. El usuario no sabe qué es clicable. Diferenciar SIEMPRE por tipología.
- **Hover-only affordance** — action card sin señal visible en default (solo `cursor-pointer + hover:bg-...`). El estado default ya debe comunicar clicabilidad (chevron, arrow, botón, border).
- **Iconos sueltos sin container** — render directo de `<Icon />` sin wrapper tintado. Se ven flotantes y poco premium. Envolver en `<div className="rounded-lg bg-..-50 p-2">`.
- **Diseño tímido** — aplicar las reglas estéticas "a medias" (light gray en vez de border de color, padding minúsculo, pesos uniformes, todo blanco). Produce resultados que parecen Material Design v1. Cuando dudes entre dos opciones, elegir la más decidida.
- **Acento sobre acento** — usar el color de acento (5%) como texto sobre un fondo del mismo color o derivado. Verde sobre verde = ilegible. El acento es para CTA fill + texto contrastante encima, o badge con texto oscuro.
- **Servidor de dev no persistente** — lanzar `npm run dev` sin background ni log, muere al terminar el contexto. Lanzar con `&` o `run_in_background: true` y verificar con `lsof`/`curl`.
- **Declarar "todo OK" sin `vite build`** — confiar en `tsc --noEmit` + HTTP 200. `tsc` no detecta verbatimModuleSyntax violations. HTTP 200 sirve el shell HTML aunque React no renderice. Validar con `vite build` antes de declarar éxito.
- **Imports de interfaces sin `type`** — con `verbatimModuleSyntax: true` (default Vite react-ts), `import { Producto }` para interfaces hace que Vite falle. Usar `import { type Producto }` o `import type { Producto }`.
- **Active state con bg de marca + texto blanco** — usar aguamarina/cyan medio como bg sin validar contraste con el texto. Falla WCAG AA. Texto debe ser oscuro sobre bg de acento medio.
