/** Extract dependency names from root-level manifests (package.json, requirements.txt, pyproject.toml). */

export interface Manifests {
  packageJson?: string | null;
  requirementsTxt?: string | null;
  pyprojectToml?: string | null;
}

export function parsePackageJson(text: string): string[] {
  try {
    const pkg = JSON.parse(text) as Record<string, unknown>;
    const names = new Set<string>();
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      const deps = pkg[field];
      if (deps && typeof deps === "object") for (const k of Object.keys(deps)) names.add(k);
    }
    return [...names];
  } catch {
    return [];
  }
}

/** Package name at the start of a requirement spec: "fastapi[all]>=0.1 ; python_version" -> "fastapi". */
function requirementName(line: string): string | null {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(line);
  return m ? m[1].toLowerCase().replace(/_/g, "-") : null;
}

export function parseRequirementsTxt(text: string): string[] {
  const names = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line || line.startsWith("-")) continue;
    const name = requirementName(line);
    if (name) names.add(name);
  }
  return [...names];
}

/**
 * Minimal pyproject reader: PEP 621 `dependencies = [ "x>=1", ... ]` arrays and
 * Poetry `[tool.poetry.dependencies]` tables. Not a full TOML parser on purpose.
 */
export function parsePyprojectToml(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/dependencies\s*=\s*\[([\s\S]*?)\]/g)) {
    for (const q of m[1].matchAll(/["']([^"']+)["']/g)) {
      const name = requirementName(q[1]);
      if (name) names.add(name);
    }
  }
  const poetry = /\[tool\.poetry(?:\.group\.[\w-]+)?\.dependencies\]([\s\S]*?)(?=\n\[|$)/g;
  for (const m of text.matchAll(poetry)) {
    for (const line of m[1].split(/\r?\n/)) {
      const key = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/.exec(line);
      if (key && key[1].toLowerCase() !== "python") names.add(key[1].toLowerCase().replace(/_/g, "-"));
    }
  }
  return [...names];
}

export function dependencyNames(m: Manifests): string[] {
  return [
    ...(m.packageJson ? parsePackageJson(m.packageJson) : []),
    ...(m.requirementsTxt ? parseRequirementsTxt(m.requirementsTxt) : []),
    ...(m.pyprojectToml ? parsePyprojectToml(m.pyprojectToml) : []),
  ];
}
