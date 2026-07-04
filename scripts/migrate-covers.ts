/**
 * Migration des couvertures : dossier local <COUV_DIR>/<ISBN>.png|jpg → R2
 * (optimisées webp), création d'un `media`, mise à jour de `book.cover`.
 * Source = migration.agone.org/couvertures (nommées par EAN-13).
 *
 *   COUV_DIR=/chemin/couvertures bun run scripts/migrate-covers.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { Surreal, RecordId } from 'surrealdb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const COUV = process.env.COUV_DIR;
if (!COUV) throw new Error('COUV_DIR manquant');

const acc = process.env.CLOUDFLARE_ACCOUNT_ID!;
const jur = (process.env.CLOUDFLARE_R2_JURISDICTION ?? '').trim().toLowerCase();
const host = jur ? `${acc}.${jur}.r2.cloudflarestorage.com` : `${acc}.r2.cloudflarestorage.com`;
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
const PUBLIC = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
const s3 = new S3Client({
  region: 'auto', endpoint: `https://${host}`,
  credentials: { accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!, secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY! }
});

const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! });

const books: any[] = (await db.query<any[]>(
  `SELECT id, isbn_paper, title FROM book WHERE isbn_paper != NONE`
))[0];
console.log(`→ ${books.length} livres avec ISBN`);

let done = 0, uploaded = 0, missing = 0;
async function processBook(b: any) {
  const isbn = String(b.isbn_paper).replace(/[^0-9Xx]/g, '');
  const src = ['png', 'jpg', 'jpeg', 'PNG', 'JPG'].map((e) => `${COUV}/${isbn}.${e}`).find((p) => existsSync(p));
  if (!src) { missing++; return; }
  try {
    const webp = await sharp(readFileSync(src)).rotate().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const key = `livres/couvertures/${isbn}.webp`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: webp, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
    const url = `${PUBLIC}/${key}`;
    const media: any[] = (await db.query<any[]>(
      `CREATE media CONTENT $m`,
      { m: { key, url, kind: 'cover', mime: 'image/webp', filename: `${isbn}.webp`, size: webp.byteLength, alt: b.title } }
    ))[0] as any;
    const mediaId = Array.isArray(media) ? media[0].id : media.id;
    await db.query(`UPDATE $id SET cover = $m`, { id: new RecordId('book', String(b.id).replace(/^book:/, '')), m: mediaId });
    uploaded++;
  } catch (e: any) {
    console.log(`  ! ${isbn}: ${e?.message ?? e}`);
  }
}

const POOL = 8;
for (let i = 0; i < books.length; i += POOL) {
  await Promise.all(books.slice(i, i + POOL).map(processBook));
  done += Math.min(POOL, books.length - i);
  if (done % 80 === 0 || done === books.length) console.log(`  … ${done}/${books.length} (uploadées ${uploaded})`);
}
console.log(`✓ Couvertures : ${uploaded} uploadées, ${missing} sans fichier ISBN.`);
await db.close();
process.exit(0);
