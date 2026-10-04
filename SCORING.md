# Builder Score

The score runs from 0 to 1000 and is a pure function of the collected metrics: [`src/lib/scoring/score.ts`](src/lib/scoring/score.ts). Weights and caps live in [`src/lib/scoring/weights.ts`](src/lib/scoring/weights.ts). Forks can change them; the tests only require the weights to sum to 100.

## Formula

```
normalized(m) = min(1, ln(1 + x_m) / ln(1 + cap_m))
score         = round( Σ normalized(m) × weight_m × 10 )
```

- **Log scaling** gives diminishing returns. The 1st deployed app is worth far more than the 31st.
- **Caps** stop farming. Past a metric's cap, more of it adds nothing.
- **Recency.** Merged PRs and contributions are bucketed by calendar year and weighted by `0.5 ^ (currentYear − year)`, a 1-year half-life. Everything else is all-time.
- **Self-declared** entries from `portfolio.yml` or the dashboard count as 0.5 each.
- **Prototypes include every hackathon entry** (weekend builds are prototypes by nature). A repo that is both counts once in Prototypes, but also counts in Hackathons.
- Unavailable metrics, for example when Actions is disabled, count as 0 and are flagged in the UI.

## Weights

| Category | Metric | Weight | Cap |
|---|---|---:|---:|
| Shipping (35) | Apps deployed | 15 | 30 |
| | Apps built | 10 | 40 |
| | Vercel projects | 5 | 30 |
| | Prototypes | 5 | 30 |
| Collaboration (25) | PRs merged | 15 | 500 |
| | Contributions | 10 | 5000 |
| Engineering rigor (20) | Test runs passed | 12 | 2000 |
| | Actions runs | 8 | 5000 |
| Breadth (12) | Repositories | 4 | 150 |
| | Projects | 3 | 20 |
| | Integrations (distinct) | 5 | 25 |
| Hackathons (8) | Hackathons | 8 | 15 |

## Tiers

Explorer 0–199 · Builder 200–399 · Shipper 400–599 · Architect 600–799 · Legend 800+

## Why these weights

Shipping carries the most weight because the product's premise is "what did you ship", not "how much did you type". Engineering rigor (tests, CI) comes next, so a builder who ships with tests outranks one who ships without them at the same volume. Raw activity (contributions) is deliberately capped and decayed, because it is the easiest signal to inflate.
