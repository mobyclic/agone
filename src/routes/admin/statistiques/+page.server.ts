import type { PageServerLoad } from './$types';
import { salesByYear, salesByMonth, topBooks, formatBreakdown, overview, booksWithSales } from '$lib/server/stats';

export const load: PageServerLoad = async ({ url }) => {
  const bookSlug = url.searchParams.get('livre') || undefined;

  // Deux séries : années entières, et à date comparable (même quantième).
  const aujourdhui = new Date();
  const [byYear, byYearToDate] = await Promise.all([
    salesByYear(bookSlug),
    salesByYear(bookSlug, aujourdhui)
  ]);
  const years = byYear.map((r) => r.period);
  const year = Number(url.searchParams.get('annee')) || years[0] || new Date().getUTCFullYear();

  const [byMonth, tops, formats, ov, books] = await Promise.all([
    salesByMonth(year, bookSlug),
    bookSlug ? Promise.resolve([]) : topBooks({ year, limit: 12 }),
    formatBreakdown({ year, bookSlug }),
    overview(bookSlug),
    booksWithSales()
  ]);

  const bookTitle = bookSlug ? books.find((b) => b.slug === bookSlug)?.title : undefined;

  return { byYear, byYearToDate, jour: aujourdhui.toISOString(), byMonth, tops, formats, overview: ov, books, year, years, bookSlug, bookTitle };
};
