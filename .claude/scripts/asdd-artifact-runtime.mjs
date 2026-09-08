#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDiscovery, materializeArtifact, storeDiscovery } from "./lib/asdd-artifact-runtime-lib.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../.."), cache=resolve(root,".tmp/asdd-discovery-cache");
const commit=()=>execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
try {
  const [action,arg]=process.argv.slice(2);
  if(action==="store"){const input=JSON.parse(readFileSync(0,"utf8"));console.log(JSON.stringify(storeDiscovery(root,cache,{...input,commit:input.commit??commit()}),null,2));}
  else if(action==="load"){const expected=JSON.parse(readFileSync(0,"utf8"));console.log(JSON.stringify(loadDiscovery(root,cache,arg,{...expected,commit:expected.commit??commit()}),null,2));}
  else if(action==="materialize"){const input=JSON.parse(readFileSync(0,"utf8"));console.log(JSON.stringify(materializeArtifact(root,input.target,input.content),null,2));}
  else throw new Error("usage: artifact-runtime.mjs store|load <id>|materialize");
} catch(error){console.error(`artifact-runtime: ${error.message}`);process.exit(1);}
