/**
 * Génération de l'email d'un numéro de LettrInfo à partir de ses BLOCS.
 * Template table-based (compatible clients mail), inspiré des LettrInfos Agone.
 */
import { query, recId } from './surreal';
import { listUpcoming } from './events';
import { getCompany } from './invoice';
import type { NlBlock } from './newsletterIssue';

const SITE = 'https://agone.org';
const RED = '#d4211c';
const INK = '#141414';
const TEXT = '#3b3f44';

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function splitNumero(title: string): { title: string; numero?: string } {
  const m = title.match(/\[LettrInfos?\s*([^\]]+)\]/i);
  return { title: title.replace(/\s*\[LettrInfos?[^\]]*\]\s*$/i, '').trim(), numero: m?.[1]?.trim() };
}

const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';

/** Grille de couvertures (3 par ligne). */
function booksBlock(books: { title: string; slug: string; cover_url?: string }[]): string {
  if (!books.length) return '';
  const cell = (b: { title: string; slug: string; cover_url?: string }) =>
    `<td width="33%" style="padding:8px;text-align:center;vertical-align:top;">
      <a href="${SITE}/livre/${esc(b.slug)}" target="_blank">${
        b.cover_url
          ? `<img src="${esc(b.cover_url)}" width="160" alt="${esc(b.title)}" style="display:block;margin:0 auto;border:1px solid ${INK};max-width:160px;">`
          : `<span style="color:${RED};font-family:Verdana,sans-serif;font-size:14px;">${esc(b.title)}</span>`
      }</a></td>`;
  const rows: string[] = [];
  for (let i = 0; i < books.length; i += 3) rows.push(`<tr>${books.slice(i, i + 3).map(cell).join('')}</tr>`);
  return `<tr><td style="padding:8px 20px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table></td></tr>`;
}

async function eventsBlock(): Promise<string> {
  const events = await listUpcoming();
  if (!events.length) return '';
  const items = events
    .slice(0, 6)
    .map(
      (e) => `<li><a href="${SITE}/rencontres/${esc(e.slug)}" target="_blank" style="color:${RED};text-decoration:underline;">${esc(e.title)}</a>${
        e.start_at ? `, le ${esc(fmtDate(e.start_at))}` : ''
      }${e.venue_name ? ` — ${esc(e.venue_name)}${e.venue_city ? `, ${esc(e.venue_city)}` : ''}` : ''}</li>`
    )
    .join('');
  return `<tr><td style="padding:8px 32px 22px;font-family:Verdana,Geneva,sans-serif;color:${TEXT};">
    <h3 style="margin:0 0 10px;color:#5f5e5e;font-size:18px;">Prochaines rencontres</h3>
    <ul style="margin:0;padding-left:18px;font-size:15px;line-height:1.6;">${items}</ul></td></tr>`;
}

/** Résout les couvertures des livres référencés dans les blocs. */
async function resolveBooks(blocks: NlBlock[]): Promise<Map<string, { title: string; slug: string; cover_url?: string }>> {
  const ids = new Set<string>();
  for (const b of blocks) if (b.type === 'books' && Array.isArray(b.books)) for (const x of b.books) if (x?.id) ids.add(String(x.id));
  const map = new Map<string, { title: string; slug: string; cover_url?: string }>();
  if (!ids.size) return map;
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, title, slug, cover.url AS cover_url FROM book WHERE id IN $ids`,
    { ids: [...ids].map((i) => recId('book', i)) }
  );
  for (const r of rows) map.set(r.id, { title: r.title, slug: r.slug, cover_url: r.cover_url ?? undefined });
  return map;
}

export async function renderIssueEmail(articleId: string): Promise<string | null> {
  const rows = await query<any>(
    `SELECT title, newsletter_blocks AS blocks FROM article WHERE id = $id LIMIT 1`,
    { id: recId('article', articleId) }
  );
  const a = rows[0];
  if (!a) return null;
  const blocks: NlBlock[] = Array.isArray(a.blocks) ? a.blocks : [];
  const [company, bookMap] = await Promise.all([getCompany(), resolveBooks(blocks)]);
  const { title, numero } = splitNumero(a.title);
  const address = (company.address || '18, boulevard de Paris\n13003 Marseille')
    .split('\n').map((l) => esc(l.trim())).filter(Boolean).join('<br>');

  const body: string[] = [];
  for (const b of blocks) {
    if (b.type === 'heading' && b.text) {
      body.push(`<tr><td style="padding:18px 32px 4px;font-family:Verdana,Geneva,sans-serif;"><h2 style="margin:0;color:#5f5e5e;font-size:20px;">${esc(String(b.text))}</h2></td></tr>`);
    } else if (b.type === 'text' && b.html) {
      body.push(`<tr><td style="padding:10px 32px;font-family:Verdana,Geneva,sans-serif;font-size:16px;line-height:1.6;color:${TEXT};">${String(b.html)}</td></tr>`);
    } else if (b.type === 'books' && Array.isArray(b.books)) {
      const resolved = b.books.map((x: any) => bookMap.get(String(x.id))).filter(Boolean) as { title: string; slug: string; cover_url?: string }[];
      body.push(booksBlock(resolved));
    } else if (b.type === 'events') {
      body.push(await eventsBlock());
    } else if (b.type === 'button' && b.label && b.url) {
      body.push(`<tr><td style="padding:12px 32px;text-align:center;"><a href="${esc(String(b.url))}" target="_blank" style="display:inline-block;background:${INK};color:#fff;font-family:Verdana,sans-serif;font-size:15px;text-decoration:none;padding:11px 22px;">${esc(String(b.label))}</a></td></tr>`);
    } else if (b.type === 'image' && b.url) {
      const img = `<img src="${esc(String(b.url))}" alt="" style="display:block;margin:0 auto;max-width:100%;">`;
      body.push(`<tr><td style="padding:12px 32px;text-align:center;">${b.href ? `<a href="${esc(String(b.href))}" target="_blank">${img}</a>` : img}</td></tr>`);
    }
  }

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;">
  <tr><td style="padding:22px;text-align:center;border-bottom:3px solid ${INK};">
    <span style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:bold;letter-spacing:2px;color:${INK};text-transform:uppercase;">Agone</span>
  </td></tr>
  <tr><td style="padding:26px 32px 4px;text-align:center;">
    <h1 style="margin:0;color:${RED};font-family:Verdana,Geneva,sans-serif;font-size:24px;line-height:1.25;">${esc(title)}</h1>
    ${numero ? `<div style="margin-top:8px;color:#8a8a8a;font-family:Verdana,sans-serif;font-size:13px;letter-spacing:1px;">LettrInfo ${esc(numero)}</div>` : ''}
  </td></tr>
  ${body.join('\n')}
  <tr><td style="background:#eff2f7;padding:22px 16px;font-family:Verdana,Geneva,sans-serif;font-size:12px;color:${TEXT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="33%" style="text-align:center;vertical-align:top;padding:0 8px;"><strong>Éditions Agone</strong><br>${address}</td>
      <td width="33%" style="text-align:center;vertical-align:top;padding:0 8px;"><strong>Diffusion Hobo</strong><br>contact@hobo-diffusion.com</td>
      <td width="33%" style="text-align:center;vertical-align:top;padding:0 8px;"><strong>Distribution Belles Lettres</strong><br>25, rue du Général-Leclerc<br>94270 Le Kremlin-Bicêtre</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:16px;text-align:center;font-family:Verdana,sans-serif;font-size:12px;color:#8a8a8a;">
    Vous recevez cette lettre car vous êtes inscrit·e à la LettrInfo d'Agone.<br>
    <a href="{{unsubscribe}}" style="color:${RED};text-decoration:underline;">Se désinscrire</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
