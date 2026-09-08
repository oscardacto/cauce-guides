#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeContextBudget } from "./lib/asdd-context-budget-lib.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
try{
  const policy=JSON.parse(readFileSync(resolve(root,".asdd/context-budget.json"),"utf8"));
  const report=analyzeContextBudget(root,policy);
  console.log(JSON.stringify(report,null,2));
  if(report.summary.errors)process.exit(1);
}catch(error){console.error(`context-budget: ${error.message}`);process.exit(1);}
