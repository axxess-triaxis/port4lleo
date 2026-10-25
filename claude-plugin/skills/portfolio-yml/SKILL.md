---
name: portfolio-yml
description: Draft, check or explain a PORT4LLEO portfolio.yml - the self-declared corrections (hackathons, prototypes, apps, exclusions) that GitHub can't see on its own.
when_to_use: Use when the user wants to add a hackathon, prototype or app to their PORT4LLEO portfolio, exclude a repo from it, or check their portfolio.yml.
argument-hint: [validate <file> | show <login>]
---

Help with a PORT4LLEO `portfolio.yml`: `$ARGUMENTS`

## What the file is

Some work is invisible to GitHub, such as a hackathon entered from a private repo. PORT4LLEO reads corrections from `portfolio.yml` in the user's `<login>/<login>` profile repository (or pasted into the website's dashboard). Every entry is labelled **self-declared** on the portfolio and counts at half weight in the Builder Score, so encourage a link (`url`) or a repo for each entry.

The format:

```yaml
hackathons:
  - name: Smart India Hackathon 2025
    url: https://example.com/my-entry
    repo: me/sih-entry        # optional
prototypes:
  - name: Voice triage prototype
    url: https://example.com/demo
    note: Built in a weekend with a pilot clinic   # optional, up to 280 characters
apps:
  - name: Field survey app
    url: https://app.example.com
exclude:
  - me/old-fork               # repos to leave out of the portfolio
```

## Commands

Needs Node.js 20 or newer. `show` also needs the user's `gh` login (or `GITHUB_TOKEN`).

- Check a local file:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/port4lleo.mjs" portfolio validate <file>`
- Fetch and check the one on GitHub:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/port4lleo.mjs" portfolio show <login>`

## How to help

- To **draft** entries, ask the user for the real name and a link for each. Never invent hackathons, prototypes or URLs.
- Write the draft to a file and run `validate` on it before suggesting they commit it. If it fails, fix what the error names and validate again.
- Committing the file to the user's profile repository is their action. Show the final YAML and say where it goes (`<login>/<login>/portfolio.yml`). Commit or push it only if they ask you to, and only to their own profile repo.
- After it's on GitHub, the website picks it up on the next sync; the `builder-score` skill reads it immediately.
