#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const name=process.argv[2]??"";
if(!/^asdd-[a-z0-9-]+$/.test(name)){console.error("resolve-rule: invalid rule name");process.exit(1);}
const base=resolve(root,".claude/references/rules");
const path=resolve(base,`${name}.md`);
const rel=relative(base,path);
const inside=rel&&!rel.startsWith(`..${sep}`)&&rel!==".."&&!rel.includes(`..${sep}`);
if(!inside||!existsSync(path)){console.error(`resolve-rule: unavailable on-demand rule ${name}`);process.exit(1);}
console.log(realpathSync(path));
