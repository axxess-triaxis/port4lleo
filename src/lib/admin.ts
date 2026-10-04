/**
 * Operator access for this deployment: GitHub logins listed in ADMIN_GITHUB_LOGINS
 * (comma-separated). Unset means no admins, so admin features are off by default for
 * anyone self-hosting. Logins come from the server-managed profiles.login column,
 * which users cannot edit (see the init migration's column grant).
 */
export function isAdminLogin(login: string | null | undefined, env = process.env.ADMIN_GITHUB_LOGINS): boolean {
  if (!login || !env) return false;
  const admins = env
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(login.toLowerCase());
}
