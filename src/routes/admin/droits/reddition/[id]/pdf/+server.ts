import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/access';
import { renderStatementPdf } from '$lib/server/redditionPdf';

/** Reddition au format PDF — le document envoyé à l'auteur. */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  requireAdmin(locals);
  try {
    const { pdf, nom } = await renderStatementPdf(params.id);
    return new Response(pdf as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${url.searchParams.has('dl') ? 'attachment' : 'inline'}; filename="${nom}"`,
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (e) {
    throw error(500, { message: e instanceof Error ? e.message : 'PDF impossible' });
  }
};
