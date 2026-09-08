import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { resolveActivePhase } from "../../hooks/_lib/run-phase-resolver.mjs";
import { readNormalized } from "./asdd-hash-normalize-lib.mjs";

const hash=(text)=>createHash("sha256").update(text).digest("hex");
const inside=(root,path)=>{const rel=relative(root,path);return rel&&!rel.startsWith(`..${sep}`)&&rel!==".."&&!rel.includes(`..${sep}`);};
const atomic=(path,content)=>{mkdirSync(dirname(path),{recursive:true});const tmp=`${path}.${process.pid}.tmp`;writeFileSync(tmp,content);renameSync(tmp,path);};

// Las fuentes se hashean NORMALIZADAS (CRLF->LF + strip de BOM), nunca en bytes
// crudos de disco. Son archivos versionados: con core.autocrlf=true el working
// tree materializa CRLF en Windows y LF en Linux, así que el mismo blob de Git
// daría dos huellas distintas y el fingerprint invalidaría el caché por cambio
// de SO en lugar de por cambio de contenido.
export function fingerprintSources(root, sourcePaths) {
  if(!Array.isArray(sourcePaths)||sourcePaths.length===0) throw new Error("source_paths must not be empty");
  return sourcePaths.map((source)=>{
    const path=resolve(root,source);
    if(!inside(root,path)||!existsSync(path)) throw new Error(`invalid source path: ${source}`);
    return {path:source,sha256:hash(readNormalized(path))};
  }).sort((a,b)=>a.path.localeCompare(b.path));
}

export function storeDiscovery(root, cacheDir, input) {
  if(!input?.commit||!input?.scope||!input?.policy_version||typeof input.content!=="string"||!input.content.trim()) throw new Error("commit, scope, policy_version and non-empty content are required");
  const sources=fingerprintSources(root,input.source_paths);
  const id=hash(JSON.stringify({commit:input.commit,scope:input.scope,policy_version:input.policy_version,sources})).slice(0,24);
  const dir=resolve(cacheDir,id);
  if(!inside(cacheDir,dir)) throw new Error("invalid cache key");
  const metadata={schema_version:1,id,commit:String(input.commit),scope:String(input.scope),policy_version:String(input.policy_version),sources,created_at:new Date().toISOString(),content_sha256:hash(input.content)};
  atomic(resolve(dir,"metadata.json"),`${JSON.stringify(metadata,null,2)}\n`);
  atomic(resolve(dir,"symbols.md"),input.content);
  return {id,path:resolve(dir,"symbols.md"),metadata};
}

export function loadDiscovery(root, cacheDir, id, expected) {
  if(!/^[a-f0-9]{24}$/.test(id)) throw new Error("invalid cache id");
  const dir=resolve(cacheDir,id), metadataPath=resolve(dir,"metadata.json"), contentPath=resolve(dir,"symbols.md");
  if(!inside(cacheDir,dir)||!existsSync(metadataPath)||!existsSync(contentPath)) throw new Error("cache entry unavailable");
  const metadata=JSON.parse(readFileSync(metadataPath,"utf8"));
  if(metadata.schema_version!==1||metadata.id!==id||metadata.commit!==expected.commit||metadata.scope!==expected.scope||metadata.policy_version!==expected.policy_version) throw new Error("cache provenance mismatch");
  const current=fingerprintSources(root,metadata.sources.map((item)=>item.path));
  if(JSON.stringify(current)!==JSON.stringify(metadata.sources)) throw new Error("cache source fingerprint is stale");
  // Bytes crudos A PROPÓSITO, al contrario de fingerprintSources: symbols.md no es
  // un archivo versionado sino un artefacto de caché que este mismo módulo escribió
  // con atomic() sin transformar EOL. El hash de referencia (content_sha256) se
  // calculó sobre el string en memoria, así que la comparación tiene que ser
  // byte-exacta contra el roundtrip. Normalizar acá rompería la integridad si el
  // contenido original traía CRLF.
  const content=readFileSync(contentPath,"utf8");
  if(hash(content)!==metadata.content_sha256) throw new Error("cache content integrity mismatch");
  return {path:contentPath,content,metadata};
}

export function materializeArtifact(root, targetRel, content, allowedRoots=["docs"]) {
  const target=resolve(root,targetRel);
  if(!inside(root,target)||!allowedRoots.some((dir)=>target===resolve(root,dir)||target.startsWith(`${resolve(root,dir)}${sep}`))) throw new Error("target is outside allowed artifact roots");
  const runPath=resolve(root,".asdd-run.json");
  if(!existsSync(runPath)) throw new Error("active run is required for artifact materialization");
  const run=JSON.parse(readFileSync(runPath,"utf8"));
  const phase=resolveActivePhase(run)?.toUpperCase();
  const name=targetRel.replaceAll("\\","/").split("/").pop();
  const match=name?.match(/^(\d{4}-\d{2}-\d{2}-\d{3})-([A-Z]+)-(\d{3})-([a-z0-9]+(?:[.-][a-z0-9]+)*)\.([a-z0-9]{1,10})$/);
  if(!match||match[1]!==run.run_id||!phase||match[2]!==phase) throw new Error("target does not satisfy the active run artifact naming contract");
  if(typeof content!=="string"||!content.trim()||content.length>500_000) throw new Error("content must be non-empty and within size limit");
  if(/\{(?:feature-id|TODO|\.\.\.)\}/.test(content)) throw new Error("content contains unresolved placeholder");
  atomic(target,content.endsWith("\n")?content:`${content}\n`);
  return {path:target,sha256:hash(content)};
}
