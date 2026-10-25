---
name: governance-audit
description: Audit a GitHub org or user's repositories with PORT4LLEO's governance checks - open Dependabot alerts, untested deploys, stale PRs, unresolved-conflict merges, possible unmasked PII, and repo sprawl.
when_to_use: Use when the user asks to audit, health-check or review the security or governance posture of a GitHub org, user or specific repos with PORT4LLEO.
argument-hint: <org-or-user> [--repos a,b] [--max-repos N]
---

Run a PORT4LLEO governance audit for: `$ARGUMENTS`

The first word is the GitHub org or user. `--repos` limits the audit to a comma-separated list of repo names. Without it, the 25 most recently pushed non-archived repos are audited (`--max-repos` changes that). If no account was given, ask for one before running anything.

## Before running

The audit runs on this machine with PORT4LLEO's own check code, through the user's `gh` login (or `GITHUB_TOKEN`). It needs Node.js 20 or newer.

- If `node --version` fails or is below 20, tell the user to install Node 20+ and stop.
- If `gh auth status` fails and `GITHUB_TOKEN` is unset, tell the user to run `gh auth login` themselves, and stop.
- Reading Dependabot alerts needs repo admin rights or the `security_events` scope. Without it, those repos come back as "not readable", not as clean.

## Run it

An org of 25 repos takes a few minutes. Tell the user it is running, then:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/port4lleo.mjs" audit <account> [--repos a,b] --log-dir "${CLAUDE_PLUGIN_DATA}/logs"
```

The output is the summary plus a `logged` path to the full report (per-repo findings). Read that file for the details you report.

## Report the findings

Summarize per repo, most serious first. Keep these three Dependabot states separate, because they mean different things:

- `accessDenied`: the token can't read alerts. Unknown, not clean.
- `disabled`: alerts were never turned on. A governance gap, not clean.
- Zero findings with neither flag: genuinely clean.

Then:

- **Untested deploys**: recent default-branch commits with no test run, or only failing ones (the last 10 commits per repo; bot and skip-CI commits are left out on purpose).
- **Stale PRs** open more than 10 days, and **conflict-resolution merges** still carrying git's `Conflicts:` marker (a lower bound).
- **PII**: regex candidates for human review, not confirmed leaks. Only ever repeat the masked excerpt from the report, never try to recover the real value.
- **Sprawl**: near-duplicate repo names, or more than 15 active repos.
- Any check with an `error`: say which check couldn't run, rather than treating it as passed.

If nothing is concerning, say so plainly. Don't manufacture findings.
