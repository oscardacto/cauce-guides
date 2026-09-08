'use strict';
/**
 * vua-spelling-rules.js
 * Diccionario determinístico de patrones lingüísticos para detección de
 * errores ortográficos, gramaticales, anglicismos y problemas tipográficos
 * de microcopy en español (es-CO por default).
 *
 * Cada regla está documentada con:
 *   - id: identificador estable (rule_id en findings)
 *   - lang: a qué idioma aplica (es | any)
 *   - severity: critical | serious | moderate | minor
 *   - pattern: regex que disparará el finding
 *   - message: descripción para el QA / dev
 *   - recommendation: corrección sugerida (cuando aplica)
 *   - explain: opcional, contexto pedagógico
 *
 * Las reglas se aplican sobre cada texto del DOM que cumpla:
 *   - length >= 3
 *   - no parece código (filtrado previamente)
 *   - no está en `ui_terminology_glossary` (overrides app-specific)
 *
 * Ampliable: para agregar más reglas, mantener la forma del objeto.
 * NO incluir reglas que generen falsos positivos masivos (ej. "ay" → "hay"
 * sin contexto se rompe en interjecciones legítimas).
 */

/**
 * Errores ortográficos comunes en español
 * (foco: omisión de h, confusión b/v, tildes faltantes en interrogativas/exclamativas)
 */
const SPELLING_ES = [
  {
    id: 'orto-haber-haver',
    lang: 'es',
    severity: 'serious',
    pattern: /\b(haver|haviendo|haviera|haveis)\b/gi,
    message: 'Posible error ortográfico: "haver" — la forma correcta del verbo es "haber" (con b).',
    recommendation: 'Reemplazar "haver" → "haber".'
  },
  {
    id: 'orto-haya-halla-haya',
    lang: 'es',
    severity: 'minor',
    pattern: /\b(halla|hallan|hallamos)\s+(que|un|una|el|la)\b/gi,
    message: 'Posible confusión entre "halla" (de hallar/encontrar) y "haya" (de haber). Revisar contexto.',
    recommendation: 'Si el sentido es "que haya ocurrido" usar "haya"; si es "se halla en X lugar" mantener "halla".'
  },
  {
    id: 'orto-iba-hiba',
    lang: 'es',
    severity: 'serious',
    pattern: /\b(hiba|hibamos|hivan)\b/gi,
    message: 'Error ortográfico: "hiba" no existe. La forma correcta es "iba" (sin h, con b).',
    recommendation: 'Reemplazar por "iba".'
  },
  {
    id: 'orto-tilde-interrogativa',
    lang: 'es',
    severity: 'minor',
    // que / como / cuando / donde / quien / cual / cuanto en oración interrogativa o exclamativa sin tilde
    // heurística simple: ¿que…?  →  debería ser ¿qué…?
    pattern: /[¿¡]\s*(que|como|cuando|donde|quien|cual|cuanto|cuantas|cuantos)\b/gi,
    message: 'Tilde faltante en pronombre interrogativo/exclamativo (qué, cómo, cuándo, dónde, quién, cuál, cuánto).',
    recommendation: 'En oraciones interrogativas/exclamativas estos pronombres llevan tilde diacrítica.'
  },
  {
    id: 'orto-tilde-monosilabos',
    lang: 'es',
    severity: 'minor',
    // detecta "esta" cuando precede un verbo conjugado (debería ser "está")
    pattern: /\b(esta|estas)\s+(activo|inactivo|disponible|pendiente|cargando|listo|guardado|ocupado|cerrado|abierto|deshabilitado|habilitado|conectado|desconectado|en|de)\b/gi,
    message: 'Posible tilde faltante: "esta" sin tilde es demostrativo; cuando es verbo (estar) debe ser "está".',
    recommendation: 'Si el sentido es del verbo estar (ej: "está activo"), agregar tilde: "está".'
  },
  {
    id: 'orto-tilde-mas',
    lang: 'es',
    severity: 'minor',
    pattern: /\bmas\s+(de|que|información|opciones|datos|detalles|reciente|antiguo|importante)\b/gi,
    message: '"mas" sin tilde es conjunción adversativa (= pero). El adverbio de cantidad/comparación lleva tilde: "más".',
    recommendation: 'Reemplazar por "más" cuando significa cantidad o comparación.'
  },
  {
    id: 'orto-tilde-solo-aun',
    lang: 'es',
    severity: 'minor',
    pattern: /\b(aun)\s+(no|así|cuando|si)\b/gi,
    message: '"aún" (con tilde) significa "todavía"; "aun" sin tilde significa "incluso". Verificar contexto.',
    recommendation: 'Si equivale a "todavía", agregar tilde: "aún".'
  },
  {
    id: 'orto-conjuncion-y-e',
    lang: 'es',
    severity: 'minor',
    pattern: /\sy\s+(i[a-zñáéíóú]|hi[a-zñáéíóú])/gi,
    message: 'Antes de palabras que empiezan por "i" o "hi" (sin diptongo) la conjunción correcta es "e", no "y".',
    recommendation: 'Reemplazar "y" → "e" (ej: "información e historia").'
  }
];

/**
 * Anglicismos comunes en UI con equivalente claro en español
 * Heurística: solo reportar cuando el contexto NO es de marca/dominio.
 * El glosario `ui_terminology_glossary` puede excluirlos por app.
 */
const ANGLICISMS_ES = [
  {
    id: 'angl-link-enlace',
    lang: 'es',
    severity: 'minor',
    pattern: /\b(link|links)\b/g,
    message: 'Anglicismo evitable en UI en español: "link" → preferir "enlace".',
    recommendation: 'Usar "enlace" salvo que la app lo defina como término de marca.'
  },
  {
    id: 'angl-password-contrasena',
    lang: 'es',
    severity: 'minor',
    pattern: /\b(password|passwords)\b/g,
    message: 'Anglicismo en UI: "password" → preferir "contraseña".',
    recommendation: 'Usar "contraseña" para coherencia idiomática.'
  },
  {
    id: 'angl-username-usuario',
    lang: 'es',
    severity: 'minor',
    pattern: /\b(username|usernames)\b/g,
    message: 'Anglicismo en UI: "username" → preferir "usuario" o "nombre de usuario".',
    recommendation: 'Sustituir por "usuario" o "nombre de usuario".'
  },
  {
    id: 'angl-login-button',
    lang: 'es',
    severity: 'minor',
    // detecta uso de "login" o "log in" como verbo en CTA (botón)
    pattern: /\b(login|log in|sign in|sign-in)\b/gi,
    message: 'Anglicismo en CTA: preferir "Iniciar sesión" en vez de "login" / "sign in".',
    recommendation: 'Usar "Iniciar sesión" para entrada y "Cerrar sesión" para salida.'
  },
  {
    id: 'angl-logout-button',
    lang: 'es',
    severity: 'minor',
    pattern: /\b(logout|log out|sign out|sign-out)\b/gi,
    message: 'Anglicismo: preferir "Cerrar sesión".',
    recommendation: 'Usar "Cerrar sesión".'
  },
  {
    id: 'angl-search-buscar',
    lang: 'es',
    severity: 'minor',
    pattern: /\b(search)\b/gi,
    message: 'Anglicismo: "search" → preferir "Buscar".',
    recommendation: 'Usar "Buscar".'
  },
  {
    id: 'angl-update-actualizar',
    lang: 'es',
    severity: 'minor',
    pattern: /\b(update|updated)\b/gi,
    message: 'Anglicismo: "update" → preferir "Actualizar" o "Actualizado".',
    recommendation: 'Usar "Actualizar" / "Actualizado".'
  }
];

/**
 * Problemas tipográficos / microcopy genéricos (válidos en cualquier idioma)
 */
const TYPOGRAPHY_GENERIC = [
  {
    id: 'typo-doble-espacio',
    lang: 'any',
    severity: 'minor',
    pattern: / {2,}/g,
    message: 'Texto con dos o más espacios consecutivos — error tipográfico.',
    recommendation: 'Normalizar a un solo espacio.'
  },
  {
    id: 'typo-puntuacion-precedida-espacio',
    lang: 'any',
    severity: 'minor',
    pattern: / [.,;:!?](?!\d)/g,
    message: 'Espacio antes de signo de puntuación — error tipográfico (en español el signo va pegado).',
    recommendation: 'Quitar el espacio antes del signo.'
  },
  {
    id: 'typo-comillas-inglesas',
    lang: 'es',
    severity: 'minor',
    pattern: /["']{2,}/g,
    message: 'Comillas duplicadas o inconsistentes. Preferir comillas tipográficas españolas «» o curvas " ".',
    recommendation: 'Estandarizar a un solo tipo de comilla.'
  },
  {
    id: 'typo-tres-puntos-suspensivos',
    lang: 'any',
    severity: 'minor',
    // tres puntos como ASCII en lugar del carácter de puntos suspensivos
    pattern: /\.\.\.(?!\.)/g,
    message: 'Tres puntos ASCII (...) en lugar del carácter Unicode de puntos suspensivos (…).',
    recommendation: 'Sustituir "..." por "…" para mejor presentación tipográfica.'
  },
  {
    id: 'typo-mayusculas-grita',
    lang: 'any',
    severity: 'minor',
    // 4+ letras consecutivas mayúsculas en una palabra (excluyendo siglas conocidas)
    pattern: /\b[A-ZÁÉÍÓÚÑ]{6,}\b/g,
    message: 'Palabra en mayúsculas sostenidas (≥6 letras). En UI las mayúsculas continuas dificultan lectura.',
    recommendation: 'Usar mayúscula inicial o capitalización Title Case salvo que sea sigla legítima.'
  },
  {
    id: 'typo-jerga-tecnica-leak',
    lang: 'any',
    severity: 'serious',
    // patrones que sugieren leak de jerga técnica al usuario final
    pattern: /\b(null|undefined|NaN|HTTP \d{3}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z|stack trace|undefined is not|cannot read property of)\b/gi,
    message: 'Texto con jerga técnica o stack trace expuesto al usuario final.',
    recommendation: 'Reemplazar por mensaje legible para humano (Nielsen H9 — ayuda con errores).'
  },
  {
    id: 'typo-error-code-only',
    lang: 'any',
    severity: 'moderate',
    // error code sin explicación: "Error 500", "Error: 0xABCD"
    pattern: /^Error\s*[:#-]?\s*[\w\d]{1,8}$/i,
    message: 'Mensaje de error solo con código, sin explicación accionable.',
    recommendation: 'Agregar descripción humana y acción sugerida (Nielsen H9).'
  }
];

const ALL_RULES = [...SPELLING_ES, ...ANGLICISMS_ES, ...TYPOGRAPHY_GENERIC];

/**
 * Aplica el conjunto de reglas a un array de textos visibles.
 *
 * @param {string[]} texts - textos visibles únicos del DOM (sample)
 * @param {object} opts
 * @param {string} opts.lang - 'es' | 'es-CO' | 'en' | etc.
 * @param {string[]} opts.glossary - términos a excluir (case-insensitive)
 * @returns {Array<object>} findings con shape estandarizado
 */
function applyRules(texts, { lang = 'es', glossary = [] } = {}) {
  const langKey = (lang || '').toLowerCase().split('-')[0];
  const glossaryLower = glossary.map((t) => String(t).toLowerCase());
  const findings = [];

  function isGlossaryTerm(text) {
    const tl = text.toLowerCase();
    return glossaryLower.some((g) => tl.includes(g));
  }

  for (const rawText of texts) {
    if (!rawText || typeof rawText !== 'string') continue;
    const text = rawText.trim();
    if (text.length < 3) continue;

    for (const rule of ALL_RULES) {
      if (rule.lang !== 'any' && rule.lang !== langKey) continue;
      const matches = text.match(rule.pattern);
      if (!matches) continue;
      // Saltar si el texto entero es término de glosario
      if (isGlossaryTerm(text)) continue;

      findings.push({
        rule_id: rule.id,
        severity: rule.severity,
        match: matches[0].slice(0, 50),
        text_excerpt: text.slice(0, 200),
        message: rule.message,
        recommendation: rule.recommendation || null,
        confidence: rule.severity === 'serious' ? 'high' : 'medium'
      });
      // Una regla por texto (evita ruido por mismas múltiples ocurrencias)
      break;
    }
  }

  return findings;
}

module.exports = {
  SPELLING_ES,
  ANGLICISMS_ES,
  TYPOGRAPHY_GENERIC,
  ALL_RULES,
  applyRules
};
