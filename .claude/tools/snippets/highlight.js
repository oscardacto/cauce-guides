#!/usr/bin/env node
/**
 * highlight.js — CLI que emite por stdout el IIFE listo para pasar a
 * `browser_evaluate` del MCP Playwright. Elimina el copy-paste de ~80 líneas
 * de JS por step que el sub-agente hacía manualmente.
 *
 * Uso:
 *   node .claude/tools/snippets/highlight.js \
 *     --selector '[data-test="add-to-cart-sauce-labs-backpack"]' \
 *     --color green \
 *     --cleanup 3000 \
 *     --click-after false
 *
 * Output: string JS (una línea o con saltos — el MCP acepta ambos) que implementa
 * el mismo protocolo canónico documentado en `.claude/skills/sofka-asdd-atf-web-highlight-injector/SKILL.md`:
 *   - iframe-aware `findIn(root)`
 *   - `setProperty(prop, val, 'important')` para vencer CSS enterprise
 *   - z-index 99999 + position:relative si era static
 *   - auto-cleanup vía setTimeout — NO requiere llamada manual de cleanup
 *   - opcional: click tras cleanup (click_after_capture)
 *
 * Flags:
 *   --selector   (requerido)   CSS selector del elemento a resaltar
 *   --color      (default green)  "green" | "red"
 *   --cleanup    (default 30000)  ms antes del auto-cleanup
 *   --click-after (default false) si true, dispara el.click() tras cleanup
 *   --raw        (flag)           emite solo el cuerpo sin envolver en parens + args
 *                                 (útil para debug; por default emite la expresión
 *                                 completa lista para browser_evaluate)
 *   --iife       (flag)           emite IIFE con args ((sel,col,...)=>{})("sel","green",...)
 *                                 en vez del arrow function default. Para uso con CLI evaluate.
 *   --inject-runtime (flag)       emite una arrow function que instala `window.__atfHighlight(sel, col, cleanupMs, clickAfter)`
 *                                 en el DOM. Llamar UNA VEZ por page load. Posteriores steps
 *                                 usan --call-only para invocar la función ya instalada (~1 línea).
 *   --call-only  (flag)           emite solo `window.__atfHighlight(sel, col, cleanupMs, clickAfter)`
 *                                 Requiere que --inject-runtime haya sido ejecutado en la página actual.
 *                                 Ahorra el spawn de Node.js + los ~80 líneas de snippet por step.
 *
 * Exit codes: 0 OK · 1 argumentos inválidos
 *
 * Racional: el skill highlight-injector documenta el IIFE. Copiarlo inline
 * en cada browser_evaluate obliga al LLM a re-generar ~80 líneas JS cada vez
 * y es fuente común de errores (selectores mal escapados, strings JS rotos).
 * Este CLI lo genera 1 vez y el sub-agente solo lo captura con Bash y lo pega.
 */
'use strict';

function parseArgs(argv) {
  const out = { color: 'green', cleanup: 30000, clickAfter: false, raw: false, iife: false, injectRuntime: false, callOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--selector')           out.selector   = argv[++i];
    else if (a === '--color')         out.color      = argv[++i];
    else if (a === '--cleanup')       out.cleanup    = parseInt(argv[++i], 10);
    else if (a === '--click-after')   out.clickAfter = argv[++i] === 'true';
    else if (a === '--raw')           out.raw        = true;
    else if (a === '--iife')          out.iife       = true;
    else if (a === '--inject-runtime') out.injectRuntime = true;
    else if (a === '--call-only')     out.callOnly   = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(1, 34).map(l => l.replace(/^ \*\s?/, '')).join('\n'));
      process.exit(0);
    }
  }
  // --call-only requires --selector but NOT full validation
  if (out.callOnly) {
    if (!out.selector) {
      process.stderr.write('[highlight.js] ERROR: --call-only requiere --selector\n');
      process.exit(1);
    }
    return out;
  }
  // --inject-runtime doesn't need --selector
  if (out.injectRuntime) return out;

  if (!out.selector) {
    process.stderr.write('[highlight.js] ERROR: --selector es requerido\n');
    process.exit(1);
  }
  if (!['green', 'red'].includes(out.color)) {
    process.stderr.write(`[highlight.js] ERROR: --color inválido: ${out.color} (debe ser green|red)\n`);
    process.exit(1);
  }
  if (isNaN(out.cleanup) || out.cleanup < 100) {
    process.stderr.write(`[highlight.js] ERROR: --cleanup debe ser un número ≥ 100 (ms)\n`);
    process.exit(1);
  }
  return out;
}

function emitSnippet({ selector, color, cleanup, clickAfter, raw, iife, injectRuntime, callOnly }) {
  // --call-only: invoca el runtime ya instalado.
  //
  // — self-healing: tras un `browser_navigate` el page reinicia y
  // `window.__atfHighlight` desaparece. La versión previa retornaba
  // `{injected:false, reason:'runtime_not_installed'}` y el step quedaba sin
  // highlight (run OrangeHRM: 2 errores `__atfHighlight is not a function`).
  // Ahora si `__atfHighlight` no existe → instala el runtime inline y luego invoca.
  // El install es ~80 LOC pero solo se paga cuando el runtime falta — runs típicos
  // siguen pagando ~1 línea efectiva por step.
  if (callOnly) {
    const selEscaped = JSON.stringify(selector);
    const colorEscaped = JSON.stringify(color);
    const installer = `(function(){
      if (window.__atfHighlight) return;
      window.__atfHighlight = function(sel, col, cleanupMs, clickAfterCapture) {
        function findIn(root) {
          const el = root.querySelector(sel);
          if (el) return { el, doc: root };
          const frames = root.querySelectorAll('iframe, frame');
          for (const f of frames) {
            try { const subDoc = f.contentDocument; if (!subDoc) continue; const found = findIn(subDoc); if (found) return found; } catch (e) {}
          }
          return null;
        }
        const found = findIn(document);
        if (!found) return { injected: false, reason: 'selector_not_found', searched_frames: true };
        const el = found.el;
        const inIframe = found.doc !== document;
        if (el.dataset.atfOrigOutline === undefined) {
          const save = (prop, key) => { el.dataset[key] = el.style.getPropertyValue(prop) || ''; el.dataset[key+'Prio'] = el.style.getPropertyPriority(prop) || ''; };
          save('outline','atfOrigOutline'); save('outline-offset','atfOrigOutlineOffset'); save('box-shadow','atfOrigBoxShadow'); save('z-index','atfOrigZIndex'); save('position','atfOrigPosition');
        }
        const styles = col === 'green' ? { outline:'3px solid #18A34A', offset:'2px', shadow:'0 0 12px rgba(24,163,74,0.5)' } : { outline:'3px solid #E02020', offset:'2px', shadow:'0 0 12px rgba(224,32,32,0.5)' };
        el.style.setProperty('outline', styles.outline, 'important');
        el.style.setProperty('outline-offset', styles.offset, 'important');
        el.style.setProperty('box-shadow', styles.shadow, 'important');
        const ownerWin = found.doc.defaultView || window;
        if (ownerWin.getComputedStyle(el).position === 'static') el.style.setProperty('position','relative','important');
        el.style.setProperty('z-index','99999','important');
        const rect = el.getBoundingClientRect();
        const inViewport = rect.top >= 0 && rect.bottom <= ownerWin.innerHeight;
        if (!inViewport) el.scrollIntoView({ behavior:'instant', block:'nearest' });
        setTimeout(() => {
          const restore = (prop, key) => { const v = el.dataset[key] || ''; const p = el.dataset[key+'Prio'] || ''; if (v) el.style.setProperty(prop, v, p); else el.style.removeProperty(prop); delete el.dataset[key]; delete el.dataset[key+'Prio']; };
          restore('outline','atfOrigOutline'); restore('outline-offset','atfOrigOutlineOffset'); restore('box-shadow','atfOrigBoxShadow'); restore('z-index','atfOrigZIndex'); restore('position','atfOrigPosition');
          if (clickAfterCapture) { try { el.click(); } catch (e) {} }
        }, cleanupMs);
        return { injected: true, in_viewport: inViewport, in_iframe: inIframe, cleanup_scheduled_ms: cleanupMs, click_scheduled: clickAfterCapture, runtime_auto_installed: true };
      };
    })();`;
    return `() => { ${installer} return window.__atfHighlight(${selEscaped}, ${colorEscaped}, ${cleanup}, ${clickAfter ? 'true' : 'false'}); }`;
  }

  // --inject-runtime: emit a function that installs window.__atfHighlight on the page.
  // Call ONCE per page load. Subsequent steps use --call-only.
  if (injectRuntime) {
    return `() => {
  if (window.__atfHighlight) return { installed: true, reused: true };
  window.__atfHighlight = function(sel, col, cleanupMs, clickAfterCapture) {
    function findIn(root) {
      const el = root.querySelector(sel);
      if (el) return { el, doc: root };
      const frames = root.querySelectorAll('iframe, frame');
      for (const f of frames) {
        try {
          const subDoc = f.contentDocument;
          if (!subDoc) continue;
          const found = findIn(subDoc);
          if (found) return found;
        } catch (e) { /* cross-origin frame */ }
      }
      return null;
    }
    const found = findIn(document);
    if (!found) return { injected: false, reason: 'selector_not_found', searched_frames: true };
    const el = found.el;
    const inIframe = found.doc !== document;
    if (el.dataset.atfOrigOutline === undefined) {
      const save = (prop, key) => {
        el.dataset[key]         = el.style.getPropertyValue(prop)    || '';
        el.dataset[key + 'Prio'] = el.style.getPropertyPriority(prop) || '';
      };
      save('outline',        'atfOrigOutline');
      save('outline-offset', 'atfOrigOutlineOffset');
      save('box-shadow',     'atfOrigBoxShadow');
      save('z-index',        'atfOrigZIndex');
      save('position',       'atfOrigPosition');
    }
    const styles = col === 'green'
      ? { outline: '3px solid #18A34A', offset: '2px', shadow: '0 0 12px rgba(24,163,74,0.5)' }
      : { outline: '3px solid #E02020', offset: '2px', shadow: '0 0 12px rgba(224,32,32,0.5)' };
    el.style.setProperty('outline',        styles.outline, 'important');
    el.style.setProperty('outline-offset', styles.offset,  'important');
    el.style.setProperty('box-shadow',     styles.shadow,  'important');
    const ownerWin = found.doc.defaultView || window;
    const currentPosition = ownerWin.getComputedStyle(el).position;
    if (currentPosition === 'static') el.style.setProperty('position', 'relative', 'important');
    el.style.setProperty('z-index', '99999', 'important');
    const rect = el.getBoundingClientRect();
    const viewH = ownerWin.innerHeight;
    const inViewport = rect.top >= 0 && rect.bottom <= viewH;
    if (!inViewport) el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    setTimeout(() => {
      const restore = (prop, key) => {
        const val  = el.dataset[key]         || '';
        const prio = el.dataset[key + 'Prio'] || '';
        if (val) el.style.setProperty(prop, val, prio);
        else el.style.removeProperty(prop);
        delete el.dataset[key];
        delete el.dataset[key + 'Prio'];
      };
      restore('outline',        'atfOrigOutline');
      restore('outline-offset', 'atfOrigOutlineOffset');
      restore('box-shadow',     'atfOrigBoxShadow');
      restore('z-index',        'atfOrigZIndex');
      restore('position',       'atfOrigPosition');
      if (clickAfterCapture) {
        try { el.click(); } catch (e) { /* no fatal */ }
      }
    }, cleanupMs);
    return { injected: true, in_viewport: inViewport, in_iframe: inIframe, cleanup_scheduled_ms: cleanupMs, click_scheduled: clickAfterCapture };
  };
  return { installed: true, reused: false };
}`;
  }

  // Template — en sync con `.claude/skills/sofka-asdd-atf-web-highlight-injector/SKILL.md` PASO 1.
  // Cuerpo de la función (compartido entre modo arrow y modo IIFE)
  const fnBody = `
  function findIn(root) {
    const el = root.querySelector(sel);
    if (el) return { el, doc: root };
    const frames = root.querySelectorAll('iframe, frame');
    for (const f of frames) {
      try {
        const subDoc = f.contentDocument;
        if (!subDoc) continue;
        const found = findIn(subDoc);
        if (found) return found;
      } catch (e) { /* cross-origin frame */ }
    }
    return null;
  }
  const found = findIn(document);
  if (!found) return { injected: false, reason: 'selector_not_found', searched_frames: true };
  const el = found.el;
  const inIframe = found.doc !== document;

  if (el.dataset.atfOrigOutline === undefined) {
    const save = (prop, key) => {
      el.dataset[key]         = el.style.getPropertyValue(prop)    || '';
      el.dataset[key + 'Prio'] = el.style.getPropertyPriority(prop) || '';
    };
    save('outline',        'atfOrigOutline');
    save('outline-offset', 'atfOrigOutlineOffset');
    save('box-shadow',     'atfOrigBoxShadow');
    save('z-index',        'atfOrigZIndex');
    save('position',       'atfOrigPosition');
  }

  const styles = col === 'green'
    ? { outline: '3px solid #18A34A', offset: '2px', shadow: '0 0 12px rgba(24,163,74,0.5)' }
    : { outline: '3px solid #E02020', offset: '2px', shadow: '0 0 12px rgba(224,32,32,0.5)' };

  el.style.setProperty('outline',        styles.outline, 'important');
  el.style.setProperty('outline-offset', styles.offset,  'important');
  el.style.setProperty('box-shadow',     styles.shadow,  'important');

  const ownerWin = found.doc.defaultView || window;
  const currentPosition = ownerWin.getComputedStyle(el).position;
  if (currentPosition === 'static') el.style.setProperty('position', 'relative', 'important');
  el.style.setProperty('z-index', '99999', 'important');

  const rect = el.getBoundingClientRect();
  const viewH = ownerWin.innerHeight;
  const inViewport = rect.top >= 0 && rect.bottom <= viewH;
  if (!inViewport) el.scrollIntoView({ behavior: 'instant', block: 'nearest' });

  setTimeout(() => {
    const restore = (prop, key) => {
      const val  = el.dataset[key]         || '';
      const prio = el.dataset[key + 'Prio'] || '';
      if (val) el.style.setProperty(prop, val, prio);
      else el.style.removeProperty(prop);
      delete el.dataset[key];
      delete el.dataset[key + 'Prio'];
    };
    restore('outline',        'atfOrigOutline');
    restore('outline-offset', 'atfOrigOutlineOffset');
    restore('box-shadow',     'atfOrigBoxShadow');
    restore('z-index',        'atfOrigZIndex');
    restore('position',       'atfOrigPosition');
    if (clickAfterCapture) {
      try { el.click(); } catch (e) { /* no fatal */ }
    }
  }, cleanupMs);

  return { injected: true, in_viewport: inViewport, in_iframe: inIframe, cleanup_scheduled_ms: cleanupMs, click_scheduled: clickAfterCapture };`;

  if (raw) return fnBody;

  // Escape del selector para embeber como literal JS string
  const selEscaped = JSON.stringify(selector);
  const colorEscaped = JSON.stringify(color);

  if (iife) {
    // IIFE format (para CLI evaluate que acepta expresiones auto-ejecutables)
    return `((sel, col, cleanupMs, clickAfterCapture) => {${fnBody}})(${selEscaped}, ${colorEscaped}, ${cleanup}, ${clickAfter ? 'true' : 'false'})`;
  }

  // DEFAULT: Arrow function MCP-compatible — zero-arg callable con constantes embebidas.
  // browser_evaluate del MCP espera () => { ... } — un callable, no una expresión.
  return `() => { const sel = ${selEscaped}; const col = ${colorEscaped}; const cleanupMs = ${cleanup}; const clickAfterCapture = ${clickAfter ? 'true' : 'false'};${fnBody}}`;
}

const args = parseArgs(process.argv.slice(2));
process.stdout.write(emitSnippet(args));
process.exit(0);
