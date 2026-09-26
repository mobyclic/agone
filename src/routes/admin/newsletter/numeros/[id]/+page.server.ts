import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getNewsletterIssue, saveNewsletterIssue, deleteNewsletterIssue, type NlBlock } from '$lib/server/newsletterIssue';
import { subscriberStats } from '$lib/server/newsletter';
import { lancerEnvoi, envoyerTest, etatEnvoi } from '$lib/server/newsletterEnvoi';
import { query, recId } from '$lib/server/surreal';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

export const load: PageServerLoad = async ({ params }) => {
  if (params.id === 'nouveau') return { isNew: true, issue: null };
  const issue = await getNewsletterIssue(params.id);
  if (!issue) throw error(404, { message: 'Numéro introuvable' });
  const [stats, envoi] = await Promise.all([
    subscriberStats(),
    query<any>(`SELECT newsletter_sent_at, newsletter_sent_count, newsletter_test_sent_at FROM $id`, { id: recId('article', params.id) })
  ]);
  return { isNew: false, issue, abonnes: stats.subscribed, envoi: envoi[0] ?? {}, tache: etatEnvoi() };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const title = String(fd.get('title') ?? '').trim();
    const status = String(fd.get('status') ?? 'draft');
    if (!title) return fail(400, { error: 'Le titre est requis.' });

    let blocks: NlBlock[] = [];
    try {
      const parsed = JSON.parse(String(fd.get('blocks') ?? '[]'));
      blocks = Array.isArray(parsed) ? parsed.filter((b) => b && typeof b.type === 'string') : [];
    } catch {
      blocks = [];
    }

    const editId = params.id && params.id !== 'nouveau' ? params.id : null;
    const id = await saveNewsletterIssue(editId, { title, status, blocks });
    throw redirect(303, withFlash(`/admin/newsletter/numeros/${id}`, 'Numéro enregistré.', 'success'));
  },

  /** Un exemplaire vers une adresse, pour relire dans un vrai client mail. */
  test: async ({ request, params, locals }) => {
    requireStaff(locals);
    const email = String((await request.formData()).get('email') ?? '').trim();
    if (!email || !params.id || params.id === 'nouveau') return fail(400, { error: 'Adresse requise.' });
    const r = await envoyerTest(params.id, email);
    if (!r.ok) return fail(502, { error: `Envoi du test impossible : ${r.error}` });
    throw redirect(303, withFlash(`/admin/newsletter/numeros/${params.id}`, `Test envoyé à ${email}.`, 'success'));
  },

  /** Envoi à tous les abonnés, en tâche de fond. */
  envoyer: async ({ params, locals }) => {
    requireStaff(locals);
    if (!params.id || params.id === 'nouveau') return fail(400, { error: 'Enregistrez d’abord le numéro.' });
    const r = await lancerEnvoi(params.id);
    if ('error' in r) return fail(400, { error: r.error });
    await journaliser(locals, { action: 'lettrinfo.envoi', cible: { type: 'newsletter', id: params.id, libelle: r.titre }, details: { abonnes: r.total } });
    return { lance: true };
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    if (params.id && params.id !== 'nouveau') await deleteNewsletterIssue(params.id);
    throw redirect(303, withFlash('/admin/newsletter', 'Numéro supprimé.', 'success'));
  }
};
