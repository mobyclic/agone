/**
 * Calcul des frais de port (pur, partagé serveur ↔ client).
 * Une zone capture un pays (liste explicite) ou « reste du monde » ; le tarif
 * dépend du poids total via des paliers { up_to (g), price (€) }.
 */
export interface ShipRate { up_to: number | null; price: number }
export interface ShipZone {
  name: string;
  countries: string[];
  rest_of_world: boolean;
  rates: ShipRate[];
  free_over?: number | null;
}
export interface ShipQuote { ok: boolean; price: number; zone?: string; error?: string }

export function quoteShippingFor(zones: ShipZone[], country: string, weightGrams: number, subtotal: number): ShipQuote {
  if (weightGrams <= 0) return { ok: true, price: 0, zone: 'Numérique' }; // rien de physique à expédier
  const zone = zones.find((z) => z.countries.includes(country)) ?? zones.find((z) => z.rest_of_world);
  if (!zone) return { ok: false, price: 0, error: 'Nous ne livrons pas encore ce pays.' };
  if (zone.free_over != null && subtotal >= zone.free_over) return { ok: true, price: 0, zone: zone.name };
  if (!zone.rates.length) return { ok: true, price: 0, zone: zone.name };
  const sorted = [...zone.rates].sort((a, b) => (a.up_to ?? Infinity) - (b.up_to ?? Infinity));
  const tier = sorted.find((r) => weightGrams <= (r.up_to ?? Infinity)) ?? sorted[sorted.length - 1];
  return { ok: true, price: tier.price, zone: zone.name };
}
