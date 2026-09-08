#!/usr/bin/env node
/**
 * ATF — diagnose-merge.js
 *
 * Habilita el modo ACUMULATIVO de `/sofka-asdd:qa-web-diagnose` sobre el mismo run_id, soportando
 * el flujo ágil de sprints incrementales: si una HU ya fue procesada, se preserva;
 * si es nueva, se appendea sin destruir lo previo.
 *
 * Identidad de HU = SLUG del título extraído por el agente Diagnostician
 * (decisión contextual = prosa). El script (validador determinístico = código)
 * solo ensambla fragmentos respetando el formato canónico.
 *
 * Sub-comandos:
 *
 *   pre-check  --run-id {id}
 *     → Lee processed_hus.json del run (si existe) y emite JSON consolidado:
 *       { mode: "fresh|append", existing_hus[], existing_sup_ids[],
 *         existing_pq_ids[], existing_mat_ids[], counters: { next_sup, next_pq, next_mat },
 *         resolved_pq_ids[] (status="resuelta") }
 *     Si processed_hus.json no existe → mode "fresh", listas vacías.
 *
 *   post-merge --run-id {id}
 *     → Lee diagnostics/.tmp/fragments/*.md (uno por HU nueva) + artefactos previos
 *       y ensambla atómicamente:
 *         - base_pruebas.md (insertar secciones HU antes de "Material Referenciado")
 *         - assumptions.md (append filas a tablas)
 *         - preguntas_cliente.md (append filas)
 *         - material_references.json (merge by id)
 *         - testability_score.md (recalcular tabla + FRS global = promedio simple)
 *         - processed_hus.json (append entradas nuevas)
 *
 *   backfill --run-id {id}
 *     → Reconstruye processed_hus.json a partir de artefactos existentes
 *       (base_pruebas.md, assumptions.md, etc.) cuando un run legacy no tiene
 *       registro. Útil para incorporar runs pre-al modo acumulativo.
 *       Captura: slugs de HUs detectadas + máximos SUP/PQ/MAT para evitar
 *       colisión de IDs. NO atribuye SUP/PQ/MAT a HUs específicas (limitación
 *       conocida). Si el run ya tiene processed_hus.json → no-op.
 *
 * Exit codes:
 *   0 = OK
 *   1 = error fatal (run_folder ausente, JSON corrupto, fragment inválido)
 *   2 = no-op (skip silencioso, sin cambios que escribir)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ────────────────────────────────────────────────────────────────────────────
// Helpers básicos
// ────────────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_BASE  = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web');

function die(msg, code) {
  process.stderr.write(`diagnose-merge: ${msg}\n`);
  process.exit(code || 1);
}

function readJSON(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    die(`JSON inválido en ${p}: ${e.message}`);
  }
}

function readText(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function writeText(p, str) {
  fs.writeFileSync(p, str, 'utf8');
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = argv[++i];
    } else {
      out._.push(a);
    }
  }
  return out;
}

// Slugify simple — minúsculas, espacios → guiones, sin acentos
function slugify(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ────────────────────────────────────────────────────────────────────────────
// Paths del run
// ────────────────────────────────────────────────────────────────────────────

function paths(runId) {
  const runFolder    = path.join(OUTPUT_BASE, runId);
  const diagDir      = path.join(runFolder, 'diagnostics');
  return {
    runFolder,
    diagDir,
    fragmentsDir:    path.join(diagDir, '.tmp', 'fragments'),
    processedHus:    path.join(diagDir, 'processed_hus.json'),
    basePruebas:     path.join(diagDir, 'base_pruebas.md'),
    assumptions:     path.join(diagDir, 'assumptions.md'),
    preguntas:       path.join(diagDir, 'preguntas_cliente.md'),
    materialRefs:    path.join(diagDir, 'material_references.json'),
    testabilityScr:  path.join(diagDir, 'testability_score.md'),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PRE-CHECK
// ────────────────────────────────────────────────────────────────────────────

function preCheck(runId) {
  const p = paths(runId);
  if (!fs.existsSync(p.runFolder)) die(`run_folder no existe: ${p.runFolder}`);

  const reg = readJSON(p.processedHus);

  // P57 — Pre-resolver knowledge_excerpts e inline_context
  // Anti-self-read del agente: en lugar de que el diagnostician haga Read sobre
  // docs/testing/atf-web/knowledge/* y docs/testing/atf-web/config/*, el script los pre-resuelve aquí.
  const sessionCtx = readJSON(path.join(p.runFolder, 'session_context.json')) || {};
  const appName = sessionCtx.app_name || '';
  const knowledgeDir = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'knowledge');
  const excerptText = (filePath, maxLines = 200) => {
    if (!fs.existsSync(filePath)) return null;
    const txt = fs.readFileSync(filePath, 'utf8');
    const lines = txt.split('\n');
    if (lines.length <= maxLines) return txt;
    return lines.slice(0, maxLines).join('\n') +
      `\n\n[... truncado en línea ${maxLines}, total ${lines.length} líneas — leer archivo completo si necesitas profundizar ...]`;
  };

  const knowledge_excerpts = {
    app_name: appName,
    app_behavior: appName ? excerptText(path.join(knowledgeDir, `app_behavior.${appName}.md`)) : null,
    test_gotchas: appName ? excerptText(path.join(knowledgeDir, `test_gotchas.${appName}.md`)) : null,
  };

  const inline_context = {
    app_name: appName,
    app_url: sessionCtx.app_url || '',
    app_version: sessionCtx.app_version || '',
    app_environment: sessionCtx.app_environment || '',
    notebooklm_enabled: sessionCtx.notebooklm_enabled === true,
    notebooklm_notebook_id: sessionCtx.notebooklm_notebook_id || '',
    functional_docs_folder: sessionCtx.functional_docs_folder || '',
    diagnostics_dir: sessionCtx.diagnostics_dir || '',
  };

  if (!reg) {
    return {
      mode: 'fresh',
      run_id: runId,
      existing_hus: [],
      existing_sup_ids: [],
      existing_pq_ids: [],
      existing_mat_ids: [],
      resolved_pq_ids: [],
      counters: { next_sup: 1, next_pq: 1, next_mat: 1 },
      inline_context,
      knowledge_excerpts,
    };
  }

  const hus = Array.isArray(reg.hus) ? reg.hus : [];
  const counters = reg.global_counters || { next_sup: 1, next_pq: 1, next_mat: 1 };

  // Detectar PQ ya resueltas (parsear preguntas_cliente.md tabla)
  const resolvedPq = parseResolvedPqIds(readText(p.preguntas));

  return {
    mode: 'append',
    run_id: runId,
    existing_hus: hus.map(h => ({
      title_slug: h.title_slug,
      title: h.title,
      source_file: h.source_file,
    })),
    existing_sup_ids: hus.flatMap(h => h.sup_ids_owned || []),
    existing_pq_ids: hus.flatMap(h => h.pq_ids_owned || []),
    existing_mat_ids: hus.flatMap(h => h.mat_ids_owned || []),
    resolved_pq_ids: resolvedPq,
    counters,
    inline_context,
    knowledge_excerpts,
  };
}

// Detecta filas de tabla con `| PQ-XXX |` y status != "pendiente"
function parseResolvedPqIds(md) {
  if (!md) return [];
  const out = [];
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\|\s*(PQ-\d{3,})\s*\|.*\|\s*(resuelta|parcial)\s*\|/i);
    if (m) out.push(m[1]);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// POST-MERGE — Parsers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fragmento de HU (.tmp/fragments/{slug}.md) con frontmatter YAML simple:
 *
 *   ---
 *   title: "Consultar Job Titles"
 *   title_slug: "consultar-job-titles"
 *   source_file: "HU Job Titles_OrangeHRM.md"
 *   frs_individual: 69.0
 *   sup_ids_owned: ["SUP-010", "SUP-011"]
 *   pq_ids_owned: ["PQ-011", "PQ-012"]
 *   mat_ids_owned: ["MAT-006"]
 *   ---
 *
 *   ## SECTION:base_pruebas
 *   ### HU-X: ...
 *   ...prosa de la HU...
 *
 *   ## SECTION:assumptions_rows
 *   | SUP-010 | HU-X | funcional | ... |
 *   | SUP-011 | HU-X | nfr | ... |
 *
 *   ## SECTION:preguntas_alta
 *   | PQ-011 | HU-X | funcional | ... | pendiente | — |
 *
 *   ## SECTION:preguntas_media
 *   | PQ-012 | HU-X | nfr | ... | pendiente | — |
 *
 *   ## SECTION:preguntas_baja
 *   (vacío)
 *
 *   ## SECTION:material_refs_json
 *   [ { "id": "MAT-006", "type": "...", ... } ]
 *
 *   ## SECTION:testability_row
 *   | HU-X | Título | claridad | completitud | criterios | trazabilidad | atomicidad | 69.0% | CONDICIONAL |
 */
function parseFragment(filePath) {
  const raw = readText(filePath);
  if (!raw) return null;

  // Frontmatter
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fmMatch) {
    throw new Error(`Fragment sin frontmatter: ${filePath}`);
  }
  const fmText = fmMatch[1];
  const body = raw.slice(fmMatch[0].length);

  // YAML mínimo (key: value, arrays como [a, b])
  const fm = {};
  for (const line of fmText.split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    else if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(x => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
    } else if (/^-?\d+(\.\d+)?$/.test(v)) v = parseFloat(v);
    fm[m[1]] = v;
  }

  // Secciones
  const sections = {};
  const sectRegex = /^##\s+SECTION:(\w+)\s*$/gm;
  const matches = [...body.matchAll(sectRegex)];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i < matches.length - 1 ? matches[i + 1].index : body.length;
    sections[name] = body.slice(start, end).trim();
  }

  return { fm, sections, sourcePath: filePath };
}

// ────────────────────────────────────────────────────────────────────────────
// POST-MERGE — Builders / Mergers
// ────────────────────────────────────────────────────────────────────────────

function recalcGlobalFrs(huRecords) {
  if (huRecords.length === 0) return { frs: 0, gate: 'BLOCKED' };
  const sum = huRecords.reduce((acc, h) => acc + (h.frs_individual || 0), 0);
  const frs = sum / huRecords.length;
  const gate = frs >= 75 ? 'READY' : (frs >= 50 ? 'CONDITIONAL' : 'BLOCKED');
  return { frs: Math.round(frs * 10) / 10, gate };
}

function mergeBasePruebas(prev, fragments, frsGlobal, gate, runMeta) {
  // Si no hay archivo previo → construir desde cero con frontmatter y secciones por HU
  const huSections = fragments
    .filter(f => f.sections.base_pruebas)
    .map(f => f.sections.base_pruebas)
    .join('\n\n');

  if (!prev) {
    let md = `# Base de Pruebas — ${runMeta.app_name} ${runMeta.app_version}\n`;
    md += `**FRS:** ${frsGlobal}%  |  **Gate:** ${gate}  |  **Generado:** ${runMeta.generated_at}\n`;
    md += `> produced_by: standalone-command\n\n`;
    md += `---\n\n${huSections}\n`;
    return md;
  }

  // Append: insertar nuevas HUs antes de "## Material Referenciado" (si existe) o al final
  const matMatch = prev.match(/^##\s+Material Referenciado\s*$/m);
  let updated;
  if (matMatch) {
    const idx = matMatch.index;
    updated = prev.slice(0, idx) + huSections + '\n\n' + prev.slice(idx);
  } else {
    updated = prev.trimEnd() + '\n\n' + huSections + '\n';
  }

  // Actualizar línea de FRS/Gate global (consume emoji opcional posterior al gate)
  const gateEmoji = gate === 'READY' ? ' ✅' : gate === 'CONDITIONAL' ? ' ⚠️' : ' ⛔';
  updated = updated.replace(
    /\*\*FRS:\*\*\s*[\d.]+%\s*\|\s*\*\*Gate:\*\*\s*\w+(\s*[✅⚠️⛔])?/,
    `**FRS:** ${frsGlobal}%  |  **Gate:** ${gate}${gateEmoji}`
  );

  return updated;
}

/**
 * Inserta filas en la sección de tabla matching el header (asumptions table).
 * El parser preserva las filas existentes y appendea las nuevas al final del bloque de tabla.
 */
function mergeAssumptions(prev, fragments, runMeta) {
  const newRows = fragments
    .filter(f => f.sections.assumptions_rows)
    .map(f => f.sections.assumptions_rows)
    .filter(Boolean)
    .join('\n');

  if (!newRows.trim()) return prev || ''; // nada que appendear

  if (!prev) {
    // Construir desde cero
    let md = `# Supuestos de Prueba — ${runMeta.app_name}\n`;
    md += `> produced_by: standalone-command\n\n`;
    md += `Deben validarse con el equipo de desarrollo antes del cierre del ciclo.\n\n`;
    md += `| ID | Fuente | Tipo | Ambigüedad | Supuesto adoptado | Riesgo | Pregunta |\n`;
    md += `|----|--------|------|-----------|-------------------|--------|---------|\n`;
    md += newRows + '\n';
    return md;
  }

  // Append al final (después de la última fila de tabla)
  const lines = prev.split(/\r?\n/);
  let lastRowIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\|\s*SUP-/i.test(lines[i])) {
      lastRowIdx = i;
      break;
    }
  }

  if (lastRowIdx === -1) {
    // No hay filas previas — append al final
    return prev.trimEnd() + '\n' + newRows + '\n';
  }

  const before = lines.slice(0, lastRowIdx + 1).join('\n');
  const after  = lines.slice(lastRowIdx + 1).join('\n');
  return before + '\n' + newRows + (after ? '\n' + after : '\n');
}

/**
 * Mergea preguntas_cliente.md preservando filas con status != "pendiente".
 * Inserta nuevas filas en la tabla correspondiente (alta/media/baja).
 */
function mergePreguntas(prev, fragments, runMeta) {
  const collect = name => fragments
    .filter(f => f.sections[name])
    .map(f => f.sections[name])
    .filter(Boolean)
    .join('\n');

  const newAlta  = collect('preguntas_alta');
  const newMedia = collect('preguntas_media');
  const newBaja  = collect('preguntas_baja');

  if (!prev) {
    // Construir desde cero
    const totalRows = [newAlta, newMedia, newBaja].filter(Boolean).join('\n');
    const totalCount = totalRows.split(/\r?\n/).filter(l => /^\|\s*PQ-/.test(l)).length;
    const altaCount = newAlta.split(/\r?\n/).filter(l => /^\|\s*PQ-/.test(l)).length;
    const mediaCount = newMedia.split(/\r?\n/).filter(l => /^\|\s*PQ-/.test(l)).length;
    const bajaCount = newBaja.split(/\r?\n/).filter(l => /^\|\s*PQ-/.test(l)).length;

    let md = `# Preguntas al Cliente — ${runMeta.app_name} ${runMeta.app_version}\n`;
    md += `**Generado:** ${runMeta.generated_at} | **Run:** ${runMeta.run_id}\n`;
    md += `**Total:** ${totalCount} | Alta: ${altaCount} | Media: ${mediaCount} | Baja: ${bajaCount}\n\n`;
    md += `> Respuestas → depositar en \`docs/testing/atf-web/requirements/hu-bajo-prueba/respuestas_cliente/respuestas_YYYYMMDD.md\`\n`;
    md += `> Re-ejecutar pipeline con nuevos documentos → FRS mejora\n\n`;
    md += `## Alta — Bloqueantes\n\n`;
    md += `| ID | HU | Tipo | Pregunta | Por qué importa | Status | Respuesta |\n`;
    md += `|----|----|------|----------|----------------|--------|-----------|\n`;
    if (newAlta) md += newAlta + '\n';
    md += `\n## Media — Afectan cobertura\n\n`;
    md += `| ID | HU | Tipo | Pregunta | Por qué importa | Status | Respuesta |\n`;
    md += `|----|----|------|----------|----------------|--------|---------|\n`;
    if (newMedia) md += newMedia + '\n';
    md += `\n## Baja — Mejoran precisión\n\n`;
    md += `| ID | HU | Tipo | Pregunta | Por qué importa | Status | Respuesta |\n`;
    md += `|----|----|------|----------|----------------|--------|---------|\n`;
    if (newBaja) md += newBaja + '\n';
    return md;
  }

  // Append: encontrar cada sección y appendear al final de su tabla
  let updated = prev;
  updated = appendToSection(updated, /^##\s+(?:🔴\s+)?Alta\s*—/m, newAlta);
  updated = appendToSection(updated, /^##\s+(?:🟡\s+)?Media\s*—/m, newMedia);
  updated = appendToSection(updated, /^##\s+(?:🟢\s+)?Baja\s*—/m, newBaja);

  // Recalcular contadores en línea de header
  const altaTotal = countPqInSection(updated, /^##\s+(?:🔴\s+)?Alta\s*—/m);
  const mediaTotal = countPqInSection(updated, /^##\s+(?:🟡\s+)?Media\s*—/m);
  const bajaTotal = countPqInSection(updated, /^##\s+(?:🟢\s+)?Baja\s*—/m);
  const grand = altaTotal + mediaTotal + bajaTotal;

  updated = updated.replace(
    /\*\*Total:\*\*\s*\d+\s*\|\s*Alta:\s*\d+\s*\|\s*Media:\s*\d+\s*\|\s*Baja:\s*\d+/,
    `**Total:** ${grand} | Alta: ${altaTotal} | Media: ${mediaTotal} | Baja: ${bajaTotal}`
  );

  return updated;
}

function appendToSection(doc, sectionRegex, newRows) {
  if (!newRows || !newRows.trim()) return doc;
  const m = doc.match(sectionRegex);
  if (!m) return doc; // sección ausente — no inventar

  const startIdx = m.index;
  // Encontrar el inicio de la siguiente sección "## " a partir de startIdx
  const after = doc.slice(startIdx + m[0].length);
  const nextSect = after.match(/^##\s+/m);
  const endIdx = nextSect ? startIdx + m[0].length + nextSect.index : doc.length;

  const sectionBlock = doc.slice(startIdx, endIdx);
  // Encontrar última fila PQ-XXX dentro del block
  const lines = sectionBlock.split(/\r?\n/);
  let lastPqIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\|\s*PQ-/.test(lines[i])) { lastPqIdx = i; break; }
  }

  let updatedBlock;
  if (lastPqIdx === -1) {
    // No hay filas previas — appendear después de la fila de separador `|----|`
    let sepIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\|[-\s|]+\|$/.test(lines[i])) { sepIdx = i; break; }
    }
    if (sepIdx === -1) return doc;
    lines.splice(sepIdx + 1, 0, newRows);
    updatedBlock = lines.join('\n');
  } else {
    lines.splice(lastPqIdx + 1, 0, newRows);
    updatedBlock = lines.join('\n');
  }

  return doc.slice(0, startIdx) + updatedBlock + doc.slice(endIdx);
}

function countPqInSection(doc, sectionRegex) {
  const m = doc.match(sectionRegex);
  if (!m) return 0;
  const after = doc.slice(m.index + m[0].length);
  const nextSect = after.match(/^##\s+/m);
  const block = nextSect ? after.slice(0, nextSect.index) : after;
  return (block.match(/^\|\s*PQ-/gm) || []).length;
}

function mergeMaterialRefs(prev, fragments, runMeta) {
  let refs = [];
  if (prev && Array.isArray(prev.references)) refs = prev.references.slice();

  for (const f of fragments) {
    const rawJson = f.sections.material_refs_json;
    if (!rawJson) continue;
    let arr;
    try {
      arr = JSON.parse(rawJson);
    } catch (e) {
      throw new Error(`material_refs_json inválido en ${f.sourcePath}: ${e.message}`);
    }
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      const existing = refs.find(x => x.id === r.id);
      if (existing) {
        // Mergear referenced_by sin duplicar
        const merged = new Set([...(existing.referenced_by || []), ...(r.referenced_by || [])]);
        existing.referenced_by = Array.from(merged);
        // Conservar found_in si existing lo tiene; de lo contrario tomar el nuevo
        if (!existing.found_in && r.found_in) existing.found_in = r.found_in;
        if (!existing.context && r.context) existing.context = r.context;
        // status / priority: conservar el más severo
        if (r.priority === 'alta') existing.priority = 'alta';
      } else {
        refs.push(r);
      }
    }
  }

  const summary = {
    total_references: refs.length,
    disponibles: refs.filter(r => r.status === 'disponible').length,
    pendientes: refs.filter(r => r.status === 'pendiente').length,
    coverage_pct: refs.length === 0 ? 100.0
      : Math.round((refs.filter(r => r.status === 'disponible').length / refs.length) * 1000) / 10,
  };

  return {
    scan_date: runMeta.generated_at,
    run_id: runMeta.run_id,
    references: refs,
    summary,
  };
}

function mergeTestabilityScore(prev, allHuRecords, frsGlobal, gate, runMeta) {
  const counts = { READY: 0, CONDITIONAL: 0, BLOCKED: 0 };
  for (const h of allHuRecords) {
    const frs = h.frs_individual || 0;
    if (frs >= 75) counts.READY++;
    else if (frs >= 50) counts.CONDITIONAL++;
    else counts.BLOCKED++;
  }

  let md = `# Testability Score — ${runMeta.app_name} ${runMeta.app_version}\n`;
  md += `> produced_by: standalone-command\n`;
  md += `> Generado: ${runMeta.generated_at}\n\n`;
  md += `## Resultado Global\n\n`;
  md += `| Métrica | Valor |\n|---------|-------|\n`;
  md += `| FRS Global | **${frsGlobal}%** |\n`;
  md += `| Gate | **${gate}** |\n`;
  md += `| Total HUs evaluadas | ${allHuRecords.length} |\n`;
  md += `| TESTEABLES (≥75) | ${counts.READY} |\n`;
  md += `| CONDICIONALES (50-74) | ${counts.CONDITIONAL} |\n`;
  md += `| NO TESTEABLES (<50) | ${counts.BLOCKED} |\n\n`;
  md += `## Detalle por HU\n\n`;
  md += `| HU | Título | Score | Clasificación |\n`;
  md += `|----|--------|-------|--------------|\n`;
  for (const h of allHuRecords) {
    const cls = (h.frs_individual || 0) >= 75 ? 'TESTEABLE'
      : (h.frs_individual || 0) >= 50 ? 'CONDICIONAL' : 'NO TESTEABLE';
    md += `| ${h.title_slug} | ${h.title} | ${h.frs_individual}% | ${cls} |\n`;
  }
  md += `\n> Detalle por dimensiones (claridad/completitud/criterios/trazabilidad/atomicidad) preservado en cada fragmento. Recalculo global = promedio simple de FRS por HU.\n`;
  return md;
}

// ────────────────────────────────────────────────────────────────────────────
// POST-MERGE — main
// ────────────────────────────────────────────────────────────────────────────

function postMerge(runId) {
  const p = paths(runId);
  if (!fs.existsSync(p.runFolder)) die(`run_folder no existe: ${p.runFolder}`);

  // Leer fragmentos
  if (!fs.existsSync(p.fragmentsDir)) {
    process.stderr.write(`diagnose-merge: sin fragmentos en ${p.fragmentsDir} — skip\n`);
    process.exit(2);
  }
  const fragmentFiles = fs.readdirSync(p.fragmentsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(p.fragmentsDir, f));

  if (fragmentFiles.length === 0) {
    process.stderr.write(`diagnose-merge: 0 fragmentos — nada que mergear\n`);
    process.exit(2);
  }

  const fragments = fragmentFiles.map(parseFragment).filter(Boolean);

  // Leer registro previo
  const prevReg = readJSON(p.processedHus) || {
    run_id: runId,
    last_extraction: null,
    hus: [],
    global_counters: { next_sup: 1, next_pq: 1, next_mat: 1 },
  };

  // Construir registros HU nuevos desde fragmentos
  const nuevasHus = fragments.map(f => ({
    title_slug: f.fm.title_slug,
    title: f.fm.title,
    source_file: f.fm.source_file,
    frs_individual: f.fm.frs_individual,
    processed_at: new Date().toISOString(),
    sup_ids_owned: f.fm.sup_ids_owned || [],
    pq_ids_owned: f.fm.pq_ids_owned || [],
    mat_ids_owned: f.fm.mat_ids_owned || [],
  }));

  // Filtrar dups por slug (si por alguna razón el agente generó fragment de slug ya en registro)
  const prevSlugs = new Set(prevReg.hus.map(h => h.title_slug));
  const nuevasFiltradas = nuevasHus.filter(h => !prevSlugs.has(h.title_slug));

  if (nuevasFiltradas.length === 0) {
    process.stderr.write(`diagnose-merge: todas las HUs en fragmentos ya están en registro — skip\n`);
    // Limpiar fragmentos para no acumular
    cleanupFragments(p.fragmentsDir);
    process.exit(2);
  }

  // Recalcular contadores nuevos
  const allHus = [...prevReg.hus, ...nuevasFiltradas];
  const allSup = allHus.flatMap(h => h.sup_ids_owned || []);
  const allPq  = allHus.flatMap(h => h.pq_ids_owned  || []);
  const allMat = allHus.flatMap(h => h.mat_ids_owned || []);
  const maxId = (arr, prefix) => arr.reduce((m, id) => {
    const n = parseInt(String(id).replace(prefix, ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  const nextCounters = {
    next_sup: maxId(allSup, 'SUP-') + 1,
    next_pq:  maxId(allPq,  'PQ-')  + 1,
    next_mat: maxId(allMat, 'MAT-') + 1,
  };

  // Recalcular FRS/gate global
  const { frs: frsGlobal, gate } = recalcGlobalFrs(allHus);

  // Metadata del run
  const sessionCtx = readJSON(path.join(p.runFolder, 'session_context.json')) || {};
  const runMeta = {
    run_id: runId,
    app_name: sessionCtx.app_name || '',
    app_version: sessionCtx.app_version || '1.0',
    generated_at: new Date().toISOString(),
  };

  // Mergear cada artefacto
  const newBasePruebas = mergeBasePruebas(readText(p.basePruebas), fragments.filter(f => nuevasFiltradas.some(h => h.title_slug === f.fm.title_slug)), frsGlobal, gate, runMeta);
  const newAssumptions = mergeAssumptions(readText(p.assumptions), fragments.filter(f => nuevasFiltradas.some(h => h.title_slug === f.fm.title_slug)), runMeta);
  const newPreguntas   = mergePreguntas(readText(p.preguntas), fragments.filter(f => nuevasFiltradas.some(h => h.title_slug === f.fm.title_slug)), runMeta);
  const prevMatRefs    = readJSON(p.materialRefs);
  const newMatRefs     = mergeMaterialRefs(prevMatRefs, fragments.filter(f => nuevasFiltradas.some(h => h.title_slug === f.fm.title_slug)), runMeta);
  const newTestability = mergeTestabilityScore(readText(p.testabilityScr), allHus, frsGlobal, gate, runMeta);

  // Escritura atómica: primero a archivos *.tmp, luego rename
  const writes = [
    [p.basePruebas, newBasePruebas],
    [p.assumptions, newAssumptions],
    [p.preguntas, newPreguntas],
    [p.materialRefs, JSON.stringify(newMatRefs, null, 2)],
    [p.testabilityScr, newTestability],
  ];
  const tmpFiles = [];
  try {
    for (const [final, content] of writes) {
      const tmp = final + '.tmp';
      writeText(tmp, content);
      tmpFiles.push([tmp, final]);
    }
    for (const [tmp, final] of tmpFiles) {
      fs.renameSync(tmp, final);
    }
  } catch (e) {
    // Cleanup tmp en caso de fallo
    for (const [tmp] of tmpFiles) {
      try { fs.unlinkSync(tmp); } catch {}
    }
    die(`Escritura atómica falló: ${e.message}`);
  }

  // Actualizar processed_hus.json
  const updatedReg = {
    run_id: runId,
    last_extraction: runMeta.generated_at,
    hus: allHus,
    global_counters: nextCounters,
    frs_global: frsGlobal,
    gate,
  };
  writeJSON(p.processedHus, updatedReg);

  // Limpiar fragmentos (consumidos)
  cleanupFragments(p.fragmentsDir);

  process.stdout.write(JSON.stringify({
    ok: true,
    run_id: runId,
    mode: prevReg.hus.length === 0 ? 'fresh' : 'append',
    nuevas_hus: nuevasFiltradas.length,
    total_hus: allHus.length,
    frs_global: frsGlobal,
    gate,
    counters: nextCounters,
  }, null, 2) + '\n');

  process.exit(0);
}

function cleanupFragments(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    try { fs.unlinkSync(path.join(dir, f)); } catch {}
  }
  try { fs.rmdirSync(dir); } catch {}
  // Remover .tmp parent si quedó vacío
  const tmpParent = path.dirname(dir);
  if (path.basename(tmpParent) === '.tmp') {
    try {
      const remaining = fs.readdirSync(tmpParent);
      if (remaining.length === 0) fs.rmdirSync(tmpParent);
    } catch {}
  }
}

// ────────────────────────────────────────────────────────────────────────────
// BACKFILL — para runs legacy con artefactos pero sin processed_hus.json
// ────────────────────────────────────────────────────────────────────────────

function backfill(runId) {
  const p = paths(runId);
  if (!fs.existsSync(p.runFolder)) die(`run_folder no existe: ${p.runFolder}`);

  if (fs.existsSync(p.processedHus)) {
    process.stdout.write(JSON.stringify({
      ok: true,
      run_id: runId,
      action: 'skip',
      reason: 'processed_hus.json ya existe',
    }, null, 2) + '\n');
    process.exit(0);
  }

  const basePruebas = readText(p.basePruebas);
  if (!basePruebas) {
    die(`backfill requiere base_pruebas.md previo en ${p.basePruebas}`);
  }

  // Detectar HUs por heading H3 SOLO dentro de bloques "## Módulo: ..."
  // Excluye explícitamente H3 fuera de ese contexto (ej: "## Material Referenciado → ### Resumen").
  const huHeadings = [];
  const lines = basePruebas.split(/\r?\n/);
  let insideModuloBlock = false;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      // Empieza un nuevo bloque H2: solo aceptamos H3 internos si es "Módulo: ..."
      insideModuloBlock = /^Módulo:/i.test(h2[1].trim());
      continue;
    }
    if (!insideModuloBlock) continue;
    const m = line.match(/^###\s+(?:HU-\w+:\s*)?(.+?)\s*$/);
    if (m) {
      const title = m[1].trim();
      huHeadings.push({
        title,
        title_slug: slugify(title.replace(/^HU-\w+:\s*/i, '')),
      });
    }
  }

  if (huHeadings.length === 0) {
    die('backfill: no se detectaron HUs en base_pruebas.md (heading H3 esperado)');
  }

  // Extraer FRS individual por HU (línea "**FRS ítem:** XX.X% | ...")
  const frsRegex = /\*\*FRS ítem:\*\*\s*([\d.]+)%/g;
  const frsValues = [];
  let m;
  while ((m = frsRegex.exec(basePruebas)) !== null) {
    frsValues.push(parseFloat(m[1]));
  }

  // Asociar FRS a HUs por orden de aparición (heurística — limitación conocida)
  const huRecords = huHeadings.map((h, i) => ({
    title_slug: h.title_slug,
    title: h.title,
    source_file: 'unknown',
    frs_individual: frsValues[i] || 0,
    processed_at: new Date().toISOString(),
    sup_ids_owned: [], // sin atribución exacta
    pq_ids_owned: [],
    mat_ids_owned: [],
  }));

  // Detectar máximos de SUP/PQ/MAT en assumptions.md, preguntas_cliente.md, material_references.json
  const allText = basePruebas + '\n' + readText(p.assumptions) + '\n' + readText(p.preguntas);
  const matrefs = readJSON(p.materialRefs);

  const maxId = (text, prefix) => {
    const re = new RegExp('\\b' + prefix + '(\\d+)\\b', 'g');
    let max = 0; let mt;
    while ((mt = re.exec(text)) !== null) {
      const n = parseInt(mt[1], 10);
      if (n > max) max = n;
    }
    return max;
  };

  const maxSup = maxId(allText, 'SUP-');
  const maxPq  = maxId(allText, 'PQ-');
  let maxMat = 0;
  if (matrefs && Array.isArray(matrefs.references)) {
    for (const r of matrefs.references) {
      const n = parseInt(String(r.id || '').replace('MAT-', ''), 10);
      if (Number.isFinite(n) && n > maxMat) maxMat = n;
    }
  } else {
    maxMat = maxId(allText, 'MAT-');
  }

  // Calcular FRS global de los artefactos previos
  const frsLine = basePruebas.match(/\*\*FRS:\*\*\s*([\d.]+)%\s*\|\s*\*\*Gate:\*\*\s*(\w+)/);
  const frsGlobal = frsLine ? parseFloat(frsLine[1]) : 0;
  const gate      = frsLine ? frsLine[2] : 'CONDITIONAL';

  const reg = {
    run_id: runId,
    last_extraction: new Date().toISOString(),
    backfilled: true,
    backfill_note: 'Reconstruido desde artefactos previos. SUP/PQ/MAT por HU NO atribuidos individualmente — solo contadores globales.',
    hus: huRecords,
    global_counters: {
      next_sup: maxSup + 1,
      next_pq:  maxPq  + 1,
      next_mat: maxMat + 1,
    },
    frs_global: frsGlobal,
    gate,
  };

  writeJSON(p.processedHus, reg);

  process.stdout.write(JSON.stringify({
    ok: true,
    run_id: runId,
    action: 'created',
    hus_detected: huRecords.length,
    counters: reg.global_counters,
    frs_global: frsGlobal,
    gate,
    note: reg.backfill_note,
  }, null, 2) + '\n');

  process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];
  const runId = args['run-id'];

  if (!cmd) {
    process.stderr.write('Uso: node diagnose-merge.js {pre-check|post-merge|backfill} --run-id <id>\n');
    process.exit(2);
  }
  if (!runId) die('--run-id es obligatorio');

  if (cmd === 'pre-check') {
    process.stdout.write(JSON.stringify(preCheck(runId), null, 2) + '\n');
    process.exit(0);
  }
  if (cmd === 'post-merge') {
    return postMerge(runId);
  }
  if (cmd === 'backfill') {
    return backfill(runId);
  }
  die(`comando desconocido: ${cmd}`);
}

main();
