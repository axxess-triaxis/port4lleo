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
and nothing else, and sends no data to PORT4LLEO. Private repositories are counted
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
