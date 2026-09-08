#!/usr/bin/env node

import assert from "node:assert/strict";
import { parseFrontmatter } from "./lib/asdd-frontmatter-lib.mjs";

const inline = parseFrontmatter(`---\r
name: demo\r
skills: [alpha, "beta skill", 'gamma']\r
empty: []\r
---\r
body`);
assert.equal(inline.ok, true);
assert.deepEqual(inline.data.skills, ["alpha", "beta skill", "gamma"]);
assert.deepEqual(inline.data.empty, []);
assert.equal(inline.content, "body");

const block = parseFrontmatter(`---
name: demo
skills:
  - alpha
  - "beta skill"
  - 'gamma'
---
body`);
assert.equal(block.ok, true);
assert.deepEqual(block.data.skills, inline.data.skills);

const absent = parseFrontmatter(`---
name: demo
description: "quoted value with spaces # retained"
---
body`);
assert.equal(absent.ok, true);
assert.equal(absent.data.skills, undefined);
assert.equal(absent.data.description, "quoted value with spaces # retained");

const duplicate = parseFrontmatter(`---
name: demo
name: other
---
body`);
assert.equal(duplicate.ok, false);
assert.match(duplicate.error, /duplicate key/u);

const malformed = parseFrontmatter(`---
skills: [alpha, "beta]
---
body`);
assert.equal(malformed.ok, false);
assert.match(malformed.error, /unterminated quote/u);

const unquotedColon = parseFrontmatter(`---
name: demo
description: Fase principal: Construir.
---
body`);
assert.equal(unquotedColon.ok, false);
assert.match(unquotedColon.error, /plain scalar contains ": "; quote the value/u);

const quotedColon = parseFrontmatter(`---
name: demo
description: "Fase principal: Construir."
---
body`);
assert.equal(quotedColon.ok, true);
assert.equal(quotedColon.data.description, "Fase principal: Construir.");

console.log("PASS frontmatter: inline/block equivalence, empty/absent lists and quotes");
console.log("PASS frontmatter: CRLF, duplicate keys and malformed lists are deterministic");
console.log("PASS frontmatter: unquoted colon-space is rejected and quoted scalar is portable");
