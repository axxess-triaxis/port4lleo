/**
 * Heuristic classifiers. Every positive result carries a `reason` so the UI can
 * show *why* a repo was counted -- the numbers stay auditable.
 */

export interface RepoFacts {
  name: string;
  description: string | null;
  topics: string[];
  homepageUrl: string | null;
  /** Dependency names from root manifests. */
  deps: string[];
  /** Logins of recent deployment creators, e.g. "vercel". */
  deploymentCreators: string[];
  /** Latest-status states of recent deployments, e.g. "SUCCESS". */
  deploymentStates: string[];
}

const APP_TOPICS = new Set(["app", "webapp", "web-app", "mobile-app", "saas", "pwa", "android-app", "ios-app"]);

/** Dependencies that mean "this repo is a runnable application", not a library. */
const APP_FRAMEWORKS: Record<string, string> = {
  next: "next",
  "react-scripts": "create-react-app",
  vite: "vite",
  "@remix-run/react": "remix",
  "react-router": "react-router",
  nuxt: "nuxt",
  "@sveltejs/kit": "sveltekit",
  astro: "astro",
  expo: "expo",
  "react-native": "react-native",
  "@capacitor/core": "capacitor",
  electron: "electron",
  "@angular/core": "angular",
  "@tauri-apps/api": "tauri",
  express: "express",
  fastify: "fastify",
  hono: "hono",
  "@nestjs/core": "nestjs",
  flask: "flask",
  fastapi: "fastapi",
  django: "django",
  streamlit: "streamlit",
  gradio: "gradio",
};

const HACKATHON_TOPICS = new Set(["hackathon", "devpost", "ethglobal", "mlh", "hacktoberfest-hackathon", "hackathon-project"]);
const HACKATHON_NAME = /hack-?a-?thon|devpost|ethglobal|\bmlh\b/i;
// In descriptions only the singular counts: "a hackathon entry" names an event, while
// "tracks hackathons, prototypes..." merely lists a feature.
const HACKATHON_DESCRIPTION = /hack-?a-?thon(?!s)|devpost|ethglobal|\bmlh\b/i;

const PROTOTYPE_TOPICS = new Set(["prototype", "poc", "proof-of-concept", "mvp", "experiment", "experimental"]);
const PROTOTYPE_TEXT = /\b(prototype|proof[- ]of[- ]concept|poc|mvp)\b/i;

const SUCCESS_STATES = new Set(["SUCCESS", "ACTIVE", "INACTIVE"]); // INACTIVE = superseded by a newer deploy

export function isVercelLogin(login: string): boolean {
  return /^vercel(\[bot\])?$/i.test(login);
}

export function hasSuccessfulDeployment(r: RepoFacts): boolean {
  return r.deploymentStates.some((s) => SUCCESS_STATES.has(s.toUpperCase()));
}

export function classifyApp(r: RepoFacts): string | null {
  const topic = r.topics.find((t) => APP_TOPICS.has(t));
  if (topic) return `topic:${topic}`;
  const fw = r.deps.map((d) => APP_FRAMEWORKS[d]).find(Boolean);
  // A framework alone could be a template or a lib demo; require evidence it was shipped somewhere.
  if (fw && (r.homepageUrl || r.deploymentStates.length > 0)) return `framework:${fw}`;
  return null;
}

export function classifyDeployed(r: RepoFacts): string | null {
  if (hasSuccessfulDeployment(r)) return "github-deployment";
  if (r.homepageUrl && /^https?:\/\//i.test(r.homepageUrl) && !/github\.com/i.test(r.homepageUrl)) {
    return "homepage";
  }
  return null;
}

export function classifyVercel(r: RepoFacts): string | null {
  return r.deploymentCreators.some(isVercelLogin) ? "vercel-deployment" : null;
}

export function classifyHackathon(r: RepoFacts): string | null {
  const topic = r.topics.find((t) => HACKATHON_TOPICS.has(t));
  if (topic) return `topic:${topic}`;
  if (HACKATHON_NAME.test(r.name) || HACKATHON_DESCRIPTION.test(r.description ?? "")) return "name/description";
  return null;
}

export function classifyPrototype(r: RepoFacts): string | null {
  const topic = r.topics.find((t) => PROTOTYPE_TOPICS.has(t));
  if (topic) return `topic:${topic}`;
  if (PROTOTYPE_TEXT.test(r.name.replace(/[-_]/g, " ")) || PROTOTYPE_TEXT.test(r.description ?? "")) {
    return "name/description";
  }
  return null;
}

const TEST_WORKFLOW = /test|\bci\b|check|e2e|spec|playwright|cypress|pytest|jest|vitest/i;

/** Whether a GitHub Actions workflow is (mostly) a test/CI workflow. */
export function isTestWorkflow(name: string, path: string): boolean {
  const file = path.split("/").pop() ?? path;
  return TEST_WORKFLOW.test(name) || TEST_WORKFLOW.test(file.replace(/[._-]/g, " "));
}
