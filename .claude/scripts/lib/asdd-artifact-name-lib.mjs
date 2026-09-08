import { resolveActivePhase, VALID_PHASES } from "../../hooks/_lib/run-phase-resolver.mjs";

const PHASES = new Set(VALID_PHASES);

export function deriveArtifactName(run, { phase, slug, extension = "md" }) {
  if (!run?.run_id || typeof run.run_id !== "string") throw new Error(".asdd-run.json no tiene run_id válido");
  if (run.status === "complete") throw new Error(`El run ${run.run_id} ya está complete`);
  const resolvedPhase = phase ? String(phase).toLowerCase() : resolveActivePhase(run);
  if (!PHASES.has(resolvedPhase)) throw new Error(`fase inválida o no resuelta: ${resolvedPhase ?? ""}`);
  // Kebab-case; semantic versions already required by Smart Data contracts may
  // remain dot-separated inside one segment (for example, contract-1.0.0).
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(String(slug ?? ""))) throw new Error("slug inválido");
  const ext = String(extension).toLowerCase();
  if (!/^[a-z0-9]{1,10}$/.test(ext)) throw new Error("extensión inválida");
  const nextSeq = (Number.isInteger(run.artifact_seq) ? run.artifact_seq : 0) + 1;
  return {
    name: `${run.run_id}-${resolvedPhase.toUpperCase()}-${String(nextSeq).padStart(3, "0")}-${slug}.${ext}`,
    phase: resolvedPhase,
    nextSeq,
    run: { ...run, artifact_seq: nextSeq },
  };
}
