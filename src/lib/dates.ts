/**
 * Heure de Paris ↔ instant absolu, pour les champs `datetime-local` du back-office.
 * Le serveur tourne en UTC (Railway) : lire « 2026-10-01T09:00 » comme une heure
 * locale du serveur publierait un article programmé avec une ou deux heures d'écart.
 * Client-safe (Intl uniquement).
 */
const TZ = 'Europe/Paris';
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
});

function champs(t: number): Record<string, number> {
  const o: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(t))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}
/** Décalage de Paris (ms) à l'instant t. */
function decalage(t: number): number {
  const c = champs(t);
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - Math.floor(t / 1000) * 1000;
}

/** « YYYY-MM-DD » ou « YYYY-MM-DDTHH:mm » lu à l'heure de Paris → Date absolue. */
export function heureParisVersDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  let r = t - decalage(t);
  const d2 = decalage(r);
  if (t - d2 !== r) r = t - d2; // passage heure d'été / d'hiver
  return new Date(r);
}

/** Instant (ISO) → « YYYY-MM-DDTHH:mm » à l'heure de Paris (valeur d'un datetime-local). */
export function dateVersHeureParis(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const c = champs(t);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${c.year}-${z(c.month)}-${z(c.day)}T${z(c.hour)}:${z(c.minute)}`;
}
