/**
 * Migration des rencontres (événements) WordPress → SurrealDB.
 * Les LIEUX (google_map) sont extraits en table `venue` RÉUTILISABLE, dédupliquée
 * par place_id (les mêmes lieux reviennent souvent) et géolocalisée (geo point).
 *
 *   WP_DIR=/chemin bun run scripts/migrate-rencontres.ts
 */
import { readFileSync } from 'node:fs';
import { Surreal, RecordId, GeometryPoint } from 'surrealdb';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const WP = process.env.WP_DIR;
if (!WP) throw new Error('WP_DIR manquant');

const readJsonl = (f: string): any[] =>
  readFileSync(`${WP}/${f}`, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

function slugify(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}
function num(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v); return Number.isFinite(n) ? n : undefined;
}
function wpDateTime(v: any): Date | undefined {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return undefined;
  const dt = new Date(s.replace(' ', 'T') + (s.length <= 10 ? 'T00:00:00' : ''));
  return isNaN(+dt) ? undefined : dt;
}
const parseIds = (s: any): number[] => {
  const out: number[] = []; const re = /s:\d+:"(\d+)"/g; let m;
  while ((m = re.exec(String(s ?? '')))) out.push(Number(m[1])); return out;
};
/** Lit un champ d'un blob PHP-serialize google_map (byte-length ignorée). */
function phpField(blob: string, key: string): string | undefined {
  const idx = blob.indexOf(`"${key}";`);
  if (idx < 0) return undefined;
  const rest = blob.slice(idx + key.length + 3);
  let m = rest.match(/^s:\d+:"([^"]*)"/); if (m) return m[1] || undefined;
  m = rest.match(/^d:([-0-9.eE]+)/); if (m) return m[1];
  m = rest.match(/^i:(-?\d+)/); if (m) return m[1];
  return undefined;
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! });
console.log('→ Migration rencontres', process.env.SURREAL_NAMESPACE, '/', process.env.SURREAL_DATABASE);

await db.query('DELETE event; DELETE venue;');

// Maps legacy → record
const authMap = new Map<number, RecordId>();
for (const r of (await db.query<any[]>('SELECT id, legacy_wp_id FROM author'))[0]) authMap.set(Number(r.legacy_wp_id), r.id);
const bookMap = new Map<number, RecordId>();
for (const r of (await db.query<any[]>('SELECT id, legacy_wp_id FROM book'))[0]) bookMap.set(Number(r.legacy_wp_id), r.id);

// Venues (dédup par place_id | nom+ville)
const venueByKey = new Map<string, RecordId>();
const venueSlugs = new Set<string>();
async function ensureVenue(lieu: string | undefined): Promise<RecordId | undefined> {
  if (!lieu || !lieu.includes('name')) return undefined;
  const name = phpField(lieu, 'name');
  if (!name) return undefined;
  const city = phpField(lieu, 'city');
  const placeId = phpField(lieu, 'place_id');
  const key = placeId || slugify(`${name}-${city ?? ''}`);
  if (venueByKey.has(key)) return venueByKey.get(key);

  let slug = slugify(`${name}-${city ?? ''}`) || slugify(name) || 'lieu';
  let s = slug, i = 2; while (venueSlugs.has(s)) s = `${slug}-${i++}`;
  venueSlugs.add(s);

  const lat = num(phpField(lieu, 'lat')), lng = num(phpField(lieu, 'lng'));
  const street = [phpField(lieu, 'street_number'), phpField(lieu, 'street_name')].filter(Boolean).join(' ') || undefined;
  const content: any = {
    name, slug: s, address: phpField(lieu, 'address'), street, city,
    post_code: phpField(lieu, 'post_code'), state: phpField(lieu, 'state'),
    country: phpField(lieu, 'country'), country_short: phpField(lieu, 'country_short'),
    lat, lng, place_id: placeId,
    geo: lat != null && lng != null ? new GeometryPoint([lng, lat]) : undefined
  };
  const rows = (await db.query<any[]>('CREATE venue CONTENT $c', { c: content }))[0];
  const id = (rows as any)[0].id as RecordId;
  venueByKey.set(key, id);
  return id;
}

const evtSlugs = new Set<string>();
const rencontres = readJsonl('rencontres.json');
let created = 0;
for (const r of rencontres) {
  const venue = await ensureVenue(r.lieu);
  let slug = slugify(r.title || r.slug) || `rencontre-${r.id}`;
  let s = slug, i = 2; while (evtSlugs.has(s)) s = `${slug}-${i++}`;
  evtSlugs.add(s);
  const authors = parseIds(r.auteurs).map((id) => authMap.get(id)).filter(Boolean);
  const books = parseIds(r.livres).map((id) => bookMap.get(id)).filter(Boolean);
  await db.query('CREATE event CONTENT $c', {
    c: {
      title: r.title, slug: s, body_html: r.content || undefined,
      start_at: wpDateTime(r.debut), end_at: wpDateTime(r.fin),
      venue, authors, books, legacy_wp_id: Number(r.id)
    }
  });
  created++;
}
console.log('  ✓ venues (dédupliqués):', venueByKey.size);
console.log('  ✓ events:', created);

// Compteur d'événements par lieu (lieux récurrents)
const counts = (await db.query<any[]>('SELECT venue AS v, count() AS n FROM event WHERE venue != NONE GROUP BY venue'))[0];
for (const c of counts) if (c.v) await db.query('UPDATE $id SET event_count = $n', { id: c.v, n: c.n });
console.log('  ✓ event_count mis à jour sur', counts.length, 'lieux');

console.log('✓ Migration rencontres terminée');
await db.close();
process.exit(0);
