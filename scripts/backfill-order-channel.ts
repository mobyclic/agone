/**
 * Backfill : commandes sans canal (channel = NONE) → 'web'.
 * Corrige l'erreur de coercition SCHEMAFULL sur les commandes importées
 * avant l'ajout du DEFAULT 'web'. Idempotent.
 */
import { readFileSync } from 'node:fs';
import { Surreal } from 'surrealdb';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! });

const before: any = await db.query('SELECT count() AS n FROM order WHERE channel IS NONE GROUP ALL');
const n = before[0]?.[0]?.n ?? 0;
console.log(`Commandes sans canal : ${n}`);

if (n > 0) {
  await db.query("UPDATE order SET channel = 'web' WHERE channel IS NONE");
  const after: any = await db.query('SELECT count() AS n FROM order WHERE channel IS NONE GROUP ALL');
  console.log(`Après backfill : ${after[0]?.[0]?.n ?? 0} restante(s).`);
} else {
  console.log('Rien à corriger.');
}
await db.close();
