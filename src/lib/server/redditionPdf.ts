/**
 * PDF d'une reddition de comptes — le document envoyé à l'auteur.
 *
 * L'article 6 des contrats impose d'y faire figurer, par titre : les
 * exemplaires vendus, les retours, la retenue provisionnelle, l'assiette et le
 * taux appliqués, puis le compte des cessions, l'à-valoir amorti et le solde.
 *
 * Même gabarit que les factures (pdf-lib, polices standard) : sobre, lisible,
 * imprimable. Les polices standard n'acceptent que le jeu WinAnsi, d'où le
 * nettoyage des espaces fines et autres caractères exotiques.
 */
import { getStatement } from './droits';
import { getCompany } from './invoice';
import { query, recId } from './surreal';

const ROLE: Record<string, string> = {
  author: 'auteur', translator: 'traducteur', preface: 'préface', postface: 'postface',
  illustrator: 'illustration', editor: 'édition', other: 'autre'
};

/** Les polices standard ne connaissent que WinAnsi : on y ramène le texte. */
const winAnsi = (s: string) =>
  String(s ?? '')
    .replace(/[   ]/g, ' ')  // espaces fines et insécables
    .replace(/[‘’]/g, '’')
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '—')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E -ÿŒœ’€—«»]/g, '');

const eur = (n: number) => winAnsi(`${(n ?? 0).toFixed(2).replace('.', ',')} €`);
const nb = (n: number) => winAnsi((n ?? 0).toLocaleString('fr-FR'));
const dateFr = (v?: string) => (v ? new Date(v).toLocaleDateString('fr-FR') : '');

export async function renderStatementPdf(id: string): Promise<{ pdf: Uint8Array; nom: string }> {
  const s = await getStatement(id);
  if (!s) throw new Error('Reddition introuvable');
  const [company, auteur] = await Promise.all([
    getCompany(),
    query<any>(`SELECT full_name, legal_name, siret, email FROM $id`, {
      id: recId('author', String(s.author).replace(/^author:/, ''))
    }).then((r) => r[0] ?? {})
  ]);

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.08);
  const grey = rgb(0.45, 0.45, 0.45);
  const rouge = rgb(0.83, 0.13, 0.11);

  const M = 48;
  let page = doc.addPage([595.28, 841.89]);
  const W = page.getWidth(), H = page.getHeight();
  let y = M;

  const texte = (v: string, x: number, opts: { size?: number; bold?: boolean; color?: any; right?: number; yTop?: number } = {}) => {
    const size = opts.size ?? 9;
    const f = opts.bold ? bold : font;
    const t = winAnsi(v);
    const xx = opts.right != null ? opts.right - f.widthOfTextAtSize(t, size) : x;
    page.drawText(t, { x: xx, y: H - (opts.yTop ?? y), size, font: f, color: opts.color ?? ink });
  };
  const ligne = (yTop = y, x1 = M, x2 = W - M, c = rgb(0.85, 0.85, 0.85)) =>
    page.drawLine({ start: { x: x1, y: H - yTop }, end: { x: x2, y: H - yTop }, thickness: 0.7, color: c });
  /** Saut de page quand la colonne est pleine (une reddition peut tenir des pages). */
  const place = (hauteur: number) => {
    if (y + hauteur < H - M) return;
    page = doc.addPage([595.28, 841.89]);
    y = M;
  };

  // ── En-tête ──────────────────────────────────────────────────────────────
  texte(company.legal_name ?? 'Éditions Agone', M, { size: 14, bold: true });
  let yEntete = y + 16;
  for (const l of String(company.address ?? '').split('\n').map((v) => v.trim()).filter(Boolean)) {
    texte(l, M, { size: 9, color: grey, yTop: yEntete });
    yEntete += 12;
  }
  texte('REDDITION DE COMPTES', W - M, { size: 18, bold: true, right: W - M, yTop: M + 4 });
  texte(`Exercice ${new Date(s.period_start).getUTCFullYear()}`, W - M, { size: 11, bold: true, right: W - M, yTop: M + 24 });
  texte(`Du ${dateFr(s.period_start)} au ${dateFr(s.period_end)}`, W - M, { size: 9, color: grey, right: W - M, yTop: M + 39 });
  const STATUT: Record<string, string> = { draft: 'Brouillon', issued: 'Émise', paid: 'Payée' };
  texte(STATUT[s.status] ?? s.status, W - M, { size: 9, color: s.status === 'draft' ? rouge : grey, right: W - M, yTop: M + 52 });

  // ── Auteur ───────────────────────────────────────────────────────────────
  y = Math.max(yEntete, M + 66) + 20;
  texte('Auteur', M, { size: 8, bold: true, color: grey });
  y += 14;
  texte(auteur.full_name ?? '', M, { size: 11, bold: true });
  y += 13;
  for (const l of [auteur.legal_name && auteur.legal_name !== auteur.full_name ? auteur.legal_name : '', auteur.siret ? `SIRET ${auteur.siret}` : '', auteur.email ?? ''].filter(Boolean)) {
    texte(String(l), M, { size: 9, color: grey });
    y += 12;
  }

  // ── Tableau des ventes ───────────────────────────────────────────────────
  const cVendus = M + 250, cRetours = M + 300, cProv = M + 352, cNet = M + 404, cBase = M + 452, cTaux = M + 490, cBrut = W - M;
  y += 16;
  texte('Titre', M, { size: 8, bold: true, color: grey });
  texte('Vendus', 0, { size: 8, bold: true, color: grey, right: cVendus });
  texte('Retours', 0, { size: 8, bold: true, color: grey, right: cRetours });
  texte('Provision', 0, { size: 8, bold: true, color: grey, right: cProv });
  texte('Retenus', 0, { size: 8, bold: true, color: grey, right: cNet });
  texte('Assiette', 0, { size: 8, bold: true, color: grey, right: cBase });
  texte('Taux', 0, { size: 8, bold: true, color: grey, right: cTaux });
  texte('Droits', 0, { size: 8, bold: true, color: grey, right: cBrut });
  y += 6; ligne(); y += 14;

  const lignes: any[] = s.lines ?? [];
  const ventes = lignes.filter((l) => l.kind !== 'cession');
  const cessions = lignes.filter((l) => l.kind === 'cession');

  for (const l of ventes) {
    place(30);
    let titre = String(l.book_title ?? '');
    if (titre.length > 42) titre = titre.slice(0, 41) + '…';
    texte(titre, M, { size: 9 });
    texte(nb(l.units_sold), 0, { size: 9, right: cVendus });
    texte(l.units_returned ? `−${nb(l.units_returned)}` : '—', 0, { size: 9, right: cRetours });
    texte(l.units_provision ? `−${nb(l.units_provision)}` : '—', 0, { size: 9, right: cProv });
    texte(nb(l.units), 0, { size: 9, bold: true, right: cNet });
    texte(eur(l.base_amount), 0, { size: 9, right: cBase });
    texte(`${l.rate} %`, 0, { size: 9, right: cTaux });
    texte(eur(l.gross), 0, { size: 9, bold: true, right: cBrut });
    y += 12;
    const precisions = [
      ROLE[l.role] ?? l.role,
      l.format === 'ebook' ? 'numérique' : l.format === 'paper' ? 'papier' : 'tous supports',
      l.share !== 100 ? `part ${l.share} %` : '',
      l.units_released ? `reprise de provision +${nb(l.units_released)}` : '',
      l.units_export ? `dont ${nb(l.units_export)} hors France (taux réduit de moitié)` : '',
      l.segment_start ? `du ${dateFr(l.segment_start)} au ${dateFr(l.segment_end)}` : ''
    ].filter(Boolean).join(' · ');
    texte(precisions, M + 8, { size: 7.5, color: grey });
    y += 14;
  }
  if (!ventes.length) { texte('Aucune vente sur l’exercice.', M, { size: 9, color: grey }); y += 16; }

  // ── Cessions de droits ───────────────────────────────────────────────────
  if (cessions.length) {
    place(40);
    y += 8;
    texte('Cessions de droits', M, { size: 8, bold: true, color: grey });
    y += 6; ligne(); y += 14;
    for (const l of cessions) {
      place(24);
      texte(`${l.book_title} — ${l.label ?? 'cession'}`, M, { size: 9 });
      texte(eur(l.base_amount), 0, { size: 9, right: cBase });
      texte(`${l.rate} %`, 0, { size: 9, right: cTaux });
      texte(eur(l.gross), 0, { size: 9, bold: true, right: cBrut });
      y += 12;
      texte('part revenant au contributeur sur les sommes encaissées', M + 8, { size: 7.5, color: grey });
      y += 14;
    }
  }

  // ── Totaux ───────────────────────────────────────────────────────────────
  place(120);
  y += 8; ligne(); y += 16;
  const total = (libelle: string, montant: string, opts: { bold?: boolean; color?: any } = {}) => {
    texte(libelle, 0, { size: opts.bold ? 10 : 9, bold: opts.bold, color: opts.color, right: W - M - 110 });
    texte(montant, 0, { size: opts.bold ? 10 : 9, bold: opts.bold, color: opts.color, right: W - M });
    y += 15;
  };
  total('Droits bruts', eur(s.gross_total));
  if (s.advance_applied) total('À-valoir amorti', `−${eur(s.advance_applied)}`);
  if (s.carry_in) total('Report de l’exercice précédent', eur(s.carry_in));
  total('Total dû', eur(s.total_due), { bold: true });
  if (!s.payable && s.carry_out) {
    total('Reporté sur l’exercice suivant', eur(s.carry_out), { color: grey });
    y += 2;
    texte('Le solde n’atteint pas le seuil contractuel de paiement : il est reporté.', 0, { size: 8, color: grey, right: W - M });
    y += 14;
  } else {
    total('Net à payer', eur(s.payable), { bold: true, color: rouge });
  }

  // ── Réserves ─────────────────────────────────────────────────────────────
  if ((s.warnings ?? []).length) {
    place(60);
    y += 10;
    texte('Observations', M, { size: 8, bold: true, color: grey });
    y += 13;
    for (const w of s.warnings as string[]) {
      for (const bout of decouper(winAnsi(w), 110)) { place(14); texte(`— ${bout}`, M, { size: 8, color: grey }); y += 11; }
    }
  }

  // ── Pied ─────────────────────────────────────────────────────────────────
  y = H - M - 10;
  texte(
    'Comptes arrêtés au 31 décembre. Le paiement intervient dans les six mois suivant l’arrêté. ' +
    'La retenue provisionnelle sur retours est reprise à l’exercice suivant.',
    M, { size: 7.5, color: grey }
  );

  const nom = `reddition-${(auteur.full_name ?? 'auteur').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}-${new Date(s.period_start).getUTCFullYear()}.pdf`;
  return { pdf: await doc.save(), nom };
}

/** Découpe un texte long en lignes d'au plus n caractères, aux espaces. */
function decouper(v: string, n: number): string[] {
  const mots = v.split(' ');
  const out: string[] = [];
  let courante = '';
  for (const m of mots) {
    if ((courante + ' ' + m).trim().length > n) { out.push(courante.trim()); courante = m; }
    else courante += ' ' + m;
  }
  if (courante.trim()) out.push(courante.trim());
  return out;
}
