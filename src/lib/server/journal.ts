/**
 * Journal des actions du back-office.
 *
 * Répond à « qui a changé ce prix ? », « quand cette commande est-elle passée
 * en remboursée ? ». On journalise ce qui engage — pas les consultations.
 * Jamais bloquant : une écriture qui échoue ne fait pas échouer l'action.
 */
import { query, recId } from './surreal';

export interface Entree {
  action: string;
  cible?: { type: string; id: string; libelle?: string };
  details?: Record<string, unknown>;
}

export async function journaliser(locals: App.Locals, e: Entree): Promise<void> {
  try {
    const u = locals.user;
    await query(`CREATE admin_log CONTENT $c`, {
      c: {
        actor: u ? recId('user', u.id) : undefined,
        actor_name: u ? u.full_name || u.email : undefined,
        action: e.action,
        target_type: e.cible?.type,
        target_id: e.cible?.id ? String(e.cible.id).replace(/^[a-z_]+:/, '') : undefined,
        target_label: e.cible?.libelle,
        details: e.details && Object.keys(e.details).length ? e.details : undefined
      }
    });
  } catch (err) {
    console.error('[journal]', e.action, err);
  }
}

export async function listerJournal(opts: { type?: string; q?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 100, start: opts.offset ?? 0 };
  if (opts.type) { where.push('target_type = $t'); vars.t = opts.type; }
  if (opts.q?.trim()) {
    vars.q = opts.q.trim().toLowerCase();
    where.push('(string::lowercase(target_label ?? "") CONTAINS $q OR string::lowercase(actor_name ?? "") CONTAINS $q OR action CONTAINS $q)');
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, actor_name, action, target_type, target_id, target_label, details, created_at
       FROM admin_log ${whereSql} ORDER BY created_at DESC LIMIT $limit START $start`,
    vars
  );
  const count = await query<any>(`SELECT count() AS n FROM admin_log ${whereSql} GROUP ALL`, vars);
  return { entrees: rows, total: count[0]?.n ?? 0 };
}

/** Lien vers la fiche visée, quand il y en a une. */
export function lienCible(type?: string, id?: string, details?: any): string | null {
  if (!type || !id) return null;
  switch (type) {
    case 'order': return details?.number ? `/admin/commandes/${details.number}` : null;
    case 'book': return details?.slug ? `/admin/catalogue/${details.slug}` : null;
    case 'author': return details?.slug ? `/admin/auteurs/${details.slug}` : null;
    case 'royalty_contract': return details?.book_id ? `/admin/droits/contrats/${details.book_id}` : null;
    case 'royalty_statement': return `/admin/droits/reddition/${id}`;
    case 'rights_deal': return `/admin/droits/cessions/${id}`;
    case 'article': return `/admin/articles/${id}`;
    case 'user': return `/admin/utilisateurs/${id}`;
    default: return null;
  }
}
