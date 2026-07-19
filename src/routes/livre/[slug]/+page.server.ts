import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBookBySlug, booksByAuthorSlug, booksInCollectionSlug } from '$lib/server/catalogue';
import { cartBookSlugs } from '$lib/server/cart';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const book = await getBookBySlug(params.slug);
  if (!book) throw error(404, { message: 'Livre introuvable' });

  const authorSlug = book.authors?.[0]?.slug;
  const collSlug = book.collections?.[0]?.slug;
  const [sameAuthor, sameCollection, cartSlugs] = await Promise.all([
    authorSlug ? booksByAuthorSlug(authorSlug, book.id, 6) : Promise.resolve([]),
    collSlug ? booksInCollectionSlug(collSlug, book.id, 6) : Promise.resolve([]),
    cartBookSlugs(cookies)
  ]);

  return { book, sameAuthor, sameCollection, cartSlugs, primaryAuthor: book.authors?.[0] };
};
