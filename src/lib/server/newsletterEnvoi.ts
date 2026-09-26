/**
 * Envoi d'un numéro de LettrInfo, en TÂCHE DE FOND.
 *
 * Mille abonnés, c'est dix appels Resend par lots de cent : trop long pour une
 * requête de formulaire. L'action lance la tâche et répond ; la page suit
 * l'avancement sur /admin/newsletter/api/envoi.
 *
 * Le corps est rendu une fois, puis personnalisé par abonné : le lien de
 * désabonnement porte son jeton. Un numéro déjà envoyé ne repart pas sans
 * qu'on le demande explicitement.
 */
import { query, recId } from './surreal';
import { sendMail, sendMailBatch, SITE_URL } from './mail';
import { renderIssueEmail } from './newsletterEmail';

export interface EnvoiNewsletter {
  id: string;
  issueId: string;
  titre: string;
  enCours: boolean;
  debut: string;
  fin?: string;
  total: number;
  envoyes: number;
  erreurs: string[];
}

let job: EnvoiNewsletter | null = null;
export const etatEnvoi = (): EnvoiNewsletter | null => job;

const sujetDe = (titre: string) => titre.replace(/\s*\[LettrInfos?[^\]]*\]\s*$/i, '').trim() || 'LettrInfo Agone';
const lienDesabonnement = (token: string) => `${SITE_URL}/newsletter/desabonnement?token=${encodeURIComponent(token)}`;

/** Un exemplaire vers une adresse : pour relire avant d'envoyer à tout le monde. */
export async function envoyerTest(issueId: string, email: string) {
  const html = await renderIssueEmail(issueId);
  if (!html) return { ok: false, error: 'Numéro introuvable.' };
  const a = (await query<any>(`SELECT title FROM $id`, { id: recId('article', issueId) }))[0];
  const res = await sendMail({
    to: email,
    subject: `[TEST] ${sujetDe(a?.title ?? '')}`,
    html: html.replace(/\{\{unsubscribe\}\}/g, `${SITE_URL}/newsletter/desabonnement`),
    bypassDryRun: true
  });
  if (res.ok) await query(`UPDATE $id SET newsletter_test_sent_at = time::now()`, { id: recId('article', issueId) });
  return res;
}

/** Abonnés actifs, en pages ; l'e-mail est projeté car on trie dessus. */
async function abonnes(start: number, limit: number) {
  return query<any>(
    `SELECT email, token FROM newsletter_subscriber WHERE status = 'subscribed' ORDER BY email ASC LIMIT $limit START $start`,
    { limit, start }
  );
}

export async function lancerEnvoi(issueId: string): Promise<EnvoiNewsletter | { error: string }> {
  if (job?.enCours) return job;
  const a = (await query<any>(`SELECT title FROM $id`, { id: recId('article', issueId) }))[0];
  if (!a) return { error: 'Numéro introuvable.' };
  const html = await renderIssueEmail(issueId);
  if (!html) return { error: 'Numéro vide.' };
  const compte = await query<any>(`SELECT count() AS n FROM newsletter_subscriber WHERE status = 'subscribed' GROUP ALL`);
  const total = compte[0]?.n ?? 0;
  if (!total) return { error: 'Aucun abonné actif.' };

  const j: EnvoiNewsletter = {
    id: Math.random().toString(36).slice(2, 10), issueId, titre: a.title,
    enCours: true, debut: new Date().toISOString(), total, envoyes: 0, erreurs: []
  };
  job = j;
  void executer(j, html, sujetDe(a.title));
  return j;
}

async function executer(j: EnvoiNewsletter, html: string, sujet: string) {
  try {
    const PAGE = 100;
    for (let start = 0; start < j.total + PAGE; start += PAGE) {
      const lot = await abonnes(start, PAGE);
      if (!lot.length) break;
      const messages = lot
        .filter((s: any) => s.email)
        .map((s: any) => ({
          to: String(s.email),
          subject: sujet,
          html: html.replace(/\{\{unsubscribe\}\}/g, lienDesabonnement(String(s.token ?? ''))),
          headers: { 'List-Unsubscribe': `<${lienDesabonnement(String(s.token ?? ''))}>` }
        }));
      const r = await sendMailBatch(messages);
      j.envoyes += r.ok;
      for (const e of r.erreurs) if (j.erreurs.length < 20) j.erreurs.push(e);
      if (lot.length < PAGE) break;
    }
    await query(
      `UPDATE $id SET newsletter_sent_at = time::now(), newsletter_sent_count = $n,
         status = 'published', published_at = published_at ?? time::now()`,
      { id: recId('article', j.issueId), n: j.envoyes }
    );
  } catch (e) {
    j.erreurs.push(e instanceof Error ? e.message : 'Échec.');
  } finally {
    j.enCours = false;
    j.fin = new Date().toISOString();
  }
}
