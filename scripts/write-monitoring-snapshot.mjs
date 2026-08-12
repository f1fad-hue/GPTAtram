import { mkdir, writeFile } from 'node:fs/promises';

const runUrl = process.env.RUN_URL;
const commit = process.env.HEAD_SHA;
if (!runUrl || !commit) throw new Error('RUN_URL and HEAD_SHA are required.');

await mkdir('data', { recursive: true });
await writeFile('data/monitoring.json', `${JSON.stringify({
  verifiedAt: new Date().toISOString(),
  status: 'passed',
  runUrl,
  commit
}, null, 2)}\n`);
console.log(`Monitoring snapshot written for ${commit.slice(0, 7)}.`);
