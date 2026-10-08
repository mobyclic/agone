/**
 * Clients — ceux qu'on facture.
 *
 * Deux natures : les particuliers, qui sont des comptes `user` (inscrits sur le
 * site, acheteurs ou non), et les professionnels, personnes morales (`client`) —
 * libraires, écoles, associations, collectivités, auteurs qui achètent des
 * exemplaires — à qui l'on fait des factures. Un professionnel peut être relié
 * au compte de son contact.
 */
import { query, recId } from './surreal';

export const KINDS_CLIENT: Record<string, string> = {
  librairie: 'Librairie', entreprise: 'Entreprise', association: 'Association', collectivite: 'Collectivité',
  ecole: 'École / université', auteur: 'Auteur', autre: 'Autre'
};

export interface ClientPro {
  id: string; name: string; kind: string; siret?: string; vat_number?: string; contact_name?: string;
  email?: string; phone?: string; address_1?: string; address_2?: string; postcode?: string; city?: string; country: string;
  notes?: string; user?: string; created_at?: string;
  /** Dépositaire : on lui confie des exemplaires qu'il vend pour Agone (voir Dépôts). */
  depositaire?: boolean;
  /** Remise en % sur ses factures de dépôt ; vide = remise par défaut (Paramètres › Dépôts). */
  remise_depot?: number;
}

const CHAMPS = `meta::id(id) AS id, name, kind, siret, vat_number, contact_name, email, phone, address_1, address_2, postcode, city, country, notes, user, created_at, depositaire, remise_depot`;
const normaliser = (r: any): ClientPro => ({
  id: String(r.id), name: r.name, kind: r.kind ?? 'autre', siret: r.siret ?? undefined, vat_number: r.vat_number ?? undefined,
  contact_name: r.contact_name ?? undefined, email: r.email ?? undefined, phone: r.phone ?? undefined,
  address_1: r.address_1 ?? undefined, address_2: r.address_2 ?? undefined, postcode: r.postcode ?? undefined, city: r.city ?? undefined,
  country: r.country ?? 'France', notes: r.notes ?? undefined, user: r.user ? String(r.user).replace(/^user:/, '') : undefined, created_at: r.created_at ?? undefined,
  depositaire: r.depositaire === true, remise_depot: r.remise_depot != null ? Number(r.remise_depot) : undefined
});

export async function listClientsPro(opts: { q?: string; kind?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const vars: Record<string, unknown> = { limit: opts.limit ?? 50, start: opts.offset ?? 0 };
  if (opts.kind) { where.push('kind = $kind'); vars.kind = opts.kind; }
  if (opts.q?.trim()) { vars.q = opts.q.trim().toLowerCase(); where.push(`(string::lowercase(name) CONTAINS $q OR string::lowercase(city ?? '') CONTAINS $q OR string::lowercase(email ?? '') CONTAINS $q OR string::lowercase(contact_name ?? '') CONTAINS $q)`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query<any>(`SELECT ${CHAMPS} FROM client ${w} ORDER BY name ASC LIMIT $limit START $start`, vars);
  const count = await query<any>(`SELECT count() AS n FROM client ${w} GROUP ALL`, vars);
  // Nombre et montant des factures par client affiché.
  const ids = rows.map((r: any) => recId('client', String(r.id)));
  const factures = ids.length
    ? await query<any>(`SELECT client, count() AS n, math::sum(total_ttc) AS total FROM invoice WHERE client IN $ids AND kind = 'invoice' GROUP BY client`, { ids })
    : [];
  const parClient = new Map<string, { n: number; total: number }>();
  for (const f of factures) parClient.set(String(f.client).replace(/^client:/, ''), { n: Number(f.n ?? 0), total: Number(f.total ?? 0) });
  return {
    clients: rows.map((r: any) => ({ ...normaliser(r), factures: parClient.get(String(r.id))?.n ?? 0, facture_total: parClient.get(String(r.id))?.total ?? 0 })),
    total: count[0]?.n ?? 0
  };
}

export async function getClientPro(id: string): Promise<ClientPro | null> {
  const rows = await query<any>(`SELECT ${CHAMPS} FROM client WHERE id = $id LIMIT 1`, { id: recId('client', id) });
  return rows[0] ? normaliser(rows[0]) : null;
}

export type ClientProInput = Omit<ClientPro, 'id' | 'created_at'>;

export async function upsertClientPro(d: ClientProInput, id?: string): Promise<string> {
  const name = d.name?.trim();
  if (!name) throw new Error('La raison sociale est requise.');
  const champs = {
    name, kind: KINDS_CLIENT[d.kind] ? d.kind : 'autre',
    siret: d.siret?.replace(/\s/g, '') || undefined, vat_number: d.vat_number?.replace(/\s/g, '').toUpperCase() || undefined,
    contact_name: d.contact_name?.trim() || undefined, email: d.email?.trim().toLowerCase() || undefined, phone: d.phone?.trim() || undefined,
    address_1: d.address_1?.trim() || undefined, address_2: d.address_2?.trim() || undefined, postcode: d.postcode?.trim() || undefined,
    city: d.city?.trim() || undefined, country: d.country?.trim() || 'France', notes: d.notes?.trim() || undefined,
    user: d.user ? recId('user', d.user.replace(/^user:/, '')) : undefined,
    depositaire: d.depositaire === true,
    remise_depot: d.remise_depot != null && Number.isFinite(d.remise_depot) ? Math.min(100, Math.max(0, d.remise_depot)) : undefined
  };
  if (id) { await query(`UPDATE $id MERGE $c`, { id: recId('client', id), c: champs }); return id; }
  const rows = await query<any>(`CREATE client CONTENT $c`, { c: champs });
  return String(rows[0].id).replace(/^client:/, '');
}

/** Suppression : refusée si des factures y sont rattachées. */
export async function deleteClientPro(id: string): Promise<{ ok: boolean; error?: string }> {
  const n = await query<any>(`SELECT count() AS n FROM invoice WHERE client = $id GROUP ALL`, { id: recId('client', id) });
  if (n[0]?.n) return { ok: false, error: `${n[0].n} facture(s) portent ce client : il ne se supprime pas.` };
  await query(`DELETE $id`, { id: recId('client', id) });
  return { ok: true };
}

/** Factures d'un client professionnel, les plus récentes d'abord. */
export async function facturesDuClient(id: string) {
  return query<any>(
    `SELECT meta::id(id) AS id, ref, kind, total_ttc, issued_at FROM invoice WHERE client = $id ORDER BY issued_at DESC LIMIT 100`,
    { id: recId('client', id) }
  );
}

/** Recherche mêlée, pour « Facturé à » : professionnels puis particuliers. */
export async function rechercherClients(qRaw: string): Promise<{ type: 'pro' | 'user'; id: string; label: string; detail?: string; bill_to: Record<string, unknown> }[]> {
  const q = (qRaw ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const [pros, users] = await Promise.all([
    query<any>(`SELECT ${CHAMPS} FROM client WHERE string::lowercase(name) CONTAINS $q OR string::lowercase(city ?? '') CONTAINS $q OR string::lowercase(contact_name ?? '') CONTAINS $q ORDER BY name ASC LIMIT 6`, { q }),
    query<any>(`SELECT meta::id(id) AS id, full_name, email, billing FROM user WHERE role IN ['customer','pending','admin','editor'] AND (string::lowercase(full_name) CONTAINS $q OR string::lowercase(email ?? '') CONTAINS $q) ORDER BY full_name ASC LIMIT 6`, { q })
  ]);
  return [
    ...pros.map((r: any) => {
      const c = normaliser(r);
      return { type: 'pro' as const, id: c.id, label: c.name, detail: [KINDS_CLIENT[c.kind], c.city].filter(Boolean).join(' · '),
        bill_to: { name: c.name, email: c.email, address_1: [c.address_1, c.address_2].filter(Boolean).join(', ') || undefined, postcode: c.postcode, city: c.city, country: c.country, vat_number: c.vat_number, siret: c.siret, contact_name: c.contact_name } };
    }),
    ...users.map((u: any) => {
      const b = u.billing ?? {};
      return { type: 'user' as const, id: String(u.id), label: u.full_name || u.email || 'Client', detail: u.email ?? undefined,
        bill_to: { name: u.full_name || u.email, email: u.email ?? undefined, address_1: b.address_1 ?? b.address ?? undefined, postcode: b.postcode ?? undefined, city: b.city ?? undefined, country: b.country ?? undefined } };
    })
  ];
}
