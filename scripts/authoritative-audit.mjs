import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, root)));
const [portfolio, registry, claims] = await Promise.all([
  readJson('data/portfolio.json'),
  readJson('data/source-registry.json'),
  readJson('data/claim-registry.json')
]);
const errors = [];
const warnings = [];
const records = [];
const fail = (message) => errors.push(message);
const sourceById = new Map(registry.sources.map((source) => [source.id, source]));
const sourceByUrl = new Map(registry.sources.map((source) => [source.url, source]));
const usedSourceIds = new Set();
const registerSources = (context, sourceIds) => {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    fail(`${context}: no authoritative source mapping.`);
    return;
  }
  for (const id of sourceIds) {
    if (!sourceById.has(id)) fail(`${context}: unknown source ${id}.`);
    else usedSourceIds.add(id);
  }
};

if (sourceById.size !== registry.sources.length) fail('Source registry IDs must be unique.');
for (const source of registry.sources) {
  const url = new URL(source.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith(source.domain)) fail(`${source.id}: URL is not on its declared authoritative HTTPS domain.`);
}
if (new Set(claims.claims.map((claim) => claim.id)).size !== claims.claims.length) fail('Claim registry IDs must be unique.');
for (const claim of claims.claims) {
  if (claim.kind === 'factual') registerSources(claim.id, claim.sourceIds);
  else for (const id of claim.sourceIds ?? []) registerSources(claim.id, [id]);
}
for (const driver of portfolio.drivers) registerSources(`${driver.id} macro driver`, driver.sourceIds);
for (const fund of portfolio.fundModels) registerSources(`${fund.id} fee model`, fund.sourceIds);
for (const fund of portfolio.drawdownModel.funds) registerSources(`${fund.id} drawdown model`, fund.sourceIds);
for (const source of portfolio.sources) {
  registerSources(`${source.name} displayed source`, source.sourceIds);
  if (!source.sourceIds?.some((id) => sourceById.get(id)?.url === source.url)) fail(`${source.name}: displayed URL does not match its mapped registry source.`);
}
for (const slide of portfolio.slides) for (const source of slide.sources) {
  const registered = sourceByUrl.get(source.url);
  if (!registered) fail(`${slide.title}: slide link ${source.label} is absent from the authoritative registry.`);
  else usedSourceIds.add(registered.id);
}
for (const source of registry.sources) if (!usedSourceIds.has(source.id)) fail(`${source.id}: registry entry is unused and should be removed.`);

if (process.env.SKIP_REMOTE_CHECK !== '1') {
  const retrieve = async (source) => {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(source.url, { method:'GET', redirect:'follow', signal:AbortSignal.timeout(60000), headers:{ 'user-agent':'ATRAM-Growth-Compass-Audit/2.1' } });
        const body = Buffer.from(await response.arrayBuffer());
        return { source, response, body, attempt };
      } catch (error) { lastError = error; }
    }
    return { source, error:lastError };
  };
  const results = await Promise.all(registry.sources.map(retrieve));
  for (const result of results) {
    const { source } = result;
    if (result.error) { fail(`${source.id}: retrieval failed after retry (${result.error.message}).`); continue; }
    const { response, body, attempt } = result;
    const digest = createHash('sha256').update(body).digest('hex').slice(0, 16);
    records.push({ id:source.id, status:response.status, url:response.url, digest, bytes:body.length, attempt });
    if (response.status === 404 || response.status >= 500) fail(`${source.id}: authoritative source unavailable (${response.status}).`);
    else if (!response.ok) warnings.push(`${source.id}: returned ${response.status}; manual review retained.`);
    if (body.length === 0) fail(`${source.id}: authoritative response was empty.`);
  }
} else warnings.push('Remote source retrieval skipped by local test setting.');

const timestamp = new Date().toISOString();
const lines = [
  '# Daily authoritative-source audit', '', `Generated: ${timestamp}`, '',
  `Result: **${errors.length ? 'FAILED' : 'PASSED'}**`, '',
  '## Scope',
  '- Factual claims, macro inputs, fee/DD inputs and every displayed source link must map to an approved authoritative source.',
  '- Unused source-registry entries fail the audit so stale or unnecessary sources cannot accumulate.',
  '- Model outputs are labelled as model assumptions and validated separately.',
  '- A retrieval failure or unsupported claim blocks deployment; the audit does not invent replacement data.', '',
  '## Source retrieval', ...records.map((record) => `- ${record.id}: HTTP ${record.status}; ${record.bytes} bytes; SHA-256 prefix ${record.digest}; attempt ${record.attempt}; ${record.url}`), '',
  '## Warnings', ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ['- None']), '',
  '## Failures', ...(errors.length ? errors.map((error) => `- ${error}`) : ['- None'])
];
const report = process.env.AUDIT_REPORT_PATH ?? 'reports/daily-authoritative-audit.md';
await mkdir(dirname(resolve(report)), { recursive:true });
await writeFile(report, `${lines.join('\n')}\n`);
console.log(`Authoritative-source audit ${errors.length ? 'FAILED' : 'PASSED'}: ${report}`);
if (errors.length) process.exitCode = 1;
