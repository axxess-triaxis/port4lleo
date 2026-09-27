import { describe, expect, it } from "vitest";
import { demoMetrics } from "@/lib/demo";
import { applyOverrides, EMPTY_OVERRIDES, mergeOverrides, parseOverridesYaml } from "@/lib/overrides/overrides";

describe("parseOverridesYaml", () => {
  it("parses a valid file and fills defaults", () => {
    const r = parseOverridesYaml("hackathons:\n  - name: SIH 2025\n    url: https://sih.gov.in\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.hackathons).toHaveLength(1);
      expect(r.value.apps).toEqual([]);
    }
  });
  it("treats an empty file as empty overrides", () => {
    const r = parseOverridesYaml("");
    expect(r.ok && r.value).toEqual(EMPTY_OVERRIDES);
  });
  it("rejects bad YAML and bad shapes with a message", () => {
    expect(parseOverridesYaml("a: [").ok).toBe(false);
    const bad = parseOverridesYaml("exclude:\n  - not a repo\n");
    expect(bad.ok).toBe(false);
  });
});

describe("applyOverrides", () => {
  const m = demoMetrics();

  it("adds self-declared entries with provenance", () => {
    const out = applyOverrides(m, { ...EMPTY_OVERRIDES, prototypes: [{ name: "Paper prototype" }] });
    expect(out.prototypes).toHaveLength(m.prototypes.length + 1);
    expect(out.prototypes.at(-1)?.provenance).toBe("self-declared");
  });

  it("excludes repos from every inferred list, case-insensitively", () => {
    const out = applyOverrides(m, { ...EMPTY_OVERRIDES, exclude: ["Demo-Builder/invoice-ai"] });
    expect(out.appsBuilt.some((r) => r.nameWithOwner === "demo-builder/invoice-ai")).toBe(false);
    expect(out.appsDeployed.some((r) => r.nameWithOwner === "demo-builder/invoice-ai")).toBe(false);
  });

  it("does not double count a declared entry for an already-inferred repo", () => {
    const out = applyOverrides(m, { ...EMPTY_OVERRIDES, apps: [{ name: "Invoice AI", repo: "demo-builder/invoice-ai" }] });
    expect(out.appsBuilt).toHaveLength(m.appsBuilt.length);
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(m);
    applyOverrides(m, { ...EMPTY_OVERRIDES, exclude: ["demo-builder/menu-qr"], hackathons: [{ name: "x" }] });
    expect(JSON.stringify(m)).toBe(before);
  });

  it("mergeOverrides concatenates sources and skips nulls", () => {
    const merged = mergeOverrides({ ...EMPTY_OVERRIDES, exclude: ["a/b"] }, null, { ...EMPTY_OVERRIDES, exclude: ["c/d"] });
    expect(merged.exclude).toEqual(["a/b", "c/d"]);
  });
});
