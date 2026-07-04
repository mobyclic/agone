/**
 * Seed AGONE — compte admin + collections de référence.
 * Idempotent : ré-exécutable (admin par email, collections par slug).
 *
 *   bun run seed
 *
 * Variables : SEED_ADMIN_EMAIL (défaut alistair.marca@gmail.com),
 *             SEED_ADMIN_PASSWORD (défaut « agone2026 »).
 */
import { readFileSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { Surreal } from 'surrealdb';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL!, { versionCheck: false });
await db.use({ namespace: process.env.SURREAL_NAMESPACE!, database: process.env.SURREAL_DATABASE! });
await db.signin({ username: process.env.SURREAL_USER!, password: process.env.SURREAL_PASS! });
console.log('→ Seed', process.env.SURREAL_NAMESPACE, '/', process.env.SURREAL_DATABASE);

// ── COMPTE ADMIN ─────────────────────────────────────────────
const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'alistair.marca@gmail.com').toLowerCase();
const adminPass = process.env.SEED_ADMIN_PASSWORD || 'agone2026';
await db.query(`DELETE user WHERE email = $e`, { e: adminEmail });
await db.query(`CREATE user CONTENT $u`, {
  u: {
    email: adminEmail,
    password_hash: hashPassword(adminPass),
    first_name: 'Alistair',
    last_name: 'Marca',
    slug: 'alistair-marca',
    role: 'admin',
    email_verified: true,
    accepts_newsletter: false,
    unsubscribe_token: randomBytes(16).toString('hex')
  }
});
console.log('  ✓ admin:', adminEmail, '/', adminPass);

// ── COLLECTIONS (référentiel réel Agone) ─────────────────────
const COLLECTIONS = [
  'Contre-feux',
  "L'Épreuve des faits",
  'Éléments',
  'Mémoires sociales',
  'Banc d’essai',
  'Cent mille signes',
  'La sociale',
  'Passé & présent',
  'Marginales'
];
let sort = 0;
for (const name of COLLECTIONS) {
  const slug = slugify(name);
  await db.query(`DELETE collection WHERE slug = $slug; CREATE collection CONTENT $c`, {
    slug,
    c: { name, slug, sort: sort++ }
  });
}
console.log('  ✓ collections:', COLLECTIONS.length);

// ── PARAMÈTRES DE SITE (compteurs de numérotation) ───────────
await db.query(
  `DELETE site_setting WHERE key = $k; CREATE site_setting CONTENT $s`,
  { k: 'counters', s: { key: 'counters', value: { order_number: 1000, invoice_number: 1 } } }
);
console.log('  ✓ site_setting: counters');

console.log('✓ Seed AGONE terminé');
await db.close();
process.exit(0);
