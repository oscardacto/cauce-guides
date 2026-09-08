#!/usr/bin/env node
/**
 * ATF — detect-playbooks.js
 *
 * Implementacion deterministica de PASO 2e.2 del cp-enricher-worker.
 * Dado un CP y el catalogo de playbooks, resuelve:
 *   - Match directo por patterns
 *   - Auto-requires via extends
 *   - Resolucion de replaces
 *   - Resolucion de conflictos (same-phase replace-conflicts)
 *   - Action:block short-circuit
 *   - Orden final por phase (at_creation → before_validation → after_validation)
 *
 * Uso como librería:
 *   const { detectPlaybooks } = require('./detect-playbooks');
 *   const result = detectPlaybooks(cp, playbooks);
 *
 * Uso CLI (stdin: CP JSON, argv[0]: path al catalogo MD):
 *   echo '{"cp_id":"...","preconditions":"..."}' | \
 *     node detect-playbooks.js .claude/agent-memory/SauceDemo/navigation-recipes.md
 *
 * Output schema:
 *   {
 *     "preconditions_playbook": [
 *       { id, phase, action, matched_pattern, blocked_reason? }
 *     ],
 *     "preconditions_source": "<texto original del Excel>",
 *     "enrichment_notes_additions": ["nota1", ...]   // appendear al enrichment_notes del CP
 *   }
 *
 * Exit codes: 0 = OK | 1 = error
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* -- API principal ----------------------------------------------------- */

/**
 * @param {Object} cp — el CP original con campos preconditions, steps_raw,
 *                      description_func, description_verify, gherkin
 * @param {Array}  playbooks — catalogo parseado por playbook-parser.js
 * @returns {{preconditions_playbook, preconditions_source, enrichment_notes_additions}}
 */
function detectPlaybooks(cp, playbooks) {
  const notes = [];

  // 1. Concatenar texto analizable en lowercase.
  const text = [
    cp.preconditions || '',
    cp.steps_raw || '',
    cp.description_func || '',
    cp.description_verify || '',
    cp.gherkin || '',
  ].join(' ').toLowerCase();

  // 2. Match directo por patterns.
  const directMatches = [];
  for (const pb of playbooks) {
    let matchedPattern = null;
    for (const pattern of pb.patterns || []) {
      if (text.includes(pattern.toLowerCase())) {
        matchedPattern = pattern;
        break;
      }
    }
    if (matchedPattern) {
      directMatches.push({ ...pb, matched_pattern: matchedPattern, reason: 'direct' });
    }
  }

  // 3. Auto-requires via extends: si A extends B y A matcheo, agregar B.
  const byId = new Map(playbooks.map(p => [p.id, p]));
  const setIds = new Set(directMatches.map(p => p.id));
  const autoAdded = [];

  for (const pb of directMatches) {
    if (pb.extends && !setIds.has(pb.extends)) {
      const base = byId.get(pb.extends);
      if (base) {
        autoAdded.push({
          ...base,
          matched_pattern: `auto-required by extends from ${pb.id}`,
          reason: 'extends',
        });
        setIds.add(base.id);
      }
    }
  }

  const beforeReplaces = [...directMatches, ...autoAdded];

  // 4. Action:block short-circuit — si algun matched tiene action:block,
  //    el CP se marca BLOQUEADO y se descartan los demas.
  const blocker = beforeReplaces.find(p => p.action === 'block');
  if (blocker) {
    notes.push(
      `Bloqueador ambiental detectado: ${blocker.id} — ${blocker.blocked_reason || 'sin razon declarada'}`
    );
    return {
      preconditions_playbook: [
        {
          id: blocker.id,
          phase: null,
          action: 'block',
          matched_pattern: blocker.matched_pattern,
          blocked_reason: blocker.blocked_reason || '',
        },
      ],
      preconditions_source: cp.preconditions || '',
      enrichment_notes_additions: notes,
    };
  }

  // 5. Aplicar replaces — si A replaces [B,C], remover B y C del set.
  const toRemove = new Set();
  for (const pb of beforeReplaces) {
    for (const refId of pb.replaces || []) {
      toRemove.add(refId);
    }
  }
  const afterReplaces = beforeReplaces.filter(p => !toRemove.has(p.id));

  // 6. Resolucion de conflictos same-phase (multiples replaces a P1 en at_creation).
  //    Criterio: specificity DESC > pattern-count matched DESC > orden declaracion.
  const byPhase = new Map();
  for (const pb of afterReplaces) {
    if (!byPhase.has(pb.phase)) byPhase.set(pb.phase, []);
    byPhase.get(pb.phase).push(pb);
  }

  const finalSet = [];
  for (const [phase, pbs] of byPhase) {
    // Agrupar playbooks que compiten por el mismo "base" (mismo set de replaces).
    // Si hay >1 con replaces solapado, resolver conflicto.
    const competing = findCompetingGroups(pbs);
    for (const group of competing) {
      if (group.length === 1) {
        finalSet.push(group[0]);
      } else {
        const winner = resolveConflict(group, text, notes);
        finalSet.push(winner);
      }
    }
  }

  // 7. Orden final por phase.
  const phaseOrder = {
    at_creation: 1,
    before_validation: 2,
    after_validation: 3,
  };
  finalSet.sort(
    (a, b) => (phaseOrder[a.phase] || 99) - (phaseOrder[b.phase] || 99)
  );

  // 8. Construir output.
  const result = finalSet.map(p => ({
    id: p.id,
    phase: p.phase,
    action: p.action || 'execute',
    matched_pattern: p.matched_pattern,
  }));

  if (result.length > 0) {
    notes.push(`Playbooks detectados: [${result.map(p => p.id).join(', ')}]`);
  } else {
    notes.push('Sin playbooks detectados — verificar manualmente si requiere precondiciones.');
  }

  return {
    preconditions_playbook: result,
    preconditions_source: cp.preconditions || '',
    enrichment_notes_additions: notes,
  };
}

/* -- Helpers ----------------------------------------------------------- */

/**
 * Detecta grupos de playbooks que compiten por el mismo "base" (mismo set de replaces).
 * Ejemplo: P3 y P10 ambos replaces [P1] → compiten.
 *          P3 replaces [P1] y P12 extends P1 → no compiten (phases distintas ya separadas).
 */
function findCompetingGroups(playbooks) {
  const groups = [];
  const used = new Set();

  for (const pb of playbooks) {
    if (used.has(pb.id)) continue;
    const group = [pb];
    used.add(pb.id);

    // Buscar otros playbooks con mismo set de replaces.
    if (pb.replaces && pb.replaces.length > 0) {
      const pbReplacesKey = pb.replaces.slice().sort().join(',');
      for (const other of playbooks) {
        if (used.has(other.id)) continue;
        if (!other.replaces || other.replaces.length === 0) continue;
        const otherKey = other.replaces.slice().sort().join(',');
        if (otherKey === pbReplacesKey) {
          group.push(other);
          used.add(other.id);
        }
      }
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Resuelve conflicto dentro de un grupo de playbooks que compiten por el mismo base.
 * Criterio:
 *   1. specificity DESC (si algun playbook la declara)
 *   2. pattern-count matched en text DESC
 *   3. orden de declaracion (primero gana)
 */
function resolveConflict(group, text, notes) {
  // Calcular metricas por playbook.
  const ranked = group.map(pb => ({
    pb,
    specificity: pb.specificity != null ? pb.specificity : null,
    patternMatches: (pb.patterns || []).filter(pat =>
      text.includes(pat.toLowerCase())
    ).length,
  }));

  // Ordenar: specificity explicita gana; si ninguno la tiene o hay empate, pattern-count.
  ranked.sort((a, b) => {
    // Si ambos tienen specificity, comparar.
    if (a.specificity != null && b.specificity != null) {
      return b.specificity - a.specificity;
    }
    // Si solo uno la tiene, gana el que la tenga (mayor que cualquier null).
    if (a.specificity != null) return -1;
    if (b.specificity != null) return 1;
    // Ninguno declaro specificity — comparar pattern matches.
    return b.patternMatches - a.patternMatches;
  });

  const winner = ranked[0].pb;
  const losers = ranked.slice(1).map(r => r.pb.id);

  if (losers.length > 0) {
    notes.push(
      `Conflicto same-phase resuelto: ganador=${winner.id}, descartados=[${losers.join(', ')}] por specificity/pattern-count`
    );
  }

  return winner;
}

/* -- CLI --------------------------------------------------------------- */

function cli() {
  if (process.argv.length < 3) {
    console.error('Uso: node detect-playbooks.js <path-navigation-recipes.md>');
    console.error('       (leer CP JSON desde stdin)');
    process.exit(2);
  }

  const mdPath = process.argv[2];
  const { parsePlaybooks } = require('./playbook-parser');

  let mdContent;
  try {
    mdContent = fs.readFileSync(mdPath, 'utf-8');
  } catch (e) {
    console.error(`Error leyendo ${mdPath}: ${e.message}`);
    process.exit(1);
  }

  const parseResult = parsePlaybooks(mdContent);
  if (parseResult.errors.length > 0) {
    console.error('Errores al parsear catalogo:');
    for (const err of parseResult.errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const stdin = fs.readFileSync(0, 'utf-8');
  let cp;
  try {
    cp = JSON.parse(stdin);
  } catch (e) {
    console.error('stdin no es JSON valido:', e.message);
    process.exit(1);
  }

  const result = detectPlaybooks(cp, parseResult.playbooks);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

/* -- Exports ----------------------------------------------------------- */

module.exports = {
  detectPlaybooks,
  findCompetingGroups,
  resolveConflict,
};

if (require.main === module) {
  cli();
}
