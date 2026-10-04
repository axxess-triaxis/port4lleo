import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { BuilderMetrics, RepoRef } from "@/lib/types";

/**
 * Self-declared corrections. Source: `portfolio.yml` in the user's
 * `<login>/<login>` profile repo, and/or the dashboard editor. Both use this schema.
 *
 *   hackathons:
 *     - name: "ETHGlobal Bangalore 2026"
 *       url: https://ethglobal.com/showcase/...
 *       repo: me/my-hack          # optional
 *   prototypes: [...]
 *   apps: [...]
 *   exclude: [me/not-a-hackathon] # removes a repo from every inferred list
 */
const entry = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.url().max(500).optional(),
  repo: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "use owner/name")
    .optional(),
  note: z.string().max(280).optional(),
});

export const overridesSchema = z.object({
  hackathons: z.array(entry).max(200).default([]),
  prototypes: z.array(entry).max(200).default([]),
  apps: z.array(entry).max(200).default([]),
  exclude: z.array(z.string().regex(/^[\w.-]+\/[\w.-]+$/)).max(500).default([]),
});

export type Overrides = z.infer<typeof overridesSchema>;
export type OverrideEntry = z.infer<typeof entry>;

export const EMPTY_OVERRIDES: Overrides = { hackathons: [], prototypes: [], apps: [], exclude: [] };

export function parseOverridesYaml(text: string): { ok: true; value: Overrides } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = parseYaml(text) ?? {};
  } catch (e) {
    return { ok: false, error: `Invalid YAML: ${e instanceof Error ? e.message : String(e)}` };
  }
  const res = overridesSchema.safeParse(raw);
  if (!res.success) return { ok: false, error: z.prettifyError(res.error) };
  return { ok: true, value: res.data };
}

export function mergeOverrides(...sources: (Overrides | null | undefined)[]): Overrides {
  const out: Overrides = { hackathons: [], prototypes: [], apps: [], exclude: [] };
  for (const s of sources) {
    if (!s) continue;
    out.hackathons.push(...s.hackathons);
    out.prototypes.push(...s.prototypes);
    out.apps.push(...s.apps);
    out.exclude.push(...s.exclude);
  }
  return out;
}

function declared(e: OverrideEntry): RepoRef {
  return {
    nameWithOwner: e.repo ?? e.name,
    url: e.url ?? (e.repo ? `https://github.com/${e.repo}` : ""),
    description: e.note ?? e.name,
    reason: "self-declared",
    provenance: "self-declared",
  };
}

function applyList(inferred: RepoRef[], added: OverrideEntry[], exclude: Set<string>): RepoRef[] {
  const kept = inferred.filter((r) => !exclude.has(r.nameWithOwner.toLowerCase()));
  const present = new Set(kept.map((r) => r.nameWithOwner.toLowerCase()));
  // A declared entry pointing at an already-inferred repo adds nothing (no double counting).
  const extra = added.filter((e) => !e.repo || !present.has(e.repo.toLowerCase())).map(declared);
  return [...kept, ...extra];
}

const REDACTED = "Private repository";

/**
 * Product rule (founder decision, 2026-10-04): every hackathon entry is also a prototype.
 * A repo already counted as a prototype is not added twice. Redacted private repos can't
 * be matched by name, so each counts once per list. Provenance carries over, so a
 * self-declared hackathon stays a half-weight self-declared prototype.
 */
export function withHackathonEntries(prototypes: RepoRef[], hackathons: RepoRef[]): RepoRef[] {
  const present = new Set(prototypes.filter((p) => p.nameWithOwner !== REDACTED).map((p) => p.nameWithOwner.toLowerCase()));
  const extra = hackathons
    .filter((h) => h.nameWithOwner === REDACTED || !present.has(h.nameWithOwner.toLowerCase()))
    .map((h) => ({ ...h, reason: "hackathon entry" }));
  return [...prototypes, ...extra];
}

/** Returns a new metrics object with overrides applied. Pure. */
export function applyOverrides(m: BuilderMetrics, o: Overrides): BuilderMetrics {
  const exclude = new Set(o.exclude.map((x) => x.toLowerCase()));
  const hackathons = applyList(m.hackathons, o.hackathons, exclude);
  return {
    ...m,
    hackathons,
    prototypes: withHackathonEntries(applyList(m.prototypes, o.prototypes, exclude), hackathons),
    appsBuilt: applyList(m.appsBuilt, o.apps, exclude),
    appsDeployed: m.appsDeployed.filter((r) => !exclude.has(r.nameWithOwner.toLowerCase())),
  };
}
