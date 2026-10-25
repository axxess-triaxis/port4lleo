# PORT4LLEO for Claude

PORT4LLEO as a Claude plugin: score GitHub builders and audit repositories from Claude
Code, with the same code the [PORT4LLEO website](https://port4leo-sigma.vercel.app) runs.

## Skills

| Skill | What it does |
|---|---|
| `port4lleo:builder-score` | Builder Score (0–1000) for any GitHub login, with each metric's points, cap and source (native, inferred or self-declared) |
| `port4lleo:governance-audit` | Audits an org or user: Dependabot alerts (with "alerts off" and "not readable" kept apart from clean), untested deploys, stale PRs, conflict-resolution merges, possible PII (masked), repo sprawl |
| `port4lleo:portfolio-yml` | Drafts and validates `portfolio.yml`, the self-declared corrections for things GitHub can't see |
| `port4lleo:daily-report` | On days with GitHub activity, runs the score and the audit, writes a dated report, and appends one line to `runs.jsonl`; on quiet days it logs a skip |
| `port4lleo:sync` | With a linked account: reads the score stored on the PORT4LLEO website, or asks the website to re-sync it (once an hour) |

## Link your PORT4LLEO account (optional)

Everything above works without an account. To also read your stored score and trigger a
re-sync from Claude:

1. Sign in at the [PORT4LLEO website](https://port4leo-sigma.vercel.app), open the
   dashboard, and under **Claude plugin: link your account** press **Create token**.
   The `p4l_…` token is shown once.
2. Set it as the plugin's `api_token` option when Claude Code asks on enabling the
   plugin (it is stored in your system's credential store, not in `settings.json`).

The token only lets the plugin read your stored score and ask the website to re-sync,
at most 30 requests per 10 minutes. It can't change settings, and the plugin never funds,
claims or pays bounties; those stay on the website with a human approving. Revoke a token
on the dashboard at any time.

Outside Claude Code, the same calls work from the script with environment variables:

```bash
PORT4LLEO_TOKEN=p4l_... node claude-plugin/scripts/port4lleo.mjs remote portfolio
```

## Install

In Claude Code:

```
/plugin marketplace add axxess-triaxis/port4lleo
/plugin install port4lleo@port4lleo
```

Requirements: Node.js 20+, and a GitHub login through the `gh` CLI (`gh auth login`)
or a `GITHUB_TOKEN`. In claude.ai and Cowork, the skills need Node available in the
environment that runs them.

## Privacy

Everything runs on your machine. The plugin calls the GitHub API with your own token
and nothing else, and sends no data to PORT4LLEO, unless you link an account: then the
`sync` skill sends your PORT4LLEO token (and nothing else) to the PORT4LLEO website. Private repositories are counted
only when you score your own account with `--include-private`, and are never named.
PII findings are stored masked (first two and last two characters only).

Reports and the run log are written under the plugin's data directory
(`~/.claude/plugins/data/port4lleo-port4lleo/logs/`), which Claude Code removes when
you uninstall the plugin.

## How it's built

`scripts/port4lleo.mjs` is generated: `scripts/build-plugin.mjs` bundles
[`src/plugin/cli.ts`](../src/plugin/cli.ts) together with the website's collector,
scoring, overrides and governance modules into one dependency-free file. CI fails if the
committed bundle is out of date. To rebuild after changing any of that code:

```bash
node scripts/build-plugin.mjs
```

A local score can differ from the website's: the website may also count private repos
(where its GitHub App is installed on your account) and dashboard-edited corrections.
