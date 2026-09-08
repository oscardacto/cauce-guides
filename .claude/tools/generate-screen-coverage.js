#!/usr/bin/env node
/**
 * generate-screen-coverage.js
 *
 * Deterministic screen-coverage check for FASE 1D.
 * Reads all screens_{module}.json files and cross-references against
 * e2e_flows in execution_plan.json. Produces screen_coverage.json.
 *
 * Usage:
 *   node .claude/tools/generate-screen-coverage.js <run_id>
 *
 * Inputs (from run folder):
 *   design/screens_*.json          — screen lists per module
 *   strategy/execution_plan.json   — e2e_flows with entry_url + execution_sequence
 *
 * Output:
 *   {run_folder}/screen_coverage.json
 *
 * Exit codes:
 *   0 — coverage_complete: true  (all screens covered or no screens found)
 *   1 — coverage_complete: false (uncovered screens exist — needs LLM to create E2E fills)
 *   2 — fatal error (missing inputs)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('path'); // We'll use manual glob via readdirSync

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: node generate-screen-coverage.js <run_id>');
  process.exit(2);
}

// Resolve paths
const projectRoot = path.resolve(__dirname, '../..');
const outputBase = path.join(projectRoot, 'docs', 'testing', 'atf-web');
const runFolder = path.join(outputBase, runId);

if (!fs.existsSync(runFolder)) {
  console.error(`Run folder not found: ${runFolder}`);
  process.exit(2);
}

const designDir = path.join(runFolder, 'design');
const strategyDir = path.join(runFolder, 'strategy');
const coveragePath = path.join(runFolder, 'screen_coverage.json');

// 1. Read all screens_*.json
const screenFiles = fs.existsSync(designDir)
  ? fs.readdirSync(designDir).filter(f => f.startsWith('screens_') && f.endsWith('.json'))
  : [];

if (screenFiles.length === 0) {
  const result = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    total_screens_required: 0,
    covered_by_existing_e2e: 0,
    new_e2e_needed: 0,
    uncovered_screens: [],
    coverage_complete: true,
    note: 'No screens_*.json files found — nothing to check'
  };
  fs.writeFileSync(coveragePath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ coverage_complete: true, screens: 0 }));
  process.exit(0);
}

// Consolidate all screens (deduplicate by url_path)
const screensMap = new Map(); // url_path -> { url_path, description, required_by_cps, module_id }

for (const file of screenFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(designDir, file), 'utf8'));
    const moduleId = data.module_id || file.replace('screens_', '').replace('.json', '');
    for (const screen of (data.screens || [])) {
      const key = screen.url_path;
      if (screensMap.has(key)) {
        // Merge required_by_cps
        const existing = screensMap.get(key);
        existing.required_by_cps = [...new Set([...existing.required_by_cps, ...(screen.required_by_cps || [])])];
        existing.modules = [...new Set([...existing.modules, moduleId])];
      } else {
        screensMap.set(key, {
          url_path: key,
          description: screen.description || '',
          required_by_cps: screen.required_by_cps || [],
          modules: [moduleId]
        });
      }
    }
  } catch (err) {
    console.error(`Warning: could not parse ${file}: ${err.message}`);
  }
}

const allScreens = Array.from(screensMap.values());

// 2. Read execution_plan.json for e2e_flows
let e2eFlows = [];
const execPlanPath = path.join(strategyDir, 'execution_plan.json');
if (fs.existsSync(execPlanPath)) {
  try {
    const plan = JSON.parse(fs.readFileSync(execPlanPath, 'utf8'));
    e2eFlows = plan.e2e_flows || [];
  } catch (err) {
    console.error(`Warning: could not parse execution_plan.json: ${err.message}`);
  }
}

// 3. Check coverage: for each screen, see if its url_path appears in any E2E flow
function isScreenCovered(urlPath, flows) {
  const normalized = urlPath.toLowerCase().replace(/\/$/, '');
  for (const flow of flows) {
    // Check entry_url
    if (flow.entry_url && flow.entry_url.toLowerCase().includes(normalized)) return true;
    // Check execution_sequence actions
    for (const step of (flow.execution_sequence || [])) {
      if (step.action && step.action.toLowerCase().includes(normalized)) return true;
      if (step.state_produced && step.state_produced.toLowerCase().includes(normalized)) return true;
    }
  }
  return false;
}

const coveredScreens = [];
const uncoveredScreens = [];

for (const screen of allScreens) {
  if (isScreenCovered(screen.url_path, e2eFlows)) {
    coveredScreens.push(screen);
  } else {
    uncoveredScreens.push(screen);
  }
}

const coverageComplete = uncoveredScreens.length === 0;

// 4. Write screen_coverage.json
const result = {
  run_id: runId,
  generated_at: new Date().toISOString(),
  total_screens_required: allScreens.length,
  covered_by_existing_e2e: coveredScreens.length,
  new_e2e_needed: uncoveredScreens.length,
  uncovered_screens: uncoveredScreens.map(s => ({
    url_path: s.url_path,
    description: s.description,
    required_by_cps: s.required_by_cps,
    modules: s.modules
  })),
  coverage_complete: coverageComplete
};

fs.writeFileSync(coveragePath, JSON.stringify(result, null, 2));

// 5. Report
console.log(JSON.stringify({
  coverage_complete: coverageComplete,
  total: allScreens.length,
  covered: coveredScreens.length,
  uncovered: uncoveredScreens.length
}));

process.exit(coverageComplete ? 0 : 1);
