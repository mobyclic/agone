/**
 * Couvertures manquantes, depuis un POSTE DE TRAVAIL.
 *
 *   bun run covers            # vise la base de .env.local s'il existe, sinon le cloud (.env)
 *   bun run covers --dry      # liste ce qui serait récupéré, sans rien écrire
 *
 * Pourquoi un script : agone.org (hébergé chez SiteGround) oppose un défi
 * anti-robots aux IP de serveurs — la synchro lancée depuis Railway reçoit une
 * page HTML au lieu de l'image. Un poste ordinaire n'est pas filtré.
 *
 * Passe par l'API REST publique de WordPress (lecture seule) : livre → image à la
 * une → fichier. Pas besoin de l'accès MySQL. Pour chaque livre migré encore sans
 * couverture : téléchargement, webp 800 px, dépôt R2, `media`, `book.cover`.
 * Idempotent : un livre qui a déjà sa couverture est ignoré.
 */
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { Surreal, RecordId } from 'surrealdb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// .env.local d'abord : s'il existe (base SurrealDB locale), ses valeurs l'emportent.
for (const l of ['.env.local', '.env'].flatMap((f) => { try { return readFileSync(f, 'utf8').split('\n'); } catch { return []; } })) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const E = process.env;
const DRY = process.argv.includes('--dry');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const WP = 'https://agone.org';

const acc = E.CLOUDFLARE_ACCOUNT_ID!;
const jur = (E.CLOUDFLARE_R2_JURISDICTION ?? '').trim().toLowerCase();
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${jur ? `${acc}.${jur}` : acc}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: E.CLOUDFLARE_R2_ACCESS_KEY_ID!, secretAccessKey: E.CLOUDFLARE_R2_SECRET_ACCESS_KEY! }
});
const BUCKET = E.CLOUDFLARE_R2_BUCKET_NAME!;
const PUBLIC = (E.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

const db = new Surreal();
await db.connect(E.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: E.SURREAL_NAMESPACE!, database: E.SURREAL_DATABASE! });
await db.signin({ username: E.SURREAL_USER!, password: E.SURREAL_PASS! });
const q = async (s: string, v?: any) => ((await db.query(s, v)) as any[])[0];
console.log(`Base : ${E.SURREAL_URL}${DRY ? '  (simulation)' : ''}`);

const livres = await q(`SELECT id, title, isbn_paper, legacy_wp_id FROM book WHERE cover = NONE AND legacy_wp_id != NONE`);
console.log(`→ ${livres.length} livre(s) migré(s) sans couverture`);

const json = async (url: string) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  return r.ok ? r.json() : null;
};

let ok = 0, sans = 0, echecs = 0;
for (const b of livres) {
  const wpId = Number(b.legacy_wp_id);
  try {
    const post = await json(`${WP}/wp-json/wp/v2/livres/${wpId}?_fields=featured_media`);
    const mediaId = Number(post?.featured_media ?? 0);
    if (!mediaId) { sans++; console.log(`  · ${b.title} — pas d'image à la une`); continue; }
    const media = await json(`${WP}/wp-json/wp/v2/media/${mediaId}?_fields=source_url`);
    const src: string | undefined = media?.source_url;
    if (!src) { sans++; console.log(`  · ${b.title} — média ${mediaId} introuvable`); continue; }
    if (DRY) { ok++; console.log(`  ✓ ${b.title} ← ${src}`); continue; }

    const res = await fetch(src, { headers: { 'User-Agent': UA, Accept: 'image/*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(buf).rotate().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const isbn = String(b.isbn_paper ?? '').replace(/[^0-9Xx]/g, '');
    const key = `livres/couvertures/${isbn || `wp-${wpId}`}.webp`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: webp, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
    const m = (await q(`CREATE media CONTENT $m`, {
      m: { key, url: `${PUBLIC}/${key}`, kind: 'cover', mime: 'image/webp', filename: key.split('/').pop(), size: webp.byteLength, alt: b.title }
    }))[0];
    await q(`UPDATE $id SET cover = $m`, { id: new RecordId('book', String(b.id).replace(/^book:/, '')), m: m.id });
    ok++;
    console.log(`  ✓ ${b.title}`);
  } catch (e: any) {
    echecs++;
    console.log(`  ! ${b.title} — ${String(e?.message ?? e).slice(0, 100)}`);
  }
}
console.log(`✓ ${ok} couverture(s) ${DRY ? 'récupérable(s)' : 'récupérée(s)'}, ${sans} sans image, ${echecs} échec(s).`);
await db.close();
process.exit(0);
