import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getEventForEdit, saveEvent, deleteEvent, updateVenuePosition, type EventInput } from '$lib/server/events';
import { withFlash } from '$lib/toasts';

export const load: PageServerLoad = async ({ params }) => {
  if (params.id === 'nouvelle') return { isNew: true, event: null };
  const event = await getEventForEdit(params.id);
  if (!event) throw error(404, { message: 'Rencontre introuvable' });
  return { isNew: false, event };
};

const iso = (v: string) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};
const ids = (v: FormDataEntryValue | null): string[] => {
  try {
    const a = JSON.parse(String(v ?? '[]'));
    return Array.isArray(a) ? a.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
};
const numOrU = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() && !Number.isNaN(n) ? n : undefined;
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    requireStaff(locals);
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();

    if (!S('title')) return fail(400, { error: 'Le titre est requis.' });

    const venueMode = S('venueMode');
    const input: EventInput = {
      title: S('title'),
      body_html: S('body_html') || undefined,
      coverId: S('coverId') || undefined,
      start_at: iso(S('start_at')),
      end_at: iso(S('end_at')),
      venueId: venueMode === 'existing' ? S('venueId') || undefined : undefined,
      newVenue:
        venueMode === 'new' && S('venueName')
          ? {
              name: S('venueName'),
              street: S('venueStreet') || undefined,
              city: S('venueCity') || undefined,
              post_code: S('venuePostcode') || undefined,
              country: S('venueCountry') || undefined,
              lat: numOrU(S('venueLat')),
              lng: numOrU(S('venueLng'))
            }
          : undefined,
      authorIds: ids(fd.get('authorIds')),
      bookIds: ids(fd.get('bookIds'))
    };

    // Lieu existant dont on a affiné la position sur la carte → mise à jour du venue.
    if (venueMode === 'existing' && S('venueId') && S('venuePosEdited') === '1') {
      const la = numOrU(S('venueLat'));
      const ln = numOrU(S('venueLng'));
      if (la != null && ln != null) await updateVenuePosition(S('venueId'), la, ln);
    }

    const editId = params.id && params.id !== 'nouvelle' ? params.id : null;
    const id = await saveEvent(editId, input);
    throw redirect(303, withFlash(`/admin/rencontres/${id}`, 'Rencontre enregistrée.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    if (params.id && params.id !== 'nouvelle') await deleteEvent(params.id);
    throw redirect(303, withFlash('/admin/rencontres', 'Rencontre supprimée.', 'success'));
  }
};
