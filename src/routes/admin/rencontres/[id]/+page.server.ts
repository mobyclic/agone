import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/access';
import { getEventForEdit, saveEvent, deleteEvent, updateVenuePosition, updateVenueContact, type EventInput } from '$lib/server/events';
import { withFlash } from '$lib/toasts';
import { heureParisVersDate } from '$lib/dates';

export const load: PageServerLoad = async ({ params }) => {
  if (params.id === 'nouvelle') return { isNew: true, event: null };
  const event = await getEventForEdit(params.id);
  if (!event) throw error(404, { message: 'Rencontre introuvable' });
  return { isNew: false, event };
};

/**
 * Champ datetime-local → ISO, lu à l'HEURE DE PARIS. `new Date(v)` le lisait dans
 * le fuseau du serveur (UTC sur Railway) : une rencontre saisie à 20:30 était
 * enregistrée à 20:30 UTC, soit 22:30 à Paris.
 */
const iso = (v: string) => (v ? heureParisVersDate(v)?.toISOString() : undefined);
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
              lng: numOrU(S('venueLng')),
              phone: S('venuePhone') || undefined,
              website: S('venueWebsite') || undefined,
              description: S('venueDescription') || undefined
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
    // Contact du lieu : partagé entre toutes ses rencontres (cf. updateVenueContact).
    if (venueMode === 'existing' && S('venueId')) {
      await updateVenueContact(S('venueId'), {
        phone: S('venuePhone'), website: S('venueWebsite'), description: S('venueDescription')
      });
    }

    const editId = params.id && params.id !== 'nouvelle' ? params.id : null;
    const id = await saveEvent(editId, input);
    throw redirect(303, withFlash(`/admin/rencontres/${id}`, 'Rencontre enregistrée.', 'success'));
  },

  /**
   * Duplique la rencontre : mêmes auteurs, livres et couverture ; titre, dates,
   * lieu et description repris du formulaire de la fenêtre « Dupliquer ».
   */
  dupliquer: async ({ request, params, locals }) => {
    requireStaff(locals);
    const source = params.id && params.id !== 'nouvelle' ? await getEventForEdit(params.id) : null;
    if (!source) return fail(404, { error: 'Rencontre introuvable.' });
    const fd = await request.formData();
    const S = (k: string) => String(fd.get(k) ?? '').trim();
    if (!S('title')) return fail(400, { dupError: 'Le titre est requis.' });
    const id = await saveEvent(null, {
      title: S('title'),
      body_html: S('body_html') || undefined,
      coverId: source.cover_id ?? undefined,
      start_at: iso(S('start_at')),
      end_at: iso(S('end_at')),
      venueId: S('venueId') || undefined,
      authorIds: (source.authors ?? []).map((a: any) => String(a.id).replace(/^author:/, '')),
      bookIds: (source.books ?? []).map((b: any) => String(b.id).replace(/^book:/, ''))
    });
    throw redirect(303, withFlash(`/admin/rencontres/${id}`, 'Rencontre dupliquée — vérifiez puis enregistrez si besoin.', 'success'));
  },

  delete: async ({ params, locals }) => {
    requireStaff(locals);
    if (params.id && params.id !== 'nouvelle') await deleteEvent(params.id);
    throw redirect(303, withFlash('/admin/rencontres', 'Rencontre supprimée.', 'success'));
  }
};
