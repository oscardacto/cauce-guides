#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const skillsRoot = resolve(root, ".claude/skills");

const isInside = (base, target) => {
  const rel = relative(base, target);
  return Boolean(rel) && !rel.startsWith(`..${sep}`) && rel !== ".." && !rel.includes(`..${sep}`);
};

export function loadCapability(value) {
  const name = String(value ?? "");
  if (!/^asdd-[a-z0-9-]+$/.test(name)) {
    throw new Error("skill name must use asdd-* naming");
  }
  const path = resolve(skillsRoot, name, "SKILL.md");
  if (!isInside(skillsRoot, path) || !existsSync(path)) {
    throw new Error(`unavailable skill ${name}`);
  }
  const resolved = realpathSync(path);
  if (!isInside(skillsRoot, resolved)) {
    throw new Error(`resolved path escapes skills root for ${name}`);
  }
  return { name, content: readFileSync(resolved, "utf8") };
}

function main() {
  try {
    const { name, content } = loadCapability(process.argv[2]);
    process.stdout.write(`<!-- ASDD capability loaded: ${name} -->\n${content}`);
  } catch (error) {
    console.error(`load-capability: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
