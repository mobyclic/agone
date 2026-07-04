import type { PageServerLoad } from './$types';
import { getPageBySlug } from '$lib/server/pages';

export const load: PageServerLoad = async () => {
  const page = await getPageBySlug('contact');
  // Nettoie les éventuels shortcodes WordPress résiduels (ex: [contact-form-7 …]).
  const html = page?.body_html?.replace(/\[[^\]]*\]/g, '').trim() || undefined;
  return { html };
};
