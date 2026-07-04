import type { PageServerLoad } from './$types';
import { forthcomingBooks } from '$lib/server/catalogue';

export const load: PageServerLoad = async () => {
  return { books: await forthcomingBooks() };
};
