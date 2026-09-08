#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const script=join(dirname(fileURLToPath(import.meta.url)),"sofka-asdd-resolve-capability.mjs");
const run=(name)=>spawnSync("node",[script,name],{encoding:"utf8"});
let fail=0;
for(const [name,ok] of [["sofka-asdd-atf-api-step-1-hu-parser",true],["sofka-asdd-atf-web-playwright-navigator",true],["../escape",false]]){const r=run(name);const pass=(r.status===0)===ok;console.log(`${pass?"✅":"❌"} ${name}`);if(!pass)fail++;}
if(fail)process.exit(1);
