#!/usr/bin/env node
/**
 * popup-freeze.js v2 (B; consolidado en ) —
 * Preserva toasts efímeros via MutationObserver + clone-to-persistent.
 *
 * **CONSOLIDACIÓN:** v2 es el ÚNICO inject path. v1
 * (CSS overrides) fue eliminada por completo del flujo de inyección. La
 * función `--cleanup` aún borra el `__atfFreezeToasts` stylesheet de v1
 * para retro-compat con runs antiguos cuyo browser tiene la marca legacy.
 * NO agregar un nuevo path v1 — si necesitas extender, hacerlo dentro de v2.
 *
 * v1 inyectaba CSS overrides (animation:none, opacity:1) — pero
 * frameworks como OxD/OrangeHRM eliminan el toast del DOM por JS interno (no por
 * fade CSS). El CSS freeze de v1 NO impide el `removeChild` programático.
 * Confirmado `CP-email-config-007`:
 * "Anti-fade CSS injected via popup-freeze.js but OxD toast lifetime (~1.5 s) is
 * shorter than MCP screenshot roundtrip (~2-3 s on Windows)".
 *
 * v2 instala un MutationObserver en `document.body` que detecta cuando se AGREGA
 * un nodo cuyo selector matchea un toast conocido. Cuando lo detecta:
 *   1. Clona el nodo en deep copy (incluye estilos computados como inline `style`).
 *   2. Lo append a un container persistente `<div id="__atfPreservedToasts">` que
 *      el observer NO está observando (ajeno al árbol de la app).
 *   3. El clon NO tiene event listeners propios — la app no lo afecta. Permanece
 *      visible hasta que el snippet `--cleanup` lo elimine.
 *
 * El highlight + screenshot apuntan al clon (`#__atfPreservedToasts > .oxd-toast`).
 *
 * Cobertura por framework (selectores agnósticos):
 *   - OxD/OrangeHRM:  .oxd-toast, .oxd-toast-container
 *   - Material UI:    .MuiSnackbar-root, .MuiAlert-root
 *   - Ant Design:     .ant-message, .ant-notification
 *   - Toastify:       .Toastify__toast
 *   - SweetAlert2:    .swal2-toast
 *   - Bootstrap:      .toast.show
 *   - Heurístico:     [class*="toast" i], [class*="snackbar" i]
 *
 * Idempotente: si `window.__atfToastObserver` ya existe, retorna `{installed:true,
 * reused:true}`. Anti-acumulación: el cleanup elimina el container.
 *
 * Uso:
 *   node .claude/tools/snippets/popup-freeze.js              # emite snippet de install
 *   node .claude/tools/snippets/popup-freeze.js --cleanup    # emite snippet de cleanup
 *
 * Output: arrow function `() => {...}` lista para `browser_evaluate({function})`.
 *
 * Doctrina prosa-vs-código: el script es deterministic, el sub-agente solo invoca.
 * Cuando se aplique en el flujo, el LLM no construye el JS — pasa el snippet tal cual.
 */
'use strict';

const args = process.argv.slice(2);
const CLEANUP = args.includes('--cleanup');

if (CLEANUP) {
  // Cleanup: desinstala observer, elimina container persistente y limpia toasts visibles
  process.stdout.write(
`() => {
  // Desconectar observer
  let observerStopped = false;
  if (window.__atfToastObserver) {
    try { window.__atfToastObserver.disconnect(); } catch (e) {}
    delete window.__atfToastObserver;
    observerStopped = true;
  }
  // Eliminar container persistente (con todos los clones)
  const container = document.getElementById('__atfPreservedToasts');
  let clonesRemoved = 0;
  if (container) {
    clonesRemoved = container.children.length;
    container.remove();
  }
  // Limpiar style freeze legacy (compat con v1)
  const styleLegacy = document.getElementById('__atfFreezeToasts');
  if (styleLegacy) styleLegacy.remove();
  // Eliminar toasts vivos del DOM real (anti-acumulación si la app no los cerró)
  const selectors = ['.oxd-toast','.Toastify__toast','.MuiSnackbar-root','.MuiAlert-root','.ant-message','.ant-notification','.swal2-toast','.toast.show'];
  let liveCleared = 0;
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => { try { el.remove(); liveCleared++; } catch (e) {} });
  }
  return { observer_stopped: observerStopped, clones_removed: clonesRemoved, live_toasts_cleared: liveCleared };
}`);
  process.exit(0);
}

// Snippet principal — install observer + container persistente
process.stdout.write(
`() => {
  if (window.__atfToastObserver) {
    return { installed: true, reused: true };
  }

  // 1. Crear container persistente (UNA vez)
  let container = document.getElementById('__atfPreservedToasts');
  if (!container) {
    container = document.createElement('div');
    container.id = '__atfPreservedToasts';
    // Posicionado para no obstruir clicks ni overlays. z-index alto pero debajo de modales típicos (>100000).
    container.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;z-index:99998;pointer-events:none;display:flex;flex-direction:column;align-items:flex-start;padding:16px;gap:8px');
    document.body.appendChild(container);
  }

  // 2. Selectores que matchean toasts conocidos
  const TOAST_SELECTORS = [
    '.oxd-toast', '.oxd-toast-container',
    '.Toastify__toast',
    '.MuiSnackbar-root', '.MuiAlert-root',
    '.ant-message-notice', '.ant-notification-notice',
    '.swal2-toast',
    '.toast.show'
  ];

  // 3. Función para verificar si un nodo matchea algún selector de toast
  function matchesToast(node) {
    if (!node || node.nodeType !== 1) return false;
    for (const sel of TOAST_SELECTORS) {
      try {
        if (node.matches && node.matches(sel)) return true;
      } catch (e) {}
    }
    // Heurística por className
    const cls = (node.className && typeof node.className === 'string') ? node.className.toLowerCase() : '';
    if (/(?:^|\\s)(?:toast|snackbar)(?:$|[\\s_-])/.test(cls)) return true;
    return false;
  }

  // 4. Función para clonar un nodo aplicando estilos computados
  function cloneWithComputedStyles(srcNode) {
    const clone = srcNode.cloneNode(true);
    // Aplicar computed styles del original como inline style en el clon (preserva visual sin depender de CSS externos)
    function copyStyles(src, dst) {
      if (src.nodeType !== 1 || dst.nodeType !== 1) return;
      try {
        const cs = window.getComputedStyle(src);
        let inline = '';
        // Copiar propiedades visuales clave
        const props = ['color','background-color','background','border','border-radius','box-shadow','padding','margin','font-family','font-size','font-weight','line-height','text-align','display','width','min-width','max-width','height'];
        for (const p of props) {
          const v = cs.getPropertyValue(p);
          if (v) inline += p + ':' + v + ';';
        }
        // Forzar visibilidad inmutable
        inline += 'opacity:1 !important;visibility:visible !important;animation:none !important;transition:none !important;';
        dst.setAttribute('style', (dst.getAttribute('style') || '') + ';' + inline);
      } catch (e) {}
      // Recursivo en hijos
      const srcKids = src.children, dstKids = dst.children;
      if (srcKids && dstKids && srcKids.length === dstKids.length) {
        for (let i = 0; i < srcKids.length; i++) copyStyles(srcKids[i], dstKids[i]);
      }
    }
    copyStyles(srcNode, clone);
    // Marcar el clon para identificación
    clone.setAttribute('data-atf-cloned', '1');
    return clone;
  }

  // 5. Procesar un nodo agregado al DOM
  function processNode(node) {
    if (!matchesToast(node)) return;
    if (node.closest && node.closest('#__atfPreservedToasts')) return; // evita loop infinito
    try {
      const clone = cloneWithComputedStyles(node);
      container.appendChild(clone);
    } catch (e) {}
  }

  // 6. Observer principal
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      for (const added of m.addedNodes) {
        if (added.nodeType !== 1) continue;
        // Caso 1: el nodo agregado ES un toast
        processNode(added);
        // Caso 2: el nodo agregado contiene toasts (ej: container que se popula al vuelo)
        if (added.querySelectorAll) {
          for (const sel of TOAST_SELECTORS) {
            try {
              added.querySelectorAll(sel).forEach(processNode);
            } catch (e) {}
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.__atfToastObserver = observer;

  return {
    installed: true,
    reused: false,
    container_id: '__atfPreservedToasts',
    selectors_watched: TOAST_SELECTORS.length
  };
}`);
process.exit(0);
