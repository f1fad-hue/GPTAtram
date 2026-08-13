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
  if (!close(fund.netCagr, fund.grossCagr - fund.wrapperFee - fund.targetFee, 1e-9)) fail(`${fund.id}: net CAGR must equal gross scenario minus wrapper and target fees.`);
  if (!fund.feeBasis || !Array.isArray(fund.sourceIds) || fund.sourceIds.length === 0) fail(`${fund.id}: fee basis and authoritative sources are required.`);
}
const requiredFeeSources = { money:'atramMoneyKiid', tech:'atramTechKiid', nasdaq:'atramNasdaqKiid' };
for (const fund of data.fundModels) if (!fund.sourceIds.includes(requiredFeeSources[fund.id])) fail(`${fund.id}: fees must map to its official A PHP KIID.`);

if (data.drivers.length !== 10) fail('Macro model must use exactly ten non-overlapping portfolio-relevant drivers.');
if (new Set(data.drivers.map((driver) => driver.id)).size !== data.drivers.length) fail('Macro driver IDs must be unique.');
if (data.drivers.some((driver) => driver.values.length !== 3 || driver.values.some((value) => value < 1 || value > 5))) fail('Macro values must be 1-5 across 3/6/12 months.');
if (data.drivers.some((driver) => !driver.relevance || !driver.sourceIds?.length || !(driver.id in data.macroModel.driverWeights))) fail('Every macro driver must document relevance, sources and a model weight.');
const horizonWeights = data.macroModel.horizonWeights;
const driverWeights = data.macroModel.driverWeights;
if (!close(sum(Object.values(horizonWeights)), 1, 1e-9) || !close(sum(Object.values(driverWeights)), 1, 1e-9)) fail('Macro horizon and driver weights must each total 100%.');
const macroRate = data.drivers.reduce((total, driver) => total + (driver.values[0] * horizonWeights.threeMonth + driver.values[1] * horizonWeights.sixMonth + driver.values[2] * horizonWeights.twelveMonth) * driverWeights[driver.id], 0);
if (!close(macroRate, data.portfolio.rate)) fail(`Stored rate ${data.portfolio.rate} does not match calculated rate ${macroRate.toFixed(2)}.`);
const expectedCap = macroRate < 4 ? 20 : macroRate < 5 ? 25 : 30;
if (data.portfolio.drawdownCap !== expectedCap) fail(`Rate ${macroRate.toFixed(2)} requires a ${expectedCap}% DD cap.`);

const ddModel = data.drawdownModel;
if (ddModel?.weights.historical !== 0.60 || ddModel?.weights.forwardMedian !== 0.40) fail('DD composite must remain exactly 60% observed A PHP raw-NAV DD and 40% forward median.');
if (ddModel.funds.some((fund) => !Number.isFinite(fund.historical) || !fund.historicalBasis.includes('official'))) fail('Every historical DD input must document its official ATRAM NAV basis.');
const compositeDd = Object.fromEntries(ddModel.funds.map((fund) => [fund.id, (fund.historical * 0.60 + fund.forwardMedian * 0.40) / 100]));
const correlations = ddModel.correlations;
function portfolioDd(allocation) {
  const weights = Object.fromEntries(ids.map((id, index) => [id, allocation[index] / 100]));
  let variance = 0;
  for (const left of ids) for (const right of ids) variance += weights[left] * compositeDd[left] * weights[right] * compositeDd[right] * correlations[left][right];
  return Math.sqrt(variance) * 100;
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
for (const scenario of data.scenarios) {
  if (sum(scenario.allocation) !== 100 || scenario.allocation.some((weight) => weight < data.optimizer.minimumFundWeight || weight % data.optimizer.gridStep !== 0)) fail(`${scenario.rate}: invalid allocation grid.`);
  const best = optimize(scenario.cap);
  if (best.allocation.some((weight, index) => weight !== scenario.allocation[index])) fail(`${scenario.rate}: scenario is not the CAGR-maximizing allocation. Expected ${best.allocation.join('/')}.`);
  if (!close(best.dd, scenario.dd) || !close(best.cagr, scenario.netCagr)) fail(`${scenario.rate}: stated DD or CAGR does not match calculation.`);
}

if (data.monteCarlo.paths !== 10000 || data.monteCarlo.months !== 120 || !Number.isInteger(data.monteCarlo.seed)) fail('Monte Carlo must use 10,000 reproducible paths over 120 months.');
if (data.slides.length !== 3 || data.slides.some((slide) => slide.facts.length < 6 || !slide.sources?.length)) fail('Each required fund needs a fee/CAGR/DD slide with authoritative links.');
if (data.monitor.length < 5 || data.monitor.some((item) => item.score < 1 || item.score > 100 || !item.trigger || !item.cadence)) fail('Fund and target-vehicle relevance monitoring must include scores, triggers and cadence.');

if (errors.length) {
  errors.forEach((message) => console.error(`VALIDATION FAILED: ${message}`));
  process.exitCode = 1;
} else {
  console.log(`Macro ${macroRate.toFixed(2)}, optimized allocation ${activeAllocation.join('/')}, net CAGR ${calculatedCagr.toFixed(3)}%, composite DD ${calculatedDd.toFixed(2)}%, cap ${expectedCap}%: OK`);
}
