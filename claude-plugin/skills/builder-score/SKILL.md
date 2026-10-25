---
name: builder-score
description: Compute a GitHub user's PORT4LLEO Builder Score (0-1000, tier Explorer to Legend) from live GitHub data, with every metric's points and where each number comes from.
when_to_use: Use when the user asks for a Builder Score, a GitHub portfolio summary, "how do I/they ship", or to compare builders on GitHub.
argument-hint: <github-login> [--include-private]
---

Compute the Builder Score for: `$ARGUMENTS`

The first word is the GitHub login. If none was given, ask for one before running anything.

## Before running

The score is computed on this machine by PORT4LLEO's own scoring code, using the GitHub API through the user's `gh` login (or `GITHUB_TOKEN`). It needs Node.js 20 or newer.

- If `node --version` fails or is below 20, tell the user to install Node 20+ and stop.
- If `gh auth status` fails and `GITHUB_TOKEN` is unset, tell the user to run `gh auth login` themselves, and stop.

Pass `--include-private` only when the user is scoring their own account and asks for private repositories to count. Private repos are counted, never named.

## Run it

Collecting metrics takes up to a minute for an active account. Tell the user it is running, then:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/port4lleo.mjs" score <login> [--include-private] --log-dir "${CLAUDE_PLUGIN_DATA}/logs"
```

## Report the result

Lead with the score and tier, then the five categories as a small table (points / max). Then call out:

- The two or three metrics contributing most, and the biggest gaps against their caps.
- Any metric with `unavailable: true` (for example Actions disabled). It counted as 0; say so rather than implying the builder scored zero there.
- Anything in `warnings`, such as an invalid `portfolio.yml` that was ignored.

Be precise about provenance. Test runs passed, apps built, apps deployed, hackathons and prototypes are **inferred** from repository data, and entries from `portfolio.yml` are **self-declared** (counted at half weight). Never present inferred or self-declared counts as verified facts.

This local score can differ from the PORT4LLEO website: the website may include private repos (where its GitHub App is installed on the user's own account) and dashboard-edited corrections, which aren't visible here. If the numbers differ, say that rather than calling either one wrong.

The formula, weights and caps are in the score result and documented at https://port4leo-sigma.vercel.app/scoring.
