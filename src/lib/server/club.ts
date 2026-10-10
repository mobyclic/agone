/**
 * Le Club des lecteurs : une adhésion annuelle (50 € TTC par défaut) qui donne
 * une remise sur le fonds (20 % sur les ouvrages parus depuis plus d'un an),
 * et éventuellement le port offert.
 *
 * - Réglages : site_setting « club » (Boutique en ligne › Le club).
 * - Adhésions : table club_membership (une ligne par période ; un renouvellement
 *   repart de la fin de l'adhésion en cours).
 * - La remise s'applique d'office au panier d'un membre, comme une promotion
 *   automatique (code « CLUB ») ; la plus avantageuse l'emporte.
 * - L'adhésion se paie en ligne (Stripe, webhook) ou s'enregistre à la main
 *   (chèque sur un salon…) ; une facture est émise et réglée.
 */
import { query, recId } from './surreal';
import { getSetting, setSetting } from './site';
import { createManualInvoice, emettreFacture, addPayment } from './invoice';
import { sendMail, layout, button, SITE_URL } from './mail';
import type { RegleRemise } from '$lib/promoCalcul';

export interface ReglagesClub {
  active: boolean;
  nom: string;
  prix_ttc: number;
  tva: number;
  remise: number;
  fond_ans: number;
  duree_mois: number;
  /** Port offert aux membres : jamais, toujours, ou seulement si la commande contient une nouveauté. */
  franco: 'non' | 'toujours' | 'nouveautes';
  texte: string;
}

export const CLUB_DEFAUT: ReglagesClub = {
  active: false, nom: 'Club des lecteurs', prix_ttc: 50, tva: 5.5, remise: 20, fond_ans: 1, duree_mois: 12, franco: 'non',
  texte: "Une adhésion d'un an pour soutenir une maison d'édition indépendante, et lire le fonds à prix réduit."
};

export async function getClub(): Promise<ReglagesClub> {
  const v = ((await getSetting('club')) ?? {}) as Partial<ReglagesClub>;
  const num = (x: unknown, d: number) => (Number.isFinite(Number(x)) && x !== '' && x != null ? Number(x) : d);
  return {
    active: v.active === true, nom: String(v.nom || CLUB_DEFAUT.nom), prix_ttc: num(v.prix_ttc, CLUB_DEFAUT.prix_ttc), tva: num(v.tva, CLUB_DEFAUT.tva),
    remise: num(v.remise, CLUB_DEFAUT.remise), fond_ans: num(v.fond_ans, CLUB_DEFAUT.fond_ans), duree_mois: num(v.duree_mois, CLUB_DEFAUT.duree_mois),
    franco: v.franco === 'toujours' || v.franco === 'nouveautes' ? v.franco : 'non', texte: String(v.texte ?? CLUB_DEFAUT.texte)
  };
}

export async function setClub(r: ReglagesClub) { await setSetting('club', { ...r }); }

export interface Adhesion { id: string; user_id: string; nom: string; email?: string; starts_at: string; ends_at: string; status: string; source: string; amount?: number; invoice_id?: string; invoice_ref?: string; note?: string; active: boolean;
  /** Abonnement Stripe (renouvellement automatique) et son état. */
  stripe_subscription?: string; auto_renew: boolean; reminder_sent_at?: string }

const normaliser = (r: any): Adhesion => ({
  id: String(r.id), user_id: String(r.user).replace(/^user:/, ''), nom: r.nom || r.email || '—', email: r.email ?? undefined,
  starts_at: r.starts_at, ends_at: r.ends_at, status: r.status, source: r.source, amount: r.amount ?? undefined,
  invoice_id: r.invoice ? String(r.invoice).replace(/^invoice:/, '') : undefined, invoice_ref: r.invoice_ref ?? undefined, note: r.note ?? undefined,
  stripe_subscription: r.stripe_subscription ?? undefined, auto_renew: r.auto_renew === true, reminder_sent_at: r.reminder_sent_at ?? undefined,
  active: r.status === 'active' && new Date(r.starts_at).getTime() <= Date.now() && new Date(r.ends_at).getTime() > Date.now()
});
const CHAMPS = `meta::id(id) AS id, user, user.full_name AS nom, user.email AS email, starts_at, ends_at, status, source, amount, invoice, invoice.ref AS invoice_ref, note, created_at, stripe_subscription, auto_renew, reminder_sent_at`;

/** Adhésion en cours d'un compte (la plus lointaine), ou null. */
export async function adhesionActive(userId?: string | null): Promise<Adhesion | null> {
  if (!userId) return null;
  const rows = await query<any>(
    `SELECT ${CHAMPS} FROM club_membership WHERE user = $u AND status = 'active' AND starts_at <= time::now() AND ends_at > time::now() ORDER BY ends_at DESC LIMIT 1`,
    { u: recId('user', userId.replace(/^user:/, '')) }
  );
  return rows[0] ? normaliser(rows[0]) : null;
}

export async function listAdhesions(opts: { q?: string; etat?: 'actives' | 'expirees' | 'toutes' } = {}) {
  const where: string[] = [];
  if (opts.etat !== 'toutes') where.push(opts.etat === 'expirees' ? "(ends_at <= time::now() OR status = 'cancelled')" : "status = 'active' AND ends_at > time::now()");
  const vars: Record<string, unknown> = {};
  if (opts.q?.trim()) { vars.q = opts.q.trim().toLowerCase(); where.push("(string::lowercase(user.full_name ?? '') CONTAINS $q OR string::lowercase(user.email ?? '') CONTAINS $q)"); }
  const rows = await query<any>(`SELECT ${CHAMPS} FROM club_membership ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ends_at DESC LIMIT 500`, vars);
  return rows.map(normaliser);
}

export async function statsClub() {
  const [actifs, an] = await Promise.all([
    query<any>(`SELECT count() AS n FROM club_membership WHERE status = 'active' AND starts_at <= time::now() AND ends_at > time::now() GROUP ALL`),
    query<any>(`SELECT count() AS n, math::sum(amount) AS total FROM club_membership WHERE created_at > time::now() - 1y GROUP ALL`)
  ]);
  return { actifs: Number(actifs[0]?.n ?? 0), adhesions_12_mois: Number(an[0]?.n ?? 0), encaisse_12_mois: Number(an[0]?.total ?? 0) };
}

/**
 * Enregistre une adhésion. Un membre déjà actif est prolongé : la nouvelle
 * période commence à la fin de la précédente. Avec `facturer`, une facture est
 * émise au membre et réglée du montant.
 */
/**
 * `stripeSession` : clé d'idempotence (session Checkout ou facture Stripe) — un webhook rejoué ne crée rien.
 * `fin` : fin de période imposée (abonnement : fin de la période facturée par Stripe).
 */
export async function ajouterAdhesion(userId: string, opts: { source: 'stripe' | 'manuel' | 'offert'; montant?: number; methode?: string; debut?: Date; fin?: Date; note?: string; stripeSession?: string; stripeSubscription?: string; facturer?: boolean }) {
  const club = await getClub();
  const uid = recId('user', userId.replace(/^user:/, ''));
  if (opts.stripeSession) {
    const deja = await query<any>(`SELECT meta::id(id) AS id FROM club_membership WHERE stripe_session = $s LIMIT 1`, { s: opts.stripeSession });
    if (deja[0]) return String(deja[0].id); // webhook rejoué
  }
  const enCours = await adhesionActive(userId);
  const debut = opts.debut ?? (enCours ? new Date(enCours.ends_at) : new Date());
  const fin = opts.fin ?? (() => { const f = new Date(debut); f.setMonth(f.getMonth() + club.duree_mois); return f; })();
  const montant = opts.source === 'offert' ? 0 : (opts.montant ?? club.prix_ttc);

  let invoice: string | undefined;
  if (opts.facturer !== false && montant > 0) {
    const u = (await query<any>(`SELECT full_name, email, billing FROM user WHERE id = $u LIMIT 1`, { u: uid }))[0] ?? {};
    const b = u.billing ?? {};
    const jour = (d: Date) => d.toLocaleDateString('fr-FR');
    invoice = await createManualInvoice({
      kind: 'invoice', customerId: userId.replace(/^user:/, ''), price_mode: 'ttc',
      bill_to: { name: u.full_name || u.email || 'Membre du club', email: u.email, address_1: b.address_1, postcode: b.postcode, city: b.city, country: b.country },
      lines: [{ description: `Adhésion au ${club.nom} — du ${jour(debut)} au ${jour(fin)}`, qty: 1, unit_price: montant, vat_rate: club.tva }]
    });
    await emettreFacture(invoice);
    await addPayment(invoice, { amount: montant, method: opts.methode ?? (opts.source === 'stripe' ? 'stripe' : 'cheque'), reference: opts.stripeSession, note: 'Adhésion au club' });
  }
  const rows = await query<any>(`CREATE club_membership CONTENT $c`, {
    c: { user: uid, starts_at: debut, ends_at: fin, status: 'active', source: opts.source, amount: montant, invoice: invoice ? recId('invoice', invoice) : undefined, stripe_session: opts.stripeSession,
         stripe_subscription: opts.stripeSubscription, auto_renew: !!opts.stripeSubscription, note: opts.note?.trim() || undefined }
  });
  return String(rows[0].id).replace(/^club_membership:/, '');
}

/**
 * État d'un abonnement Stripe (résilié, ou renouvellement coupé en fin de période) :
 * reporté sur les périodes qu'il a créées. L'adhésion en cours reste valable jusqu'à sa fin.
 */
export async function majAbonnementClub(subscriptionId: string, renouvellement: boolean) {
  await query(`UPDATE club_membership SET auto_renew = $r WHERE stripe_subscription = $s`, { s: subscriptionId, r: renouvellement });
}

/** Client Stripe d'un compte (créé au premier paiement), pour le portail de gestion. */
export async function memoriserClientStripe(userId: string, customerId: string) {
  await query(`UPDATE $u SET stripe_customer_id = $c`, { u: recId('user', userId.replace(/^user:/, '')), c: customerId });
}
export async function clientStripe(userId: string): Promise<string | null> {
  const r = await query<string>(`SELECT VALUE stripe_customer_id FROM $u`, { u: recId('user', userId.replace(/^user:/, '')) });
  return r[0] ?? null;
}

export async function annulerAdhesion(id: string) {
  await query(`UPDATE $id SET status = 'cancelled'`, { id: recId('club_membership', id) });
}

/** La remise du club, sous forme de règle de promotion automatique. */
export function regleClub(club: ReglagesClub): RegleRemise {
  return {
    code: 'CLUB', description: `${club.nom} : −${club.remise} % sur le fonds`, type: 'percent', value: club.remise, scope: 'fond',
    books: [], collections: [], fondAns: club.fond_ans, condition: 'none', conditionBooks: [], auto: true
  };
}

/** Port offert pour ce membre et ce panier ? (nouveauté = parue depuis moins de fond_ans) */
export function portOffert(club: ReglagesClub, membre: boolean, publications: (string | null | undefined)[]): boolean {
  if (!club.active || !membre || club.franco === 'non') return false;
  if (club.franco === 'toujours') return true;
  const limite = new Date(); limite.setFullYear(limite.getFullYear() - club.fond_ans);
  return publications.some((p) => !p || new Date(p) > limite);
}

/** Jours avant l'échéance où le membre est prévenu du renouvellement automatique. */
export const RAPPEL_JOURS = 15;

/**
 * Rappel avant renouvellement (tâche quotidienne, /api/cron/club-rappels) : aux
 * membres dont l'adhésion se renouvelle automatiquement et arrive à échéance dans
 * RAPPEL_JOURS jours ou moins, un e-mail — une seule fois par période
 * (reminder_sent_at). Le montant annoncé est celui de la période en cours :
 * Stripe reconduit le prix souscrit.
 */
export async function envoyerRappelsRenouvellement(jours = RAPPEL_JOURS): Promise<{ envoyes: number; echecs: number }> {
  const club = await getClub();
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, user, user.full_name AS nom, user.first_name AS prenom, user.email AS email, ends_at, amount
       FROM club_membership
      WHERE status = 'active' AND auto_renew = true AND reminder_sent_at = NONE
        AND ends_at > time::now() AND ends_at <= $limite
      ORDER BY ends_at ASC`,
    { limite: new Date(Date.now() + jours * 86400_000) }
  );
  const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  let envoyes = 0, echecs = 0;
  for (const m of rows) {
    if (!m.email) { echecs++; continue; }
    const date = new Date(m.ends_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const montant = Number(m.amount ?? club.prix_ttc);
    const html = layout(`Votre adhésion se renouvelle le ${date}`, `
      <p style="margin:0 0 14px">${m.prenom ? `Bonjour ${String(m.prenom).replace(/</g, '&lt;')},` : 'Bonjour,'}</p>
      <p style="margin:0 0 14px">Votre adhésion au ${club.nom} arrive à échéance le <strong>${date}</strong>. Elle sera renouvelée automatiquement pour ${club.duree_mois} mois :
        <strong>${euro(montant)}</strong> seront prélevés ce jour-là sur votre moyen de paiement enregistré, et vous recevrez la facture.</p>
      <p style="margin:0 0 14px">Vous n'avez rien à faire pour continuer à bénéficier de −${club.remise} % sur le fonds.</p>
      <p style="margin:0 0 8px">Pour changer de carte ou arrêter le renouvellement :</p>
      <p>${button(`${SITE_URL}/club`, 'Gérer mon adhésion')}</p>
      <p style="color:#8a857c;font-size:12px;margin-top:20px">Merci de soutenir une maison d'édition indépendante.</p>`);
    const r = await sendMail({ to: m.email, subject: `Votre adhésion au ${club.nom} se renouvelle le ${date}`, html });
    if (r.ok) { await query(`UPDATE $id SET reminder_sent_at = time::now()`, { id: recId('club_membership', String(m.id)) }); envoyes++; }
    else echecs++;
  }
  return { envoyes, echecs };
}
