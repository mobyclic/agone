/**
 * Texte brut d'un PDF, sans dépendance extérieure.
 *
 * Les contrats sont des PDF de traitement de texte : leurs polices sont des
 * « sous-ensembles » dont chaque caractère porte un code arbitraire. Lire les
 * chaînes du flux ne donnerait qu'une bouillie ; il faut suivre l'opérateur Tf
 * et décoder avec la table ToUnicode de la police courante. Ces tables sont
 * souvent rangées dans des flux d'objets compressés (/ObjStm) qu'on déplie
 * d'abord.
 *
 * Un PDF scanné (image) n'a pas de couche texte : l'extraction rend alors une
 * chaîne quasi vide, ce que l'appelant doit traiter comme « illisible ».
 */
import { inflateSync } from 'node:zlib';

const gonfle = (b: Buffer): Buffer => {
  try { return inflateSync(b); } catch { return b; }
};

/** Découpe grossière du fichier en flux (les `stream … endstream`). */
function flux(data: Buffer): Buffer[] {
  const out: Buffer[] = [];
  const marque = Buffer.from('stream');
  const fin = Buffer.from('endstream');
  let i = 0;
  while (i < data.length) {
    const d = data.indexOf(marque, i);
    if (d < 0) break;
    let debut = d + marque.length;
    if (data[debut] === 0x0d) debut++;
    if (data[debut] === 0x0a) debut++;
    const f = data.indexOf(fin, debut);
    if (f < 0) break;
    out.push(data.subarray(debut, f));
    i = f + fin.length;
  }
  return out;
}

/** Tous les objets du fichier, y compris ceux des flux d'objets. */
function objets(data: Buffer): Map<number, Buffer> {
  const out = new Map<number, Buffer>();
  const texte = data.toString('latin1');
  for (const m of texte.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g)) {
    out.set(Number(m[1]), Buffer.from(m[2], 'latin1'));
  }
  for (const corps of [...out.values()]) {
    const t = corps.toString('latin1');
    if (!t.includes('/ObjStm')) continue;
    const n = Number(t.match(/\/N\s+(\d+)/)?.[1] ?? 0);
    const first = Number(t.match(/\/First\s+(\d+)/)?.[1] ?? 0);
    const f = flux(corps)[0];
    if (!f || !n) continue;
    const plat = gonfle(f);
    const entetes = plat.subarray(0, first).toString('latin1').trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = entetes[2 * i], off = entetes[2 * i + 1];
      const suivant = entetes[2 * i + 3];
      const fin = Number.isFinite(suivant) ? first + suivant : plat.length;
      if (!Number.isFinite(num) || !Number.isFinite(off)) continue;
      if (!out.has(num)) out.set(num, plat.subarray(first + off, fin));
    }
  }
  return out;
}

/** Table code → caractère d'un flux ToUnicode. */
function cmap(corps: Buffer): Map<number, string> {
  const t = new Map<number, string>();
  const f = flux(corps)[0] ? gonfle(flux(corps)[0]) : corps;
  const s = f.toString('latin1');
  const versTexte = (h: string) => {
    const b = Buffer.from(h, 'hex');
    let out = '';
    for (let i = 0; i + 1 < b.length; i += 2) out += String.fromCharCode(b.readUInt16BE(i));
    return out || String.fromCharCode(b[0] ?? 0);
  };
  for (const bloc of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of bloc[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      t.set(parseInt(p[1], 16), versTexte(p[2]));
    }
  }
  for (const bloc of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of bloc[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const deb = parseInt(p[1], 16), fin = parseInt(p[2], 16), cible = parseInt(p[3], 16);
      for (let k = deb; k <= Math.min(fin, deb + 1024); k++) t.set(k, String.fromCharCode(cible + k - deb));
    }
  }
  return t;
}

/** Texte d'un PDF (chaîne vide ou presque si le document est un scan). */
export function texteDuPdf(data: Buffer): string {
  const objs = objets(data);

  // Nom de police (/F1, /TT2…) → sa table de décodage.
  const tables = new Map<string, Map<number, string>>();
  const large = new Map<string, boolean>();
  for (const corps of objs.values()) {
    const t = corps.toString('latin1');
    for (const m of t.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/g)) {
      const police = objs.get(Number(m[2]));
      if (!police) continue;
      const pt = police.toString('latin1');
      const num = pt.match(/\/ToUnicode\s+(\d+)\s+0\s+R/)?.[1];
      if (!num) continue;
      const table = cmap(objs.get(Number(num)) ?? Buffer.alloc(0));
      if (table.size) {
        tables.set(m[1], table);
        large.set(m[1], pt.includes('Identity') || Math.max(...table.keys()) > 255);
      }
    }
  }

  const morceaux: string[] = [];
  for (const brut of flux(data)) {
    const f = gonfle(brut).toString('latin1');
    if (!f.includes('BT') || (!f.includes('Tj') && !f.includes('TJ'))) continue;
    let courante: Map<number, string> | undefined;
    let deux = false;
    const jetons = /\/([A-Za-z0-9_.+-]+)\s+[\d.]+\s+Tf|\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>|(T\*|Td|TD)/g;
    for (const m of f.matchAll(jetons)) {
      if (m[1] !== undefined) { courante = tables.get(m[1]); deux = large.get(m[1]) ?? false; continue; }
      if (m[3] !== undefined) { morceaux.push('\n'); continue; }
      let codes: number[] = [];
      if (m[0].startsWith('(')) {
        const s = m[0]
          .slice(1, -1)
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8) & 0xff));
        codes = [...s].map((c) => c.charCodeAt(0));
      } else {
        const h = (m[2] ?? '').replace(/[^0-9A-Fa-f]/g, '');
        const b = Buffer.from(h.length % 2 ? h.slice(0, -1) : h, 'hex');
        codes = deux
          ? Array.from({ length: Math.floor(b.length / 2) }, (_, i) => b.readUInt16BE(i * 2))
          : [...b];
      }
      morceaux.push(
        courante
          ? codes.map((c) => courante!.get(c) ?? '').join('')
          : codes.map((c) => (c >= 9 && c < 127) || c >= 160 ? String.fromCharCode(c) : '').join('')
      );
    }
    morceaux.push('\n');
  }
  return morceaux.join('').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
}
