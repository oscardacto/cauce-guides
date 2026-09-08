#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { routeRequest } from "./lib/sofka-asdd-proportional-router-lib.mjs";

try {
  let input;
  if (process.argv[2] === "--file" && process.argv.length === 4) {
    const root = resolve(process.cwd());
    const requested = resolve(root, process.argv[3]);
    const fromRoot = relative(root, requested);
    if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
      throw new Error("--file must stay inside the project root");
    }
    input = { request: readFileSync(requested, "utf8") };
  } else if (process.argv.length === 2) {
    const raw = readFileSync(0, "utf8");
    input = JSON.parse(raw);
  } else {
    throw new Error("usage: route-request [--file <project-relative-path>] or JSON stdin");
  }
  console.log(JSON.stringify(routeRequest(input.request, input.options), null, 2));
} catch (error) {
  console.error(`route-request: ${error.message}`);
  process.exit(1);
}
