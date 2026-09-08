#!/usr/bin/env node
/** Static contract for consolidated SessionStart dispatcher. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const hook=join(dirname(fileURLToPath(import.meta.url)),"..","hooks","sofka-asdd-session-start-dispatcher.mjs");
const source=readFileSync(hook,"utf8");
const checks=[['dispatcher exists',source.includes('Consolidated SessionStart dispatcher')],['reads Git once',source.includes('rev-parse')],['emits routing core',source.includes('TRIVIAL/LIGHT/MEDIUM/FULL')],['includes model state',source.includes('ORC-002-B')],['includes run freshness',source.includes('ORC-007')]];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?'✅':'❌'} ${name}`);if(!ok)failed++;} if(failed)process.exit(1);
