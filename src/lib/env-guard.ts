/**
 * Anything named NEXT_PUBLIC_* is inlined into the browser bundle. Refuse to build
 * when one of them holds a secret-shaped value, so a mis-pasted key can never ship.
 */
const SECRET_SHAPES: [RegExp, string][] = [
  [/^sbp_/, "a Supabase personal access token"],
  [/^sb_secret_/, "a Supabase secret key"],
  [/^eyJ[\w-]+\.[\w-]*(cm9sZSI6InNlcnZpY2Vfcm9sZ|InJvbGUiOiJzZXJ2aWNlX3JvbGUi)/, "a Supabase service_role JWT"],
  [/^gh[pousr]_|^github_pat_/, "a GitHub token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
];

export function findPublicSecrets(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
    for (const [re, what] of SECRET_SHAPES) {
      if (re.test(value.trim())) problems.push(`${name} looks like ${what}`);
    }
  }
  return problems;
}
