import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { createAdminOrder, type AdminOrderLine } from '$lib/server/order';
import { typesCommandeSaisie } from '$lib/server/canaux';
import { saveEvent } from '$lib/server/events';
import { heureParisVersDate } from '$lib/dates';
import { withFlash } from '$lib/toasts';
import { journaliser } from '$lib/server/journal';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return { types: await typesCommandeSaisie() };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();

    // — Lignes —
    let lines: AdminOrderLine[] = [];
    try {
      const parsed = JSON.parse(S('lines') || '[]');
      lines = (Array.isArray(parsed) ? parsed : [])
        .map((l: any) => ({
          bookId: String(l.bookId || ''),
          title: String(l.title || ''),
          format: (['papier', 'epub', 'souscription'].includes(l.format) ? l.format : 'papier') as AdminOrderLine['format'],
          qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
          unit_price: Math.max(0, Number(l.unit_price) || 0)
        }))
        .filter((l: AdminOrderLine) => l.bookId);
    } catch {
      lines = [];
    }
    if (!lines.length) return fail(400, { error: 'Ajoutez au moins un livre à la commande.' });

    // — Client —
    const mode = S('customerMode');
    const customerId = S('customerId');
    const newEmail = S('newEmail');
    if (mode === 'existing' && !customerId) return fail(400, { error: 'Choisissez un client existant, créez-en un, ou indiquez « Sans client ».' });
    if (mode === 'new' && !newEmail) return fail(400, { error: 'Renseignez l’email du nouveau client.' });

    // — Date (antidatée si ce n'est pas aujourd'hui) —
    const jour = S('placed_at');
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const placedAt = jour && jour !== aujourdhui ? heureParisVersDate(`${jour}T12:00`) ?? undefined : undefined;

    // — Rencontre : existante, ou créée à la volée avec les livres de la commande —
    let eventId = S('eventId') || undefined;
    if (!eventId && S('eventMode') === 'new' && S('newEventTitle')) {
      const dateEv = S('newEventDate') || jour || aujourdhui;
      eventId = await saveEvent(null, {
        title: S('newEventTitle'),
        start_at: heureParisVersDate(`${dateEv}T${S('newEventTime') || '18:30'}`)?.toISOString(),
        newVenue: S('newEventVenue') ? { name: S('newEventVenue'), city: S('newEventCity') || undefined } : undefined,
        authorIds: [], bookIds: [...new Set(lines.map((l) => l.bookId))]
      });
    }

    // — Adresse de livraison (optionnelle) —
    const ship = {
      first_name: S('ship_first'), last_name: S('ship_last'), address_1: S('ship_address'),
      postcode: S('ship_postcode'), city: S('ship_city'), country: S('ship_country') || 'France'
    };
    const hasShip = ship.address_1 || ship.city || ship.postcode;

    const { number } = await createAdminOrder({
      customerId: mode === 'existing' ? customerId : undefined,
      newCustomer: mode === 'new' ? { first_name: S('newFirst'), last_name: S('newLast'), email: newEmail } : undefined,
      channel: S('channel') || 'comptoir',
      status: S('status') || 'paid',
      paymentMethod: S('payment_method') || undefined,
      eventId, placedAt,
      silencieux: !!placedAt,
      shipping: hasShip ? ship : undefined,
      lines
    });
    await journaliser(locals, { action: 'commande.saisie', cible: { type: 'order', id: String(number), libelle: `Commande n°${number}` }, details: { canal: S('channel'), paiement: S('payment_method'), date: jour, rencontre: eventId } });

    throw redirect(303, withFlash(`/admin/commandes/${number}`, `Commande #${number} créée.`, 'success'));
  }
};
