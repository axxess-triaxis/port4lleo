import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGitHubClient } from "@/lib/github/client";

/**
 * Viewer-side authorization for governance data, always derived from the viewer's own
 * GitHub user token (never from our DB), so revoked access takes effect immediately.
 */

export interface ViewerInstallation {
  id: number;
  account: { login: string; type: string; avatar_url: string };
  repository_selection: string;
}

export async function viewerInstallations(userToken: string): Promise<ViewerInstallation[]> {
  const gh = createGitHubClient(userToken);
  const body = await gh.rest<{ installations: ViewerInstallation[] }>("/user/installations?per_page=100");
  return body.installations;
}

/** Full names of the repos in `installationId` that this viewer can access. */
export async function viewerRepos(userToken: string, installationId: number): Promise<string[]> {
  const gh = createGitHubClient(userToken);
  const out: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const body = await gh.rest<{ total_count: number; repositories: { full_name: string }[] }>(
      `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
    );
    out.push(...body.repositories.map((r) => r.full_name));
    if (body.repositories.length < 100 || out.length >= body.total_count) break;
  }
  return out;
}

/** Keep our installations table in step with what GitHub reports (webhooks can be missed). */
export async function upsertInstallations(admin: SupabaseClient, list: ViewerInstallation[]) {
  if (list.length === 0) return;
  await admin.from("installations").upsert(
    list.map((i) => ({
      id: i.id,
      account_login: i.account.login,
      account_type: i.account.type,
      repository_selection: i.repository_selection,
    })),
    { onConflict: "id", ignoreDuplicates: false },
  );
}
