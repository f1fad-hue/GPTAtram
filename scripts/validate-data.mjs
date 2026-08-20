import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/portfolio.json', import.meta.url)));
const errors = [];
const fail = (message) => errors.push(message);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const close = (left, right, tolerance = 0.011) => Math.abs(left - right) <= tolerance;
const requiredIds = ['money','tech','nasdaq','asia'];
const allocation = data.portfolio.allocation;
const ids = allocation.map((item) => item.id);

if (ids.length !== 4 || new Set(ids).size !== 4 || !requiredIds.every((id) => ids.includes(id))) fail('Allocation must contain all four required funds exactly once.');
if (sum(allocation.map((item) => item.weight)) !== 100 || allocation.some((item) => item.weight < 5 || item.weight % 5)) fail('Allocation must total 100%, include every fund at 5% or more and use the 5% grid.');
if (!allocation.find((item) => item.id === 'asia')?.name.includes('Asia Equity Opportunity')) fail('The Asia Equity Opportunity fund is required.');

if (data.fundModels.length !== 4 || new Set(data.fundModels.map((fund) => fund.id)).size !== 4) fail('Four unique fee-adjusted CAGR models are required.');
const modelById = Object.fromEntries(data.fundModels.map((fund) => [fund.id, fund]));
for (const id of requiredIds) {
  const fund = modelById[id];
  if (!fund) { fail(`${id}: missing fund model.`); continue; }
  const afterTarget = fund.targetLevelCagr ?? fund.grossCagr;
  if (id === 'money' ? fund.targetLevelCagr !== null : !close(fund.targetLevelCagr, fund.grossCagr - fund.targetFee, 1e-9)) fail(`${id}: target-level CAGR math is wrong.`);
  if (!close(fund.netCagr, afterTarget - fund.wrapperFee, 1e-9)) fail(`${id}: fully net CAGR math is wrong.`);
  if (!fund.forecastUse || !fund.feeBasis || !fund.sourceIds?.length) fail(`${id}: fee/forecast basis and sources are required.`);
}
if (!close(modelById.money.netCagr,3.47,1e-9) || !modelById.money.sourceIds.includes('atramMoneyKiid')) fail('Money Market must retain the verified 3.47% fully net input.');
if (!close(modelById.tech.netCagr,9.36,1e-9) || !close(modelById.tech.targetFee,1.89,1e-9) || !modelById.tech.sourceIds.includes('fidelity')) fail('Technology must use 9.36% net CAGR and Fidelity 1.89% OCF.');
if (!close(modelById.nasdaq.netCagr,8.24,1e-9) || !modelById.nasdaq.returnBasis?.includes('IE000U9J8HX9') || modelById.nasdaq.sourceIds.includes('jepqHistory')) fail('Nasdaq CAGR must be 8.24%, use the actual UCITS target and exclude JEPQ history.');
if (!close(modelById.asia.grossCagr,7.90,1e-9) || !close(modelById.asia.targetFee,.85,1e-9) || !close(modelById.asia.wrapperFee,1.30,1e-9) || !close(modelById.asia.netCagr,5.75,1e-9) || !modelById.asia.feeBasis?.includes('HK0000615358')) fail('Asia must use 7.90% LTCMA less 0.85% target TER and 1.30% ATRAM fees = 5.75%.');

const macro = data.macroModel;
if (macro.maxDistinctDrivers !== 12 || data.drivers.length !== 12) fail('The macro matrix must use exactly 12 distinct portfolio-relevant drivers.');
if (new Set(data.drivers.map((driver) => driver.id)).size !== 12 || new Set(data.drivers.map((driver) => driver.channel)).size !== 12) fail('Macro IDs and transmission channels must be unique.');
if (!close(sum(Object.values(macro.horizonWeights)),1,1e-9) || !close(sum(Object.values(macro.driverWeights)),1,1e-9)) fail('Macro horizon and driver weights must each total 100%.');
for (const driver of data.drivers) {
  if (!['Broad macro','Correlated portfolio'].includes(driver.category) || !driver.region || !driver.channel || !driver.relevance || !driver.sourceIds?.length) fail(`${driver.id}: classification, relevance and sources are required.`);
  if (driver.values?.length !== 3 || driver.values.some((value) => value < 1 || value > 5)) fail(`${driver.id}: 3/6/12-month scores must be 1-5.`);
  if (!(driver.id in macro.driverWeights)) fail(`${driver.id}: missing model weight.`);
  const impact = driver.allocationImpact;
  if (!impact || Object.keys(impact).sort().join(',') !== requiredIds.slice().sort().join(',') || requiredIds.some((id) => !Number.isInteger(impact[id]) || impact[id] < -2 || impact[id] > 2) || requiredIds.every((id) => impact[id] === 0)) fail(`${driver.id}: all four -2 to +2 fund sensitivities are required.`);
}
const h = macro.horizonWeights;
const macroRate = data.drivers.reduce((total, driver) => total + (driver.values[0]*h.threeMonth + driver.values[1]*h.sixMonth + driver.values[2]*h.twelveMonth)*macro.driverWeights[driver.id],0);
if (!close(macroRate,data.portfolio.rate) || data.portfolio.rate !== Number(data.portfolio.rate.toFixed(2))) fail(`Macro rate must match and display to two decimals; calculated ${macroRate.toFixed(4)}.`);
const cap = macroRate < 4 ? 20 : macroRate < 5 ? 25 : 30;
const band = macroRate < 4 ? '3.00-3.99' : macroRate < 5 ? '4.00-4.99' : '5.00';
if (data.portfolio.drawdownCap !== cap || data.portfolio.rateBand !== band) fail('Stored rating band or DD cap does not match the macro rate.');

if (data.regionalRankings.length !== 3 || new Set(data.regionalRankings.map((row) => row.region)).size !== 3 || !['US','Europe','Asia'].every((region) => data.regionalRankings.some((row) => row.region === region))) fail('Regional rankings must cover US, Europe and Asia exactly once.');
for (const region of data.regionalRankings) {
  const drivers = region.driverIds.map((id) => data.drivers.find((driver) => driver.id === id));
  if (drivers.some((driver) => !driver) || !region.rationale || region.values?.length !== 3) { fail(`${region.region}: invalid regional ranking basis.`); continue; }
  const denominator = sum(drivers.map((driver) => macro.driverWeights[driver.id]));
  const calculated = [0,1,2].map((index) => sum(drivers.map((driver) => driver.values[index]*macro.driverWeights[driver.id]))/denominator);
  if (calculated.some((value,index) => !close(value,region.values[index]))) fail(`${region.region}: regional horizon score does not match its mapped drivers.`);
  const score = region.values[0]*h.threeMonth + region.values[1]*h.sixMonth + region.values[2]*h.twelveMonth;
  if (!close(score,region.score)) fail(`${region.region}: regional composite is wrong.`);
}
const ranked = [...data.regionalRankings].sort((a,b) => b.score-a.score);
if (ranked.some((row,index) => row.rank !== index+1)) fail('Regional ranks must follow composite scores.');

const dd = data.drawdownModel;
if (dd.basis !== 'historicalMaximumDrawdownOnly' || dd.aggregation !== 'simpleWeightedSum' || /forward|correlation|diversification/i.test(JSON.stringify(dd).replaceAll('No forward-looking DD, blend, correlation adjustment, or diversification credit is used.',''))) fail('DD may use historical maximum drawdown and simple weighted sum only.');
if (dd.funds.length !== 4 || new Set(dd.funds.map((fund) => fund.id)).size !== 4) fail('Four historical maximum-DD inputs are required.');
const ddById = Object.fromEntries(dd.funds.map((fund) => [fund.id,fund]));
if (!close(ddById.money.historical,.1932,1e-6) || !ddById.money.historicalBasis.includes('No target fund exists')) fail('Money Market must use its own official NAV because no target exists.');
if (!close(ddById.tech.historical,31.6614,1e-6) || !ddById.tech.historicalBasis.includes('LU1046421795')) fail('Technology DD must use the Fidelity target.');
if (!close(ddById.nasdaq.historical,21.6911,1e-6) || !ddById.nasdaq.historicalBasis.includes('46654Q203')) fail('Nasdaq DD must use the documented JEPQ historical proxy.');
if (!close(ddById.asia.historical,35.9769,1e-6) || !ddById.asia.historicalBasis.includes('HK0000151818') || !ddById.asia.historicalBasis.includes('accumulating')) fail('Asia DD must use the JPM target accumulating USD share history.');
if (dd.funds.some((fund) => !fund.historicalBasis || !fund.historicalMetric || !fund.sourceIds?.length)) fail('Every DD input needs a basis, metric and sources.');
const ddPercent = Object.fromEntries(dd.funds.map((fund) => [fund.id,fund.historical]));
const cagrPercent = Object.fromEntries(data.fundModels.map((fund) => [fund.id,fund.netCagr]));
const portfolioDd = (weights) => sum(weights.map((weight,index) => weight/100*ddPercent[ids[index]]));
const portfolioCagr = (weights) => sum(weights.map((weight,index) => weight/100*cagrPercent[ids[index]]));
function optimize(limit) {
  let best;
  for (let a=5;a<=85;a+=5) for (let b=5;b<=85;b+=5) for (let c=5;c<=85;c+=5) {
    const d=100-a-b-c;
    if (d<5 || d%5) continue;
    const weights=[a,b,c,d]; const loss=portfolioDd(weights); const growth=portfolioCagr(weights);
    if (loss<=limit+1e-12 && (!best || growth>best.growth+1e-12)) best={weights,loss,growth};
  }
  return best;
}
const activeWeights = allocation.map((item) => item.weight);
const activeDd = portfolioDd(activeWeights); const activeCagr = portfolioCagr(activeWeights); const activeBest=optimize(cap);
if (activeBest.weights.some((value,index) => value!==activeWeights[index])) fail(`Active allocation is not optimal; expected ${activeBest.weights.join('/')}.`);
if (!close(activeDd,data.portfolio.drawdown,1e-6) || !close(activeCagr,data.portfolio.netCagrForecast)) fail('Stored portfolio DD or CAGR is inconsistent.');
if (activeDd>cap) fail('Active allocation exceeds its DD cap.');
const caps = new Map([['3.00-3.99',20],['4.00-4.99',25],['5.00',30]]);
if (data.scenarios.length!==3) fail('Exactly three rate scenarios are required.');
for (const scenario of data.scenarios) {
  const expectedCap=caps.get(scenario.rate); const best=optimize(expectedCap);
  if (!expectedCap || scenario.cap!==expectedCap || best.weights.some((value,index)=>value!==scenario.allocation[index]) || !close(best.loss,scenario.dd) || !close(best.growth,scenario.netCagr)) fail(`${scenario.rate}: scenario is not the maximum-growth feasible solution.`);
}

if (data.slides.length!==4 || data.slides.some((slide)=>slide.facts.length<4 || !slide.sources?.length)) fail('Four concise fund cards with fees, CAGR, DD and sources are required.');
if (data.monitor.length!==8 || new Set(data.monitor.map((item)=>item.holding)).size!==8 || data.monitor.some((item)=>item.score<1 || item.score>100 || !item.status || !item.trigger || !item.cadence)) fail('Eight unique fund/target relevance monitors are required.');
if (data.monteCarlo.paths!==10000 || data.monteCarlo.months!==120 || !Number.isInteger(data.monteCarlo.seed)) fail('Monte Carlo must use 10,000 seeded paths over 120 months.');

if (errors.length) {
  errors.forEach((message)=>console.error(`VALIDATION FAILED: ${message}`));
  process.exitCode=1;
} else console.log(`Macro ${macroRate.toFixed(2)}; allocation ${activeWeights.join('/')}; net CAGR ${activeCagr.toFixed(3)}%; historical max DD ${activeDd.toFixed(2)}% / ${cap}% cap: OK`);
