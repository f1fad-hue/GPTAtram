import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, root)));
const [portfolio, registry, claims] = await Promise.all([
  readJson('data/portfolio.json'), readJson('data/source-registry.json'), readJson('data/claim-registry.json')
]);
const errors = [], warnings = [], records = [];
const fail = (message) => errors.push(message);
const sourceById = new Map(registry.sources.map(source => [source.id, source]));

if (portfolio.drivers.length !== 10) fail(`Expected exactly 10 non-overlapping macro drivers; found ${portfolio.drivers.length}.`);
for (const source of registry.sources) {
  const url = new URL(source.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith(source.domain)) fail(`${source.id}: source URL is not the declared authoritative HTTPS domain.`);
}
for (const claim of claims.claims) {
  if (claim.kind === 'factual' && claim.sourceIds.length === 0) fail(`${claim.id}: factual claim has no authoritative source.`);
  for (const id of claim.sourceIds) if (!sourceById.has(id)) fail(`${claim.id}: unknown source ${id}.`);
}

if (process.env.SKIP_REMOTE_CHECK !== '1') {
  for (const source of registry.sources) {
    try {
      const response = await fetch(source.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'ATRAM-Growth-Compass-Audit/1.0' } });
      const digest = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex').slice(0, 16);
      records.push({ id: source.id, status: response.status, url: response.url, digest });
      if (response.status === 404 || response.status >= 500) fail(`${source.id}: authoritative source unavailable (${response.status}).`);
      else if (!response.ok) warnings.push(`${source.id}: source returned ${response.status}; retained for manual review.`);
    } catch (error) { fail(`${source.id}: network check failed (${error.message}).`); }
  }
} else warnings.push('Remote source retrieval skipped by local test setting.');

const timestamp = new Date().toISOString();
const lines = [
  '# Daily authoritative-source audit', '', `Generated: ${timestamp}`, '',
  `Result: **${errors.length ? 'FAILED' : 'PASSED'}**`, '',
  '## Scope', '- Factual claims must cite an approved authoritative source.', '- Model outputs are labelled model outputs and are checked for math/code integrity separately.', '- This automated audit does not invent or overwrite investment data; any new factual input needs the latest official disclosure.', '',
  '## Source retrieval', ...records.map(r => `- ${r.id}: HTTP ${r.status}; SHA-256 prefix ${r.digest}; ${r.url}`), '',
  '## Warnings', ...(warnings.length ? warnings.map(w => `- ${w}`) : ['- None']), '',
  '## Failures', ...(errors.length ? errors.map(e => `- ${e}`) : ['- None'])
];
const report = process.env.AUDIT_REPORT_PATH ?? 'reports/daily-authoritative-audit.md';
await mkdir(dirname(resolve(report)), { recursive: true });
await writeFile(report, `${lines.join('\n')}\n`);
console.log(`Authoritative-source audit ${errors.length ? 'FAILED' : 'PASSED'}: ${report}`);
if (errors.length) process.exitCode = 1;
