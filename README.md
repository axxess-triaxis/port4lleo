<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/port4lleo-wordmark-dark.png">
    <img alt="PORT4LLEO" src="public/brand/port4lleo-wordmark-light.png" width="520">
  </picture>
</p>

# PORT4LLEO

An open-source GitHub App with two jobs:

1. **Builder portfolio.** It turns your GitHub account into a shareable portfolio of what you shipped and how you ship, with a transparent **Builder Score** out of 1000.
2. **Repository governance.** Install it on an account or organization and it audits the repositories for the failure modes AI-assisted teams actually hit. This part started as [RepoWatch](https://github.com/axxess-triaxis/RepoWatch).

## Portfolio

Sign in with GitHub and you get a shareable page at `/u/<your-login>` with:

| Metric | Source |
|---|---|
| Repositories, Projects, PRs merged, Contributions | GitHub GraphQL API |
| Actions runs | Actions REST API, across your 100 most recently pushed repos |
| Test runs passed | Successful runs of test/CI workflows *(inferred)* |
| Apps built / Apps deployed | App frameworks in root manifests plus deployments or homepage *(inferred)* |
| Vercel projects | Deployments by the Vercel GitHub app, or the Vercel API if you add a token |
| Hackathons, Prototypes | Repo topics, names and descriptions, plus `portfolio.yml` *(inferred + self-declared)* |
| Integrations most used | Root `package.json` / `requirements.txt` / `pyproject.toml`, matched against a [curated registry](src/lib/classify/integrations.ts) |
| **Builder Score** | 12 weighted, log-scaled metrics with recency decay. See [SCORING.md](SCORING.md) |

Every tile shows where its number comes from. Heuristic counts are labelled **inferred**, and anything you add by hand is labelled **self-declared**.

There's also a README badge (`/api/badge/<login>`), an Open Graph card per user, and a daily re-sync.

## Governance

Install the app, choose repositories, and each audit checks:

| Check | What it flags |
|---|---|
| Dependabot | Open alerts by severity. "Alerts disabled" and "not readable" are reported separately and never as clean. |
| Untested deploys | Recent default-branch commits with no test check-run (Playwright, Vitest, Jest, pytest, Cypress, or any check named "test"), or only failing ones |
| Stale PRs | Open more than 10 days |
| Conflict-resolution merges | Merge commits still carrying git's `Conflicts:` marker. A lower bound. |
| Possible unmasked PII | Emails, phone numbers, SSN, card-like and Aadhaar-like numbers in tracked text files. Stored **masked** only. |
| Repo sprawl | More than 15 active repos, and near-duplicate names |

Audits run when the app is installed, daily, and on demand (at most once an hour). Each audit covers the 25 most recently pushed repos, their last 10 commits, and up to 40 files per repo for PII.

**Audits are never public.** A user sees findings only for repos they can access on GitHub, and this is checked live against GitHub on every page load.

## Fix bounties (PayPal + AI)

Organisations can put a PayPal bounty on a Dependabot alert PORT4LLEO found. A developer fixes it, claims with the pull request, and gets paid by PayPal once the fix is verified and a maintainer approves.

1. **Fund.** A repository admin or maintainer funds a bounty (1–500 USD) on an open alert with PayPal Checkout: PayPal JS SDK buttons, with Orders v2 created and captured server-side through `@paypal/paypal-server-sdk`.
2. **Claim.** Any other signed-in developer claims it with the pull request URL and the PayPal email to be paid at. The email is stored encrypted.
3. **Verify.** Six deterministic checks run first. The PR must be in the repo, merged, into the default branch, by the claimant and after funding, and **GitHub must report the alert `fixed`**. If all pass, an **AI agent** (Groq `gpt-oss-120b`) reviews the evidence. It uses two tools: the **PayPal Agent Toolkit**'s `get_order`, to confirm the bounty was captured, and a read-only view of the PR's diffs, to confirm the vulnerable package was actually updated. It then recommends pay or don't pay, with reasons and risks.
4. **Approve.** A maintainer who isn't the claimant approves. PORT4LLEO re-checks GitHub, then pays through **PayPal Payouts**. The fix appears on the developer's public portfolio as a paid security fix.
5. **Cancel.** An unclaimed bounty can be cancelled and refunded through the PayPal Payments API.

**The agent can't move money.** It has no payout tool. A failed check, or a PayPal order the tool didn't itself see as `COMPLETED` for *this* bounty, overrides any "pay". A human approves every payout. Pull request content is treated as untrusted.

**Sandbox only.** Live mode needs both `PAYPAL_ENV=live` and `PAYPAL_ALLOW_LIVE=true`. In production, holding funds and paying third parties requires PayPal's marketplace (multiparty) onboarding and a compliance review, which this project has not done.

## Privacy

- PORT4LLEO is a GitHub App with **read-only** permissions. It has no OAuth scopes and cannot write to anything.
- Without an install, it reads only public data. Private repos are included only where you install the app and select them. Private repos are **counted but never named** in a portfolio.
- GitHub and Vercel tokens are encrypted with AES-256-GCM before they are stored. The token tables have row-level security enabled and no policies, so only the server can read them.
- You can make your portfolio private from the dashboard. Uninstalling the app deletes its audits. Full policy: `/privacy`.

## Correcting your portfolio

Some things are invisible to GitHub, such as a hackathon entered from a private repo. Add a `portfolio.yml` to your `<login>/<login>` profile repo, or paste the same format into the dashboard:

```yaml
hackathons:
  - name: Smart India Hackathon 2025
    url: https://example.com/my-entry
    repo: me/sih-entry        # optional
prototypes:
  - name: Voice agent paper prototype
apps: []
exclude:
  - me/not-actually-a-hackathon   # removed from every inferred list
```

Self-declared items count at half weight in the score.

## Self-hosting

Prerequisites: Node 20.9+, pnpm 10, a Supabase project, and your own GitHub App.

1. **Supabase.** Create a project and apply `supabase/migrations/*.sql` in order (`supabase db push`).
2. **GitHub App** (GitHub → Settings → Developer settings → GitHub Apps → New):
   - **Callback URL:** `https://<project-ref>.supabase.co/auth/v1/callback`. Keep "Expire user authorization tokens" on.
   - **Setup URL:** `https://<your-domain>/dashboard/governance`, with "Redirect on update" enabled.
   - **Webhook URL:** `https://<your-domain>/api/github/webhooks`, plus a random webhook secret.
   - **Repository permissions (all read-only):** Metadata, Contents, Actions, Checks, Deployments, Pull requests, Dependabot alerts.
   - **Account permissions (read-only):** Projects.
   - Then generate a private key.
3. **Supabase Auth.** Under Providers → GitHub, paste the App's client ID and client secret. Add `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback`) to the redirect allowlist.
4. **Environment.** Copy `.env.example` to `.env.local` and fill it in.
5. Run it:
   ```bash
   pnpm install
   pnpm dev
   ```
6. **Deploy to Vercel.** Set the same environment variables. `vercel.json` schedules the daily `/api/cron/sync` and `/api/cron/audit`.

The `/u/demo` page works without any configuration, which makes it handy for UI work.

## Development

```bash
pnpm typecheck   # route types + tsc
pnpm lint        # zero warnings
pnpm test        # vitest: scoring, classifiers, overrides, collectors + governance checks (mocked GitHub), crypto, webhooks
pnpm build
pnpm e2e         # playwright against the production build (desktop + mobile)
pnpm smoke <login> [--private]   # real GitHub API, no DB; token from $GITHUB_TOKEN or `gh auth token`
```

Layout: GitHub collectors and App auth are in `src/lib/github`, heuristics in `src/lib/classify`, the score in `src/lib/scoring`, governance checks in `src/lib/governance`, and pages and API routes in `src/app`.

## Known limitations

- Fix bounties run in the PayPal sandbox; see above for what production would require. Bounties cover Dependabot alerts only, because those are the findings GitHub itself marks as fixed.

- Integrations are read from **root** manifests only, so packages inside a monorepo are missed.
- "Test runs passed" counts runs, not test cases. GitHub doesn't expose test-case counts.
- Actions and test runs are all-time counts with no recency decay.
- Homepage URLs are not checked for reachability.
- Org-owned repos you contribute to count toward PRs and contributions, but not toward repos, apps or integrations.
- Governance audits are capped per run (see above), so large organizations are covered 25 repos at a time, most recently active first.
- The daily cron audits 3 installations per run (Vercel Hobby allows one cron run a day). Installs, repository additions and on-demand runs trigger audits immediately.
- PII patterns are deliberately broad. Findings are candidates to confirm, and paths that look like tests, fixtures or examples are marked likely benign.

## License

MIT
