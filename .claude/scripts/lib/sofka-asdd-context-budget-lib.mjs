import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { parseFrontmatter } from "./sofka-asdd-frontmatter-lib.mjs";

export const countWords = (text) => String(text).trim().split(/\s+/u).filter(Boolean).length;
const read = (path) => readFileSync(path, "utf8");
const relative = (root, path) => path.slice(root.length + 1).replaceAll(sep, "/");
const mdFiles = (dir) => existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? mdFiles(join(dir, entry.name))
        : entry.name.endsWith(".md")
          ? [join(dir, entry.name)]
          : [])
  : [];

function canonicalDocumentWords(text, parsed) {
  if (!parsed.ok) return countWords(text);
  const canonicalFrontmatter = Object.entries(parsed.data)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(" ") : value}`)
    .join("\n");
  return countWords(`${canonicalFrontmatter}\n${parsed.content}`);
}

function positiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function validatePolicy(policy) {
  if (![1, 2].includes(policy?.schema_version)) throw new Error("policy schema_version must be 1 or 2");
  for (const [key, value] of Object.entries(policy.limits ?? {})) positiveNumber(value, `limits.${key}`);
  for (const [key, gate] of Object.entries(policy.targets ?? {})) {
    positiveNumber(gate?.limit, `targets.${key}.limit`);
    if (!["measurement", "warning", "error"].includes(gate?.stage)) {
      throw new Error(`targets.${key}.stage must be measurement, warning or error`);
    }
  }
}

function conditionalSkillAllowlist(root) {
  const contractPath = join(root, ".sofka-asdd", "cli-contract.json");
  if (!existsSync(contractPath)) return new Map();
  try {
    const contract = JSON.parse(read(contractPath));
    return new Map(
      (contract.conditional_install ?? []).flatMap((entry) =>
        (entry.provides_skills ?? []).map((skill) => [skill, entry.id])),
    );
  } catch {
    return new Map();
  }
}

function observedComponent(root, policy, key) {
  const component = policy.measured_components?.[key];
  if (!component) return { value: 0 };
  if (typeof component.value !== "number" || component.value < 0 || !Number.isFinite(component.value)) {
    return { value: 0, error: "invalid-value" };
  }
  const sourcePath = component.source ? resolve(root, component.source) : null;
  if (!sourcePath || !(sourcePath === root || sourcePath.startsWith(`${root}${sep}`))) {
    return { value: component.value, error: "source-outside-project" };
  }
  if (!existsSync(sourcePath)) return { value: component.value, error: "missing-source" };
  return { value: component.value };
}

export function analyzeContextBudget(root, policy, now = new Date()) {
  validatePolicy(policy);
  const measurements = [];
  const violations = [];
  const integrityErrors = [];
  const unmeasuredComponents = (policy.unmeasured_components ?? []).map((id) => ({ id }));
  const exceptions = new Map((policy.exceptions ?? []).map((item) => [item.id, item]));
  const conditionalSkills = conditionalSkillAllowlist(root);

  const exceptionFor = (id) => {
    const exception = exceptions.get(id);
    return exception && exception.owner && exception.reason && Date.parse(exception.expires_at) >= now.getTime()
      ? exception
      : null;
  };
  const addMeasurement = (id, limit, value, path, stage = "error") => {
    const item = { id, path, value, limit, over_by: Math.max(0, value - limit), stage };
    measurements.push(item);
    if (item.over_by <= 0 || stage === "measurement") return;
    const exception = exceptionFor(id);
    violations.push({
      ...item,
      status: exception ? "excepted" : stage,
      ...(exception ? { exception } : {}),
    });
  };
  const addIntegrityError = (id, path, reason) => {
    const item = { id, path, reason, status: "error", kind: "integrity" };
    integrityErrors.push(item);
    violations.push(item);
  };

  const rules = mdFiles(join(root, ".claude", "rules"));
  const alwaysOnWords = countWords(
    [join(root, "CLAUDE.md"), ...rules].filter(existsSync).map(read).join("\n"),
  );
  addMeasurement("global", policy.limits.global_words, alwaysOnWords, "CLAUDE.md + .claude/rules/**");

  const commands = mdFiles(join(root, ".claude", "commands")).map((path) => {
    const value = countWords(read(path));
    addMeasurement(`command:${basename(path, ".md")}`, policy.limits.command_words, value, relative(root, path));
    return { path: relative(root, path), words: value };
  });
  const activeCommandWords = Math.max(0, ...commands.map((item) => item.words));
  const hookInjection = observedComponent(root, policy, "hook_injection_words");
  const hookInjectionWords = hookInjection.value;
  if (hookInjection.error) {
    addIntegrityError(
      "measured-component:hook_injection_words",
      policy.measured_components?.hook_injection_words?.source ?? ".sofka-asdd/context-budget.json",
      hookInjection.error,
    );
  }
  const allowlistedMissing = new Set();
  const agents = [];

  for (const path of mdFiles(join(root, ".claude", "agents"))) {
    const text = read(path);
    const name = basename(path, ".md");
    const parsed = parseFrontmatter(text);
    const own = canonicalDocumentWords(text, parsed);
    if (!parsed.ok) addIntegrityError(`frontmatter:${name}`, relative(root, path), parsed.error);
    const rawSkills = parsed.data?.skills ?? [];
    if (!Array.isArray(rawSkills)) {
      addIntegrityError(`skills-type:${name}`, relative(root, path), "skills must be a YAML list");
    }
    const skills = Array.isArray(rawSkills) ? rawSkills.map(String) : [];
    const duplicates = [...new Set(skills.filter((skill, index) => skills.indexOf(skill) !== index))];
    for (const skill of duplicates) addIntegrityError(`duplicate-skill:${name}:${skill}`, relative(root, path), "duplicate skill reference");

    let eagerSkillWords = 0;
    const resolvedSkills = [];
    const conditional = [];
    for (const skill of [...new Set(skills)]) {
      const skillPath = join(root, ".claude", "skills", skill, "SKILL.md");
      if (existsSync(skillPath)) {
        const value = countWords(read(skillPath));
        eagerSkillWords += value;
        resolvedSkills.push({ name: skill, words: value });
      } else if (conditionalSkills.has(skill)) {
        conditional.push({ name: skill, provider: conditionalSkills.get(skill) });
        allowlistedMissing.add(`${name}:${skill}:${conditionalSkills.get(skill)}`);
      } else {
        addIntegrityError(`skill-reference:${name}:${skill}`, relative(root, path), "SKILL.md not found");
      }
    }

    addMeasurement(`agent:${name}`, policy.limits.agent_words, own, relative(root, path));
    addMeasurement(
      `agent_with_skills:${name}`,
      policy.limits.agent_with_skills_words,
      own + eagerSkillWords,
      relative(root, path),
    );
    agents.push({
      agent: name,
      path: relative(root, path),
      always_on_words: alwaysOnWords,
      agent_words: own,
      eager_skills: skills.length,
      resolved_eager_skills: resolvedSkills,
      conditional_eager_skills: conditional,
      eager_skills_words: eagerSkillWords,
      active_command_words: activeCommandWords,
      hook_injection_words: hookInjectionWords,
      measured_effective_context_words:
        alwaysOnWords + own + eagerSkillWords + activeCommandWords + hookInjectionWords,
    });
  }

  for (const entry of [...allowlistedMissing].sort()) {
    const [agent, skill, provider] = entry.split(":");
    unmeasuredComponents.push({ id: "conditional_eager_skill", agent, skill, provider });
  }

  const hookDir = join(root, ".claude", "hooks");
  if (existsSync(hookDir)) {
    for (const entry of readdirSync(hookDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".mjs")) continue;
      const path = join(hookDir, entry.name);
      addMeasurement(
        `hook_source:${basename(path, ".mjs")}`,
        policy.limits.hook_source_words,
        countWords(read(path)),
        relative(root, path),
      );
    }
  }

  // `target()` era fail-open: si la clave no estaba en `policy.targets`, el gate
  // desaparecia en silencio y el validador seguia en verde. Un renombre de clave
  // —`always_on_words` a `always_on_core_words`, por ejemplo— dejaba de enforzarse
  // sin que nada avisara. Ahora se registra toda clave que el codigo mide y la que
  // la politica no declara sale como error de integridad.
  const requestedTargets = new Set();
  const target = (key, id, value, path) => {
    requestedTargets.add(key);
    const gate = policy.targets?.[key];
    if (gate) addMeasurement(id, gate.limit, value, path, gate.stage);
  };
  // El piso completo (core + descripciones + hooks) lo mide measure-context-footprint.mjs
  // contra `always_on_floor_words`. Acá se gobierna solo el nucleo.
  target("always_on_core_words", "target:always_on_core", alwaysOnWords, "CLAUDE.md + .claude/rules/**");
  for (const agent of agents) {
    target("eager_skills_per_agent", `target:eager_skills:${agent.agent}`, agent.eager_skills, agent.path);
    target(
      "initial_agent_plus_skill_words",
      `target:initial_agent:${agent.agent}`,
      agent.agent_words + agent.eager_skills_words,
      agent.path,
    );
    if ((policy.coordinators ?? []).includes(agent.agent)) {
      target("thin_coordinator_words", `target:coordinator:${agent.agent}`, agent.agent_words, agent.path);
    }
  }

  for (const key of [...requestedTargets].sort()) {
    if (policy.targets?.[key]) continue;
    addIntegrityError(
      `target-not-declared:${key}`,
      ".sofka-asdd/context-budget.json",
      "el codigo mide este target y la politica no lo declara: el gate no se enforza. Declararlo en `targets` (stage `measurement` si no debe gatear todavia)",
    );
  }
  // Direccion inversa: una clave declarada en `targets` que ningun `target()` invoco en
  // esta corrida. Pasa desapercibido si, por ejemplo, `coordinators` queda desactualizado
  // y ningun agente real matchea la condicion de la linea 221 — `thin_coordinator_words`
  // seguiria declarado pero dejaria de enforzarse en silencio, sin error de integridad.
  // Acotado a las claves que ESTE modulo gobierna via `target()` arriba — las 3
  // `*_description_chars` viven en `targets` pero las enforza `skill-description-budget`
  // en validate-template.mjs y measure-context-footprint.mjs, no este archivo.
  const OWN_TARGET_KEYS = ["always_on_core_words", "eager_skills_per_agent", "initial_agent_plus_skill_words", "thin_coordinator_words"];
  for (const key of OWN_TARGET_KEYS) {
    if (!policy.targets?.[key]) continue;
    if (requestedTargets.has(key)) continue;
    addIntegrityError(
      `target-never-invoked:${key}`,
      ".sofka-asdd/context-budget.json",
      "la politica declara este target y ninguna corrida lo invoco: el gate no se enforza sobre nada. Revisar la condicion que deberia dispararlo (ej. `coordinators` desactualizado)",
    );
  }

  const largestEffective = agents.reduce(
    (largest, agent) => agent.measured_effective_context_words > (largest?.measured_effective_context_words ?? -1)
      ? agent
      : largest,
    null,
  );
  return {
    schema_version: 2,
    unit: "words",
    method: {
      effective_context_formula: "always_on + agent + eager_skills + active_command + hook_injection",
      active_command: "largest measured command payload (conservative combination)",
    },
    layers: {
      always_on_words: alwaysOnWords,
      active_command_words: activeCommandWords,
      hook_injection_words: hookInjectionWords,
      agents,
      largest_measured_effective_context: largestEffective,
    },
    unmeasured_components: unmeasuredComponents,
    integrity_errors: integrityErrors,
    measurements,
    violations,
    summary: {
      measured: measurements.length,
      errors: violations.filter((item) => item.status === "error").length,
      warnings: violations.filter((item) => item.status === "warning").length,
      exceptions: violations.filter((item) => item.status === "excepted").length,
    },
  };
}
