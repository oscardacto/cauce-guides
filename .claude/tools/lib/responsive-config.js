#!/usr/bin/env node
'use strict';
/**
 * responsive-config.js — SSoT para carga, validación y expansión de configuración responsive.
 *
 * Centraliza:
 *   - Validación del bloque appweb.yaml → responsive
 *   - Sanitización de nombres de viewport a formato seguro de carpeta
 *   - Resolución de viewports habilitados
 *   - Expansión determinística: cp_targets[] × viewports[] → execution_targets[]
 *   - Compatibilidad cuando el bloque responsive no existe (responsive deshabilitado)
 *
 * Capacidades MCP v1 (config.yaml → responsive.mcp_viewport_capability = "resize_only"):
 *   - width y height: aplicados via browser_resize, verificables post-apply.
 *   - device_scale_factor, is_mobile, has_touch: declarativos — registrados en
 *     result.json → viewport.requested pero NO simulados por el MCP en v1.
 *
 * Uso:
 *   const { loadResponsiveConfig, expandExecutionTargets } = require('./responsive-config');
 *   const responsiveCfg = loadResponsiveConfig(appYamlObject);
 *   if (responsiveCfg.errors.length) { ... handle ... }
 *   const targets = expandExecutionTargets(cpTargets, responsiveCfg.viewports);
 */

// ─── Constantes de v1 ────────────────────────────────────────────────────────

const V1_EXECUTION_MODE  = 'all_cps_all_viewports';
const V1_RESULT_POLICY   = 'strict';
const V1_MCP_CAPABILITY  = 'resize_only';

// ─── Sanitización ────────────────────────────────────────────────────────────

/**
 * Sanitiza un nombre de viewport a formato seguro para nombre de carpeta.
 * Regla: solo [a-z0-9_-]. Espacios → '_'. Resto → descartado.
 *
 * @param {string} name
 * @returns {string|null} — null si el resultado está vacío
 */
function sanitizeViewportName(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  const sanitized = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
  return sanitized.length > 0 ? sanitized : null;
}

// ─── Validación de viewport individual ───────────────────────────────────────

/**
 * Valida y normaliza un objeto viewport del bloque appweb.yaml → responsive.viewports[].
 *
 * @param {object} vp    — viewport raw desde YAML
 * @param {number} index — posición en el array (para mensajes de error)
 * @returns {{ valid: boolean, errors: string[], sanitized: object|null }}
 */
function validateViewport(vp, index) {
  const errors = [];

  if (!vp || typeof vp !== 'object') {
    return { valid: false, errors: [`viewport[${index}] no es un objeto válido`], sanitized: null };
  }

  const sanitizedName = sanitizeViewportName(vp.name);
  if (!sanitizedName) {
    errors.push(`viewport[${index}].name es requerido y debe contener al menos un carácter en [a-z0-9_-]`);
  }

  const width = parseInt(vp.width, 10);
  if (!Number.isInteger(width) || width <= 0) {
    errors.push(`viewport[${index}].width debe ser un entero positivo (recibido: ${JSON.stringify(vp.width)})`);
  }

  const height = parseInt(vp.height, 10);
  if (!Number.isInteger(height) || height <= 0) {
    errors.push(`viewport[${index}].height debe ser un entero positivo (recibido: ${JSON.stringify(vp.height)})`);
  }

  if (vp.device_scale_factor !== undefined && vp.device_scale_factor !== null) {
    const dpr = parseFloat(vp.device_scale_factor);
    if (isNaN(dpr) || dpr <= 0) {
      errors.push(`viewport[${index}].device_scale_factor debe ser un número mayor que cero (recibido: ${JSON.stringify(vp.device_scale_factor)})`);
    }
  }

  if (errors.length > 0) return { valid: false, errors, sanitized: null };

  // Normalizar label: usar name si label está ausente o vacío
  const label = (typeof vp.label === 'string' && vp.label.trim())
    ? vp.label.trim()
    : sanitizedName;

  return {
    valid: true,
    errors: [],
    sanitized: {
      name:                sanitizedName,
      label,
      width,
      height,
      device_scale_factor: (typeof vp.device_scale_factor === 'number' && vp.device_scale_factor > 0)
                             ? vp.device_scale_factor
                             : 1,
      is_mobile:           Boolean(vp.is_mobile),
      has_touch:           Boolean(vp.has_touch),
      enabled:             vp.enabled !== false, // default true si omitido
    },
  };
}

// ─── Carga y validación del bloque responsive ─────────────────────────────────

/**
 * Carga y valida la configuración responsive desde el objeto parseado de appweb.yaml.
 *
 * @param {object|null} appConfig — objeto ya parseado de appweb.yaml (o null/undefined)
 * @returns {{
 *   enabled:        boolean,
 *   execution_mode: string,
 *   result_policy:  string,
 *   mcp_capability: string,
 *   viewports:      object[],  // solo los viewports habilitados y validados
 *   errors:         string[],  // errores bloqueantes (preflight debe DETENERSE si hay alguno)
 *   warnings:       string[],  // advertencias no bloqueantes (registrar, no detener)
 * }}
 */
function loadResponsiveConfig(appConfig) {
  const result = {
    enabled:        false,
    execution_mode: V1_EXECUTION_MODE,
    result_policy:  V1_RESULT_POLICY,
    mcp_capability: V1_MCP_CAPABILITY,
    viewports:      [],
    errors:         [],
    warnings:       [],
  };

  // Compatibilidad hacia atrás: bloque ausente = responsive deshabilitado, sin error
  if (!appConfig || !appConfig.responsive) {
    return result;
  }

  const cfg = appConfig.responsive;

  result.enabled = cfg.enabled === true;
  if (!result.enabled) return result; // disabled → no validar viewports

  // execution_mode — solo all_cps_all_viewports en v1
  if (cfg.execution_mode && cfg.execution_mode !== V1_EXECUTION_MODE) {
    result.warnings.push(
      `responsive.execution_mode "${cfg.execution_mode}" no está soportado en v1. ` +
      `Se usará "${V1_EXECUTION_MODE}".`
    );
  }

  // result_policy — solo strict en v1
  if (cfg.result_policy && cfg.result_policy !== V1_RESULT_POLICY) {
    result.warnings.push(
      `responsive.result_policy "${cfg.result_policy}" no está soportado en v1. ` +
      `Se usará "${V1_RESULT_POLICY}".`
    );
  }

  // viewports — debe ser array no vacío
  if (!Array.isArray(cfg.viewports) || cfg.viewports.length === 0) {
    result.errors.push(
      'responsive.viewports debe ser un array no vacío cuando responsive.enabled = true. ' +
      'Agrega al menos un viewport con enabled: true en appweb.yaml.'
    );
    return result;
  }

  const seenNames = new Set();

  for (let i = 0; i < cfg.viewports.length; i++) {
    const vp = cfg.viewports[i];

    // Skip disabled
    if (vp && vp.enabled === false) continue;

    const { valid, errors, sanitized } = validateViewport(vp, i);

    if (!valid) {
      result.errors.push(...errors);
      continue;
    }

    if (seenNames.has(sanitized.name)) {
      result.errors.push(
        `responsive.viewports[${i}].name "${sanitized.name}" está duplicado. ` +
        'Los nombres de viewport deben ser únicos.'
      );
      continue;
    }

    seenNames.add(sanitized.name);
    result.viewports.push(sanitized);
  }

  if (result.viewports.length === 0 && result.errors.length === 0) {
    result.errors.push(
      'responsive está habilitado pero ningún viewport tiene enabled: true (o enabled omitido).'
    );
  }

  return result;
}

// ─── Expansión cp_targets × viewports ────────────────────────────────────────

/**
 * Expande determinísticamente cp_targets[] × viewports[] en execution_targets[].
 *
 * Orden: CP primero, viewport dentro (CP-001: vp1, vp2, vp3 → CP-002: vp1, vp2, vp3).
 * Este orden permite escribir el result.json consolidado del CP inmediatamente
 * tras completar todos sus viewports, sin esperar al resto de CPs.
 *
 * @param {Array<{cp_id: string, module_id: string}>} cpTargets
 * @param {Array<object>} viewports — lista de viewports validados (output de loadResponsiveConfig)
 * @returns {Array<{cp_id, module_id, viewport: {name, label, width, height, ...}, ...rest}>}
 */
function expandExecutionTargets(cpTargets, viewports) {
  const targets = [];
  for (const cp of cpTargets) {
    for (const vp of viewports) {
      targets.push({
        ...cp,
        viewport: {
          name:                vp.name,
          label:               vp.label,
          width:               vp.width,
          height:              vp.height,
          device_scale_factor: vp.device_scale_factor,
          is_mobile:           vp.is_mobile,
          has_touch:           vp.has_touch,
        },
      });
    }
  }
  return targets;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/**
 * Calcula el total de execution_targets dado un número de CPs y viewports.
 * Útil para banners y estimaciones de duración en el orchestrator.
 *
 * @param {number} cpCount
 * @param {number} viewportCount
 * @returns {number}
 */
function totalExecutionUnits(cpCount, viewportCount) {
  return cpCount * viewportCount;
}

/**
 * Devuelve la carpeta de viewport dentro de la carpeta del CP.
 * Wrapper sobre sanitizeViewportName para garantizar consistencia de rutas.
 *
 * @param {string} viewportName — nombre ya sanitizado del viewport
 * @param {string} cpFolder     — carpeta canónica del CP (slug)
 * @returns {string}            — path relativo: "{cpFolder}/{viewportName}"
 */
function viewportFolder(viewportName, cpFolder) {
  return `${cpFolder}/${viewportName}`;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  sanitizeViewportName,
  validateViewport,
  loadResponsiveConfig,
  expandExecutionTargets,
  totalExecutionUnits,
  viewportFolder,
  // Constantes exportadas para que los callers no hardcodeen valores de v1
  V1_EXECUTION_MODE,
  V1_RESULT_POLICY,
  V1_MCP_CAPABILITY,
};
