import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/portfolio.json', import.meta.url)));
const fail = (message) => { console.error(`VALIDATION FAILED: ${message}`); process.exitCode = 1; };
const sum = (xs) => xs.reduce((a, x) => a + x, 0);
if (sum(data.portfolio.allocation.map(x => x.weight)) !== 100) fail('Active weights must equal 100%.');
if (data.portfolio.rate < 4 || data.portfolio.rate >= 5 || data.portfolio.drawdownCap !== 25) fail('The active 4.xx score must use a 25% cap.');
for (const scenario of data.scenarios) {
  if (sum(scenario.allocation) !== 100) fail(`${scenario.rate}: scenario weights must equal 100%.`);
  if (scenario.dd > scenario.cap) fail(`${scenario.rate}: composite drawdown exceeds its cap.`);
}
for (const d of data.drivers) if (d.values.length !== 3 || d.values.some(v => v < 1 || v > 5)) fail(`${d.name}: macro values must be 1–5 across 3/6/12m.`);
for (const m of data.monitor) if (m.score < 1 || m.score > 100) fail(`${m.holding}: relevance score must be 1–100.`);
if (process.env.SKIP_REMOTE_CHECK !== '1') {
  for (const source of data.sources) {
    try { const res = await fetch(source.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(20000) }); if (res.status === 404 || res.status >= 500) fail(`${source.name}: source unavailable (${res.status}).`); }
    catch (e) { fail(`${source.name}: source check error (${e.message}).`); }
  }
} else console.log('Remote source availability skipped by local test setting.');
if (!process.exitCode) console.log('Portfolio data, drawdown guardrails, score ranges, and authoritative source availability: OK');
