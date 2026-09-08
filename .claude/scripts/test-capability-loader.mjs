#!/usr/bin/env node
import { loadCapability } from "./asdd-load-capability.mjs";
let failed = 0;
const assert = (ok, message) => {
  console.log(`${ok ? "✅" : "❌"} ${message}`);
  if (!ok) failed += 1;
};

const loaded = loadCapability("asdd-developer-bug-fix");
assert(loaded.name === "asdd-developer-bug-fix", "known capability loader resolves the requested capability");
assert(loaded.content.includes("#"), "loader returns the SKILL.md content");
assert((() => { try { loadCapability("../escape"); return false; } catch { return true; } })(), "loader rejects traversal input");
if (failed) process.exit(1);
