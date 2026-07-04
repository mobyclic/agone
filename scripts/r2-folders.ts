/**
 * Crée les « dossiers » logiques du bucket R2 AGONE (objets .keep de 0 octet).
 * R2/S3 n'a pas de vrais dossiers (préfixes virtuels) ; ces marqueurs rendent
 * l'arborescence visible dans le dashboard et documentent la convention.
 *
 *   bun run scripts/r2-folders.ts
 */
import { readFileSync } from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
const JUR = (process.env.CLOUDFLARE_R2_JURISDICTION ?? '').trim().toLowerCase();
const host = JUR ? `${ACCOUNT_ID}.${JUR}.r2.cloudflarestorage.com` : `${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${host}`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!
  }
});

const FOLDERS = [
  'livres/',
  'livres/couvertures/',
  'livres/ebooks/',
  'auteurs/',
  'blog/',
  'rencontres/',
  'media/'
];

for (const prefix of FOLDERS) {
  await client.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: `${prefix}.keep`, Body: '', ContentType: 'text/plain' })
  );
  console.log('  ✓', prefix);
}
console.log(`✓ ${FOLDERS.length} dossiers R2 créés dans le bucket "${BUCKET}"`);
process.exit(0);
