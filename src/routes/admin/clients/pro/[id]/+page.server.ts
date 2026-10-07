import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getClientPro, upsertClientPro, deleteClientPro, facturesDuClient, KINDS_CLIENT } from '$lib/server/clients';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAdmin(locals);
  if (params.id === 'nouveau') return { client: null, factures: [], kinds: KINDS_CLIENT };
  const client = await getClientPro(params.id);
  if (!client) throw error(404, { message: 'Client introuvable' });
  return { client, factures: await facturesDuClient(params.id), kinds: KINDS_CLIENT };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    try {
      const id = await upsertClientPro({
        name: S('name'), kind: S('kind'), siret: S('siret'), vat_number: S('vat_number'), contact_name: S('contact_name'),
        email: S('email'), phone: S('phone'), address_1: S('address_1'), address_2: S('address_2'), postcode: S('postcode'),
        city: S('city'), country: S('country') || 'France', notes: S('notes'), user: S('userId') || undefined
      }, params.id === 'nouveau' ? undefined : params.id);
      await journaliser(locals, { action: params.id === 'nouveau' ? 'client.cree' : 'client.modifie', cible: { type: 'client', id, libelle: S('name') } });
      throw redirect(303, withFlash(`/admin/clients/pro/${id}`, 'Client enregistré.', 'success'));
    } catch (e) {
      if ((e as any)?.status === 303) throw e;
      return fail(400, { error: e instanceof Error ? e.message : 'Enregistrement impossible.' });
    }
  },
  delete: async ({ params, locals }) => {
    requireAdmin(locals);
    const r = await deleteClientPro(params.id!);
    if (!r.ok) return fail(400, { error: r.error });
    throw redirect(303, withFlash('/admin/clients?type=pro', 'Client supprimé.', 'success'));
  }
};
