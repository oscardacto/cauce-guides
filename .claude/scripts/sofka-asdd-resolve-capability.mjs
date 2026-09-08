#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const name=process.argv[2] ?? "";
if(!/^sofka-asdd-[a-z0-9-]+$/.test(name)){console.error("resolve-capability: skill name must use sofka-asdd-* naming");process.exit(1);}
const skillsRoot=resolve(root,".claude/skills");
const path=resolve(skillsRoot,name,"SKILL.md");
const rel=relative(skillsRoot,path);
const inside=rel&&!rel.startsWith(`..${sep}`)&&rel!==".."&&!rel.includes(`..${sep}`);
if(!inside||!existsSync(path)){console.error(`resolve-capability: unavailable skill ${name}`);process.exit(1);}
console.log(realpathSync(path));
