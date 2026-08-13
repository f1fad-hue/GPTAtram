import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/portfolio.json', import.meta.url)));
const errors = [];
const fail = (message) => errors.push(message);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const close = (left, right, tolerance = 0.011) => Math.abs(left - right) <= tolerance;

const ids = data.portfolio.allocation.map((item) => item.id);
if (ids.length !== 3 || new Set(ids).size !== 3 || !['money','tech','nasdaq'].every((id) => ids.includes(id))) fail('Active allocation must include all three required funds exactly once.');
if (data.portfolio.allocation.some((item) => !item.name.endsWith('A PHP'))) fail('Every active holding must use the required A PHP unit class.');
if (sum(data.portfolio.allocation.map((item) => item.weight)) !== 100) fail('Active allocation must total 100%.');
if (data.portfolio.allocation.some((item) => item.weight < data.optimizer.minimumFundWeight || item.weight % data.optimizer.gridStep !== 0)) fail('Active weights must include every fund and use the configured 5% grid.');

if (data.fundModels.length !== 3 || new Set(data.fundModels.map((fund) => fund.id)).size !== 3) fail('Each required fund must have exactly one fee-adjusted CAGR model.');
for (const fund of data.fundModels) {
  const expectedTargetLevel = fund.id === 'money' ? null : fund.grossCagr - fund.targetFee;
  if (fund.id === 'money' ? fund.targetLevelCagr !== null : !close(fund.targetLevelCagr, expectedTargetLevel, 1e-9)) fail(`${fund.id}: target-level forecast must equal gross scenario minus target fees, or null when no target exists.`);
  const investableInput = fund.targetLevelCagr ?? fund.grossCagr;
  if (!close(fund.netCagr, investableInput - fund.wrapperFee, 1e-9)) fail(`${fund.id}: A PHP net CAGR must equal the explicit target/own-fund input minus the complete wrapper fee stack.`);
  if (!fund.forecastUse) fail(`${fund.id}: forecast-use basis is required.`);
  if (!fund.feeBasis || !Array.isArray(fund.sourceIds) || fund.sourceIds.length === 0) fail(`${fund.id}: fee basis and authoritative sources are required.`);
}
const requiredFeeSources = { money:'atramMoneyKiid', tech:'atramTechKiid', nasdaq:'atramNasdaqKiid' };
for (const fund of data.fundModels) if (!fund.sourceIds.includes(requiredFeeSources[fund.id])) fail(`${fund.id}: fees must map to its official A PHP KIID.`);
const nasdaqCagr = data.fundModels.find((fund) => fund.id === 'nasdaq');
const targetBasedGross = 0.30 * 18.15 + 0.70 * 6.70;
const targetFeeAdjustment = 0.70 * 0.35;
if (!close(nasdaqCagr.grossCagr, targetBasedGross, 1e-9) || !close(nasdaqCagr.targetFee, targetFeeAdjustment, 1e-9) || !close(nasdaqCagr.targetLevelCagr, 9.89, 1e-9) || !close(nasdaqCagr.netCagr, 8.24, 1e-9)) fail('Nasdaq CAGR must use the explicit 9.89% target-level forecast before the complete ATRAM wrapper-fee deduction.');
const techCagr = data.fundModels.find((fund) => fund.id === 'tech');
if (!close(techCagr.targetLevelCagr, 11.31, 1e-9) || !close(techCagr.netCagr, 10.06, 1e-9)) fail('Technology CAGR must use the explicit 11.31% target-level forecast before the complete ATRAM wrapper-fee deduction.');
if (!nasdaqCagr.returnBasis?.includes('IE000U9J8HX9') || !nasdaqCagr.returnBasis?.includes('JEPQ is excluded from CAGR') || !['atramNasdaqKiid','jpmNasdaqFactsheet','jpmLtcma'].every((id) => nasdaqCagr.sourceIds.includes(id)) || nasdaqCagr.sourceIds.includes('jepqHistory')) fail('Nasdaq CAGR must map to the actual UCITS target and LTCMA, never JEPQ history.');

if (data.macroModel.maxDistinctDrivers !== 12 || data.drivers.length !== data.macroModel.maxDistinctDrivers) fail('Macro model must use the complete maximum set of twelve distinct portfolio-relevant drivers.');
if (new Set(data.drivers.map((driver) => driver.id)).size !== data.drivers.length) fail('Macro driver IDs must be unique.');
if (data.drivers.some((driver) => driver.values.length !== 3 || driver.values.some((value) => value < 1 || value > 5))) fail('Macro values must be 1-5 across 3/6/12 months.');
const requiredImpactFunds = ['money','tech','nasdaq'];
if (data.drivers.some((driver) => !driver.relevance || !driver.channel || !driver.sourceIds?.length || !(driver.id in data.macroModel.driverWeights))) fail('Every macro driver must document a unique channel, relevance, sources and model weight.');
if (new Set(data.drivers.map((driver) => driver.channel)).size !== data.drivers.length) fail('Each macro driver must have a distinct non-duplicated portfolio channel.');
if (data.drivers.some((driver) => !driver.allocationImpact || Object.keys(driver.allocationImpact).sort().join(',') !== requiredImpactFunds.slice().sort().join(',') || requiredImpactFunds.some((fund) => !Number.isInteger(driver.allocationImpact[fund]) || driver.allocationImpact[fund] < -2 || driver.allocationImpact[fund] > 2) || requiredImpactFunds.every((fund) => driver.allocationImpact[fund] === 0))) fail('Every macro driver must have a -2 to +2 allocation sensitivity for all three funds and change at least one fund.');
if (!data.macroModel.selectionRule?.includes('Twelve') || !data.macroModel.selectionRule.includes('duplicate')) fail('Macro model must document the twelve-driver non-duplication ceiling.');
const horizonWeights = data.macroModel.horizonWeights;
const driverWeights = data.macroModel.driverWeights;
if (!close(sum(Object.values(horizonWeights)), 1, 1e-9) || !close(sum(Object.values(driverWeights)), 1, 1e-9)) fail('Macro horizon and driver weights must each total 100%.');
const macroRate = data.drivers.reduce((total, driver) => total + (driver.values[0] * horizonWeights.threeMonth + driver.values[1] * horizonWeights.sixMonth + driver.values[2] * horizonWeights.twelveMonth) * driverWeights[driver.id], 0);
if (macroRate < 1 || macroRate > 5) fail('Portfolio macro rate must remain on the 1 bearish to 5 bullish scale.');
if (!close(macroRate, data.portfolio.rate)) fail(`Stored rate ${data.portfolio.rate} does not match calculated rate ${macroRate.toFixed(2)}.`);
const expectedCap = macroRate < 4 ? 20 : macroRate < 5 ? 25 : 30;
if (data.portfolio.drawdownCap !== expectedCap) fail(`Rate ${macroRate.toFixed(2)} requires a ${expectedCap}% DD cap.`);
const expectedRateBand = macroRate < 4 ? '3.00-3.99' : macroRate < 5 ? '4.00-4.99' : '5.00';
if (data.portfolio.rateBand !== expectedRateBand) fail(`Rate ${macroRate.toFixed(2)} requires the ${expectedRateBand} stored rate band.`);

const ddModel = data.drawdownModel;
if (ddModel?.basis !== 'historicalMaximumDrawdownOnly' || ddModel?.aggregation !== 'simpleWeightedSum' || 'simulation' in ddModel || 'weights' in ddModel || 'correlations' in ddModel) fail('DD must use only the simple allocation-weighted sum of historical maximum drawdowns, with no forward DD, blend, or correlation credit.');
if (ddModel.funds.some((fund) => !Number.isFinite(fund.historical) || !fund.historicalBasis || !fund.historicalMetric || !fund.sourceIds?.length || 'forwardP50' in fund || 'forwardBasis' in fund || 'forwardMetric' in fund)) fail('Every DD input must contain only a documented historical maximum drawdown and authoritative source.');
const ddFunds = Object.fromEntries(ddModel.funds.map((fund) => [fund.id, fund]));
if (!ddFunds.money.historicalBasis.includes('no target vehicle') || !ddFunds.money.sourceIds.includes('atramMoneyKiid')) fail('Money-market historical maximum DD must use its own official A PHP NAV because it has no target vehicle.');
if (!close(ddFunds.tech.historical, 31.6614, 1e-6) || !ddFunds.tech.historicalBasis.includes('LU1046421795') || !ddFunds.tech.historicalBasis.includes('3,203') || !ddFunds.tech.historicalBasis.includes('19 Feb 2020') || !ddFunds.tech.historicalBasis.includes('18 Mar 2020') || !ddFunds.tech.historicalMetric.includes('daily NAV maximum drawdown') || !ddFunds.tech.sourceIds.includes('fidelityNav')) fail('Technology DD must use the exact Fidelity A-ACC-USD official daily NAV maximum drawdown and document its record count, peak and trough.');
if (!ddFunds.nasdaq.historicalBasis.includes('JEPQ') || !ddFunds.nasdaq.historicalBasis.includes('46654Q203') || !ddFunds.nasdaq.historicalBasis.includes('1,072') || !ddFunds.nasdaq.historicalBasis.includes('not distribution-adjusted') || !ddFunds.nasdaq.historicalBasis.includes('actual UCITS target IE000U9J8HX9') || !ddFunds.nasdaq.historicalMetric.includes('raw-NAV') || !ddFunds.nasdaq.sourceIds.includes('jepqHistory')) fail('Nasdaq historical maximum DD must use official daily JEPQ raw-NAV history as a disclosed, non-distribution-adjusted proxy while preserving the actual UCITS target identity.');
const historicalDd = Object.fromEntries(ddModel.funds.map((fund) => [fund.id, fund.historical / 100]));
function portfolioDd(allocation) {
  return allocation.reduce((total, weight, index) => total + weight / 100 * historicalDd[ids[index]], 0) * 100;
}
const netCagr = Object.fromEntries(data.fundModels.map((fund) => [fund.id, fund.netCagr]));
function portfolioCagr(allocation) { return allocation.reduce((total, weight, index) => total + netCagr[ids[index]] * weight / 100, 0); }

const activeAllocation = data.portfolio.allocation.map((item) => item.weight);
const calculatedDd = portfolioDd(activeAllocation);
const calculatedCagr = portfolioCagr(activeAllocation);
if (calculatedDd > data.portfolio.drawdownCap) fail(`Active DD ${calculatedDd.toFixed(2)}% exceeds ${data.portfolio.drawdownCap}% cap.`);
if (!close(calculatedCagr, data.portfolio.netCagrForecast)) fail(`Stored portfolio CAGR ${data.portfolio.netCagrForecast} does not match ${calculatedCagr.toFixed(3)}.`);

function optimize(cap) {
  let best;
  for (let money = data.optimizer.minimumFundWeight; money <= 90; money += data.optimizer.gridStep) {
    for (let tech = data.optimizer.minimumFundWeight; tech <= 90; tech += data.optimizer.gridStep) {
      const nasdaq = 100 - money - tech;
      if (nasdaq < data.optimizer.minimumFundWeight || nasdaq % data.optimizer.gridStep !== 0) continue;
      const allocation = [money, tech, nasdaq];
      const dd = portfolioDd(allocation);
      const cagr = portfolioCagr(allocation);
      if (dd <= cap && (!best || cagr > best.cagr + 1e-12)) best = { allocation, dd, cagr };
    }
  }
  return best;
}

const activeBest = optimize(data.portfolio.drawdownCap);
if (activeBest.allocation.some((weight, index) => weight !== activeAllocation[index])) fail(`Active allocation is not maximum forecast CAGR. Expected ${activeBest.allocation.join('/')}.`);
const requiredScenarios = new Map([['3.00-3.99', 20], ['4.00-4.99', 25], ['5.00', 30]]);
if (data.scenarios.length !== 3 || new Set(data.scenarios.map((scenario) => scenario.rate)).size !== 3) fail('Exactly one optimized rate 3, 4 and 5 scenario is required.');
for (const scenario of data.scenarios) {
  if (scenario.cap !== requiredScenarios.get(scenario.rate)) fail(`${scenario.rate}: scenario DD cap is not the required rating-dependent cap.`);
  if (sum(scenario.allocation) !== 100 || scenario.allocation.some((weight) => weight < data.optimizer.minimumFundWeight || weight % data.optimizer.gridStep !== 0)) fail(`${scenario.rate}: invalid allocation grid.`);
  const best = optimize(scenario.cap);
  if (best.allocation.some((weight, index) => weight !== scenario.allocation[index])) fail(`${scenario.rate}: scenario is not the CAGR-maximizing allocation. Expected ${best.allocation.join('/')}.`);
  if (!close(best.dd, scenario.dd) || !close(best.cagr, scenario.netCagr)) fail(`${scenario.rate}: stated DD or CAGR does not match calculation.`);
}

if (data.monteCarlo.paths !== 10000 || data.monteCarlo.months !== 120 || !Number.isInteger(data.monteCarlo.seed)) fail('Monte Carlo must use 10,000 reproducible paths over 120 months.');
if (data.slides.length !== 3 || data.slides.some((slide) => slide.facts.length < 3 || !slide.sources?.length)) fail('Each required fund needs a concise CAGR/historical-DD card with authoritative links.');
const requiredMonitors = ['ATRAM Peso Money Market Fund - A PHP', 'ATRAM Global Technology Feeder Fund - A PHP', 'Fidelity Global Technology target fund', 'ATRAM Nasdaq Equity Income Feeder Fund - A PHP', 'JPM Nasdaq Equity Premium Income target ETF', 'U.S.-listed JEPQ strategy-history proxy'];
if (data.monitor.length !== requiredMonitors.length || new Set(data.monitor.map((item) => item.holding)).size !== data.monitor.length || !requiredMonitors.every((holding) => data.monitor.some((item) => item.holding === holding)) || data.monitor.some((item) => item.score < 1 || item.score > 100 || !item.status || !item.trigger || !item.cadence)) fail('Relevance monitoring must cover every required A PHP fund and its target/proxy vehicle exactly once, with score, status, trigger and cadence.');

if (errors.length) {
  errors.forEach((message) => console.error(`VALIDATION FAILED: ${message}`));
  process.exitCode = 1;
} else {
  console.log(`Macro ${macroRate.toFixed(2)}, optimized allocation ${activeAllocation.join('/')}, net CAGR ${calculatedCagr.toFixed(3)}%, weighted historical maximum DD ${calculatedDd.toFixed(2)}%, cap ${expectedCap}%: OK`);
}
