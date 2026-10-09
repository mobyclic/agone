import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBookBySlug, slugActuelLivre, booksByAuthorSlug, booksContributedBySlug, booksInCollectionSlug } from '$lib/server/catalogue';
import { cartBookSlugs } from '$lib/server/cart';
import { purchasedBookSlugs } from '$lib/server/order';
import { isStaff } from '$lib/roles';
import { upcomingForBook } from '$lib/server/events';
import { offresPourLivre } from '$lib/server/promo';

export const load: PageServerLoad = async ({ params, cookies, locals }) => {
  const book = await getBookBySlug(params.slug, !!locals.user && isStaff(locals.user.role));
  if (!book) {
    // Livre renommé : l'ancienne adresse redirige vers la nouvelle.
    const actuel = await slugActuelLivre(params.slug);
    if (actuel) throw redirect(301, `/livre/${actuel}`);
    throw error(404, { message: 'Livre introuvable' });
  }

  const authorSlug = book.authors?.[0]?.slug;
  const collSlug = book.collections?.[0]?.slug;
  const [sameAuthor, contributions, sameCollection, cartSlugs, purchasedSlugs, rencontres] = await Promise.all([
    authorSlug ? booksByAuthorSlug(authorSlug, book.id, 6) : Promise.resolve([]),
    authorSlug ? booksContributedBySlug(authorSlug, book.id, 6) : Promise.resolve([]),
    collSlug ? booksInCollectionSlug(collSlug, book.id, 6) : Promise.resolve([]),
    cartBookSlugs(cookies),
    // Exclut aussi les achats précédents des suggestions (si connecté).
    locals.user ? purchasedBookSlugs(locals.user.id) : Promise.resolve([]),
    upcomingForBook(book.id)
  ]);
  // Promotions automatiques qui couvrent ce livre, et le club (remise du membre, ou invitation).
  const offres = await offresPourLivre({ id: book.id, price_paper: book.price_paper, price_ebook: book.price_ebook, published_at: book.published_at }, locals.user?.id);

  return { book, sameAuthor, contributions, sameCollection, cartSlugs, purchasedSlugs, rencontres, offres, primaryAuthor: book.authors?.[0] };
};
