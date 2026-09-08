// ATF v2 — highlight-runtime.js (standalone, apto para page.addInitScript)
// Instala window.__atfHighlight(sel, col, cleanupMs, clickAfterCapture) en cada
// navegación. Idempotente: si ya existe no reinstala.
//
// Cargado UNA VEZ al inicio del CP via:
//   browser_run_code: await page.addInitScript({ path: '.claude/tools/snippets/highlight-runtime.js' })
//
// Racional: evita re-inyectar ~3 KB de JS en cada `browser_evaluate` del protocolo
// highlight → capture → click. Una carga por CP.

(function () {
  if (window.__atfHighlight) return;
  window.__atfHighlight = function (sel, col, cleanupMs, clickAfterCapture) {
    function findIn(root) {
      const el = root.querySelector(sel);
      if (el) return { el: el, doc: root };
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
      const save = function (prop, key) {
        el.dataset[key] = el.style.getPropertyValue(prop) || '';
        el.dataset[key + 'Prio'] = el.style.getPropertyPriority(prop) || '';
      };
      save('outline', 'atfOrigOutline');
      save('outline-offset', 'atfOrigOutlineOffset');
      save('box-shadow', 'atfOrigBoxShadow');
      save('z-index', 'atfOrigZIndex');
      save('position', 'atfOrigPosition');
    }
    const styles = col === 'green'
      ? { outline: '3px solid #18A34A', offset: '2px', shadow: '0 0 12px rgba(24,163,74,0.5)' }
      : { outline: '3px solid #E02020', offset: '2px', shadow: '0 0 12px rgba(224,32,32,0.5)' };
    el.style.setProperty('outline', styles.outline, 'important');
    el.style.setProperty('outline-offset', styles.offset, 'important');
    el.style.setProperty('box-shadow', styles.shadow, 'important');
    const ownerWin = found.doc.defaultView || window;
    const currentPosition = ownerWin.getComputedStyle(el).position;
    if (currentPosition === 'static') el.style.setProperty('position', 'relative', 'important');
    el.style.setProperty('z-index', '99999', 'important');
    const rect = el.getBoundingClientRect();
    const viewH = ownerWin.innerHeight;
    const inViewport = rect.top >= 0 && rect.bottom <= viewH;
    if (!inViewport) el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    setTimeout(function () {
      const restore = function (prop, key) {
        const val = el.dataset[key] || '';
        const prio = el.dataset[key + 'Prio'] || '';
        if (val) el.style.setProperty(prop, val, prio);
        else el.style.removeProperty(prop);
        delete el.dataset[key];
        delete el.dataset[key + 'Prio'];
      };
      restore('outline', 'atfOrigOutline');
      restore('outline-offset', 'atfOrigOutlineOffset');
      restore('box-shadow', 'atfOrigBoxShadow');
      restore('z-index', 'atfOrigZIndex');
      restore('position', 'atfOrigPosition');
      if (clickAfterCapture) {
        try { el.click(); } catch (e) { /* non-fatal */ }
      }
    }, cleanupMs);
    return { injected: true, in_viewport: inViewport, in_iframe: inIframe, cleanup_scheduled_ms: cleanupMs, click_scheduled: clickAfterCapture };
  };
})();
