import { readFile } from 'node:fs/promises';

const portfolio = JSON.parse(await readFile(new URL('../data/portfolio.json', import.meta.url)));
const endpoint = 'https://am.jpmorgan.com/FundsMarketingHandler/historicalData?cusip=46654Q203&country=us&role=adv&userLoggedIn=false&language=en&version=9.14';
const response = await fetch(endpoint, {
  headers: { 'user-agent':'ATRAM-Growth-Compass-Target-DD/1.0' },
  redirect: 'follow',
  signal: AbortSignal.timeout(60000)
});
if (!response.ok) throw new Error(`JPM target history returned HTTP ${response.status}.`);
const data = await response.json();
const rows = data.historicalETFNAVMarketPriceList;
if (!Array.isArray(rows) || rows.length < 250) throw new Error('JEPQ history does not contain a usable daily NAV series.');

let peak = -Infinity;
let peakDate;
let maximum = { drawdown:0, peakDate, troughDate:peakDate };
for (const row of rows) {
  if (!Number.isFinite(row.navPrice)) throw new Error(`Invalid JEPQ NAV at ${row.date}.`);
  if (row.navPrice > peak) {
    peak = row.navPrice;
    peakDate = row.date;
  }
  const drawdown = (peak - row.navPrice) / peak * 100;
  if (drawdown > maximum.drawdown) maximum = { drawdown, peakDate, troughDate:row.date };
}

const stored = portfolio.drawdownModel.funds.find((fund) => fund.id === 'nasdaq');
if (!stored?.sourceIds?.includes('jepqHistory')) throw new Error('Nasdaq DD is not mapped to the official JEPQ strategy-proxy history source.');
if (Math.abs(stored.historical - maximum.drawdown) > 0.02) {
  throw new Error(`Stored JEPQ proxy DD ${stored.historical.toFixed(4)}% differs from current official monthly total-return MDD ${maximum.drawdown.toFixed(4)}%. Update and re-optimize before deployment.`);
}
console.log(`JEPQ strategy proxy ${rows.length}-day raw-NAV MDD ${maximum.drawdown.toFixed(4)}% (${maximum.peakDate} to ${maximum.troughDate}): verified; not distribution-adjusted.`);
