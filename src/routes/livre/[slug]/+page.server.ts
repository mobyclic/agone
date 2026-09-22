import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBookBySlug, booksByAuthorSlug, booksContributedBySlug, booksInCollectionSlug } from '$lib/server/catalogue';
import { cartBookSlugs } from '$lib/server/cart';
import { purchasedBookSlugs } from '$lib/server/order';
import { isStaff } from '$lib/roles';
import { upcomingForBook } from '$lib/server/events';

export const load: PageServerLoad = async ({ params, cookies, locals }) => {
  const book = await getBookBySlug(params.slug, !!locals.user && isStaff(locals.user.role));
  if (!book) throw error(404, { message: 'Livre introuvable' });

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

  return { book, sameAuthor, contributions, sameCollection, cartSlugs, purchasedSlugs, rencontres, primaryAuthor: book.authors?.[0] };
};
