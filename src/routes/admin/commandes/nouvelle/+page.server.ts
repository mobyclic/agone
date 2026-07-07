import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { createAdminOrder, type AdminOrderLine } from '$lib/server/order';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ locals }) => {
  requireStaff(locals);
  return {};
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireStaff(locals);
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
    if (mode === 'existing' && !customerId) return fail(400, { error: 'Choisissez un client existant ou créez-en un.' });
    if (mode === 'new' && !newEmail) return fail(400, { error: 'Renseignez l’email du nouveau client.' });

    // — Adresse de livraison (optionnelle) —
    const ship = {
      first_name: S('ship_first'),
      last_name: S('ship_last'),
      address_1: S('ship_address'),
      postcode: S('ship_postcode'),
      city: S('ship_city'),
      country: S('ship_country') || 'France'
    };
    const hasShip = ship.address_1 || ship.city || ship.postcode;

    const { number } = await createAdminOrder({
      customerId: mode === 'existing' ? customerId : undefined,
      newCustomer: mode === 'new' ? { first_name: S('newFirst'), last_name: S('newLast'), email: newEmail } : undefined,
      channel: S('channel') || 'comptoir',
      status: S('status') || 'paid',
      shipping: hasShip ? ship : undefined,
      lines
    });

    throw redirect(303, withFlash(`/admin/commandes/${number}`, `Commande #${number} créée.`, 'success'));
  }
};
