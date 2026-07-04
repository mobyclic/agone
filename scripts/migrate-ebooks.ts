/**
 * Migration ebooks + bibliothèque : fichiers .epub → R2 (clés non-devinables),
 * ebook_asset, clients (users), et arêtes user->owns->ebook_asset (entitlements).
 *   EPUB_DIR=/chemin WP_DIR=/chemin bun run scripts/migrate-ebooks.ts
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { Surreal, RecordId } from 'surrealdb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const WP = process.env.WP_DIR, EPUB = process.env.EPUB_DIR;
if (!WP || !EPUB) throw new Error('WP_DIR et EPUB_DIR requis');
const readJsonl = (f: string) => readFileSync(`${WP}/${f}`, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

// index basename → chemin (récursif)
const byBasename = new Map<string, string>();
(function walk(dir: string) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.epub$/i.test(e)) byBasename.set(e.toLowerCase(), p);
  }
})(EPUB);
console.log('epub files indexés:', byBasename.size);

const acc = process.env.CLOUDFLARE_ACCOUNT_ID!;
const jur = (process.env.CLOUDFLARE_R2_JURISDICTION ?? '').trim().toLowerCase();
const host = jur ? `${acc}.${jur}.r2.cloudflarestorage.com` : `${acc}.r2.cloudflarestorage.com`;
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
const s3 = new S3Client({ region: 'auto', endpoint: `https://${host}`, credentials: { accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!, secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY! } });

const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! });
const q = (s: string, v?: any) => db.query(s, v).then((r: any) => r[0]);
console.log('→ Migration ebooks', process.env.SURREAL_NAMESPACE, '/', process.env.SURREAL_DATABASE);

await q(`DELETE owns; DELETE ebook_asset;`);

// map book legacy_wp_id → surreal id
const bookMap = new Map<number, string>();
for (const b of await q(`SELECT id, legacy_wp_id FROM book WHERE legacy_wp_id != NONE`)) bookMap.set(Number(b.legacy_wp_id), String(b.id));

// ── CLIENTS ───────────────────────────────────────────────────
const userMap = new Map<number, string>(); // wp user id → surreal user id
let cNew = 0, cExist = 0;
for (const c of readJsonl('customers.json')) {
  const email = String(c.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) continue;
  const ex = (await q(`SELECT id FROM user WHERE email = $e LIMIT 1`, { e: email }))[0];
  if (ex) {
    await q(`UPDATE $id SET legacy_wp_id = $lid`, { id: new RecordId('user', String(ex.id).replace(/^user:/, '')), lid: Number(c.id) });
    userMap.set(Number(c.id), String(ex.id)); cExist++;
  } else {
    const rows = await q(`CREATE user CONTENT $u`, { u: { email, first_name: c.first || '', last_name: c.last || '', role: 'customer', email_verified: true, accepts_newsletter: false, unsubscribe_token: randomBytes(12).toString('hex'), legacy_wp_id: Number(c.id) } });
    userMap.set(Number(c.id), String(rows[0].id)); cNew++;
  }
}
console.log(`  ✓ clients: ${cNew} créés, ${cExist} existants`);

// ── EBOOK ASSETS (upload R2) ──────────────────────────────────
const assetByBook = new Map<number, string>(); // wp book id → ebook_asset surreal id
const ebooks = readJsonl('ebooks.json');
let up = 0, missing = 0, done = 0;
async function processEbook(e: any) {
  const bookId = bookMap.get(Number(e.book_id));
  if (!bookId) return;
  const base = String(e.file ?? '').split('/').pop()?.toLowerCase();
  const localPath = e.file && existsSync(join(EPUB, e.file)) ? join(EPUB, e.file) : base ? byBasename.get(base) : undefined;
  let r2_key: string, status: string, size: number | undefined, filename: string | undefined;
  if (localPath && existsSync(localPath)) {
    const buf = readFileSync(localPath);
    r2_key = `livres/ebooks/${randomUUID()}.epub`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: r2_key, Body: buf, ContentType: 'application/epub+zip', CacheControl: 'private, no-store' }));
    status = 'available'; size = buf.byteLength; filename = base; up++;
  } else {
    r2_key = `livres/ebooks/missing-${e.att_id}`; status = 'announced_no_file'; missing++;
  }
  const rows = await q(`CREATE ebook_asset CONTENT $a`, { a: { book: new RecordId('book', bookId.replace(/^book:/, '')), format: 'epub', r2_key, filename, size, content_type: 'application/epub+zip', status, legacy_attachment_id: Number(e.att_id) || undefined } });
  assetByBook.set(Number(e.book_id), String((rows as any)[0].id));
}
const POOL = 6;
for (let i = 0; i < ebooks.length; i += POOL) {
  await Promise.all(ebooks.slice(i, i + POOL).map(processEbook));
  done += Math.min(POOL, ebooks.length - i);
  if (done % 60 === 0 || done === ebooks.length) console.log(`  … ${done}/${ebooks.length} (uploadés ${up})`);
}
console.log(`  ✓ ebook_assets : ${up} fichiers uploadés, ${missing} sans fichier`);

// ── ENTITLEMENTS → owns ───────────────────────────────────────
let owned = 0;
for (const ent of readJsonl('entitlements.json')) {
  const u = userMap.get(Number(ent.id_user));
  const a = assetByBook.get(Number(ent.id_livre));
  if (!u || !a) continue;
  try {
    await q(`RELATE $u->owns->$a SET acquired_at = $d`, { u: new RecordId('user', u.replace(/^user:/, '')), a: new RecordId('ebook_asset', a.replace(/^ebook_asset:/, '')), d: ent.date_add ? new Date(ent.date_add) : new Date('2024-01-01') });
    owned++;
  } catch { /* dup */ }
}
console.log(`  ✓ bibliothèque : ${owned} droits d'accès (owns)`);

console.log('✓ Migration ebooks terminée');
await db.close();
process.exit(0);
