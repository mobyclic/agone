import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBookBySlug, booksByAuthorSlug, booksInCollectionSlug } from '$lib/server/catalogue';

export const load: PageServerLoad = async ({ params }) => {
  const book = await getBookBySlug(params.slug);
  if (!book) throw error(404, { message: 'Livre introuvable' });

  const authorSlug = book.authors?.[0]?.slug;
  const collSlug = book.collections?.[0]?.slug;
  const [sameAuthor, sameCollection] = await Promise.all([
    authorSlug ? booksByAuthorSlug(authorSlug, book.id, 4) : Promise.resolve([]),
    collSlug ? booksInCollectionSlug(collSlug, book.id, 4) : Promise.resolve([])
  ]);

  return { book, sameAuthor, sameCollection, primaryAuthor: book.authors?.[0] };
};
