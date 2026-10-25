---
name: daily-report
description: Produce PORT4LLEO's daily report for a GitHub account - only on days with GitHub activity - with the Builder Score and a governance audit, logged as dated files and one line per run in runs.jsonl.
when_to_use: Use when the user asks for today's (or a given day's) PORT4LLEO report, a daily log of their GitHub account, or when a scheduled task runs the daily report.
argument-hint: <account> [--date YYYY-MM-DD]
---

Run the PORT4LLEO daily report for: `$ARGUMENTS`

The first word is the GitHub account. `--date` picks a past day (local calendar date); the default is today. If no account was given, ask for one.

Needs Node.js 20 or newer and the user's `gh` login (or `GITHUB_TOKEN`). If either is missing, say what to install or run, and stop.

## Run it

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/port4lleo.mjs" daily <account> [--date YYYY-MM-DD] --log-dir "${CLAUDE_PLUGIN_DATA}/logs"
```

It first checks the account's GitHub events for that day (including private events when the account is the token owner).

- **No activity:** it stops and logs a "skipped" line. Report that in one sentence and do nothing else.
- **Activity:** it computes the Builder Score (private repos counted, never named) and runs the governance audit, and writes everything to `${CLAUDE_PLUGIN_DATA}/logs/<date>/daily-<account>.json`.

## Write the report

Read the logged file and write a short report for that day. Save it as `${CLAUDE_PLUGIN_DATA}/logs/<date>/report.md`, and show it to the user:

1. **Activity:** event count by type, and the repos touched.
2. **Builder Score:** score and tier. If an earlier report exists in `logs/`, compare it with the most recent one and give the change.
3. **Governance:** the audit headline, then only what changed or needs action. Keep the Dependabot states separate ("alerts off" and "not readable" are never clean), and only ever show masked PII excerpts.
4. **Follow-ups:** at most three concrete next actions, each pointing at a repo or PR.

Facts only from the logged data. Don't fill gaps with guesses; if a check errored, say so.

## History

`${CLAUDE_PLUGIN_DATA}/logs/runs.jsonl` has one line per run (date, command, headline, file). Use it when the user asks how things changed over time.
