import { GitHubError, type GitHubClient } from "@/lib/github/client";
import { EMPTY_OVERRIDES, parseOverridesYaml, type Overrides } from "./overrides";

/**
 * portfolio.yml from the `<login>/<login>` profile repo, if present and valid.
 * Shared by the web sync and the Claude plugin so both read it the same way.
 */
export async function fetchProfileYaml(
  gh: GitHubClient,
  login: string,
): Promise<{ overrides: Overrides; error: string | null }> {
  try {
    const file = await gh.rest<{ content: string; encoding: string }>(`/repos/${login}/${login}/contents/portfolio.yml`);
    const text = Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8").toString("utf8");
    const parsed = parseOverridesYaml(text);
    return parsed.ok ? { overrides: parsed.value, error: null } : { overrides: EMPTY_OVERRIDES, error: parsed.error };
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return { overrides: EMPTY_OVERRIDES, error: null };
    throw e;
  }
}
