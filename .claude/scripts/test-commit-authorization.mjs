#!/usr/bin/env node
import { rmSync } from "node:fs";
import { approveActiveCommitChallenge, consumeCommitAuthorization, dir, issueCommitChallenge } from "./lib/asdd-commit-authorization-lib.mjs";
const command='git commit -m "feat: demo"';rmSync(dir,{recursive:true,force:true});
try{consumeCommitAuthorization({branch:'feature/demo',command});throw new Error('bypass accepted');}catch(error){if(!String(error.message).includes('no valid'))throw error;}
issueCommitChallenge({branch:'feature/demo',command,ttl_seconds:60});approveActiveCommitChallenge();consumeCommitAuthorization({branch:'feature/demo',command});
try{consumeCommitAuthorization({branch:'feature/demo',command});throw new Error('replay accepted');}catch(error){if(!String(error.message).includes('no valid'))throw error;}
console.log('✅ GS-003 requires exact, explicit, single-use commit authorization');rmSync(dir,{recursive:true,force:true});
