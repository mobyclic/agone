/**
 * Rattrapage des couvertures manquantes : pour les livres AGONE sans cover,
 * récupère l'image à la une WordPress (publique sur agone.org), optimise en webp,
 * upload R2, crée le media et renseigne book.cover.
 *   WP_DIR=/chemin bun run scripts/migrate-covers-wp.ts
 */
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { Surreal, RecordId } from 'surrealdb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const WP = process.env.WP_DIR; if (!WP) throw new Error('WP_DIR requis');
const readJsonl = (f: string) => readFileSync(`${WP}/${f}`, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

const acc = process.env.CLOUDFLARE_ACCOUNT_ID!;
const jur = (process.env.CLOUDFLARE_R2_JURISDICTION ?? '').trim().toLowerCase();
const host = jur ? `${acc}.${jur}.r2.cloudflarestorage.com` : `${acc}.r2.cloudflarestorage.com`;
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
const PUBLIC = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
const s3 = new S3Client({ region: 'auto', endpoint: `https://${host}`, credentials: { accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!, secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY! } });

const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! });
const q = (s: string, v?: any) => db.query(s, v).then((r: any) => r[0]);

// mapping WP : book_id → { isbn, file }
const wp = new Map<number, { isbn?: string; file?: string }>();
for (const r of readJsonl('wpcovers.json')) wp.set(Number(r.book_id), { isbn: r.isbn || undefined, file: r.file || undefined });

// livres AGONE sans couverture
const coverless = await q(`SELECT id, title, legacy_wp_id FROM book WHERE cover = NONE AND legacy_wp_id != NONE`);
console.log(`→ ${coverless.length} livres sans couverture`);

let done = 0, ok = 0, noimg = 0, fail = 0;
async function processBook(b: any) {
  const meta = wp.get(Number(b.legacy_wp_id));
  if (!meta?.file) { noimg++; return; }
  try {
    const res = await fetch(`https://agone.org/wp-content/uploads/${meta.file}`);
    if (!res.ok) { fail++; return; }
    const buf = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(buf).rotate().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const isbn = (meta.isbn || '').replace(/[^0-9Xx]/g, '');
    const key = `livres/couvertures/${isbn || `wp-${b.legacy_wp_id}`}.webp`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: webp, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
    const url = `${PUBLIC}/${key}`;
    const media = (await q(`CREATE media CONTENT $m`, { m: { key, url, kind: 'cover', mime: 'image/webp', filename: `${isbn || b.legacy_wp_id}.webp`, size: webp.byteLength, alt: b.title } }))[0];
    await q(`UPDATE $id SET cover = $m`, { id: new RecordId('book', String(b.id).replace(/^book:/, '')), m: media.id });
    ok++;
  } catch (e: any) { fail++; console.log('  !', b.title, String(e?.message ?? e).slice(0, 60)); }
}

const POOL = 6;
for (let i = 0; i < coverless.length; i += POOL) {
  await Promise.all(coverless.slice(i, i + POOL).map(processBook));
  done += Math.min(POOL, coverless.length - i);
  if (done % 30 === 0 || done === coverless.length) console.log(`  … ${done}/${coverless.length} (ok ${ok})`);
}
console.log(`✓ Couvertures WP : ${ok} récupérées, ${noimg} sans image à la une, ${fail} échecs.`);
await db.close();
process.exit(0);
