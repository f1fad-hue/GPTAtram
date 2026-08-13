import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/portfolio.json', import.meta.url)));
const simulation = data.drawdownModel.simulation;
const netCagr = Object.fromEntries(data.fundModels.map((fund) => [fund.id, fund.netCagr / 100]));

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random) {
  const left = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * random());
}

function percentile(sorted, probability) {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

function maxDrawdowns({ annualReturn, annualVolatility, paths, months, seed }) {
  const random = rng(seed);
  const monthlyDrift = Math.log1p(annualReturn) / 12;
  const monthlyVolatility = annualVolatility / Math.sqrt(12);
  const drawdowns = new Array(paths);
  for (let path = 0; path < paths; path += 1) {
    let value = 1;
    let peak = 1;
    let maximum = 0;
    for (let month = 0; month < months; month += 1) {
      value *= Math.exp(monthlyDrift - 0.5 * monthlyVolatility ** 2 + monthlyVolatility * normal(random));
      peak = Math.max(peak, value);
      maximum = Math.max(maximum, 1 - value / peak);
    }
    drawdowns[path] = maximum * 100;
  }
  return drawdowns.sort((left, right) => left - right);
}

function calibrateVolatility({ annualReturn, targetP50, paths, months, seed }) {
  let lower = 0.00001;
  let upper = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const drawdowns = maxDrawdowns({ annualReturn, annualVolatility: midpoint, paths, months, seed });
    if (percentile(drawdowns, 0.50) < targetP50) lower = midpoint;
    else upper = midpoint;
  }
  return (lower + upper) / 2;
}

if (data.drawdownModel.basis !== 'forwardP50Only' || simulation.percentile !== 0.50 || 'weights' in data.drawdownModel) {
  throw new Error('The active drawdown model must be forward-P50-only with no historical/composite weights.');
}

for (const [index, fund] of data.drawdownModel.funds.entries()) {
  const annualVolatility = calibrateVolatility({
    annualReturn: netCagr[fund.id],
    targetP50: fund.forwardP50Calibration,
    paths: simulation.calibrationPaths,
    months: simulation.months,
    seed: simulation.calibrationSeed + index * 1000
  });
  const drawdowns = maxDrawdowns({
    annualReturn: netCagr[fund.id],
    annualVolatility,
    paths: simulation.validationPaths,
    months: simulation.months,
    seed: simulation.validationSeed + index * 1000
  });
  const p50 = percentile(drawdowns, simulation.percentile);
  if (Math.abs(p50 - fund.forwardP50Calibration) > 0.25) throw new Error(`${fund.id}: independent P50 ${p50.toFixed(4)}% no longer tracks calibration ${fund.forwardP50Calibration.toFixed(4)}%.`);
  if (Math.abs(annualVolatility * 100 - fund.annualVolatilityPct) > 0.000001) throw new Error(`${fund.id}: stored annual volatility does not reproduce calibration.`);
  if (Math.abs(p50 - fund.forwardP50) > 0.001) throw new Error(`${fund.id}: stored forward P50 ${fund.forwardP50.toFixed(6)}% does not reproduce ${p50.toFixed(6)}%.`);
  console.log(`${fund.id}: annual volatility ${(annualVolatility * 100).toFixed(8)}%, P50 10Y max DD ${p50.toFixed(6)}% (${simulation.validationPaths.toLocaleString()} paths): OK`);
}

console.log('Historical maximum drawdowns carry zero allocation weight: P50-only model OK');
