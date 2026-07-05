import { RecordId } from 'surrealdb';
import { query } from './surreal';

/** Slug ASCII : minuscules, tirets, sans accents. */
export function slugify(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Slug unique sur une table donnée (ajoute -2, -3… en cas de collision).
 * `field` = champ slug (par défaut 'slug').
 */
export async function uniqueSlug(
  table: string,
  base: string,
  opts: { field?: string; excludeId?: string } = {}
): Promise<string> {
  const field = opts.field ?? 'slug';
  const root = slugify(base) || 'item';
  let candidate = root;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await query<any>(
      `SELECT id FROM type::table($table) WHERE ${field} = $slug ${opts.excludeId ? 'AND id != $exclude' : ''} LIMIT 1`,
      { table, slug: candidate, ...(opts.excludeId ? { exclude: new RecordId(table, opts.excludeId) } : {}) }
    );
    if (!rows.length) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}
