# ATRAM Growth Compass

Mobile-first, light-theme research dashboard for four required Philippine ATRAM funds:

- ATRAM Peso Money Market Fund - A PHP
- ATRAM Global Technology Feeder Fund - A PHP
- ATRAM Nasdaq Equity Income Feeder Fund - A PHP
- ATRAM Asia Equity Opportunity Feeder Fund - PHP

## Model guardrails

- Macro: a 1 bearish to 5 bullish score to two decimals using 12 distinct broad and portfolio-correlated drivers over 3, 6 and 12 months. U.S., Europe and Asia are ranked from mapped regional drivers.
- Drawdown: historical maximum drawdown only, aggregated as the simple allocation-weighted sum. Global Technology uses Fidelity A-ACC-USD; Nasdaq uses older U.S. JEPQ as a disclosed raw-NAV proxy; Asia uses JPMorgan Asia Equity Dividend (acc) USD; Money Market uses its own NAV because no target exists. There is no forward DD or diversification credit.
- Caps: rate 3.00-3.99 = 20%; rate 4.00-4.99 = 25%; rate 5.00 = 30%. The optimizer keeps a one-percentage-point operational reserve below each user cap.
- Macro cushion: the Money Market minimum is the 5%-grid ceiling of `5% + 10% x (5 - macro rate)`, bounded from 5% to 25%. This is a secondary guardrail; it cannot override the DD limit or the robust growth objective. The current 3.54 rate produces a 20% minimum.
- Optimizer: exhaustive maximin search across the documented base, return-stress and fee/forecast-miss cases on a 5% grid after applying the macro cushion. Every required fund is 5%-60%; ties prefer higher base CAGR, then lower historical DD.
- Co-timed portfolio risk: CDaR is diagnostic-only and excluded from optimization until synchronized common-date official NAV series for all four sleeves can be reproduced by the weekend pipeline.
- Fully net CAGR inputs: Money Market 3.47%, Global Technology 9.36%, Nasdaq Equity Income 8.24%, and Asia Equity Opportunity 5.75%. Each card separates ATRAM fees from target fees.
- Nasdaq role separation: actual UCITS target IE000U9J8HX9 supports CAGR; U.S. JEPQ CUSIP 46654Q203 supplies historical DD only.
- Asia role separation: exact C (div) USD target HK0000615358 supplies the 0.85% target fee; the same target fund's accumulating USD share HK0000151818 supplies distribution-clean historical DD.
- Monte Carlo: 10,000 reproducible monthly-lognormal return paths over 120 months; it is not used for historical DD.

## Verification and publishing

`npm test` validates the four-fund schema, complete fee math, macro and regional scores, DD inputs, robust exhaustive optimizer, Monte Carlo, source/claim registries, and current official JPMorgan target histories. The authoritative audit rejects unknown or unused sources.

GitHub Actions runs after each main-branch push, manually, and every Sunday at 09:30 Australia/Brisbane. A failed check blocks deployment and opens a monitoring issue. A successful run writes the live verification timestamp and deploys GitHub Pages.

Live HTTPS site: https://f1fad-hue.github.io/GPTAtram/
