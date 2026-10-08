/**
 * Nettoyage ponctuel du contenu migré de WordPress (idempotent) :
 *  - entités HTML restées dans les champs TEXTE (titres, extraits, noms) : décodées ;
 *  - apostrophes encodées (&#x27; / &#039;) dans les champs HTML : remplacées par « ’ » hors balises ;
 *  - notes de bas de page [mfn]…[/mfn] (plugin Modern Footnotes) : converties au format de
 *    l'éditeur, <sup data-fn="…"></sup>, et retirées des extraits.
 * Usage : bun scripts/nettoyer-entites.ts [--apply]
 */
import { query, recId } from '$lib/server/surreal';
const APPLY = process.argv.includes('--apply');

const NOMMEES: Record<string, string> = { amp: '&', quot: '"', apos: '’', nbsp: ' ', lt: '<', gt: '>', laquo: '«', raquo: '»', hellip: '…', eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ucirc: 'û', ugrave: 'ù', euml: 'ë', iuml: 'ï', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', deg: '°', euro: '€', oelig: 'œ', OElig: 'Œ' };
/** Décode toutes les entités d'un texte brut (apostrophe droite → typographique). */
export function decoderTexte(s: string): string {
  return s
    .replace(/&#x27;|&#039;|&#39;|&apos;/g, '’')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => NOMMEES[n] ?? m);
}
/** Dans un HTML : apostrophes encodées → « ’ », uniquement hors balises. */
export function apostrophesHtml(html: string): string {
  return html.replace(/(&#x27;|&#039;|&#39;)(?![^<]*>)/g, '’');
}
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** [mfn]note[/mfn] → <sup data-fn="note"></sup> (le texte de la note garde son HTML en ligne, échappé dans l'attribut). */
export function convertirNotes(html: string): string {
  return html.replace(/\s*\[mfn\]([\s\S]*?)\[\/mfn\]/g, (_m, note: string) => `<sup data-fn="${escAttr(note.trim())}"></sup>`);
}
const sansNotes = (s: string) => s.replace(/\s*\[mfn\][\s\S]*?\[\/mfn\]/g, '');

const TEXTE: [string, string][] = [['book','title'],['book','subtitle'],['article','title'],['article','excerpt'],['event','title'],['event','excerpt'],['author','full_name'],['venue','name'],['collection','name'],['rubrique','name'],['page','title']];
const HTML: [string, string][] = [['book','description_html'],['book','extra_info_html'],['article','body_html'],['event','body_html'],['page','body_html'],['author','bio_html'],['collection','description_html']];

let modifs = 0;
async function traiter(table: string, champ: string, fn: (s: string) => string) {
  const rows = await query<any>(`SELECT meta::id(id) AS id, ${champ} AS v FROM ${table} WHERE ${champ} != NONE AND (string::contains(${champ}, '&') OR string::contains(${champ}, '[mfn]'))`);
  let n = 0;
  for (const r of rows) {
    const avant = String(r.v); const apres = fn(avant);
    if (apres === avant) continue;
    n++;
    if (APPLY) await query(`UPDATE $id SET ${champ} = $v`, { id: recId(table, r.id), v: apres });
  }
  if (n) console.log(`${table}.${champ} : ${n} ligne(s)${APPLY ? ' mises à jour' : ' à modifier'}`);
  modifs += n;
}
if (import.meta.main) {
  for (const [t, f] of TEXTE) await traiter(t, f, (s) => decoderTexte(sansNotes(s)));
  for (const [t, f] of HTML) await traiter(t, f, (s) => convertirNotes(apostrophesHtml(s)));
  console.log(APPLY ? `Terminé : ${modifs} modification(s).` : `Simulation : ${modifs} modification(s) — relancer avec --apply.`);
  process.exit(0);
}
