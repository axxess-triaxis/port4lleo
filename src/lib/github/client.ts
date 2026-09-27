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
}

const API = "https://api.github.com";

export function createGitHubClient(token: string, fetchImpl: typeof fetch = fetch): GitHubClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "builderscore",
  };

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
      const res = await fetchImpl(`${API}${path}`, { headers });
      if (!res.ok) throw new GitHubError(`GET ${path} -> ${res.status}`, res.status);
      return (await res.json()) as T;
    },
  };
}
