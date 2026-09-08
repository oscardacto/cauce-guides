---
name: asdd-ui-ux-content
description: Define y audita contenido UX — microcopy, tono, labels, mensajes de error, CTAs y textos de ayuda.
---

## Rol

Definir, escribir y auditar todo el contenido textual de la interfaz: microcopy, labels, placeholders, mensajes de error, CTAs, hints, tooltips, textos de onboarding y notificaciones. Opera como el "escritor de la interfaz" — cada palabra que el usuario lee pasa por esta skill.

## Cuándo activar

### Fase Construir (definición)
- El usuario pide definir el copy de una vista o componente
- Antes o durante `hifi-builder` cuando se necesitan textos finales
- Cuando se detecta que los textos son genéricos o placeholder ("Lorem ipsum", "Click here", "Error")
- Cuando se construye un flujo nuevo y se necesitan mensajes para todos los estados

### Fase Verificar (auditoría)
- Después de que `hifi-builder` o `figma-impl` completan las vistas
- Cuando se pide auditar el copy, tono, o consistencia textual
- Antes de generar handoff a developer o QA

## 🚨 Locale Gate (NO es opcional, NO es recomendación)

**El handoff NO se declara hasta que el grep de voseo devuelva 0 matches.** No basta con "tener cuidado con el voseo" — es un **gate obligatorio ejecutable**.

### Para proyectos en español Colombia (tuteo)

**Comando OBLIGATORIO a ejecutar antes de cualquier "vista terminada" o "handoff":**

```bash
grep -rEn "\b(ingresá|elegí|calculá|cubrí|contactá|gestioná|activá|mirá|sumá|llamá|escribí|seleccioná|tenés|querés|podés|sabés|autorizás|comunicate|fijate|dale|usá|envía|envialo|comprá|vendé|llevá|olvidá|recordá|verificá|continuá|completá|firmá|aceptá|enviá)\b" src/
```

- ✅ **Si devuelve 0 matches:** copy aprobado, podés declarar handoff
- ❌ **Si devuelve cualquier match:** corregir EN ESE MOMENTO antes de seguir. No es "lo veo después", es **bloqueante**.

### Tabla de conversión 1:1 (auto-fix)

| ❌ Voseo (argentino, prohibido) | ✅ Tuteo (Colombia) |
|---|---|
| Ingresá / Ingresa(rgentino) | Ingresa |
| Elegí | Elige |
| Calculá | Calcula |
| Cubrí | Cubre |
| Contactá | Contacta |
| Gestioná | Gestiona |
| Activá | Activa |
| Mirá | Mira |
| Sumá | Suma |
| Llamá | Llama |
| Escribí | Escribe |
| Seleccioná | Selecciona |
| Verificá | Verifica |
| Continuá | Continúa |
| Completá | Completa |
| Firmá | Firma |
| Aceptá | Acepta |
| Enviá | Envía |
| Comprá | Compra |
| Vendé | Vende |
| Llevá | Lleva |
| Olvidá | Olvida |
| Recordá | Recuerda |
| Usá | Usa |
| Tenés | Tienes |
| Querés | Quieres |
| Podés | Puedes |
| Sabés | Sabes |
| Autorizás | Autorizas |
| Comunicate | Comunícate |
| Fijate | Fíjate |
| Dale (imperativo "vale") | Vale / Listo / OK |
| "¿Tenés cuenta?" | "¿Tienes cuenta?" |
| "¿Querés saber?" | "¿Quieres saber?" |
| "Podés ver..." | "Puedes ver..." |

### Por qué esta regla es un GATE y no un consejo

Esta regla ha fallado en aplicarse 3 rondas seguidas a pesar de estar documentada. El patrón:
1. La skill describe la regla en texto
2. El agente la "lee" pero no la ejecuta
3. El copy generado tiene voseo
4. El usuario lo detecta visualmente

**La única forma de eliminarlo es como gate ejecutable:** correr el grep, ver 0 matches, entonces seguir. Sin esto, la regla sigue siendo decorativa.

**Patrón general:** convertir reglas "soft" (memorizar, ser cuidadoso, recordar) en reglas "hard" (ejecutar comando, validar output, bloquear si falla).

## Principios de UX Writing

### 1. Claridad sobre creatividad
El usuario vino a completar una tarea, no a leer prosa. Cada texto debe ser:
- **Escaneable:** la información clave en las primeras palabras
- **Específico:** "Ingresá tu correo" no "Por favor, proporcione su dirección de correo electrónico"
- **Accionable:** el usuario sabe qué hacer después de leerlo

### 2. Tono de voz consistente

| Dimensión | Espectro | Ejemplo financiero |
|---|---|---|
| Formalidad | Profesional pero cercano | "Tu solicitud fue enviada" (no "Su solicitud ha sido remitida") |
| Confianza | Seguro sin ser arrogante | "Verificamos tu identidad" (no "Intentaremos verificar") |
| Empatía | Reconoce la emoción del momento | "Estamos validando, no cierres esta ventana" |
| Simplicidad | Sin jerga técnica innecesaria | "Contraseña incorrecta" (no "Error de autenticación 401") |

**Regla:** el tono se define al inicio del proyecto y se mantiene en todas las vistas. Si el dominio es financiero, el tono es profesional-cercano. Si es e-commerce, puede ser más casual.

### 3. Jerarquía de contenido por componente

| Componente | Contenido | Reglas |
|---|---|---|
| **Heading (h1)** | Título de la acción principal | Verbo + objeto. Máx 5 palabras. "Crear cuenta", "Verificá tu correo" |
| **Subtítulo** | Contexto o instrucción secundaria | 1 oración. Explica el por qué o el cómo. |
| **Label** | Nombre del campo | Sustantivo claro. "Correo electrónico", no "Email address" (si la app es en español) |
| **Placeholder** | Ejemplo de formato | Formato esperado, no instrucción. "correo@ejemplo.com", no "Ingrese su correo" |
| **Hint** | Restricción o ayuda | Requisito técnico en lenguaje simple. "6 a 12 dígitos", "Mínimo 8 caracteres" |
| **Error** | Qué falló + cómo corregir | Diagnóstico + solución. "El correo no es válido. Revisá que tenga @ y dominio" |
| **CTA** | Acción del botón | Verbo en infinitivo o imperativo. "Crear cuenta", "Continuar", "Verificar" |
| **Toast/Notificación** | Resultado de acción | Estado + contexto. "Cuenta creada. Revisá tu correo para verificar." |
| **Empty state** | Sin datos | Explicación + acción. "Aún no tenés solicitudes. Simulá tu crédito para comenzar." |
| **Loading** | Espera | Qué está pasando. "Verificando identidad...", no solo un spinner |

### 4. Mensajes de error — framework

Cada mensaje de error sigue la estructura: **Qué pasó + Cómo resolverlo**

| Tipo | Malo | Bueno |
|---|---|---|
| Campo vacío | "Campo requerido" | "El correo electrónico es obligatorio" |
| Formato inválido | "Formato incorrecto" | "Ingresá un correo válido (ej. nombre@dominio.com)" |
| Contraseña débil | "Contraseña no válida" | "Debe tener al menos 8 caracteres y una mayúscula" |
| Servidor | "Error 500" | "No pudimos procesar tu solicitud. Intentá de nuevo en unos minutos." |
| Conexión | "Network error" | "Parece que no tenés conexión. Verificá tu internet e intentá de nuevo." |

**Regla:** nunca mostrar códigos de error (400, 401, 500) al usuario final. El código va al log, el mensaje va al humano.

### 5. Idioma y localización

| Criterio | Regla |
|---|---|
| Idioma base | El del dominio/usuario. Si la HU está en español, toda la UI es en español |
| Consistencia | No mezclar idiomas ("Email" en un label y "Correo" en otro) |
| Voseo/tuteo | Definir al inicio y mantener. **Colombia: tuteo SIEMPRE (nunca voseo argentino)**. Argentina/Uruguay: voseo. Resto LATAM: tuteo. España: tuteo o usted formal. |
| Términos técnicos | Usar el equivalente local. "Iniciar sesión" no "Login". "Contraseña" no "Password" |
| Pluralización | Manejar singular/plural. "1 solicitud" vs "3 solicitudes" |
| Géneros | Usar lenguaje neutro cuando sea posible. "Tu cuenta" no "La cuenta del usuario" |

#### Voseo prohibido en Colombia (regla estricta)

El español de Colombia usa **tuteo** ("tú"), no voseo ("vos"). Los imperativos terminados en tilde + í (cubrí, elegí, ingresá, contactá) son **argentinismos prohibidos** en proyectos para Colombia.

| ❌ Voseo argentino (PROHIBIDO en Colombia) | ✅ Tuteo Colombia |
|---|---|
| Ingresá tus datos | Ingresa tus datos |
| Elegí el producto | Elige el producto |
| Cubrí imprevistos | Cubre imprevistos |
| Calculá tu cuota | Calcula tu cuota |
| Contactá a un asesor | Contacta a un asesor |
| Mirá los detalles | Mira los detalles |
| Tenés acceso a... | Tienes acceso a... |
| ¿Querés saber más? | ¿Quieres saber más? |
| Podés ver... | Puedes ver... |
| Sabés que... | Sabes que... |

**Patrones detectables:**
- Imperativos terminados en `-á`, `-é`, `-í` con tilde aguda (ingresá, elegí, escribí)
- Conjugaciones 2da persona singular con "vos" (tenés, querés, podés, sabés)
- "Mirá", "fijate", "dale"

**Auditoría obligatoria antes de handoff:** grep regex `\b(ingresá|elegí|calculá|cubrí|contactá|mirá|tenés|querés|podés|sabés|fijate|sumá|llamá|escribí|seleccioná)\b` en TODO el copy. Si hay matches, corregir antes de declarar handoff.

### 6. Anti-patterns de contenido

| Anti-pattern | Qué detectar | Fix |
|---|---|---|
| **Placeholder como label** | Campo sin label visible, solo placeholder que desaparece al escribir | Agregar label permanente |
| **CTA genérico** | "Enviar", "OK", "Aceptar" sin contexto | Usar verbo específico: "Crear cuenta", "Confirmar pago" |
| **Error culpabilizador** | "Ingresaste mal el correo" | Reformular sin culpa: "El formato del correo no es válido" |
| **Doble negación** | "No desea no recibir notificaciones" | Reformular en positivo: "Recibir notificaciones por correo" |
| **Texto legal como CTA** | "Acepto los términos y condiciones" como botón principal | Separar: checkbox para aceptar + CTA para la acción |
| **Placeholder instructivo** | "Ingrese su correo aquí" como placeholder | Placeholder = ejemplo de formato. Instrucción va en label o hint |
| **Mensaje de éxito genérico** | "Operación exitosa" | Especificar: "Tu cuenta fue creada. Revisa tu correo." |
| **Loading sin contexto** | Spinner sin texto | Agregar qué se está procesando: "Verificando identidad..." |
| **Voseo argentino en proyecto colombiano** | "Ingresá tus datos", "Elegí el producto", "Calculá tu cuota" | Reescribir en tuteo Colombia: "Ingresa tus datos", "Elige el producto", "Calcula tu cuota". Ver sección "Voseo prohibido en Colombia". |
| **Mezcla de tratamientos** | Tutear en una vista y vosear/ustedear en otra | Locale se define UNA vez al inicio y se mantiene en todas las vistas |

## Proceso

### Fase Construir — Definición de copy

1. **Inventario de contenido:** listar todas las pantallas y componentes que necesitan texto
2. **Definir tono de voz:** basado en el dominio y la audiencia del producto
3. **Escribir copy por componente:** headings, labels, placeholders, hints, errors, CTAs, estados vacíos, loading
4. **Mapear estados:** cada campo/componente con sus variantes (default, error, success, loading, empty, disabled)
5. **Entregar tabla de copy:** documento estructurado que `hifi-builder` consume al construir

### Fase Verificar — Auditoría de contenido

1. **Leer todos los archivos de componentes y vistas** (`src/components/`, `src/pages/`)
2. **Extraer todo el texto visible** (headings, labels, placeholders, errores, CTAs, hints, toasts)
3. **Evaluar contra los 6 principios** de UX writing
4. **Reportar hallazgos** con severidad y fix sugerido

## Niveles de severidad

| Severidad | Criterio | Acción |
|---|---|---|
| **Crítica** | Texto engañoso, error culpabilizador, código técnico visible al usuario, placeholder sin label | Fix obligatorio |
| **Alta** | Inconsistencia de idioma, CTA genérico en acción principal, error sin solución | Fix recomendado |
| **Media** | Tono inconsistente, texto redundante, hint que repite el label | Documentar |
| **Baja** | Oportunidad de mejorar claridad o brevedad | Sugerencia |

## Formato de output

### Fase Construir — Tabla de copy

```markdown
# Copy UI — {Vista/Componente}

**Idioma:** {es-CO / es / en}
**Tono:** {profesional-cercano / casual / formal}
**Voseo/Tuteo:** {tuteo}

## Headings y subtítulos

| Pantalla | Heading | Subtítulo |
|---|---|---|
| Registro | Crear cuenta | Ingresá tus datos para comenzar con tu solicitud |

## Labels, placeholders y hints

| Campo | Label | Placeholder | Hint | Error (vacío) | Error (formato) |
|---|---|---|---|---|---|
| Email | Correo electrónico | correo@ejemplo.com | — | El correo es obligatorio | Ingresá un correo válido |

## CTAs

| Acción | Texto | Estado disabled |
|---|---|---|
| Submit registro | Crear cuenta | (deshabilitado hasta formulario válido) |

## Mensajes de estado

| Estado | Texto |
|---|---|
| Loading | Verificando identidad... |
| Éxito | ¡Cuenta activada! |
| Error servidor | No pudimos procesar tu solicitud. Intentá de nuevo. |
```

### Fase Verificar — Reporte de auditoría

```markdown
# Auditoría de Contenido UX — {Vista}

**Fecha:** {YYYY-MM-DD}
**Resultado:** {APROBADO / APROBADO CON OBSERVACIONES / NO APROBADO}

## Resumen por principio

| Principio | Estado | Hallazgos |
|---|---|---|
| Claridad | {✓/✗} | {n} |
| Tono de voz | {✓/✗} | {n} |
| Jerarquía de contenido | {✓/✗} | {n} |
| Mensajes de error | {✓/✗} | {n} |
| Idioma y localización | {✓/✗} | {n} |
| Anti-patterns | {✓/✗} | {n} |

## Hallazgos

### [{Severidad}] {Principio} — {Título}
- **Archivo:** `{ruta}:{línea}`
- **Texto actual:** "{texto encontrado}"
- **Problema:** {descripción}
- **Fix sugerido:** "{texto corregido}"
```

## Outputs

### Fase Construir
- `docs/ui/ux-content-{vista}.md` — Tabla de copy para la vista

### Fase Verificar
- `docs/ui/content-audit-{vista}.md` — Reporte de auditoría de contenido

## Cuándo NO invocar

- Para crear componentes → usar `hifi-builder` o `figma-impl`
- Para auditar accesibilidad WCAG → usar `accessibility`
- Para auditar principios visuales → usar `design-audit`
- Para configurar tokens → usar `design-tokens`

## Anti-patterns de la skill

- **Copy sin contexto de dominio** — escribir textos genéricos sin conocer el dominio del producto. Siempre consultar la HU y el dominio antes de escribir.
- **Auditoría solo de ortografía** — revisar tildes pero no evaluar claridad, tono ni estructura. Los 6 principios son obligatorios.
- **Ignorar estados de error** — definir solo el happy path. Cada campo necesita mensajes para vacío, formato inválido y error de servidor.
- **Mezclar idiomas sin justificación** — usar "Email" cuando el resto de la app dice "Correo electrónico". La excepción son términos sin traducción natural (ej. "OTP").
- **Tono indefinido** — no definir el tono al inicio y luego tener inconsistencias entre vistas formales e informales.
