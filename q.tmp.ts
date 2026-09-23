import { readFileSync } from 'node:fs';
import { Surreal } from 'surrealdb';
const env: Record<string, string> = {};
for (const l of readFileSync('.env', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) env[m[1]] = m[2]; }
const db = new Surreal(); await db.connect(env.SURREAL_URL, { versionCheck: false });
await db.use({ namespace: env.SURREAL_NAMESPACE, database: env.SURREAL_DATABASE });
await db.signin({ username: env.SURREAL_USER, password: env.SURREAL_PASS } as any);
console.log(JSON.stringify((await db.query(readFileSync(0, 'utf8'))), null, 1).slice(0, 2500)); await db.close();
