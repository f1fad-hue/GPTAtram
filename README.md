# ATRAM Growth Compass

Mobile-first, static research dashboard for three required PHP UITF classes:

- ATRAM Peso Money Market Fund - A PHP
- ATRAM Global Technology Feeder Fund - A PHP
- ATRAM Nasdaq Equity Income Feeder Fund - A PHP

## Model guardrails

- Macro sentiment: 1 bearish to 5 bullish, using ten non-overlapping portfolio drivers across 3, 6 and 12 months.
- Drawdown: exactly 60% authoritative underlying target-fund/ETF historical downside plus 40% forward-looking 10-year median DD for the same target vehicle. The standalone money-market UITF uses its own A PHP fund for both inputs because it has no target.
- Caps: rate 3.00-3.99 = 20%; rate 4.00-4.99 = 25%; rate 5.00 = 30%.
- Optimizer: maximum allocation-weighted net CAGR on a 5% grid, with every required fund at least 5% and total weight 100%.
- Net CAGR: gross 10-year scenario minus every ATRAM/operating and target-fund/ETF fee displayed in the official A PHP KIID.
- Monte Carlo: 10,000 reproducible monthly-lognormal paths over 120 months.

The Fidelity target input is its manager-published largest calendar-year loss and is explicitly labelled as a proxy, not an exact daily MDD. The JPM target input is monthly total-return MDD from manager data. Forecasts, correlations and forward medians are model assumptions, not promises.

## Verification and publishing

`npm test` validates authoritative-source retrieval, claim coverage, fees, optimizer optimality, allocation totals, macro arithmetic, DD formulas/caps, Monte Carlo configuration, monitoring records and code syntax.

GitHub Actions runs after each push, manually, and daily at 01:17 UTC (09:17 Manila). Failed verification blocks deployment and opens a GitHub issue. Successful verification writes a live monitoring timestamp and deploys GitHub Pages.

Live HTTPS site: `https://f1fad-hue.github.io/GPTAtram/`
