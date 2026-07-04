/**
 * Cloudflare R2 storage helper (AGONE).
 *
 * Structure des dossiers dans le bucket :
 *   livres/couvertures/<isbn>.webp   — couvertures (public)
 *   livres/ebooks/<isbn>.epub        — ebooks (PRIVÉ : servi via endpoint authentifié)
 *   auteurs/<slug>.webp              — portraits d'auteurs
 *   blog/<slug>/<variant>.webp       — visuels des articles (Antichambre)
 *   rencontres/<slug>/<variant>.webp — visuels des rencontres
 *   media/<dossier>/<id>             — uploads génériques (admin)
 *
 * Vars d'environnement attendues (Cloudflare R2) :
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   CLOUDFLARE_R2_BUCKET_NAME
 *   CLOUDFLARE_R2_PUBLIC_URL    — URL publique (custom domain ou r2.dev)
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';

const ACCOUNT_ID  = env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY  = env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const SECRET_KEY  = env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const BUCKET      = env.CLOUDFLARE_R2_BUCKET_NAME;
const PUBLIC_URL  = (env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
// Juridiction du bucket : '' (défaut), 'eu' ou 'fedramp'. Les buckets EU
// utilisent l'endpoint <account>.eu.r2.cloudflarestorage.com.
const JURISDICTION = (env.CLOUDFLARE_R2_JURISDICTION ?? '').trim().toLowerCase();

let _client: S3Client | null = null;
function getClient(): S3Client {
  if (_client) return _client;
  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    throw new Error('Cloudflare R2 misconfigured — check CLOUDFLARE_* env vars');
  }
  const host = JURISDICTION
    ? `${ACCOUNT_ID}.${JURISDICTION}.r2.cloudflarestorage.com`
    : `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${host}`,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY }
  });
  return _client;
}

/** Construit l'URL publique d'un fichier stocké (à partir de sa clé). */
export function publicUrlFor(key: string): string {
  if (!PUBLIC_URL) return key; // fallback : on retourne la clé brute
  return `${PUBLIC_URL}/${key.replace(/^\/+/, '')}`;
}

// ─────────────────────────────────────────────────────────────
// Optimisation image (sharp)
// ─────────────────────────────────────────────────────────────

export interface ImageOptimOptions {
  /** Largeur max (px). Hauteur calculée automatiquement. Default 2000. */
  maxWidth?: number;
  /** Format de sortie. 'webp' par défaut (meilleur ratio qualité/poids). */
  format?: 'webp' | 'jpeg' | 'avif';
  /** Qualité (1-100). 82 par défaut pour webp/jpeg. */
  quality?: number;
}

/** Optimise un buffer image (resize + format + compress). Retourne le buffer + mime. */
export async function optimizeImage(
  input: Buffer,
  opts: ImageOptimOptions = {}
): Promise<{ buffer: Buffer; mime: string; extension: string }> {
  const { maxWidth = 2000, format = 'webp', quality = 82 } = opts;
  let pipeline = sharp(input).rotate(); // auto-orient
  const meta = await pipeline.metadata();
  if (meta.width && meta.width > maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  }
  let buffer: Buffer;
  let mime: string;
  let extension: string;
  switch (format) {
    case 'jpeg':
      buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
      mime = 'image/jpeg'; extension = 'jpg'; break;
    case 'avif':
      buffer = await pipeline.avif({ quality }).toBuffer();
      mime = 'image/avif'; extension = 'avif'; break;
    case 'webp':
    default:
      buffer = await pipeline.webp({ quality, effort: 5 }).toBuffer();
      mime = 'image/webp'; extension = 'webp'; break;
  }
  return { buffer, mime, extension };
}

// ─────────────────────────────────────────────────────────────
// Upload / Delete
// ─────────────────────────────────────────────────────────────

export interface UploadResult {
  key: string;
  url: string;
  mime: string;
  size: number;
}

/** Upload un buffer brut (déjà optimisé) sous une clé donnée. */
export async function uploadBuffer(opts: {
  key: string;
  buffer: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<UploadResult> {
  const client = getClient();
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: opts.key,
    Body: opts.buffer,
    ContentType: opts.contentType,
    CacheControl: opts.cacheControl ?? 'public, max-age=31536000, immutable'
  }));
  return {
    key: opts.key,
    url: publicUrlFor(opts.key),
    mime: opts.contentType,
    size: opts.buffer.byteLength
  };
}

/** Récupère un objet privé du bucket (pour servir via un endpoint authentifié). Null si absent. */
export async function getObject(key: string): Promise<{ body: Uint8Array; contentType?: string } | null> {
  const client = getClient();
  try {
    const res: any = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = (await res.Body.transformToByteArray()) as Uint8Array;
    return { body, contentType: res.ContentType };
  } catch (e: any) {
    if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

/** Upload optimisé d'une image : resize + compression + upload R2 en une étape. */
export async function uploadOptimizedImage(opts: {
  /** Clé dans le bucket sans l'extension (ex: 'talents/abc/portrait-1'). */
  keyBase: string;
  /** Buffer d'image (depuis File.arrayBuffer()). */
  input: Buffer;
  /** Options d'optimisation. */
  optim?: ImageOptimOptions;
}): Promise<UploadResult> {
  const { buffer, mime, extension } = await optimizeImage(opts.input, opts.optim);
  const key = `${opts.keyBase.replace(/^\/+|\/+$/g, '')}.${extension}`;
  return uploadBuffer({ key, buffer, contentType: mime });
}

// ─────────────────────────────────────────────────────────────
// Navigation (médiathèque)
// ─────────────────────────────────────────────────────────────

export interface MediaFile {
  key: string;
  url: string;
  size: number;
  lastModified?: string;
}
export interface MediaListing {
  /** Préfixe courant (avec slash final), '' = racine. */
  prefix: string;
  /** Sous-dossiers (préfixes enfants, avec slash final). */
  folders: string[];
  /** Fichiers directement dans ce dossier. */
  files: MediaFile[];
}

/** Liste le contenu d'un « dossier » du bucket (navigation type explorateur). */
export async function listObjects(prefix = ''): Promise<MediaListing> {
  const client = getClient();
  const norm = prefix.replace(/^\/+/, '');
  const withSlash = norm && !norm.endsWith('/') ? norm + '/' : norm;
  const folders: string[] = [];
  const files: MediaFile[] = [];
  let token: string | undefined;
  do {
    const res: any = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: withSlash,
      Delimiter: '/',
      ContinuationToken: token
    }));
    for (const p of res.CommonPrefixes ?? []) {
      if (p.Prefix) folders.push(p.Prefix);
    }
    for (const o of res.Contents ?? []) {
      if (!o.Key || o.Key === withSlash) continue; // ignore le placeholder du dossier
      files.push({
        key: o.Key,
        url: publicUrlFor(o.Key),
        size: o.Size ?? 0,
        lastModified: o.LastModified ? new Date(o.LastModified).toISOString() : undefined
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return { prefix: withSlash, folders, files };
}

/** Liste récursive de toutes les images du bucket (pour un sélecteur de photos). */
export async function listAllImages(prefix = ''): Promise<MediaFile[]> {
  const client = getClient();
  const withSlash = prefix.replace(/^\/+/, '');
  const out: MediaFile[] = [];
  let token: string | undefined;
  do {
    const res: any = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: withSlash,
      ContinuationToken: token
    }));
    for (const o of res.Contents ?? []) {
      if (o.Key && /\.(jpe?g|png|webp|gif|avif)$/i.test(o.Key)) {
        out.push({
          key: o.Key,
          url: publicUrlFor(o.Key),
          size: o.Size ?? 0,
          lastModified: o.LastModified ? new Date(o.LastModified).toISOString() : undefined
        });
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** Supprime un seul objet du bucket. */
export async function deleteFile(key: string): Promise<void> {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Supprime TOUS les objets sous un préfixe (ex: tout le dossier d'un talent). */
export async function deletePrefix(prefix: string): Promise<number> {
  const client = getClient();
  let total = 0;
  let continuationToken: string | undefined = undefined;
  do {
    const listed: any = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix.replace(/^\/+|\/+$/g, '') + '/',
      ContinuationToken: continuationToken
    }));
    const contents = listed.Contents ?? [];
    if (contents.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: contents.map((o: any) => ({ Key: o.Key })) }
      }));
      total += contents.length;
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return total;
}

// ─────────────────────────────────────────────────────────────
// Conventions de clés (helpers)
// ─────────────────────────────────────────────────────────────

/** Dossiers logiques du bucket AGONE. */
export const R2_FOLDERS = ['livres', 'auteurs', 'blog', 'rencontres', 'media'] as const;

/** Clé (base, sans extension) d'une couverture de livre — publique, indexée par ISBN. */
export function bookCoverKey(isbn: string): string {
  return `livres/couvertures/${String(isbn).replace(/[^0-9Xx]/g, '')}`;
}

/** Clé d'un fichier ebook — bucket PRIVÉ (servi via endpoint authentifié + URL signée). */
export function bookEbookKey(isbn: string, ext: string = 'epub'): string {
  return `livres/ebooks/${String(isbn).replace(/[^0-9Xx]/g, '')}.${ext}`;
}

/** Clé (base, sans extension) du portrait d'un auteur. */
export function authorPortraitKey(slug: string): string {
  return `auteurs/${slug}`;
}

/** Clé (base, sans extension) d'un visuel d'article (Antichambre). */
export function blogImageKey(slug: string, variant: string = 'cover'): string {
  return `blog/${slug}/${variant}`;
}

/** Clé (base, sans extension) d'un visuel de rencontre. */
export function rencontreImageKey(slug: string, variant: string = 'cover'): string {
  return `rencontres/${slug}/${variant}`;
}

/** Clé générique pour un upload admin (dossier logique + id). */
export function mediaKey(folder: string, id: string): string {
  return `media/${folder.replace(/^\/+|\/+$/g, '')}/${id}`;
}
