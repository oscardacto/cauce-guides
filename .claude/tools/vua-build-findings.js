#!/usr/bin/env node
/**
 * vua-build-findings.js
 * Combina los page_scan_phase_a.json (output del scanner Playwright) con un
 * conjunto extendido de reglas determinísticas para las 3 aristas del VUA:
 *
 *   1) ACCESIBILIDAD — axe-core 4.11.4 (locale es-CO aplicado en el scanner).
 *   2) USABILIDAD    — 10 heurísticas Jakob Nielsen, todas determinísticas
 *                       (basadas en URL/slug + DOM + cta_labels + affordances).
 *   3) VISUAL        — lang/idioma + texto-código + tipografía + layout +
 *                       diccionario de ortografía/anglicismos/microcopy ES.
 *
 * Filosofía: cobertura proactiva. Cada arista emite hallazgos ANTES de que
 * el PO haga review manual. Cuando un patrón requiere reasoning semántico
 * (tono editorial, microcopy ambigua), se delega a la fase opcional --deep-llm
 * del comando /sofka-asdd:qa-web-visual-ux-a11y.
 *
 * Output: findings.json por pantalla con shape estandarizado consumido por
 * aggregate-vua-results.js + dashboard.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const spelling = require('./lib/vua-spelling-rules.js');

// ────────────────────────────────────────────────────────────────────────────
// Constantes de presentación
// ────────────────────────────────────────────────────────────────────────────

const NIELSEN_NAMES = {
  1: 'Visibilidad del estado del sistema',
  2: 'Coincidencia entre el sistema y el mundo real',
  3: 'Control y libertad del usuario',
  4: 'Consistencia y estándares',
  5: 'Prevención de errores',
  6: 'Reconocimiento más que recuerdo',
  7: 'Flexibilidad y eficiencia de uso',
  8: 'Diseño estético y minimalista',
  9: 'Ayudar a reconocer y recuperarse de errores',
  10: 'Ayuda y documentación'
};

// CTA equivalentes por intención (para detección de inconsistencia cross-page)
const CTA_INTENTS = {
  save: /^(guardar|save|aceptar|confirmar|aplicar|enviar|submit|ok|continuar|continue|siguiente|next|finalizar|finish)$/i,
  cancel: /^(cancelar|cancel|atr[áa]s|volver|back|cerrar|close|descartar|discard)$/i,
  edit: /^(editar|edit|modificar|modify|cambiar|change|actualizar|update)$/i,
  delete: /^(eliminar|delete|borrar|remove|quitar)$/i,
  add: /^(agregar|añadir|add|crear|create|new|nuevo|nueva)$/i
};

// ────────────────────────────────────────────────────────────────────────────
// Utilidades
// ────────────────────────────────────────────────────────────────────────────

function severityFromImpact(impact) {
  return ({ critical: 'critical', serious: 'serious', moderate: 'moderate', minor: 'minor' })[impact] || 'info';
}

function deriveSeverityRank(s) {
  return ({ critical: 5, serious: 4, moderate: 3, minor: 2, info: 1 })[s] || 0;
}

function wcagFromTags(tags) {
  if (!tags) return null;
  const wcagTag = tags.find((t) => /^wcag\d+aaa?$|^wcag\d{3,4}$/.test(t));
  return wcagTag || tags.find((t) => /^wcag/.test(t)) || null;
}

function classifyPageType(pageInfo, dom) {
  const url = (pageInfo.page_url || '').toLowerCase();
  const slug = (pageInfo.page_slug || '').toLowerCase();
  if (/auth\/login|signin|sign-in/i.test(url)) return 'login';
  if (/auth\/logout|signout|sign-out/i.test(url)) return 'logout';
  if (/save|edit/i.test(url)) return 'form';
  if (/list|view\w*list|index|admin\/view/i.test(url)) return 'list';
  if (/dashboard|home/i.test(url)) return 'dashboard';
  if ((dom.inputs_meta || []).length >= 4) return 'form';
  return 'unknown';
}

// ────────────────────────────────────────────────────────────────────────────
// PASO 1 — Findings de accesibilidad (axe-core)
// ────────────────────────────────────────────────────────────────────────────

function buildAxeFindings(violations) {
  const out = [];
  for (const v of violations) {
    for (const node of v.nodes.slice(0, 3)) {
      out.push({
        agrupador: 'accesibilidad',
        tipo: 'hallazgo',
        rule_id: v.id,
        wcag: wcagFromTags(v.tags),
        nielsen: null,
        severity: severityFromImpact(v.impact),
        selector: Array.isArray(node.target) ? node.target.join(' ') : String(node.target || ''),
        message: v.help,
        recommendation: v.description ? v.description : null,
        evidence_status: 'captured',
        evidence_file: 'screenshot_clean.png',
        confidence: 'high',
        source: 'axe-core'
      });
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// PASO 2 — Findings visuales determinísticos
// ────────────────────────────────────────────────────────────────────────────

function buildVisualFindings(visual, expectedLang, dom, typography, glossary) {
  const out = [];
  const lang = (visual.lang_attr || '').toLowerCase();
  const exp = (expectedLang || '').toLowerCase();

  // 2.1 — Lang attribute mismatch
  if (exp && (!lang || lang.split('-')[0] !== exp.split('-')[0])) {
    out.push({
      agrupador: 'visual',
      tipo: 'hallazgo',
      rule_id: 'lang-mismatch',
      wcag: 'wcag311',
      nielsen: 4,
      severity: 'serious',
      selector: 'html',
      message: lang
        ? `Idioma declarado en <html lang="${lang}"> no coincide con app_language="${expectedLang}".`
        : `Atributo lang ausente en <html> (esperado app_language="${expectedLang}").`,
      recommendation: `Declarar <html lang="${expectedLang}"> o ajustar app_language en config si la UI debe estar en ${lang || 'inglés'}.`,
      evidence_status: 'captured',
      evidence_file: 'screenshot_clean.png',
      confidence: 'high',
      source: 'visual-deterministic'
    });
  }

  // 2.2 — Texto-código en UI
  for (const item of visual.code_in_ui || []) {
    out.push({
      agrupador: 'visual',
      tipo: 'hallazgo',
      rule_id: 'code-in-ui',
      wcag: null,
      nielsen: 2,
      severity: 'moderate',
      selector: item.selector,
      message: `Texto con apariencia de código expuesto en UI: "${item.text}".`,
      recommendation: 'Reemplazar la salida cruda por mensaje legible para el usuario final.',
      evidence_status: 'captured',
      evidence_file: 'screenshot_clean.png',
      confidence: 'medium',
      source: 'visual-deterministic'
    });
  }

  // 2.3 — UI predominio inglés cuando se espera español
  if (exp && exp.startsWith('es') && Array.isArray(dom.texts)) {
    const sample = dom.texts.slice(0, 50).join(' ').toLowerCase();
    const hasSpanish = /\b(de|el|la|usuario|contraseña|guardar|cancelar|inicio|cerrar sesión|administración|nombre|fecha)\b/.test(sample);
    const hasEnglish = /\b(the|user|password|save|cancel|login|logout|administration|name|date|search)\b/.test(sample);
    if (hasEnglish && !hasSpanish) {
      out.push({
        agrupador: 'visual',
        tipo: 'recomendacion',
        rule_id: 'ui-language-mismatch',
        wcag: null,
        nielsen: 2,
        severity: 'moderate',
        selector: null,
        message: `Los textos visibles parecen estar en inglés, pero app_language declara "${expectedLang}".`,
        recommendation: 'Localizar los strings de UI a español o revisar app_language.',
        evidence_status: 'general_observation',
        evidence_file: null,
        confidence: 'high',
        source: 'visual-deterministic'
      });
    }
  }

  // 2.4 — Tipografía: inconsistencia de familias
  if (typography && Array.isArray(typography.font_families) && typography.font_families.length > 3) {
    out.push({
      agrupador: 'visual',
      tipo: 'recomendacion',
      rule_id: 'typography-family-inconsistency',
      wcag: null,
      nielsen: 4,
      severity: 'minor',
      selector: null,
      message: `Se detectaron ${typography.font_families.length} familias tipográficas distintas en la pantalla.`,
      recommendation: 'Consolidar a 1-2 familias máximo para coherencia visual.',
      evidence_status: 'general_observation',
      evidence_file: null,
      confidence: 'medium',
      source: 'visual-deterministic'
    });
  }

  // 2.5 — Tipografía: jerarquía rota en headings
  if (typography && typography.font_sizes_by_tag) {
    const sizesH1 = typography.font_sizes_by_tag.h1 || [];
    const sizesH2 = typography.font_sizes_by_tag.h2 || [];
    const px = (s) => parseFloat(String(s.value || s || '0').replace('px', '')) || 0;
    if (sizesH1.length && sizesH2.length && px(sizesH1[0]) <= px(sizesH2[0])) {
      out.push({
        agrupador: 'visual',
        tipo: 'recomendacion',
        rule_id: 'typography-heading-hierarchy',
        wcag: 'wcag131',
        nielsen: 4,
        severity: 'moderate',
        selector: 'h1, h2',
        message: `Jerarquía tipográfica inconsistente: <h1> (${sizesH1[0].value || sizesH1[0]}) no es mayor que <h2> (${sizesH2[0].value || sizesH2[0]}).`,
        recommendation: 'Garantizar que h1 > h2 > h3 en font-size para reflejar jerarquía semántica.',
        evidence_status: 'captured',
        evidence_file: 'screenshot_clean.png',
        confidence: 'high',
        source: 'visual-deterministic'
      });
    }
  }

  // 2.6 — Ortografía / anglicismos / microcopy (diccionario determinístico)
  const spellingFindings = spelling.applyRules(dom.texts || [], {
    lang: expectedLang || 'es',
    glossary: glossary || []
  });
  // Dedup por rule_id (un hallazgo por regla por pantalla)
  const seenSpelling = new Set();
  for (const sf of spellingFindings) {
    if (seenSpelling.has(sf.rule_id)) continue;
    seenSpelling.add(sf.rule_id);
    const isSerious = sf.severity === 'serious' || sf.severity === 'critical';
    out.push({
      agrupador: 'visual',
      tipo: isSerious ? 'hallazgo' : 'recomendacion',
      rule_id: sf.rule_id,
      wcag: null,
      nielsen: 2,
      severity: sf.severity,
      selector: null,
      message: `${sf.message} Texto: "${sf.text_excerpt}".`,
      recommendation: sf.recommendation,
      evidence_status: 'general_observation',
      evidence_file: null,
      confidence: sf.confidence,
      source: 'spelling-rules'
    });
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// PASO 3 — Findings Nielsen (10 heurísticas determinísticas)
// ────────────────────────────────────────────────────────────────────────────

function buildNielsenFindings(pageInfo, phaseA) {
  const out = [];
  const dom = phaseA.dom || {};
  const headings = dom.headings || [];
  const ctaLabels = dom.cta_labels || [];
  const inputs = dom.inputs_meta || [];
  const help = phaseA.help_affordances || {};
  const action = phaseA.action_flow || {};
  const layout = phaseA.layout || {};
  const axeIds = (phaseA.violations || []).map((v) => v.id);
  const url = pageInfo.page_url || '';
  const slug = pageInfo.page_slug || '';
  const pageType = classifyPageType(pageInfo, dom);
  const hasHeading = headings.length > 0;

  function add(rule_id, n, severity, message, recommendation, opts = {}) {
    out.push({
      agrupador: 'usabilidad',
      tipo: opts.tipo || (severity === 'critical' || severity === 'serious' ? 'hallazgo' : 'recomendacion'),
      rule_id,
      wcag: opts.wcag || null,
      nielsen: n,
      severity,
      selector: opts.selector || null,
      message,
      recommendation,
      evidence_status: opts.selector ? 'captured' : 'general_observation',
      evidence_file: opts.selector ? 'screenshot_clean.png' : null,
      confidence: opts.confidence || 'medium',
      source: 'nielsen-heuristic'
    });
  }

  // ── N1 — Visibilidad del estado del sistema ──────────────────
  if (!hasHeading && !['login', 'logout'].includes(pageType)) {
    add(
      'nielsen-1-no-page-heading', 1, 'moderate',
      'La pantalla no expone un encabezado h1-h4 que comunique en qué módulo/acción está el usuario.',
      'Agregar un heading visible o breadcrumbs para que el usuario sepa su ubicación en la app.',
      { wcag: 'wcag242', confidence: 'high' }
    );
  }
  if (pageType === 'logout') {
    add(
      'nielsen-1-logout-feedback', 1, 'minor',
      'El logout redirige a otra pantalla sin confirmación visual ("Sesión cerrada").',
      'Mostrar toast/banner momentáneo confirmando el cierre de sesión.',
      { confidence: 'medium' }
    );
  }
  if (!action.has_back_breadcrumbs && !['login', 'logout', 'dashboard'].includes(pageType)) {
    add(
      'nielsen-1-no-breadcrumbs', 1, 'minor',
      'Pantalla interna sin breadcrumbs ni navegación contextual visible.',
      'Considerar breadcrumbs o un indicador de ruta para orientar al usuario en jerarquía profunda.',
      { confidence: 'medium' }
    );
  }

  // ── N2 — Mundo real ──────────────────────────────────────────
  // Cubierto por 'code-in-ui' y 'typo-jerga-tecnica-leak' (visual). Aquí: jerga
  // técnica leak en CTAs.
  for (const cta of ctaLabels) {
    if (/\b(submit|delete|update|insert|select|null|undefined|404|500|api|json|debug|log|stack)\b/i.test(cta) &&
        cta.length < 40) {
      add(
        'nielsen-2-tech-jargon-cta', 2, 'moderate',
        `CTA con jerga técnica: "${cta}". El usuario final no debería ver términos como submit/delete/update sin localización.`,
        'Reemplazar por verbos de acción en idioma del usuario (Guardar, Eliminar, Actualizar).',
        { confidence: 'high' }
      );
      break; // Un finding por pantalla — evita ruido
    }
  }

  // ── N3 — Control y libertad del usuario ──────────────────────
  if (pageType === 'form' && !action.has_cancel_button) {
    add(
      'nielsen-3-form-no-cancel', 3, 'serious',
      'Pantalla de formulario sin botón visible de Cancelar/Atrás/Volver.',
      'Agregar Cancel/Back para permitir al usuario salir del flow sin guardar.',
      { confidence: 'high' }
    );
  }
  if (pageType === 'form' && !action.has_undo) {
    add(
      'nielsen-3-no-undo-action', 3, 'minor',
      'No se detecta acción Undo/Deshacer en pantalla de modificación.',
      'En operaciones destructivas (borrar, archivar) considerar undo (toast con acción inversa) o confirmación.',
      { confidence: 'low' }
    );
  }

  // ── N4 — Consistencia y estándares ──────────────────────────
  // Aquí solo evaluamos página actual; cross-page se evalúa en aggregate.
  const intentCounts = {};
  for (const cta of ctaLabels) {
    for (const [intent, re] of Object.entries(CTA_INTENTS)) {
      if (re.test(cta)) {
        intentCounts[intent] = (intentCounts[intent] || new Set());
        intentCounts[intent].add(cta.trim());
      }
    }
  }
  for (const [intent, set] of Object.entries(intentCounts)) {
    if (set.size > 1) {
      add(
        'nielsen-4-cta-inconsistent-intent', 4, 'moderate',
        `Misma intención con etiquetas distintas en la pantalla: "${[...set].join('", "')}" (intent: ${intent}).`,
        'Estandarizar el copy de CTAs con la misma intención (ej: solo "Guardar" en toda la app).',
        { confidence: 'medium' }
      );
    }
  }
  // Mezcla idiomática en CTAs (es + en simultáneo)
  const enCtas = ctaLabels.filter((c) => /^(save|cancel|edit|delete|submit|search|update|next|back|continue|ok)$/i.test(c.trim()));
  const esCtas = ctaLabels.filter((c) => /^(guardar|cancelar|editar|eliminar|enviar|buscar|actualizar|siguiente|atr[áa]s|continuar)$/i.test(c.trim()));
  if (enCtas.length > 0 && esCtas.length > 0) {
    add(
      'nielsen-4-mixed-language-cta', 4, 'serious',
      `CTAs mezclando idiomas: español (${esCtas.slice(0, 3).join(', ')}) e inglés (${enCtas.slice(0, 3).join(', ')}).`,
      'Localizar todos los CTAs al mismo idioma (preferiblemente app_language).',
      { confidence: 'high' }
    );
  }

  // ── N5 — Prevención de errores ──────────────────────────────
  if (pageType === 'form') {
    add(
      'nielsen-5-form-confirmation', 5, 'minor',
      'Pantalla de formulario sin diálogo de confirmación visible al cancelar/salir con cambios sin guardar.',
      'Implementar guard de cambios pendientes (dirty form) que avise antes de descartar.',
      { confidence: 'low' }
    );
    // Inputs requeridos sin marca visual obvia
    const requiredInputs = inputs.filter((i) => i.required);
    if (requiredInputs.length > 0 && requiredInputs.length === inputs.length) {
      add(
        'nielsen-5-all-required-no-marker', 5, 'minor',
        `Todos los campos del form están marcados required en HTML sin diferencial visual.`,
        'Si todos son requeridos, indicar "todos los campos son obligatorios"; si no, usar asterisco en los obligatorios.',
        { confidence: 'medium' }
      );
    }
  }
  if (pageType === 'login') {
    if ((dom.texts || []).some((t) => /Username\s*:\s*Admin/i.test(t)) ||
        (dom.texts || []).some((t) => /Password\s*:\s*admin/i.test(t))) {
      add(
        'nielsen-5-credentials-disclosed', 5, 'serious',
        'Las credenciales (usuario/contraseña) están visibles en texto plano en la pantalla de login.',
        'Aceptable solo en demos públicas. En producción/staging cliente, retirar el bloque.',
        { tipo: 'hallazgo', confidence: 'high' }
      );
    }
  }

  // ── N6 — Reconocimiento sobre recuerdo ──────────────────────
  if (pageType === 'form' && inputs.length > 0) {
    const noPlaceholderNoLabel = inputs.filter((i) => !i.has_label && !i.has_placeholder);
    if (noPlaceholderNoLabel.length > 0) {
      add(
        'nielsen-6-input-no-affordance', 6, 'serious',
        `${noPlaceholderNoLabel.length} input(s) sin label asociado ni placeholder — el usuario debe recordar qué dato se espera.`,
        'Agregar <label for> o placeholder con un ejemplo claro del formato esperado.',
        { wcag: 'wcag332', confidence: 'high' }
      );
    }
  }

  // ── N7 — Flexibilidad y eficiencia ──────────────────────────
  // Heurística: presencia de teclas de acceso o atajos visibles
  const hasAccesskey = (dom.texts || []).some((t) => /\bAlt\s*\+\s*[A-Z]\b|\bCtrl\s*\+\s*[A-Z]\b/.test(t));
  if (!hasAccesskey && pageType === 'form' && inputs.length >= 5) {
    add(
      'nielsen-7-no-keyboard-shortcuts', 7, 'minor',
      'Formulario extenso sin atajos de teclado visibles (Alt+, Ctrl+) ni indicación de navegación rápida.',
      'En forms largos considerar tab order claro y atajos para acciones frecuentes.',
      { confidence: 'low', tipo: 'recomendacion' }
    );
  }

  // ── N8 — Diseño minimalista ─────────────────────────────────
  if ((dom.texts || []).length > 150) {
    add(
      'nielsen-8-too-many-texts', 8, 'minor',
      `La pantalla expone ${dom.texts.length} textos visibles distintos. Posible sobrecarga cognitiva.`,
      'Revisar si textos auxiliares pueden ocultarse tras tooltips, secciones colapsables o paginación.',
      { confidence: 'low', tipo: 'recomendacion' }
    );
  }
  if (layout && layout.overflow_horizontal) {
    add(
      'nielsen-8-horizontal-overflow', 8, 'serious',
      'La pantalla genera scroll horizontal en viewport 1366×900 — diseño no contenido.',
      'Restructurar grid/contenedores para evitar overflow horizontal en resoluciones estándar.',
      { confidence: 'high' }
    );
  }
  if (layout && Array.isArray(layout.small_touch_targets) && layout.small_touch_targets.length > 0) {
    add(
      'nielsen-8-small-touch-targets', 8, 'moderate',
      `${layout.small_touch_targets.length} elemento(s) interactivos con tamaño <24×24px (anti-patrón en touch / accesibilidad motora).`,
      'Aumentar tamaño mínimo a 24×24px (recomendado 44×44 para touch — WCAG 2.5.5).',
      { wcag: 'wcag255', confidence: 'high' }
    );
  }

  // ── N9 — Ayuda con errores ──────────────────────────────────
  if (axeIds.includes('label')) {
    add(
      'nielsen-9-form-error-messaging', 9, 'serious',
      'Inputs sin label asociado (axe `label`) — los mensajes de error post-submit no podrán referirse al campo de manera accesible.',
      'Asociar cada input a su <label for> y permitir aria-describedby para errores inline.',
      { wcag: 'wcag332', confidence: 'high' }
    );
  }
  if (pageType === 'form') {
    const inputsConDescripcion = inputs.filter((i) => i.has_aria_describedby);
    if (inputs.length >= 3 && inputsConDescripcion.length === 0) {
      add(
        'nielsen-9-no-aria-describedby', 9, 'minor',
        'Form con varios inputs y ninguno usa aria-describedby para mensajes de validación.',
        'Conectar mensajes de error/ayuda con aria-describedby para anuncio screen reader.',
        { wcag: 'wcag332', confidence: 'medium' }
      );
    }
  }
  // Mensajes de error genéricos en DOM
  for (const t of (dom.texts || []).slice(0, 60)) {
    if (/^(Error|Algo salió mal|Something went wrong|Failed|Try again later)\.?$/i.test(t.trim())) {
      add(
        'nielsen-9-generic-error-message', 9, 'serious',
        `Mensaje de error genérico visible: "${t}". No comunica causa ni acción al usuario.`,
        'Reemplazar por mensaje específico que explique qué falló y qué puede hacer el usuario.',
        { confidence: 'high' }
      );
      break;
    }
  }

  // ── N10 — Ayuda y documentación ─────────────────────────────
  const hasAnyHelp = !!(help.has_help_links || (help.has_tooltips || 0) > 0 || (help.has_describedby || 0) > 0 || (help.has_details || 0) > 0);
  if (!hasAnyHelp && ['form', 'list'].includes(pageType)) {
    add(
      'nielsen-10-no-help-affordance', 10, 'moderate',
      'No se detectan tooltips, links a ayuda/docs, aria-describedby ni <details> en una pantalla de operación compleja.',
      'Agregar tooltips inline, link "?" hacia documentación, o sección "Ayuda" accesible.',
      { confidence: 'medium' }
    );
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Summary y orquestación
// ────────────────────────────────────────────────────────────────────────────

function buildSummary(findings) {
  const byAgrupador = { accesibilidad: 0, visual: 0, usabilidad: 0 };
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0, info: 0 };
  const byTipo = { hallazgo: 0, recomendacion: 0 };
  for (const f of findings) {
    byAgrupador[f.agrupador] = (byAgrupador[f.agrupador] || 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byTipo[f.tipo] = (byTipo[f.tipo] || 0) + 1;
  }
  return {
    total: findings.length,
    by_agrupador: byAgrupador,
    by_severity: bySeverity,
    by_tipo: byTipo
  };
}

function readGlossaryFromCtx(ctx) {
  if (Array.isArray(ctx.ui_terminology_glossary)) return ctx.ui_terminology_glossary;
  if (ctx.a11y_config && Array.isArray(ctx.a11y_config.ui_terminology_glossary)) return ctx.a11y_config.ui_terminology_glossary;
  return [];
}

function main() {
  const args = process.argv.slice(2);
  const arg = (k) => {
    const i = args.findIndex((a) => a === k || a.startsWith(k + '='));
    if (i === -1) return null;
    const a = args[i];
    return a.includes('=') ? a.split('=').slice(1).join('=') : args[i + 1];
  };
  const ctxPath = arg('--vua-context');
  if (!ctxPath) { console.error('USO: --vua-context=<path>'); process.exit(2); }
  const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  const expectedLang = ctx.app_language || (ctx.a11y_config && ctx.a11y_config.app_language);
  const glossary = readGlossaryFromCtx(ctx);

  const pages = ctx.pages.filter((p) => !p.skip_reason);
  const stats = { pages_built: 0, pages_missing_phase_a: 0, total_findings: 0 };

  for (const pageInfo of pages) {
    const phaseAPath = path.join(pageInfo.output_dir, 'page_scan_phase_a.json');
    const blockedPath = path.join(pageInfo.output_dir, 'page_blocked.json');
    if (!fs.existsSync(phaseAPath)) {
      if (fs.existsSync(blockedPath)) { stats.pages_missing_phase_a++; continue; }
      stats.pages_missing_phase_a++;
      continue;
    }
    const phaseA = JSON.parse(fs.readFileSync(phaseAPath, 'utf8'));

    const axeFindings = buildAxeFindings(phaseA.violations || []);
    const visualFindings = buildVisualFindings(
      phaseA.visual || {},
      expectedLang,
      phaseA.dom || {},
      phaseA.typography || null,
      glossary
    );
    const nielsenFindings = buildNielsenFindings(pageInfo, phaseA);

    const all = [...axeFindings, ...visualFindings, ...nielsenFindings]
      .sort((a, b) => deriveSeverityRank(b.severity) - deriveSeverityRank(a.severity))
      .map((f, i) => ({ id: 'F-' + String(i + 1).padStart(3, '0'), ...f }));

    const findings = {
      flow_refs: phaseA.flow_refs || pageInfo.flow_refs,
      page_url: phaseA.page_url || pageInfo.page_url,
      page_slug: phaseA.page_slug || pageInfo.page_slug,
      scanned_at: phaseA.scanned_at,
      scan_status: 'completed',
      fase_a_complete: true,
      fase_b_complete: true,
      axe_version: phaseA.axe_version,
      axe_locale: phaseA.axe_locale || 'en',
      stability_strategy: phaseA.stability_strategy || 'fixed_timeout',
      auth_state: phaseA.auth_state || 'authenticated',
      page_type: classifyPageType(pageInfo, phaseA.dom || {}),
      findings: all,
      summary: buildSummary(all)
    };

    fs.writeFileSync(path.join(pageInfo.output_dir, 'findings.json'), JSON.stringify(findings, null, 2));
    stats.pages_built++;
    stats.total_findings += all.length;
    console.log(JSON.stringify({
      event: 'findings_built',
      page: pageInfo.page_slug,
      total: all.length,
      by_agrupador: findings.summary.by_agrupador,
      by_severity: findings.summary.by_severity
    }));
  }

  console.log(JSON.stringify({ event: 'all_findings_built', stats, nielsen_titles: NIELSEN_NAMES }));
}

main();
