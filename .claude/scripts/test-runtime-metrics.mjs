#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const script=join(dirname(fileURLToPath(import.meta.url)),"asdd-runtime-metrics.mjs");
const result=spawnSync("node",[script],{encoding:"utf8"});
if(result.status!==0){console.error(result.stderr);process.exit(1);} console.log("✅ runtime baseline metrics remain within regression gates");
