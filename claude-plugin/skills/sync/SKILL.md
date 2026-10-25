---
name: sync
description: Read the Builder Score stored on the user's linked PORT4LLEO account, or ask the PORT4LLEO website to re-sync it from GitHub.
when_to_use: Use when the user asks for "my PORT4LLEO score", what their public portfolio shows, when they last synced, or to refresh / re-sync their PORT4LLEO portfolio.
argument-hint: "[status|resync]"
---

Linked PORT4LLEO account: `$ARGUMENTS` (default: `status`).

## How it works

This skill talks to the PORT4LLEO website, not to GitHub. It uses the plugin's own MCP tools:

- `remote_portfolio`: the stored score, tier, last sync time and public portfolio URL.
- `remote_resync`: asks the website to re-collect the user's metrics on its server and store a new score.
  The website does the collecting; nothing computed on this machine is sent.

Both tools need the plugin's optional `api_token` setting: a `p4l_…` token the user creates on their
PORT4LLEO dashboard under "Claude plugin: link your account". If a tool answers that the plugin is not
linked, tell the user how to create a token and set it in the plugin's settings, and stop. Never ask
the user to paste the token into the chat.

## Status (default)

Call `remote_portfolio` and report the score and tier, when the score was computed, the last sync time
and the portfolio URL. If `score` is null, the account has no stored score yet: suggest a re-sync.
Mention `isPublic: false` if set (the public page then shows nothing to others).

## Resync

Call `remote_resync` only when the user asked for a re-sync. It is allowed once an hour (the same
limit as the dashboard's "Sync now"); `resyncAvailableAt` from `remote_portfolio` says when. On a
"Synced recently" answer, tell the user when they can try again rather than retrying. A sync can take
a few minutes; tell the user it is running.

Report the new score and tier, and list any `warnings` (for example an ignored `portfolio.yml`).

## Comparing with a local score

`port4lleo:builder-score` computes a score on this machine from live GitHub data. The website's stored
score can differ: it may count private repositories where its GitHub App is installed on the user's
account, plus dashboard-edited corrections. If both are shown, explain the difference rather than
calling either one wrong.
