import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Charge .env (local)
try {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const args = process.argv.slice(2);
const output = args.find((a) => !a.startsWith('--')) ?? `dump-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.surql`;
const flags = args.filter((a) => a.startsWith('--'));

// Convertit ws://… en http(s)://… pour la CLI surreal
const wsToHttp = (url: string) => url.replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://')).replace(/\/rpc\/?$/, '');

const endpoint = wsToHttp(process.env.SURREAL_URL ?? 'ws://127.0.0.1:8000/rpc');
const ns = process.env.SURREAL_NAMESPACE ?? 'mobyclic';
const db = process.env.SURREAL_DATABASE ?? 'feedsourcing';
const user = process.env.SURREAL_USER ?? 'root';
const pass = process.env.SURREAL_PASS ?? 'root';

console.log(`→ Export ${ns}/${db} depuis ${endpoint}`);
console.log(`→ Fichier : ${output}`);
if (flags.length) console.log(`→ Flags  : ${flags.join(' ')}`);

const result = spawnSync(
  'surreal',
  [
    'export',
    '--endpoint', endpoint,
    '--username', user,
    '--password', pass,
    '--namespace', ns,
    '--database', db,
    ...flags,
    output
  ],
  { stdio: 'inherit' }
);

process.exit(result.status ?? 1);
