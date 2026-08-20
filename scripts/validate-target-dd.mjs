import { readFile } from 'node:fs/promises';

const portfolio = JSON.parse(await readFile(new URL('../data/portfolio.json', import.meta.url)));
const stored = Object.fromEntries(portfolio.drawdownModel.funds.map((fund) => [fund.id,fund]));
const endpoints = [
  { id:'nasdaq', label:'JEPQ raw NAV proxy', url:'https://am.jpmorgan.com/FundsMarketingHandler/historicalData?cusip=46654Q203&country=us&role=adv&userLoggedIn=false&language=en&version=9.14', field:'historicalETFNAVMarketPriceList', value:'navPrice', source:'jepqHistory', minimum:250 },
  { id:'asia', label:'JPM Asia Equity Dividend (acc) USD target', url:'https://am.jpmorgan.com/FundsMarketingHandler/historicalData?cusip=HK0000151818&country=hk&role=adv&userLoggedIn=false&language=en&version=9.14', field:'historicalNAVList', value:'navPrice', source:'jpmAsiaHistory', minimum:1000 }
];

for (const target of endpoints) {
  const response = await fetch(target.url,{headers:{'user-agent':'ATRAM-Growth-Compass-Target-DD/2.0'},redirect:'follow',signal:AbortSignal.timeout(60000)});
  if (!response.ok) throw new Error(`${target.label} returned HTTP ${response.status}.`);
  const payload = await response.json(); const rows = payload[target.field];
  if (!Array.isArray(rows) || rows.length < target.minimum) throw new Error(`${target.label} does not contain a usable daily NAV series.`);
  let peak=-Infinity; let peakDate; let maximum={drawdown:0};
  for (const row of rows) {
    const value=Number(row[target.value]); if (!Number.isFinite(value)) throw new Error(`${target.label}: invalid NAV at ${row.date}.`);
    if (value>peak) { peak=value; peakDate=row.date; }
    const drawdown=(peak-value)/peak*100;
    if (drawdown>maximum.drawdown) maximum={drawdown,peakDate,troughDate:row.date};
  }
  if (!stored[target.id]?.sourceIds?.includes(target.source)) throw new Error(`${target.id} DD is not mapped to ${target.source}.`);
  if (Math.abs(stored[target.id].historical-maximum.drawdown)>.02) throw new Error(`Stored ${target.label} DD ${stored[target.id].historical.toFixed(4)}% differs from current official MDD ${maximum.drawdown.toFixed(4)}%. Re-optimize before deployment.`);
  console.log(`${target.label}: ${rows.length} records, MDD ${maximum.drawdown.toFixed(4)}% (${maximum.peakDate} to ${maximum.troughDate}) verified.`);
}
