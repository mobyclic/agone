import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/access';
import { renderIssueEmail } from '$lib/server/newsletterEmail';

export const GET: RequestHandler = async ({ params, locals }) => {
  requireStaff(locals);
  const html = await renderIssueEmail(params.id);
  if (!html) throw error(404, { message: 'Numéro introuvable' });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' }
  });
};
