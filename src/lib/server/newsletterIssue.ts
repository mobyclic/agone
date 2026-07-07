/**
 * Numéro de LettrInfo — composition par BLOCS (souple, réordonnable).
 *
 * Un numéro est un `article` (is_newsletter_issue = true) dont l'email est décrit
 * par `newsletter_blocks` : liste ordonnée de blocs { type, … }. Types :
 *   - heading : { text }
 *   - text    : { html }           (contenu riche)
 *   - books   : { books: [{id,title}] }   (grille de couvertures)
 *   - events  : { }                (prochaines rencontres, automatique)
 *   - button  : { label, url }
 *   - image   : { url, href? }
 * Le `body_html` de l'article (version Antichambre) est dérivé des blocs à l'enregistrement.
 */
import { query, recId } from './surreal';
import { uniqueSlug } from './slug';

export type NlBlock = Record<string, any> & { type: string };

export interface NewsletterIssue {
  id: string;
  title: string;
  status: string;
  blocks: NlBlock[];
}

export async function getNewsletterIssue(id: string): Promise<NewsletterIssue | null> {
  const rows = await query<any>(
    `SELECT meta::id(id) AS id, title, status, newsletter_blocks AS blocks
       FROM article WHERE id = $id LIMIT 1`,
    { id: recId('article', id) }
  );
  const a = rows[0];
  if (!a) return null;
  return { id: a.id, title: a.title, status: a.status ?? 'draft', blocks: Array.isArray(a.blocks) ? a.blocks : [] };
}

/** Corps HTML « Antichambre » dérivé des blocs (titres + textes + livres en liens). */
function blocksToBodyHtml(blocks: NlBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'heading' && b.text) parts.push(`<h2>${escapeHtml(String(b.text))}</h2>`);
    else if (b.type === 'text' && b.html) parts.push(String(b.html));
    else if (b.type === 'button' && b.label && b.url)
      parts.push(`<p><a href="${escapeAttr(String(b.url))}">${escapeHtml(String(b.label))}</a></p>`);
  }
  return parts.join('\n');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, '&quot;');

function bookIdsFromBlocks(blocks: NlBlock[]): string[] {
  const ids = new Set<string>();
  for (const b of blocks)
    if (b.type === 'books' && Array.isArray(b.books))
      for (const x of b.books) if (x?.id) ids.add(String(x.id));
  return [...ids];
}

export interface NewsletterIssueInput {
  title: string;
  status?: string; // draft | published
  blocks: NlBlock[];
}

export async function saveNewsletterIssue(id: string | null, input: NewsletterIssueInput): Promise<string> {
  const status = input.status === 'published' ? 'published' : 'draft';
  const body_html = blocksToBodyHtml(input.blocks);
  const books = bookIdsFromBlocks(input.blocks).map((b) => recId('book', b));
  const vars: Record<string, unknown> = {
    title: input.title.trim() || '(sans titre)',
    status,
    blocks: input.blocks,
    body_html: body_html || undefined,
    books
  };
  const set = `title = $title, status = $status, is_newsletter_issue = true,
    newsletter_blocks = $blocks, books = $books, body_html = $body_html`;

  if (id) {
    await query(`UPDATE $id SET ${set}`, { ...vars, id: recId('article', id) });
    return id;
  }
  const slug = await uniqueSlug('article', input.title || 'lettrinfo');
  const rows = await query<any>(`CREATE article SET ${set}, slug = $slug`, { ...vars, slug });
  return String(rows[0].id).replace(/^article:/, '');
}

export async function deleteNewsletterIssue(id: string): Promise<void> {
  await query(`DELETE $id`, { id: recId('article', id) });
}
