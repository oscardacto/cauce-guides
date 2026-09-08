import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
export const dir=resolve(here,"..","..",".runtime","commit-authorization"), challengePath=join(dir,"challenge.json"), authorizationPath=join(dir,"authorization.json");
const normalize=(value)=>String(value??"").trim().replace(/\s+/g," ");
const hash=(value)=>createHash("sha256").update(normalize(value)).digest("hex");
const write=(path,value)=>{mkdirSync(dirname(path),{recursive:true,mode:0o700});const tmp=`${path}.${process.pid}.tmp`;writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});renameSync(tmp,path);};

// -----------------------------------------------------------------------------
// GS-003 tiene dos modos de autorización, y la diferencia importa.
//
// `command` (el original): un commit concreto. El challenge fija el hash del
// comando exacto, la rama y un uso único. Es el modo por defecto y el más
// estricto: el usuario aprueba ESE commit.
//
// `branch` (nuevo, ORC-011): ORC-011-B obliga al developer que corre en un
// worktree a cerrar con un commit —sin commit el worktree se destruye y los
// cambios se pierden— pero el orquestador no puede emitir un challenge por
// comando exacto, porque el mensaje lo redacta el developer recién al terminar.
// El resultado era un bloqueo estructural cuya única salida mecánica era el
// escape hatch, es decir el diseño empujaba al bypass. Este modo lo resuelve
// sin renunciar a la aprobación humana: el usuario aprueba "commits en la rama
// X", con TTL y un tope de usos, y cada consumo queda registrado.
// -----------------------------------------------------------------------------

const COMMIT_RE=/\bgit\s+commit\b/;

export function issueCommitChallenge({branch,command,ttl_seconds=300},now=new Date()){
 if(!branch||!command||!COMMIT_RE.test(command))throw new Error("branch and git commit command are required");
 const ttl=Math.min(Math.max(Number(ttl_seconds)||300,1),900), challenge={schema_version:1,scope:"command",challenge_id:randomUUID(),branch:normalize(branch),command_hash:hash(command),issued_at:now.toISOString(),expires_at:new Date(now.getTime()+ttl*1000).toISOString()};
 write(challengePath,challenge);try{unlinkSync(authorizationPath);}catch{} return challenge;
}

/**
 * Challenge de lote para los commits de cierre de uno o varios worktrees.
 *
 * @param {object}   input
 * @param {string[]} input.branches      ramas de worktree que quedarán autorizadas
 * @param {number}   [input.ttl_seconds] TTL, tope duro de 900 s como el modo command
 * @param {number}   [input.max_uses]    commits permitidos por rama (default 1)
 */
export function issueWorktreeCommitChallenge({branches,ttl_seconds=900,max_uses=1},now=new Date()){
 const list=(Array.isArray(branches)?branches:[branches]).map(normalize).filter(Boolean);
 if(list.length===0)throw new Error("at least one worktree branch is required");
 const uses=Math.min(Math.max(Number(max_uses)||1,1),10);
 const ttl=Math.min(Math.max(Number(ttl_seconds)||900,1),900);
 const challenge={schema_version:1,scope:"branch",challenge_id:randomUUID(),branches:list,max_uses_per_branch:uses,uses:{},issued_at:now.toISOString(),expires_at:new Date(now.getTime()+ttl*1000).toISOString()};
 write(challengePath,challenge);try{unlinkSync(authorizationPath);}catch{} return challenge;
}

// -----------------------------------------------------------------------------
// Modo `intent` (GS-003) — la orden explícita del usuario ES la autorización.
//
// Los otros dos modos parten de un supuesto: que la intención de commitear nace
// del agente y el humano la aprueba después. Cuando el humano ES quien la
// escribe ("commiteá y pusheá"), el supuesto se invierte y la ceremonia deja de
// proteger algo. En ese turno todavía no existe ningún challenge que aprobar, y
// el clasificador de intención nunca marca una orden imperativa como aprobación
// —"commiteá y pusheá y creá el MR" son 6 tokens, ninguno afirmativo—, así que
// la única salida mecánica era gastar un turno extra pidiendo un `ok` por algo
// que el usuario ya había ordenado.
//
// Lo que NO cambia: sigue habiendo una decisión humana explícita (la orden), la
// autorización sigue ligada a la rama, sigue siendo de uso acotado, sigue
// venciendo por TTL, y su emisión queda auditada. Lo que se elimina es el turno
// de ida y vuelta, no la aprobación.
//
// Fuera de alcance por diseño: force push, reset --hard y reescritura de
// historia. El router los saca de la vía rápida (DANGEROUS_GIT) y el emisor
// nunca llega a llamarse para ellos.
//
// @param {string} input.branch     rama que queda autorizada (la actual)
// @param {string} [input.prompt]   prompt del usuario; se guarda hasheado como
//                                  evidencia de qué orden originó la autorización
// @param {number} [input.max_uses] commits permitidos en la rama (tope 3)
// -----------------------------------------------------------------------------
export function issueIntentCommitAuthorization({branch,prompt,ttl_seconds=900,max_uses=1},now=new Date()){
 const target=normalize(branch);
 if(!target)throw new Error("branch is required to pre-authorize a commit by intent");
 const uses=Math.min(Math.max(Number(max_uses)||1,1),3);
 const ttl=Math.min(Math.max(Number(ttl_seconds)||900,1),900);
 const auth={schema_version:1,scope:"intent",authorization_id:randomUUID(),approved_by:"user-prompt-intent",prompt_hash:prompt?hash(prompt):null,branches:[target],max_uses_per_branch:uses,uses:{},issued_at:now.toISOString(),approved_at:now.toISOString(),expires_at:new Date(now.getTime()+ttl*1000).toISOString(),used_at:null};
 // Una orden nueva invalida cualquier challenge pendiente de un turno anterior:
 // no puede quedar vivo para que otra cosa lo apruebe después (GS-003).
 try{unlinkSync(challengePath);}catch{}
 write(authorizationPath,auth);return auth;
}

export function approveActiveCommitChallenge(now=new Date()){
 const challenge=JSON.parse(readFileSync(challengePath,"utf8")); if(challenge.schema_version!==1||Date.parse(challenge.expires_at)<=now.getTime())throw new Error("commit challenge missing or expired");
 const auth={...challenge,authorization_id:randomUUID(),approved_at:now.toISOString(),used_at:null}; write(authorizationPath,auth);unlinkSync(challengePath);return auth;
}
// Un rechazo explícito del usuario descarta el challenge de commit pendiente:
// no puede quedar vivo para que una afirmación posterior lo apruebe (GS-003).
export function revokeActiveCommitChallenge(){
 let revoked=false; for(const path of [challengePath,authorizationPath]){try{unlinkSync(path);revoked=true;}catch{}} return revoked;
}
export function consumeCommitAuthorization({branch,command},now=new Date()){
 let auth;try{auth=JSON.parse(readFileSync(authorizationPath,"utf8"));}catch{throw new Error("no valid explicit authorization for this commit");}
 if(auth.schema_version!==1||Date.parse(auth.expires_at)<=now.getTime())throw new Error("no valid explicit authorization for this commit");

 // Modos branch e intent: la autorización cubre commits de las ramas declaradas,
 // con un tope de usos por rama. No se liga al comando exacto porque quien
 // autoriza no conoce el mensaje — lo redacta el developer al cerrar el worktree
 // (branch), o el usuario ordenó la operación sin escribirlo (intent). El
 // binding real es rama + `git commit` + cupo + TTL.
 if(auth.scope==="branch"||auth.scope==="intent"){
  const target=normalize(branch);
  if(!Array.isArray(auth.branches)||!auth.branches.includes(target))throw new Error("no valid explicit authorization for this commit");
  if(!COMMIT_RE.test(String(command??"")))throw new Error("no valid explicit authorization for this commit");
  const usados=Number(auth.uses?.[target]||0);
  if(usados>=Number(auth.max_uses_per_branch||1))throw new Error("no valid explicit authorization for this commit");
  auth.uses={...(auth.uses||{}),[target]:usados+1};
  auth.last_used_at=now.toISOString();
  // `used_at` se marca cuando se agotan todas las ramas, para que el guard siga
  // viendo una autorización viva mientras queden cierres pendientes.
  const agotadas=auth.branches.every((b)=>Number(auth.uses[b]||0)>=Number(auth.max_uses_per_branch||1));
  if(agotadas)auth.used_at=now.toISOString();
  write(authorizationPath,auth);return auth;
 }

 // Modo command (default): binding estricto a rama + comando exacto + uso único.
 if(auth.used_at||auth.branch!==normalize(branch)||auth.command_hash!==hash(command))throw new Error("no valid explicit authorization for this commit");
 auth.used_at=now.toISOString();write(authorizationPath,auth);return auth;
}
