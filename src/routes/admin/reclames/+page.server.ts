import { redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/access';
import { getSetting, setSetting } from '$lib/server/site';
import { journaliser } from '$lib/server/journal';
import { withFlash } from '$lib/toasts';

/** Réclames : le bandeau d'information en haut du site et la fenêtre promotionnelle. */
export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  const [banner, popup] = await Promise.all([getSetting('banner'), getSetting('popup')]);
  const b = (banner ?? {}) as Record<string, any>;
  const msg = b.message;
  const p = (popup ?? {}) as Record<string, any>;
  return {
    banner: { active: b.active === true, message: typeof msg === 'object' && msg ? String(msg.fr ?? '') : String(msg ?? ''), variant: typeof b.variant === 'string' ? b.variant : 'info', url: String(b.url ?? '') },
    popup: {
      active: p.active === true, title: String(p.title ?? ''), body: String(p.body ?? ''), cta_label: String(p.cta_label ?? ''), cta_url: String(p.cta_url ?? ''),
      image_url: String(p.image_url ?? ''), starts_at: String(p.starts_at ?? '').slice(0, 10), ends_at: String(p.ends_at ?? '').slice(0, 10),
      frequency: typeof p.frequency === 'string' ? p.frequency : 'day', delay: Number(p.delay ?? 2)
    }
  };
};

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export const actions: Actions = {
  banner: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    await setSetting('banner', { active: fd.get('active') === 'on', message: S(fd, 'message'), variant: S(fd, 'variant') || 'info', url: S(fd, 'url') || undefined });
    await journaliser(locals, { action: 'reclames.bandeau', cible: { type: 'site_setting', id: 'banner', libelle: 'Bandeau d’information' } });
    throw redirect(303, withFlash('/admin/reclames', 'Bandeau enregistré.', 'success'));
  },
  popup: async ({ request, locals }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const delay = Number(S(fd, 'delay'));
    await setSetting('popup', {
      active: fd.get('active') === 'on', title: S(fd, 'title'), body: S(fd, 'body'), cta_label: S(fd, 'cta_label'), cta_url: S(fd, 'cta_url'),
      image_url: S(fd, 'image_url'), starts_at: S(fd, 'starts_at') || undefined, ends_at: S(fd, 'ends_at') || undefined,
      frequency: ['once', 'day', 'session', 'always'].includes(S(fd, 'frequency')) ? S(fd, 'frequency') : 'day',
      delay: Number.isFinite(delay) && delay >= 0 ? Math.min(60, delay) : 2,
      // Une nouvelle version (texte changé) se remontre à ceux qui avaient fermé l'ancienne.
      version: Date.now().toString(36)
    });
    await journaliser(locals, { action: 'reclames.popup', cible: { type: 'site_setting', id: 'popup', libelle: 'Fenêtre promotionnelle' } });
    throw redirect(303, withFlash('/admin/reclames', 'Fenêtre promotionnelle enregistrée.', 'success'));
  }
};
