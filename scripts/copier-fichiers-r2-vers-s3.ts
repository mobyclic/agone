/**
 * Copie les fichiers de Cloudflare R2 (buckets public ET privé) vers le bucket Infomaniak « agone » :
 * mêmes clés, type et cache conservés. Rejouable : un fichier déjà présent (même taille) est sauté.
 *
 *   railway variables --service agone --json | bun run scripts/copier-fichiers-r2-vers-s3.ts
 *
 * La configuration R2 arrive sur l'entrée standard (JSON des variables Railway, où vit le nom du
 * bucket privé) ; les accès Infomaniak sont lus dans ~/.infomaniak-s3.env. Rien n'est affiché.
 * Voir docs/INFOMANIAK.md (bascule).
 */
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
const r2: Record<string, string> = JSON.parse(await Bun.stdin.text());
const s3env = Object.fromEntries((await Bun.file(process.env.HOME + '/.infomaniak-s3.env').text()).split('\n').map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/)).filter(Boolean).map((m) => [m![1], m![2]]));
const host = r2.CLOUDFLARE_R2_JURISDICTION ? `${r2.CLOUDFLARE_ACCOUNT_ID}.${r2.CLOUDFLARE_R2_JURISDICTION}.r2.cloudflarestorage.com` : `${r2.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const src = new S3Client({ region: 'auto', endpoint: `https://${host}`, credentials: { accessKeyId: r2.CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey: r2.CLOUDFLARE_R2_SECRET_ACCESS_KEY } });
const dst = new S3Client({ endpoint: s3env.S3_ENDPOINT, region: s3env.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: s3env.S3_ACCESS_KEY_ID, secretAccessKey: s3env.S3_SECRET_ACCESS_KEY } });
const DEST = 'agone';
for (const [nom, bucket] of [['public', r2.CLOUDFLARE_R2_BUCKET_NAME], ['privé', r2.CLOUDFLARE_R2_BUCKET_PRIVATE]] as const) {
  if (!bucket) { console.log(`${nom} : non configuré`); continue; }
  const cles: { Key: string; Size: number }[] = []; let token: string | undefined;
  do { const r = await src.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token })); for (const o of r.Contents ?? []) cles.push({ Key: o.Key!, Size: o.Size ?? 0 }); token = r.IsTruncated ? r.NextContinuationToken : undefined; } while (token);
  let copies = 0, deja = 0, octets = 0; const echecs: string[] = [];
  for (let i = 0; i < cles.length; i += 8) {
    await Promise.all(cles.slice(i, i + 8).map(async (o) => {
      try {
        try { const h = await dst.send(new HeadObjectCommand({ Bucket: DEST, Key: o.Key })); if (h.ContentLength === o.Size) { deja++; return; } } catch { /* absent */ }
        const g: any = await src.send(new GetObjectCommand({ Bucket: bucket, Key: o.Key }));
        const body = await g.Body.transformToByteArray();
        await dst.send(new PutObjectCommand({ Bucket: DEST, Key: o.Key, Body: body, ContentType: g.ContentType, CacheControl: g.CacheControl }));
        copies++; octets += body.byteLength;
      } catch (e: any) { echecs.push(`${o.Key} (${e?.name ?? e})`); }
    }));
  }
  console.log(`${nom} : ${cles.length} objets · ${copies} copiés (${(octets / 1e6).toFixed(1)} Mo) · ${deja} déjà présents · ${echecs.length} échecs${echecs.length ? ' : ' + echecs.slice(0, 5).join(', ') : ''}`);
}
