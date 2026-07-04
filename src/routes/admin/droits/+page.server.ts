import type { PageServerLoad } from './$types';
import { ensureChannels, listChannels, listPeriods } from '$lib/server/droits';
import { query } from '$lib/server/surreal';

const countOf = (t: string) =>
  query<any>(`SELECT count() AS n FROM ${t} GROUP ALL`).then((r) => r[0]?.n ?? 0);

export const load: PageServerLoad = async () => {
  await ensureChannels();
  const [channels, periods, contracts, reports, statements] = await Promise.all([
    listChannels(),
    listPeriods(),
    countOf('royalty_contract'),
    countOf('sales_report'),
    countOf('royalty_statement')
  ]);
  return { channels, periods, stats: { contracts, reports, statements } };
};
