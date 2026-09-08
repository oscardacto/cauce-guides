#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeContextBudget } from "./lib/asdd-context-budget-lib.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
try{
 const budget=analyzeContextBudget(root,JSON.parse(readFileSync(resolve(root,".asdd/context-budget.json"),"utf8")));
 const baseline=JSON.parse(readFileSync(resolve(root,"docs/baselines/asdd-runtime-baseline.json"),"utf8"));
 const settings=JSON.parse(readFileSync(resolve(root,".claude/settings.json"),"utf8"));
 const hooks=(settings.hooks?.SessionStart?.[0]?.hooks??[]).length;
 const global=budget.measurements.find((item)=>item.id==="global")?.value??0;
 const largest=Math.max(...budget.measurements.filter((item)=>item.id.startsWith("agent_with_skills:")).map((item)=>item.value));
 const metrics={
  schema_version:2,
  unit:"words",
  always_on_words:global,
  session_start_hooks:hooks,
  largest_agent_with_skills_words:largest,
  largest_measured_effective_context_words:budget.layers.largest_measured_effective_context?.measured_effective_context_words??0,
  context_budget_warnings:budget.summary.warnings,
  unmeasured_components:budget.unmeasured_components.length,
  registered_hooks_files:16
 };
 const limits=baseline.limits, failures=[];
 for(const [key,limit] of Object.entries(limits)){const metric={always_on_words_max:"always_on_words",registered_hooks_max:"registered_hooks_files",session_start_hooks_max:"session_start_hooks",largest_agent_with_skills_max:"largest_agent_with_skills_words"}[key];if(metrics[metric]>limit)failures.push(`${metric}=${metrics[metric]} > ${limit}`);}
 console.log(JSON.stringify({metrics,failures},null,2));if(failures.length)process.exit(1);
}catch(error){console.error(`runtime-metrics: ${error.message}`);process.exit(1);}
