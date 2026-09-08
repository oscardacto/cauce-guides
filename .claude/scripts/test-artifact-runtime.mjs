#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadDiscovery, materializeArtifact, storeDiscovery } from "./lib/asdd-artifact-runtime-lib.mjs";
const root=mkdtempSync(join(tmpdir(),"asdd-artifact-")),cache=join(root,"cache");mkdirSync(join(root,"src"),{recursive:true});writeFileSync(join(root,"src/a.ts"),"export const a=1;\n");
writeFileSync(join(root,".asdd-run.json"),JSON.stringify({run_id:"2026-07-18-001",status:"in_progress",current_phase:"analyze",artifact_seq:1,phases:{analyze:{status:"in_progress"}}}));
const entry=storeDiscovery(root,cache,{commit:"abc",scope:"src/a.ts",policy_version:"1",source_paths:["src/a.ts"],content:"# Symbols\n- a"});
if(loadDiscovery(root,cache,entry.id,{commit:"abc",scope:"src/a.ts",policy_version:"1"}).content!=="# Symbols\n- a")throw new Error("cache load failed");
writeFileSync(join(root,"src/a.ts"),"export const a=2;\n");
try{loadDiscovery(root,cache,entry.id,{commit:"abc",scope:"src/a.ts",policy_version:"1"});throw new Error("stale cache accepted");}catch(error){if(!String(error.message).includes("stale"))throw error;}
const out=materializeArtifact(root,"docs/specs/2026-07-18-001-ANALYZE-002-demo.md","# Demo\ncontent");if(!out.path.endsWith("demo.md"))throw new Error("materialization failed");
try{materializeArtifact(root,"docs/specs/demo.md","# nope");throw new Error("invalid naming accepted");}catch(error){if(!String(error.message).includes("naming"))throw error;}
try{materializeArtifact(root,".claude/out.md","# nope");throw new Error("invalid root accepted");}catch(error){if(!String(error.message).includes("allowed"))throw error;}
rmSync(root,{recursive:true,force:true});console.log("✅ cache provenance/invalidation and writer-agnostic materialization");
