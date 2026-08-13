# ATRAM Growth Compass

Mobile-first, static research dashboard for three required PHP UITF classes:

- ATRAM Peso Money Market Fund - A PHP
- ATRAM Global Technology Feeder Fund - A PHP
- ATRAM Nasdaq Equity Income Feeder Fund - A PHP

## Model guardrails

- Macro sentiment: 1 bearish to 5 bullish, using twelve distinct portfolio drivers across 3, 6 and 12 months—the optimized coverage ceiling before signals become duplicates.
- Drawdown: only the independently seeded, 50,000-path simulated P50 10-year forward maximum drawdown. Historical maximum DD is displayed for context but has zero allocation weight. Nasdaq uses older U.S. JEPQ as the DD proxy; Money Market uses its own A PHP fund because it has no target.
- Caps: rate 3.00-3.99 = 20%; rate 4.00-4.99 = 25%; rate 5.00 = 30%.
- Optimizer: maximum allocation-weighted net CAGR on a 5% grid, with every required fund at least 5% and total weight 100%.
- Net CAGR: gross 10-year scenario minus every ATRAM/operating and target-fund/ETF fee displayed in the official A PHP KIID.
- Explicit target inputs: Fidelity 11.31% and Nasdaq UCITS 9.89%, both already net of their applicable target-level fee adjustment. The optimizer deducts the complete ATRAM A PHP wrapper fees and uses fully net 10.06% and 8.24%; Peso Money Market has no target and remains 3.47% net.
- Nasdaq role separation: the actual UCITS target IE000U9J8HX9 supplies the CAGR basis; U.S. JEPQ supplies only the longer-history DD proxy. The 8.24% net CAGR blends 30% of the target's official 18.15% annualized total return with 70% of JPM's 6.70% long-term U.S. large-cap assumption, then removes the non-embedded target fee and the complete ATRAM wrapper fee stack.
- Monte Carlo: 10,000 reproducible monthly-lognormal paths over 120 months.
- Look-through: the three required ATRAM funds and their official target/proxy vehicles are modeled; the portfolio has no direct-stock holdings, so no unsupported stock sleeve is invented.

The Fidelity historical context is the exact daily NAV maximum drawdown calculated from the manager's full official A-ACC-USD chart (LU1046421795): 31.66% from 28.71 on 19 February 2020 to 19.62 on 18 March 2020, across 3,203 observations. The Nasdaq historical context is JEPQ daily raw-NAV MDD from official JPM manager data and is explicitly labelled as not distribution-adjusted. Neither historical figure enters the allocation DD formula. Forward P50 DD is a reproducible monthly-lognormal model estimate: annual volatility is calibrated with 10,000 deterministic paths, then the median 10-year maximum drawdown is measured on an independent 50,000-path run. Forecasts, correlations and simulated percentiles are model assumptions, not promises.
For the Nasdaq sleeve, the older U.S.-listed JEPQ (CUSIP 46654Q203) supplies only the longer strategy-history DD proxy. The actual ATRAM target UCITS ETF (ISIN IE000U9J8HX9) exclusively supplies the fund-specific return history used in the CAGR model.

## Verification and publishing

`npm test` validates authoritative-source retrieval and link coverage, rejects unused registry entries, recomputes current official JEPQ raw-NAV DD, independently reproduces and sanity-checks the Monte Carlo distribution, and verifies claim coverage, fees, optimizer optimality, allocation totals, macro arithmetic, DD formulas/caps and monitoring records.

GitHub Actions runs after each push, manually, and daily at 01:17 UTC (09:17 Manila). Failed verification blocks deployment and opens a GitHub issue. Successful verification writes a live monitoring timestamp and deploys GitHub Pages.

Live HTTPS site: `https://f1fad-hue.github.io/GPTAtram/`
