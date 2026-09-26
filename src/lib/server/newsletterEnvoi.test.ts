/**
 * Envoi de LettrInfo — la mécanique, sans base ni Resend (bun test).
 * Vérifie : pagination des abonnés, personnalisation du lien de désabonnement,
 * comptage, horodatage du numéro à la fin.
 */
import { expect, mock, test } from 'bun:test';

const ABONNES = Array.from({ length: 230 }, (_, i) => ({ email: `a${i}@ex.org`, token: `tok${i}` }));
const envois: any[] = [];
const updates: any[] = [];

mock.module('$env/dynamic/private', () => ({ env: {} }));
mock.module('./surreal.ts', () => ({
  recId: (t: string, id: string) => `${t}:${id}`,
  query: async (sql: string, vars: any = {}) => {
    if (sql.includes('FROM newsletter_subscriber') && sql.includes('count()')) return [{ n: ABONNES.length }];
    if (sql.includes('FROM newsletter_subscriber')) return ABONNES.slice(vars.start, vars.start + vars.limit);
    if (sql.startsWith('UPDATE')) { updates.push({ sql, vars }); return []; }
    if (sql.includes('SELECT title')) return [{ title: 'La satire mise à mal [LettrInfo 26-XXIII]' }];
    return [];
  }
}));
mock.module('./mail.ts', () => ({
  SITE_URL: 'https://agone.org',
  sendMail: async (o: any) => { envois.push({ ...o, test: true }); return { ok: true }; },
  sendMailBatch: async (lots: any[]) => { envois.push(...lots); return { ok: lots.length, erreurs: [] }; }
}));
mock.module('./newsletterEmail.ts', () => ({
  renderIssueEmail: async () => '<p>Bonjour</p><a href="{{unsubscribe}}">Se désinscrire</a>'
}));

const { lancerEnvoi, etatEnvoi, envoyerTest } = await import('./newsletterEnvoi');

test('envoi à tous les abonnés, par pages, lien de désabonnement personnalisé', async () => {
  const r = await lancerEnvoi('n1');
  expect('error' in r).toBe(false);
  for (let i = 0; i < 50 && etatEnvoi()?.enCours; i++) await new Promise((res) => setTimeout(res, 10));
  const etat = etatEnvoi()!;
  expect(etat.enCours).toBe(false);
  expect(etat.total).toBe(230);
  expect(etat.envoyes).toBe(230);
  expect(envois).toHaveLength(230);
  expect(envois[7].html).toContain('desabonnement?token=tok7');
  expect(envois[7].headers['List-Unsubscribe']).toContain('tok7');
  expect(envois[0].subject).toBe('La satire mise à mal');
  const fin = updates.find((u) => u.sql.includes('newsletter_sent_at'));
  expect(fin?.vars.n).toBe(230);
});

test('un test part vers une seule adresse, sujet marqué', async () => {
  envois.length = 0;
  const r = await envoyerTest('n1', 'moi@agone.org');
  expect(r.ok).toBe(true);
  expect(envois).toHaveLength(1);
  expect(envois[0].to).toBe('moi@agone.org');
  expect(envois[0].subject).toMatch(/^\[TEST\]/);
  expect(envois[0].bypassDryRun).toBe(true);
});
