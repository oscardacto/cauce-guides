#!/usr/bin/env node
/**
 * ATF — augment-plan-with-playbooks.js
 *
 * Post-procesa un `enrichment_plan.json` (consolidado por el orquestador tras los workers)
 * añadiendo `auto_inferred.preconditions_playbook[]` y `auto_inferred.preconditions_source`
 * a cada CP del plan, deterministicamente, usando la librería `detect-playbooks.js`.
 *
 * Motivación (ADR-001 Opción C' M8 —:
 *   El smoke Nivel 3 demostró que los sub-agents LLM del CP Enricher Worker no pueden
 *   invocar bash+scripts externos de forma confiable (paths Windows fallan, el LLM
 *   alucina resultados cuando bash falla silenciosamente). La solución: mover la
 *   detección de playbooks FUERA del worker, al orchestrator, que sí tiene ejecución
 *   bash estable.
 *
 * Flujo:
 *   workers → producen fragments SIN preconditions_playbook
 *   orchestrator consolida fragments → enrichment_plan.json
 *   ★ augment-plan-with-playbooks.js añade auto_inferred.preconditions_playbook
 *   orchestrator invoca cp-enricher.js → aplica plan augmentado → cp_modulo_*.json
 *
 * Uso:
 *   node .claude/tools/augment-plan-with-playbooks.js \
 *     --plan    output/{run}/design/enrichment_plan_{module}.json \
 *     --source  output/{run}/design/cp_modulo_{module}_original.json \
 *     --recipes .claude/agent-memory/{app}/navigation-recipes.md \
 *     [--output output/{run}/design/enrichment_plan_{module}.json]   # default: in-place
 *
 * Exit codes:
 *   0 — OK, plan augmentado con éxito
 *   1 — error (archivos faltantes, JSON inválido, detección fallida, etc.)
 *   2 — argumentos inválidos
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { parsePlaybooks }  = require('./playbook-parser');
const { detectPlaybooks } = require('./detect-playbooks');

/* -- CLI --------------------------------------------------------------- */

function die(msg) {
  console.error(`❌ augment-plan: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { flatten: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--plan':    opts.plan    = argv[++i]; break;
      case '--source':  opts.source  = argv[++i]; break;
      case '--recipes': opts.recipes = argv[++i]; break;
      case '--output':  opts.output  = argv[++i]; break;
      case '--flatten': opts.flatten = true;      break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        console.warn(`⚠️  Argumento desconocido ignorado: ${argv[i]}`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
Uso: node augment-plan-with-playbooks.js --plan <ruta> --source <ruta> --recipes <ruta> [--output <ruta>]

Parámetros:
  --plan <ruta>     enrichment_plan_{module}.json consolidado por el orchestrator.
  --source <ruta>   cp_modulo_{module}_original.json (fuente con texto de preconditions).
  --recipes <ruta>  navigation-recipes.md con playbooks declarados via enricher-trigger.
  --output <ruta>   Destino del plan augmentado. Default: sobrescribe --plan in-place.
  --flatten         Expandir setup_steps de cada playbook inline en steps_raw_enriched
                    con prefijo [SETUP]. Añade setup_steps_count al CP. (FASE 2 enricher v2)

Efecto:
  Para cada CP del plan:
    - Localiza el CP en --source (por cp_id) para obtener el texto original
      (preconditions, steps_raw, description_func, description_verify, gherkin).
    - Invoca detectPlaybooks() sobre el CP original + playbooks parseados.
    - Añade a cp.auto_inferred:
      - preconditions_playbook[]
      - preconditions_source (texto original del Excel)
    - Appendea las notas del augment a cp.enrichment_notes.
  Escribe el plan augmentado a --output (o in-place si no se especifica).
`);
}

function main(argv) {
  const opts = parseArgs(argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!opts.plan || !opts.source || !opts.recipes) {
    console.error('❌ Faltan argumentos: --plan, --source, --recipes (obligatorios)');
    console.error('   Usa --help para ver detalle.');
    process.exit(2);
  }

  const outputPath = opts.output || opts.plan;

  // Leer plan.
  if (!fs.existsSync(opts.plan)) die(`Plan no encontrado: ${opts.plan}`);
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(opts.plan, 'utf-8'));
  } catch (e) {
    die(`Error parseando plan: ${e.message}`);
  }

  if (!Array.isArray(plan.enriched_cps)) {
    die('El plan no contiene enriched_cps[] (array esperado).');
  }

  // Leer source matrix (para acceder al texto original de cada CP).
  if (!fs.existsSync(opts.source)) die(`Source no encontrado: ${opts.source}`);
  let source;
  try {
    source = JSON.parse(fs.readFileSync(opts.source, 'utf-8'));
  } catch (e) {
    die(`Error parseando source: ${e.message}`);
  }

  if (!Array.isArray(source.test_cases)) {
    die('El source no contiene test_cases[] (array esperado).');
  }

  // Indexar source por cp_id.
  const sourceByCpId = new Map();
  for (const cp of source.test_cases) {
    if (cp.cp_id) sourceByCpId.set(cp.cp_id, cp);
  }

  // Parsear playbooks.
  if (!fs.existsSync(opts.recipes)) die(`Recipes no encontrado: ${opts.recipes}`);
  const recipesContent = fs.readFileSync(opts.recipes, 'utf-8');
  const parseResult = parsePlaybooks(recipesContent);
  if (parseResult.errors.length > 0) {
    console.error('❌ Errores al parsear recipes:');
    for (const e of parseResult.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const playbooks = parseResult.playbooks;

  // Augmentar cada CP del plan.
  const stats = {
    total: plan.enriched_cps.length,
    augmented: 0,
    with_playbook: 0,
    without_playbook: 0,
    not_in_source: 0,
    with_blocker: 0,
  };
  const playbookIdCounts = {};

  for (const planCp of plan.enriched_cps) {
    const sourceCp = sourceByCpId.get(planCp.cp_id);

    if (!sourceCp) {
      // CP del plan no está en el source — warning, dejar sin augment.
      stats.not_in_source++;
      ensureAutoInferred(planCp);
      planCp.auto_inferred.preconditions_playbook = [];
      planCp.auto_inferred.preconditions_source = '';
      appendNote(planCp, `M8 aug: cp_id no encontrado en source (skip augment)`);
      continue;
    }

    // Ejecutar detectPlaybooks sobre el CP ORIGINAL (texto crudo del Excel).
    const result = detectPlaybooks(sourceCp, playbooks);

    // Merge al plan.
    ensureAutoInferred(planCp);
    planCp.auto_inferred.preconditions_playbook = result.preconditions_playbook;
    planCp.auto_inferred.preconditions_source  = result.preconditions_source;

    // Appendear notas de M8.
    if (result.enrichment_notes_additions && result.enrichment_notes_additions.length > 0) {
      const m8Note = result.enrichment_notes_additions.join(' | ');
      appendNote(planCp, `M8 aug: ${m8Note}`);
    }

    // Stats.
    stats.augmented++;
    if (result.preconditions_playbook.length > 0) {
      stats.with_playbook++;
      for (const pb of result.preconditions_playbook) {
        playbookIdCounts[pb.id] = (playbookIdCounts[pb.id] || 0) + 1;
        if (pb.action === 'block') stats.with_blocker++;
      }
    } else {
      stats.without_playbook++;
    }
  }

  // --- FLATTEN: expandir setup_steps inline en steps_raw_enriched ---
  const flattenStats = { flattened: 0, setup_steps_total: 0, blocked_by_playbook: 0 };

  if (opts.flatten) {
    // Indexar playbooks por id para lookup rápido.
    const playbookById = new Map();
    for (const pb of playbooks) {
      playbookById.set(pb.id, pb);
    }

    for (const planCp of plan.enriched_cps) {
      const pbs = (planCp.auto_inferred && planCp.auto_inferred.preconditions_playbook) || [];
      if (pbs.length === 0) continue;

      // Check for blockers first.
      const blocker = pbs.find(p => p.action === 'block');
      if (blocker) {
        flattenStats.blocked_by_playbook++;
        continue; // Agent handles BLOCKED status — script only augments.
      }

      // Collect setup_steps from all execute playbooks, ordered by phase.
      const phaseOrder = { 'at_creation': 1, 'before_validation': 2, 'after_validation': 3 };
      const execPbs = pbs
        .filter(p => p.action === 'execute' || !p.action)
        .map(p => ({ ...p, pb: playbookById.get(p.id) }))
        .filter(p => p.pb && Array.isArray(p.pb.setup_steps) && p.pb.setup_steps.length > 0)
        .sort((a, b) => (phaseOrder[a.pb.phase] || 99) - (phaseOrder[b.pb.phase] || 99));

      if (execPbs.length === 0) continue;

      // Resolve variables in setup_steps.
      const h4 = (planCp.auto_inferred && planCp.auto_inferred.h4_data_defaults) || {};
      const varMap = {
        '{producto_cp}': h4.product || '{producto_cp}',
        '{plan_cp}': h4.plan || '{plan_cp}',
        '{fecha_efectiva}': h4.effective_date || '{fecha_efectiva}',
        '{moneda_cp}': Array.isArray(h4.currency) ? h4.currency[0] : (h4.currency || '{moneda_cp}'),
      };

      const flattenedSteps = [];
      for (const entry of execPbs) {
        for (const step of entry.pb.setup_steps) {
          let resolved = step;
          for (const [varName, varVal] of Object.entries(varMap)) {
            resolved = resolved.split(varName).join(varVal);
          }
          flattenedSteps.push(`[SETUP] ${resolved}`);
        }
        // Add verification step if present.
        if (entry.pb.verification) {
          let vStep = entry.pb.verification;
          for (const [varName, varVal] of Object.entries(varMap)) {
            vStep = vStep.split(varName).join(varVal);
          }
          flattenedSteps.push(`[SETUP] Verificar: ${vStep}`);
        }
      }

      if (flattenedSteps.length === 0) continue;

      // Remove original Type A precondition steps that the playbook replaces.
      // The first step(s) of steps_raw_enriched that match preconditions_type_a are replaced.
      const typeA = planCp.preconditions_type_a || [];
      let currentSteps = (planCp.steps_raw_enriched || '').split('\n').filter(s => s.trim());

      if (typeA.length > 0) {
        // Remove steps that match Type A preconditions (they're replaced by playbook steps).
        const typeALower = typeA.map(s => s.toLowerCase().replace(/^- /, '').trim());
        currentSteps = currentSteps.filter(s => {
          const normalized = s.toLowerCase().replace(/^- /, '').trim();
          return !typeALower.includes(normalized);
        });
      }

      // Prepend flattened steps.
      const allSteps = flattenedSteps.map(s => `- ${s}`).concat(
        currentSteps.map(s => s.startsWith('- ') ? s : `- ${s}`)
      );
      planCp.steps_raw_enriched = allSteps.join('\n');
      planCp.setup_steps_count = flattenedSteps.length;

      flattenStats.flattened++;
      flattenStats.setup_steps_total += flattenedSteps.length;

      appendNote(planCp, `FLATTEN: ${flattenedSteps.length} pasos [SETUP] de ${execPbs.map(p => p.id).join(',')}`);
    }
  }

  // Escribir plan augmentado.
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2), 'utf-8');

  // Reportar stats (stdout).
  console.log(`✅ augment-plan-with-playbooks — plan augmentado`);
  console.log(`   plan         : ${opts.plan}`);
  console.log(`   source       : ${opts.source}`);
  console.log(`   recipes      : ${opts.recipes} (${playbooks.length} playbooks)`);
  console.log(`   output       : ${outputPath}`);
  console.log(`   total CPs    : ${stats.total}`);
  console.log(`   augmented    : ${stats.augmented}`);
  console.log(`   con playbook : ${stats.with_playbook} (${pct(stats.with_playbook, stats.total)}%)`);
  console.log(`   sin playbook : ${stats.without_playbook} (${pct(stats.without_playbook, stats.total)}%)`);
  if (stats.not_in_source > 0) {
    console.log(`   no-source    : ${stats.not_in_source} (⚠️ warning — cp_id del plan no existe en source)`);
  }
  if (stats.with_blocker > 0) {
    console.log(`   bloqueadores : ${stats.with_blocker} (action:block — CPs marcados como ambientalmente bloqueados)`);
  }
  if (Object.keys(playbookIdCounts).length > 0) {
    console.log(`   top playbooks:`);
    Object.entries(playbookIdCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([id, count]) => {
        console.log(`     ${id}: ${count} CPs`);
      });
  }

  // Flatten stats (only if --flatten was used).
  if (opts.flatten) {
    console.log(`   --- flatten ---`);
    console.log(`   flatten mode : ON`);
    console.log(`   flattened    : ${flattenStats.flattened} CPs`);
    console.log(`   setup_steps  : ${flattenStats.setup_steps_total} total (avg ${flattenStats.flattened > 0 ? (flattenStats.setup_steps_total / flattenStats.flattened).toFixed(1) : 0}/CP)`);
    if (flattenStats.blocked_by_playbook > 0) {
      console.log(`   pb-blocked   : ${flattenStats.blocked_by_playbook} CPs (action:block — not flattened)`);
    }
  }

  process.exit(0);
}

/* -- Helpers ----------------------------------------------------------- */

function ensureAutoInferred(cp) {
  if (!cp.auto_inferred) cp.auto_inferred = {};
}

function appendNote(cp, note) {
  if (!cp.enrichment_notes) {
    cp.enrichment_notes = note;
  } else {
    cp.enrichment_notes = cp.enrichment_notes + ' | ' + note;
  }
}

function pct(n, total) {
  return total === 0 ? '0.0' : ((n / total) * 100).toFixed(1);
}

/* -- Exports ----------------------------------------------------------- */

module.exports = {
  parseArgs,
  ensureAutoInferred,
  appendNote,
};

if (require.main === module) {
  main(process.argv.slice(2));
}
