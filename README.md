# ATRAM Growth Compass

Mobile-first, static portfolio-research dashboard for the three specified ATRAM funds.

## Guardrails

- The 4.42/5 active sentiment score maps to a 25% composite-drawdown cap.
- The net-CAGR values are model scenarios, never historical claims or investment promises.
- A fund with less than ten years of history is labelled as such. The Nasdaq fund launched in 2026, so it cannot have a 10-year observed CAGR.
- `npm test` validates allocation totals, score ranges, drawdown caps, relevance scores, source availability, and static build requirements.

## Daily automation

GitHub Actions runs daily at 01:17 UTC, after each push, or manually. It validates the sources and all local model guardrails then redeploys GitHub Pages. It does not silently change economic assumptions: a human must update `data/portfolio.json` only after reviewing new primary-source disclosures.

The Page URL will be `https://f1fad-hue.github.io/GPTAtram/` after GitHub Pages is enabled and the first workflow completes.
