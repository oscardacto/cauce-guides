#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const script=join(dirname(fileURLToPath(import.meta.url)),"sofka-asdd-resolve-rule.mjs");
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const manifest=JSON.parse(readFileSync(join(root,".sofka-asdd","rule-loading.json"),"utf8"));
let failed=0;
const cases=[...manifest.entries.map((entry)=>[entry.name,true]),["sofka-asdd-workflow-build",true],["sofka-asdd-data-routing",true],["../git-safety",false]];
for(const [name,shouldPass] of cases){
 const result=spawnSync("node",[script,name],{encoding:"utf8"});
 const ok=(result.status===0)===shouldPass;
 console.log(`${ok?"✅":"❌"} ${name}`); if(!ok)failed++;
}
if(failed)process.exit(1);
