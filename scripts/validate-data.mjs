import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/portfolio.json', import.meta.url)));
const fail = (message) => { console.error(`VALIDATION FAILED: ${message}`); process.exitCode = 1; };
const sum = (xs) => xs.reduce((a, x) => a + x, 0);

if (sum(data.portfolio.allocation.map(item => item.weight)) !== 100) fail('Active allocation must equal 100%.');
if (data.portfolio.allocation.some(item => item.weight % 5 !== 0)) fail('Active allocation weights must be rounded to 5% increments.');
for (const scenario of data.scenarios) {
  if (sum(scenario.allocation) !== 100) fail(`${scenario.rate}: allocation must equal 100%.`);
  if (scenario.allocation.some(weight => weight % 5 !== 0)) fail(`${scenario.rate}: allocation weights must be rounded to 5% increments.`);
  if (scenario.dd > scenario.cap) fail(`${scenario.rate}: stated DD exceeds cap.`);
}
if (data.drivers.length !== 10) fail('Macro model must use exactly ten non-overlapping portfolio-relevant drivers.');
if (data.drivers.some(driver => driver.values.length !== 3 || driver.values.some(value => value < 1 || value > 5))) fail('Macro scores must be 1-5 across 3/6/12 months.');
if (new Set(data.drivers.map(driver => driver.id)).size !== data.drivers.length) fail('Macro driver IDs must be unique to prevent double-counting.');
if (data.drivers.some(driver => !driver.relevance || !(driver.id in data.macroModel.driverWeights))) fail('Every macro driver must document its allocation relevance and model weight.');

const h = data.macroModel?.horizonWeights;
const driverWeights = data.macroModel?.driverWeights;
if (!h || !driverWeights || Math.abs(sum(Object.values(h)) - 1) > 1e-9 || Math.abs(sum(Object.values(driverWeights)) - 1) > 1e-9) fail('Macro horizon and driver weights must each sum to 100%.');
const macroRate = data.drivers.reduce((total, driver) => total + (driver.values[0] * h.threeMonth + driver.values[1] * h.sixMonth + driver.values[2] * h.twelveMonth) * driverWeights[driver.id], 0);
if (Math.abs(macroRate - data.portfolio.rate) > 0.01) fail(`Stored rate ${data.portfolio.rate} does not match calculated macro rate ${macroRate.toFixed(2)}.`);
const expectedCap = macroRate < 4 ? 20 : macroRate < 5 ? 25 : 30;
if (data.portfolio.drawdownCap !== expectedCap) fail(`Macro rate ${macroRate.toFixed(2)} requires a ${expectedCap}% drawdown cap.`);

const dd = data.drawdownModel;
if (!dd || Math.abs(sum(Object.values(dd.weights)) - 1) > 1e-9) fail('Historical/forward drawdown weights must sum to 100%.');
const allocation = Object.fromEntries(data.portfolio.allocation.map(item => [item.id, item.weight / 100]));
const composite = Object.fromEntries(dd.funds.map(fund => [fund.id, (fund.historical * dd.weights.historical + fund.forwardMedian * dd.weights.forwardMedian) / 100]));
let variance = 0;
for (const left of Object.keys(allocation)) for (const right of Object.keys(allocation)) variance += allocation[left] * composite[left] * allocation[right] * composite[right] * dd.correlations[left][right];
const calculatedDd = Math.sqrt(variance) * 100;
if (calculatedDd > data.portfolio.drawdownCap) fail(`Calculated composite DD ${calculatedDd.toFixed(2)}% exceeds cap ${data.portfolio.drawdownCap}%.`);

for (const item of data.monitor) if (item.score < 1 || item.score > 100) fail(`${item.holding}: relevance score must be 1-100.`);
if (!process.exitCode) console.log(`Macro rate ${macroRate.toFixed(2)}, composite DD ${calculatedDd.toFixed(2)}%, cap ${expectedCap}%: OK`);
