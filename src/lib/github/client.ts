export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GitHubClient {
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  rest<T>(path: string): Promise<T>;
  /** Follows `Link: rel="next"` and concatenates array pages, up to `limit` items. */
  restAll<T>(path: string, limit?: number): Promise<T[]>;
}

const API = "https://api.github.com";

function nextLink(header: string | null): string | null {
  if (!header) return null;
  const m = /<([^>]+)>;\s*rel="next"/.exec(header);
  return m ? m[1] : null;
}

export function createGitHubClient(token: string, fetchImpl: typeof fetch = fetch): GitHubClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "port4lleo",
  };

  async function get(url: string): Promise<Response> {
    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      // GitHub's own message distinguishes cases callers care about
      // (e.g. "Dependabot alerts are disabled for this repository" vs a plain 403).
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      const path = url.startsWith(API) ? url.slice(API.length) : url;
      throw new GitHubError(`GET ${path} -> ${res.status}${body?.message ? `: ${body.message}` : ""}`, res.status);
    }
    return res;
  }

  return {
    async graphql<T>(query: string, variables: Record<string, unknown> = {}) {
      const res = await fetchImpl(`${API}/graphql`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new GitHubError(`GraphQL HTTP ${res.status}`, res.status);
      const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
      // Partial data with errors (e.g. one inaccessible field) is still useful; only fail on no data.
      if (!body.data) {
        throw new GitHubError(body.errors?.map((e) => e.message).join("; ") ?? "GraphQL: no data", 200);
      }
      return body.data;
    },

    async rest<T>(path: string) {
      return (await (await get(`${API}${path}`)).json()) as T;
    },

    async restAll<T>(path: string, limit = 1000) {
      const out: T[] = [];
      let url: string | null = `${API}${path}`;
      while (url && out.length < limit) {
        const res = await get(url);
        const page = (await res.json()) as T[];
        out.push(...page);
        url = nextLink(res.headers.get("link"));
      }
      return out.slice(0, limit);
    },
  };
}
