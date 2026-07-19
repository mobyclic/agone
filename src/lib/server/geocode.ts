/**
 * Géocodage d'adresses via Nominatim (OpenStreetMap) — gratuit, sans clé.
 * Politique d'usage : User-Agent identifiant + usage modéré (admin uniquement).
 */
export interface GeoResult { lat: number; lng: number; display?: string }

export async function geocodeAddress(queryStr: string): Promise<GeoResult | null> {
  const q = (queryStr ?? '').trim();
  if (q.length < 3) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AgoneEditions/1.0 (https://agone.org)', 'Accept-Language': 'fr' }
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const hit = Array.isArray(arr) ? arr[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat), lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, display: hit.display_name };
  } catch {
    return null;
  }
}
