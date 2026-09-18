import { readFileSync } from 'node:fs';
import { Surreal } from 'surrealdb';

try {
  // .env.local d'abord : s'il existe (base SurrealDB locale, cf. scripts/surreal-local.sh),
  // ses valeurs l'emportent — la boucle ne remplit une variable que si elle est vide.
  for (const line of ['.env.local', '.env'].flatMap((f) => { try { return readFileSync(f, 'utf8').split('\n'); } catch { return []; } })) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! });

const sql = readFileSync('src/lib/server/schema.surql', 'utf8');
await db.query(sql);
console.log('✓ Schéma AGONE appliqué');
await db.close();
process.exit(0);
