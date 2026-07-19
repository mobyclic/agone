/**
 * Livraison — zones (pays desservis) + tarifs au poids.
 */
import { query, recId } from './surreal';
import { COUNTRIES, type Country } from '$lib/countries';
import { quoteShippingFor, type ShipZone, type ShipQuote } from '$lib/shipping-calc';

function normalizeRates(raw: any): { up_to: number | null; price: number }[] {
  return (Array.isArray(raw) ? raw : [])
    .map((r: any) => ({ up_to: r?.up_to != null ? Number(r.up_to) : null, price: Number(r?.price ?? 0) }))
    .filter((r) => Number.isFinite(r.price));
}

/** Zones actives (pour le calcul public), triées. */
export async function activeShipZones(): Promise<(ShipZone & { id: string })[]> {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, name, countries, rest_of_world, rates, free_over
       FROM shipping_zone WHERE active = true ORDER BY sort ASC, name ASC`);
  return rows.map((z) => ({
    id: z.id, name: z.name, countries: (z.countries ?? []).map(String),
    rest_of_world: !!z.rest_of_world, rates: normalizeRates(z.rates),
    free_over: z.free_over ?? null
  }));
}

/** Pays vers lesquels on livre (union des zones actives ; « reste du monde » = tous). */
export async function shippableCountries(): Promise<Country[]> {
  const zones = await activeShipZones();
  if (zones.some((z) => z.rest_of_world)) return COUNTRIES;
  const codes = new Set<string>();
  for (const z of zones) for (const c of z.countries) codes.add(c);
  return COUNTRIES.filter((c) => codes.has(c.code));
}

/** Devis de port (autoritatif, côté serveur). */
export async function quoteShipping(country: string, weightGrams: number, subtotal: number): Promise<ShipQuote> {
  return quoteShippingFor(await activeShipZones(), country, weightGrams, subtotal);
}

// ── Back-office (CRUD) ────────────────────────────────────────
export interface ShipZoneRow {
  id: string; name: string; country_count: number; rest_of_world: boolean;
  rate_count: number; free_over?: number; active: boolean; sort: number;
}

export async function listShipZonesAdmin(): Promise<ShipZoneRow[]> {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, name, array::len(countries) AS country_count, rest_of_world,
        array::len(rates) AS rate_count, free_over, active, sort
       FROM shipping_zone ORDER BY sort ASC, name ASC`);
  return rows.map((z) => ({
    id: z.id, name: z.name, country_count: z.country_count ?? 0, rest_of_world: !!z.rest_of_world,
    rate_count: z.rate_count ?? 0, free_over: z.free_over ?? undefined, active: !!z.active, sort: z.sort ?? 0
  }));
}

export async function getShipZoneForEdit(id: string) {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, name, countries, rest_of_world, rates, free_over, active, sort
       FROM shipping_zone WHERE id = $id LIMIT 1`, { id: recId('shipping_zone', id) });
  const z = rows[0];
  if (!z) return null;
  return {
    id: z.id, name: z.name, countries: (z.countries ?? []).map(String),
    rest_of_world: !!z.rest_of_world, rates: normalizeRates(z.rates),
    free_over: z.free_over ?? undefined, active: !!z.active, sort: z.sort ?? 0
  };
}

export interface ShipZoneInput {
  name: string; countries: string[]; rest_of_world: boolean;
  rates: { up_to: number | null; price: number }[]; free_over?: number; active: boolean;
}

export async function saveShipZone(id: string | null, d: ShipZoneInput): Promise<string> {
  const rates = normalizeRates(d.rates).map((r) => (r.up_to != null ? { up_to: r.up_to, price: r.price } : { price: r.price }));
  const vars: Record<string, unknown> = {
    name: d.name.trim() || 'Zone',
    countries: d.rest_of_world ? [] : d.countries,
    rest_of_world: !!d.rest_of_world,
    rates,
    active: !!d.active
  };
  const setParts = ['name = $name', 'countries = $countries', 'rest_of_world = $rest_of_world', 'rates = $rates', 'active = $active'];
  if (d.free_over != null && !Number.isNaN(d.free_over)) { setParts.push('free_over = $free_over'); vars.free_over = d.free_over; }
  else setParts.push('free_over = NONE');

  if (id) {
    await query(`UPDATE $id SET ${setParts.join(', ')}`, { ...vars, id: recId('shipping_zone', id) });
    return id;
  }
  const max = await query<any>(`SELECT sort FROM shipping_zone ORDER BY sort DESC LIMIT 1`);
  vars.sort = (max[0]?.sort ?? -1) + 1;
  const rows = await query<any>(`CREATE shipping_zone SET ${setParts.join(', ')}, sort = $sort`, vars);
  return String(rows[0].id).replace(/^shipping_zone:/, '');
}

export async function deleteShipZone(id: string): Promise<void> {
  await query(`DELETE $id`, { id: recId('shipping_zone', id) });
}
