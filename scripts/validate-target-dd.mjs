import { readFile } from 'node:fs/promises';

const portfolio = JSON.parse(await readFile(new URL('../data/portfolio.json', import.meta.url)));
const endpoint = 'https://am.jpmorgan.com/FundsMarketingHandler/historicalData?cusip=IE000U9J8HX9&country=gb&role=adv&userLoggedIn=false&language=en';
const response = await fetch(endpoint, {
  headers: { 'user-agent':'ATRAM-Growth-Compass-Target-DD/1.0' },
  redirect: 'follow',
  signal: AbortSignal.timeout(60000)
});
if (!response.ok) throw new Error(`JPM target history returned HTTP ${response.status}.`);
const data = await response.json();
const rows = data.performanceDataForChart;
if (!Array.isArray(rows) || rows.length < 12) throw new Error('JPM target history does not contain a usable monthly total-return series.');

let value = 100;
let peak = 100;
let peakDate = 'inception';
let maximum = { drawdown:0, peakDate, troughDate:peakDate };
for (const row of rows) {
  if (!Number.isFinite(row.cumulativeNoLoadPercentage)) throw new Error(`Invalid JPM total return at ${row.date}.`);
  value *= 1 + row.cumulativeNoLoadPercentage;
  if (value > peak) {
    peak = value;
    peakDate = row.date;
  }
  const drawdown = (peak - value) / peak * 100;
  if (drawdown > maximum.drawdown) maximum = { drawdown, peakDate, troughDate:row.date };
}

const stored = portfolio.drawdownModel.funds.find((fund) => fund.id === 'nasdaq');
if (!stored?.sourceIds?.includes('jpmorganHistory')) throw new Error('Nasdaq DD is not mapped to the official JPM target-history source.');
if (Math.abs(stored.historical - maximum.drawdown) > 0.02) {
  throw new Error(`Stored JPM target DD ${stored.historical.toFixed(4)}% differs from current official monthly total-return MDD ${maximum.drawdown.toFixed(4)}%. Update and re-optimize before deployment.`);
}
console.log(`JPM target ETF ${rows.length}-month total-return MDD ${maximum.drawdown.toFixed(4)}% (${maximum.peakDate} to ${maximum.troughDate}): verified.`);
