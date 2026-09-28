/**
 * Unmasked-PII scan, ported from RepoWatch checks/pii_scan.py. Patterns are
 * deliberately conservative (false positives over misses); a hit is a candidate for
 * a human to confirm. Only masked excerpts ever leave this module.
 */
import type { GitHubClient } from "@/lib/github/client";
import type { PiiFinding, PiiKind, PiiResult } from "./types";

export const MAX_FILE_BYTES = 200_000;
const SKIP_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".pdf", ".zip", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".lock"];
const SKIP_PATH_SUBSTRINGS = ["node_modules/", "dist/", "build/", ".git/", "vendor/"];
const BENIGN_PATH_HINTS = ["test", "spec", "fixture", "example", "sample", ".md"];

export const PII_PATTERNS: Record<PiiKind, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  phone_us: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  ssn_us: /\b\d{3}-\d{2}-\d{4}\b/,
  credit_card: /\b(?:\d[ -]*?){13,16}\b/,
  aadhaar_in: /\b\d{4}\s?\d{4}\s?\d{4}\b/,
};

export function mask(text: string): string {
  if (text.length <= 4) return "*".repeat(text.length);
  return text.slice(0, 2) + "*".repeat(text.length - 4) + text.slice(-2);
}

/** One file's content -> findings, at most one per kind (same as RepoWatch). */
export function scanContent(path: string, content: string): PiiFinding[] {
  const likelyBenign = BENIGN_PATH_HINTS.some((h) => path.toLowerCase().includes(h));
  const out: PiiFinding[] = [];
  for (const [kind, re] of Object.entries(PII_PATTERNS) as [PiiKind, RegExp][]) {
    const m = re.exec(content);
    if (m) out.push({ path, kind, maskedExcerpt: mask(m[0]), likelyBenign });
  }
  return out;
}

export function isScannablePath(path: string, size: number): boolean {
  const lower = path.toLowerCase();
  return (
    size <= MAX_FILE_BYTES &&
    !SKIP_EXTENSIONS.some((ext) => lower.endsWith(ext)) &&
    !SKIP_PATH_SUBSTRINGS.some((s) => path.includes(s))
  );
}

export async function checkPii(gh: GitHubClient, repo: string, defaultBranch: string, maxFiles = 40): Promise<PiiResult> {
  const result: PiiResult = { findings: [], filesScanned: 0, error: null };
  let entries: { path: string; type: string; sha: string; size?: number }[];
  try {
    const tree = await gh.rest<{ tree: typeof entries }>(
      `/repos/${repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
    );
    entries = tree.tree;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return result;
  }
  const candidates = entries.filter((e) => e.type === "blob" && isScannablePath(e.path, e.size ?? 0)).slice(0, maxFiles);
  for (const entry of candidates) {
    let blob: { content?: string; encoding?: string };
    try {
      blob = await gh.rest(`/repos/${repo}/git/blobs/${entry.sha}`);
    } catch {
      continue; // one unreadable blob shouldn't kill the scan
    }
    if (blob.encoding !== "base64" || !blob.content) continue;
    result.filesScanned++;
    result.findings.push(...scanContent(entry.path, Buffer.from(blob.content, "base64").toString("utf8")));
  }
  return result;
}
