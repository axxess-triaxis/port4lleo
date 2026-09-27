# BuilderScore

An open-source app that turns your GitHub account into a builder portfolio and dashboard. It shows what you shipped and how you ship, and gives you a transparent **Builder Score** out of 1000.

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

## Privacy

- The default sign-in scope is `read:user read:project`, which gives public data only.
- Private repos are opt-in and need GitHub's `repo` scope, which GitHub only offers as full read/write. BuilderScore only reads. Private repos are **counted but never named** in a snapshot.
- GitHub and Vercel tokens are encrypted with AES-256-GCM before they are stored. The token tables have row-level security enabled and no policies, so only the server can read them.
- You can make your portfolio private from the dashboard.

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

Prerequisites: Node 20.9+, pnpm 10, a Supabase project, and a GitHub OAuth App.

1. **Supabase.** Create a project and apply `supabase/migrations/*.sql` (`supabase db push`, or paste it into the SQL editor).
2. **GitHub OAuth App** (GitHub → Settings → Developer settings → OAuth Apps). Set the callback URL to `https://<project-ref>.supabase.co/auth/v1/callback`. In Supabase → Authentication → Providers → GitHub, paste the client ID and secret.
3. **Supabase redirect allowlist.** Add `https://<your-domain>/auth/callback`, plus `http://localhost:3000/auth/callback` for local development.
4. **Environment.** Copy `.env.example` to `.env.local` and fill it in.
5. Run it:
   ```bash
   pnpm install
   pnpm dev
   ```
6. **Deploy to Vercel.** Set the same environment variables. `vercel.json` schedules the daily `/api/cron/sync`.

The `/u/demo` page works without any configuration, which makes it handy for UI work.

## Development

```bash
pnpm typecheck   # route types + tsc
pnpm lint        # zero warnings
pnpm test        # vitest: scoring, classifiers, overrides, collectors (mocked GitHub), crypto
pnpm build
pnpm e2e         # playwright against the production build (desktop + mobile)
pnpm smoke <login> [--private]   # real GitHub API, no DB; token from $GITHUB_TOKEN or `gh auth token`
```

Layout: collectors are in `src/lib/github`, heuristics in `src/lib/classify`, the score in `src/lib/scoring`, and pages and API routes in `src/app`.

## Known limitations

- Integrations are read from **root** manifests only, so packages inside a monorepo are missed.
- "Test runs passed" counts runs, not test cases. GitHub doesn't expose test-case counts.
- Actions and test runs are all-time counts with no recency decay.
- Homepage URLs are not checked for reachability.
- Org-owned repos you contribute to count toward PRs and contributions, but not toward repos, apps or integrations.

## License

MIT
