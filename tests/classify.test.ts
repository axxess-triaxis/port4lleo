import { describe, expect, it } from "vitest";
import { lookupIntegration } from "@/lib/classify/integrations";
import { parsePackageJson, parsePyprojectToml, parseRequirementsTxt } from "@/lib/classify/manifests";
import {
  classifyApp,
  classifyDeployed,
  classifyHackathon,
  classifyPrototype,
  classifyVercel,
  isTestWorkflow,
  type RepoFacts,
} from "@/lib/classify/repos";

const facts = (p: Partial<RepoFacts> = {}): RepoFacts => ({
  name: "thing",
  description: null,
  topics: [],
  homepageUrl: null,
  deps: [],
  deploymentCreators: [],
  deploymentStates: [],
  ...p,
});

describe("manifests", () => {
  it("reads all npm dependency fields and tolerates bad JSON", () => {
    expect(parsePackageJson(JSON.stringify({ dependencies: { next: "1" }, devDependencies: { vitest: "1" } }))).toEqual([
      "next",
      "vitest",
    ]);
    expect(parsePackageJson("{nope")).toEqual([]);
  });
  it("reads requirements.txt names, skipping comments and flags", () => {
    expect(parseRequirementsTxt("# hi\nfastapi[all]>=0.1\n-r base.txt\nPyGithub==2\npsycopg2_binary\n")).toEqual([
      "fastapi",
      "pygithub",
      "psycopg2-binary",
    ]);
  });
  it("reads PEP 621 and Poetry pyproject dependencies", () => {
    const pep = `[project]\ndependencies = [\n  "openai>=1",\n  'boto3',\n]\n`;
    expect(parsePyprojectToml(pep)).toEqual(["openai", "boto3"]);
    const poetry = `[tool.poetry.dependencies]\npython = "^3.11"\nflask = "^3"\n\n[build-system]\nrequires = []\n`;
    expect(parsePyprojectToml(poetry)).toEqual(["flask"]);
  });
});

describe("integrations registry", () => {
  it("matches exact and prefix entries case-insensitively", () => {
    expect(lookupIntegration("stripe")?.name).toBe("Stripe");
    expect(lookupIntegration("@aws-sdk/client-s3")?.name).toBe("AWS");
    expect(lookupIntegration("@Anthropic-AI/SDK")?.name).toBe("Anthropic");
    expect(lookupIntegration("left-pad")).toBeNull();
  });
});

describe("classifiers", () => {
  it("app: topic, or framework plus shipping evidence", () => {
    expect(classifyApp(facts({ topics: ["webapp"] }))).toBe("topic:webapp");
    expect(classifyApp(facts({ deps: ["next"] }))).toBeNull(); // template/lib with no deploy
    expect(classifyApp(facts({ deps: ["next"], homepageUrl: "https://x.dev" }))).toBe("framework:next");
    expect(classifyApp(facts({ deps: ["fastapi"], deploymentStates: ["FAILURE"] }))).toBe("framework:fastapi");
  });
  it("deployed: successful deployment or external homepage", () => {
    expect(classifyDeployed(facts({ deploymentStates: ["FAILURE"] }))).toBeNull();
    expect(classifyDeployed(facts({ deploymentStates: ["INACTIVE"] }))).toBe("github-deployment");
    expect(classifyDeployed(facts({ homepageUrl: "https://github.com/me/x" }))).toBeNull();
    expect(classifyDeployed(facts({ homepageUrl: "https://x.dev" }))).toBe("homepage");
    expect(classifyDeployed(facts({ homepageUrl: "not a url" }))).toBeNull();
  });
  it("vercel: deployment created by the Vercel app", () => {
    expect(classifyVercel(facts({ deploymentCreators: ["vercel"] }))).toBe("vercel-deployment");
    expect(classifyVercel(facts({ deploymentCreators: ["vercel[bot]"] }))).toBe("vercel-deployment");
    expect(classifyVercel(facts({ deploymentCreators: ["netlify"] }))).toBeNull();
  });
  it("hackathon: topic or name/description", () => {
    expect(classifyHackathon(facts({ topics: ["ethglobal"] }))).toBe("topic:ethglobal");
    expect(classifyHackathon(facts({ description: "Built at a 24h hackathon" }))).toBe("name/description");
    expect(classifyHackathon(facts({ name: "hackernews-clone" }))).toBeNull();
  });
  it("prototype: topic or name/description", () => {
    expect(classifyPrototype(facts({ topics: ["poc"] }))).toBe("topic:poc");
    expect(classifyPrototype(facts({ name: "rag-mvp" }))).toBe("name/description");
    expect(classifyPrototype(facts({ name: "mvpn" }))).toBeNull();
  });
  it("test workflows by name or file", () => {
    expect(isTestWorkflow("CI", ".github/workflows/main.yml")).toBe(true);
    expect(isTestWorkflow("Build", ".github/workflows/e2e.yml")).toBe(true);
    expect(isTestWorkflow("Deploy to prod", ".github/workflows/deploy.yml")).toBe(false);
    expect(isTestWorkflow("Release", ".github/workflows/release.yml")).toBe(false);
  });
});
