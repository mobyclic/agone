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

import { decoderEntites as decoderTexte, apostrophesHtml, convertirNotesWp as convertirNotes, sansNotesWp as sansNotes } from '$lib/text';

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
