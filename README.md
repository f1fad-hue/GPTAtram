# ATRAM Growth Compass

Mobile-first, static portfolio-research dashboard for the three specified ATRAM funds.

## Guardrails

- The 4.42/5 active sentiment score maps to a 25% composite-drawdown cap.
- The net-CAGR values are model scenarios, never historical claims or investment promises.
- A fund with less than ten years of history is labelled as such. The Nasdaq fund launched in 2026, so it cannot have a 10-year observed CAGR.
- `npm test` validates allocation totals, score ranges, drawdown caps, relevance scores, source availability, and static build requirements.

## Daily automation

GitHub Actions runs daily at 01:17 UTC, after each push, or manually. It retrieves only the sources in `data/source-registry.json`, verifies every factual claim has an approved authoritative citation in `data/claim-registry.json`, validates model guardrails, checks code syntax/static files, stores an audit report for 90 days, then redeploys GitHub Pages.

The automation never silently invents, overwrites, or treats a forecast as factual data. A new factual value must be entered only after the latest official disclosure is reviewed; the daily audit then validates its approved source and evidence trail.

The dashboard is immediately usable at `https://cdn.jsdelivr.net/gh/f1fad-hue/GPTAtram@main/index.html`.

For the first-party GitHub Pages URL, enable **Settings → Pages → Build and deployment → GitHub Actions** once. The next daily workflow run will then deploy `https://f1fad-hue.github.io/GPTAtram/` automatically.
