---
name: fix-bounties
description: List PORT4LLEO fix bounties (PayPal-funded rewards for fixing Dependabot alerts) on repositories the user's linked account can access, read-only, with links to act on them on the website.
when_to_use: Use when the user asks which security-fix bounties are open, what bounties exist on their repos, or what they could fix and get paid for on PORT4LLEO.
argument-hint: "[repo-or-owner filter]"
---

List fix bounties. Optional filter: `$ARGUMENTS`

## Read-only, always

This skill only **lists** bounties. It never funds, claims, verifies, approves, cancels or pays one,
and it must not try: no tool here can, and money movements on PORT4LLEO need the user to act on the
website, with a human approving every payout. If the user asks to fund or claim a bounty, give them the
bounty's `url` and tell them to do it there.

## Run it

Call the plugin's MCP tool `remote_bounties`. It needs the plugin's optional `api_token` setting (a
`p4l_…` token from the user's PORT4LLEO dashboard, under "Claude plugin: link your account"). If the tool
says the plugin is not linked, explain how to link it and stop. Never ask the user to paste the token into
the chat.

The website checks access live against GitHub with the user's own sign-in. A private-repo bounty is
listed only while the user can see that repository through a PORT4LLEO installation. Public-repo
bounties that are funded and unclaimed are listed for everyone.

## Report

If the user gave a filter, keep only bounties whose `repo` contains it (case-insensitive).

Show a short table, highest severity first: repo, alert (`alertNumber`, linked to `alertUrl`), package,
severity, amount and currency, status, and the bounty `url`. Then:

- Mark rows where `role` is `funder` ("you funded") or `claimant` ("your claim").
- `funded` means open to claim. `claimed` and `verified` are already taken (show `claimantLogin` and
  `prUrl`).
- If the list is empty, say so and mention `reposChecked`. Zero accessible repos usually means the
  PORT4LLEO GitHub App isn't installed where the user expects.

To work on a funded alert locally, the user can run `port4lleo:governance-audit` on the repository to
see the alert in context. Claiming happens on the bounty's web page, with the merged PR's URL.
