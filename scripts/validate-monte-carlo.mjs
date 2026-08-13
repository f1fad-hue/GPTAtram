import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/portfolio.json', import.meta.url)));
const allocation = Object.fromEntries(data.portfolio.allocation.map((item) => [item.id, item.weight / 100]));
const mu = data.fundModels.reduce((total, fund) => total + fund.netCagr / 100 * allocation[fund.id], 0);
const sigma = data.portfolio.volatility;
const config = data.monteCarlo;

if (Math.abs(mu * 100 - data.portfolio.netCagrForecast) > 1e-9) throw new Error('Monte Carlo CAGR input differs from the independently calculated allocation-weighted net CAGR.');
if (config.paths !== 10000 || config.months !== 120 || !Number.isInteger(config.seed)) throw new Error('Monte Carlo configuration must remain 10,000 deterministic paths over 120 months.');
if (config.distribution !== 'monthly lognormal' || !(sigma > 0 && sigma < 1)) throw new Error('Monte Carlo distribution or volatility input is invalid.');

function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
function normal(random) {
  let u = 0;
  let v = 0;
  while (!u) u = random();
  while (!v) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function percentile(values, probability) {
  const index = (values.length - 1) * probability;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return values[low] + (values[high] - values[low]) * (index - low);
}

const random = rng(config.seed);
const values = [];
for (let path = 0; path < config.paths; path += 1) {
  let value = 1;
  for (let month = 0; month < config.months; month += 1) {
    value *= Math.exp((mu - sigma ** 2 / 2) / 12 + sigma * normal(random) / Math.sqrt(12));
  }
  values.push(value);
}
values.sort((left, right) => left - right);
const [p10, p50, p90] = [0.1, 0.5, 0.9].map((probability) => percentile(values, probability));
const sampleMean = values.reduce((total, value) => total + value, 0) / values.length;
const years = config.months / 12;
const analyticalMedian = Math.exp((mu - sigma ** 2 / 2) * years);
const analyticalMean = Math.exp(mu * years);

if (!(0 < p10 && p10 < p50 && p50 < p90)) throw new Error('Monte Carlo percentiles are not finite and strictly ordered.');
if (Math.abs(p50 / analyticalMedian - 1) > 0.04) throw new Error('Monte Carlo median fails the analytical lognormal sanity check.');
if (Math.abs(sampleMean / analyticalMean - 1) > 0.04) throw new Error('Monte Carlo mean fails the analytical lognormal sanity check.');

console.log(`Monte Carlo ${config.paths.toLocaleString()} paths / ${config.months} months / seed ${config.seed}: p10 ${p10.toFixed(4)}x, p50 ${p50.toFixed(4)}x, p90 ${p90.toFixed(4)}x; analytical sanity checks passed.`);
