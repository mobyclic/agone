/** Une fois : les réglages « banner » et « popup » (Paramètres) deviennent des réclames. */
import { query } from '$lib/server/surreal';
import { getSetting } from '$lib/server/site';
const b = ((await getSetting('banner')) ?? {}) as Record<string, any>;
const p = ((await getSetting('popup')) ?? {}) as Record<string, any>;
const msg = typeof b.message === 'object' && b.message ? String(b.message.fr ?? '') : String(b.message ?? '');
let n = 0;
if (msg.trim()) { await query(`CREATE reclame CONTENT $c`, { c: { kind: 'bandeau', status: b.active === true ? 'published' : 'draft', title: msg.slice(0, 60), message: msg, url: b.url || undefined, variant: b.variant || 'info' } }); n++; }
if (String(p.title ?? '').trim() || String(p.body ?? '').trim()) {
  await query(`CREATE reclame CONTENT $c`, { c: { kind: 'modal', status: p.active === true ? 'published' : 'draft', title: String(p.title || 'Fenêtre'), message: p.body || undefined, url: p.cta_url || undefined, cta_label: p.cta_label || undefined, frequency: p.frequency || 'day', delay: Number(p.delay ?? 2), starts_at: p.starts_at ? new Date(p.starts_at) : undefined, ends_at: p.ends_at ? new Date(p.ends_at) : undefined } });
  n++;
}
console.log('réclames migrées :', n, '| bandeau :', JSON.stringify(b), '| popup :', JSON.stringify(p).slice(0, 120));
process.exit(0);
