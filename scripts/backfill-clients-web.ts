/**
 * Registre des clients (une fois, idempotent) :
 *  - les clients pro existants deviennent « pro » (et physiques s'ils sont de type auteur) ;
 *  - chaque compte ayant une commande web payée entre au registre comme client web.
 * Usage : bun scripts/backfill-clients-web.ts
 */
import { query } from '$lib/server/surreal';
import { ensureClientWeb } from '$lib/server/clients';
const t0 = Date.now();
const pros = await query<any>(`UPDATE client SET pro = true, web = false, personne = IF kind = 'auteur' THEN 'physique' ELSE 'morale' END WHERE pro = NONE RETURN meta::id(id) AS id`);
console.log('clients pro initialisés :', pros.length);
const acheteurs = await query<any>(`SELECT customer, count() AS n FROM order WHERE customer != NONE AND channel = 'web' AND status IN ['completed','paid','processing','sent_to_bl'] GROUP BY customer`);
let crees = 0, deja = 0, sans = 0;
for (const a of acheteurs) {
  const avant = (await query<any>(`SELECT count() AS n FROM client WHERE user = $u GROUP ALL`, { u: a.customer }))[0]?.n ?? 0;
  const id = await ensureClientWeb(String(a.customer));
  if (!id) sans++; else if (avant) deja++; else crees++;
}
console.log(`acheteurs web : ${acheteurs.length} — créés ${crees}, déjà au registre ${deja}, sans nom ${sans} — ${Date.now() - t0} ms`);
console.log('registre :', JSON.stringify(await query<any>(`SELECT web, pro, count() AS n FROM client GROUP BY web, pro`)));
process.exit(0);
