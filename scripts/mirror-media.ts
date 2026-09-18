/**
 * Miroir local des médias R2, pour la base SurrealDB LOCALE (travail hors connexion).
 *
 *   bun run scripts/mirror-media.ts
 *
 * Télécharge dans static/_r2-local/ les médias absents (chemins R2 conservés),
 * puis réécrit `media.url` vers /_r2-local/… — DANS LA BASE LOCALE SEULEMENT :
 * le script refuse de tourner sans .env.local, pour ne jamais toucher au cloud.
 * Idempotent. Appelé automatiquement par `bun run db:local:pull`.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Surreal } from 'surrealdb';

if (!existsSync('.env.local')) {
  console.error('.env.local absent : ce script ne vise que la base locale. Abandon.');
  process.exit(1);
}
const env: Record<string, string> = {};
for (const f of ['.env', '.env.local']) for (const l of readFileSync(f, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) env[m[1]] = m[2];
}
if (!/127\.0\.0\.1|localhost/.test(env.SURREAL_URL ?? '')) {
  console.error('SURREAL_URL de .env.local ne pointe pas sur la machine locale. Abandon.');
  process.exit(1);
}

const db = new Surreal();
await db.connect(env.SURREAL_URL, { versionCheck: false });
await db.use({ namespace: env.SURREAL_NAMESPACE, database: env.SURREAL_DATABASE });
await db.signin({ username: env.SURREAL_USER, password: env.SURREAL_PASS });

const rows: any[] = ((await db.query(`SELECT url FROM media WHERE url != NONE AND string::starts_with(url, 'https://')`)) as any[])[0] ?? [];
const hotes = new Set<string>();
let telecharges = 0; const echecs: string[] = [];
for (let i = 0; i < rows.length; i += 16) {
  await Promise.all(rows.slice(i, i + 16).map(async ({ url }) => {
    const u = new URL(url); hotes.add(u.origin);
    const cible = 'static/_r2-local' + decodeURIComponent(u.pathname);
    if (existsSync(cible)) return;
    try {
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      mkdirSync(dirname(cible), { recursive: true });
      writeFileSync(cible, Buffer.from(await r.arrayBuffer())); telecharges++;
    } catch (e: any) { echecs.push(`${url} (${e.message})`); }
  }));
}
for (const h of hotes) {
  await db.query(`UPDATE media SET url = string::replace(url, $h, '/_r2-local') WHERE string::starts_with(url, $h)`, { h });
}
console.log(`médias : ${rows.length} à relocaliser · ${telecharges} téléchargé(s) · ${echecs.length} échec(s)`);
if (echecs.length) console.log(echecs.slice(0, 10).join('\n'));
await db.close();
