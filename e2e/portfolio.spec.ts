import { expect, test } from "@playwright/test";

const TILES = [
  "repos",
  "projects",
  "prsMerged",
  "contributions",
  "actionsRuns",
  "testsPassed",
  "appsBuilt",
  "appsDeployed",
  "vercelProjects",
  "hackathons",
  "prototypes",
  "integrations",
];

test("landing page links to sign-in and the demo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("builder portfolio");
  await expect(page.getByRole("link", { name: "Connect GitHub" })).toHaveAttribute("href", "/auth/signin");
  await page.getByRole("link", { name: "See a demo portfolio" }).click();
  await expect(page).toHaveURL(/\/u\/demo$/);
});

test("demo portfolio renders score, breakdown and every stat tile", async ({ page }) => {
  await page.goto("/u/demo");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  const score = Number(await page.getByTestId("builder-score").innerText().then((t) => t.split("/")[0].trim()));
  expect(score).toBeGreaterThan(0);
  expect(score).toBeLessThanOrEqual(1000);
  await expect(page.getByTestId("builder-tier")).not.toBeEmpty();
  await expect(page.getByTestId("score-breakdown")).toContainText("Shipping");
  for (const key of TILES) await expect(page.getByTestId(`stat-${key}`)).toBeVisible();
  await expect(page.getByTestId("list-hackathons")).toContainText("self-declared");
  await expect(page.getByTestId("integrations")).toContainText("OpenAI");
});

test("page has no horizontal overflow", async ({ page }) => {
  await page.goto("/u/demo");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("badge route returns an SVG with the score", async ({ request }) => {
  const res = await request.get("/api/badge/demo");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/svg+xml");
  const body = await res.text();
  expect(body).toMatch(/^<svg[\s\S]*builder score[\s\S]*<\/svg>$/);
});

test("unknown users 404", async ({ page, request }) => {
  const res = await page.goto("/u/this-user-does-not-exist-xyz");
  expect(res?.status()).toBe(404);
  expect((await request.get("/api/badge/this-user-does-not-exist-xyz")).status()).toBe(404);
});

test("dashboard redirects when signed out / unconfigured", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/(\?error=not-configured)?$/);
});

test("authenticated APIs reject anonymous callers", async ({ request }) => {
  expect((await request.post("/api/sync")).status()).toBeGreaterThanOrEqual(401);
  expect((await request.put("/api/overrides", { data: "apps: []" })).status()).toBeGreaterThanOrEqual(401);
  expect((await request.get("/api/cron/sync")).status()).toBe(401);
});

test("scoring page lists every weight", async ({ page }) => {
  await page.goto("/scoring");
  for (const label of ["Apps deployed", "PRs merged", "Test runs passed", "Hackathons"]) {
    // "Hackathons" is both a metric and a category, so match the first cell.
    await expect(page.getByRole("cell", { name: label, exact: true }).first()).toBeVisible();
  }
});

test("sign-in failures show the provider's real reason, not a generic message", async ({ page }) => {
  await page.goto(
    "/?error=missing-code#error=server_error&error_description=Error+getting+user+profile+from+external+provider",
  );
  await expect(page.getByTestId("auth-error")).toHaveText(
    "Sign-in failed: Error getting user profile from external provider",
  );
  await page.goto("/?error=missing-code");
  await expect(page.getByTestId("auth-error")).toHaveText("Sign-in link was incomplete. Try again.");
});

test("favicon.ico serves the app icon", async ({ request }) => {
  const res = await request.get("/favicon.ico");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test("governance dashboard redirects when signed out / unconfigured", async ({ page }) => {
  await page.goto("/dashboard/governance");
  await expect(page).toHaveURL(/\/(\?error=not-configured)?$/);
});

test("marketplace-required pages render and are linked from the footer", async ({ page }) => {
  for (const [path, heading] of [
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of service"],
    ["/support", "Support"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.locator("footer").getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  }
  await page.goto("/privacy");
  await expect(page.locator("article")).toContainText("masked excerpt");
});

test("webhook and audit endpoints reject unauthenticated callers", async ({ request }) => {
  const body = JSON.stringify({ action: "created" });
  const bad = await request.post("/api/github/webhooks", {
    data: body,
    headers: { "x-github-event": "installation", "x-hub-signature-256": "sha256=deadbeef", "content-type": "application/json" },
  });
  expect(bad.status()).toBe(401);
  expect((await request.post("/api/github/webhooks", { data: body })).status()).toBe(401);
  expect((await request.get("/api/cron/audit")).status()).toBe(401);
  expect((await request.post("/api/governance/audit", { data: { installationId: 1 } })).status()).toBeGreaterThanOrEqual(401);
});
