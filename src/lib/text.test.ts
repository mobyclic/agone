import { describe, expect, it } from 'bun:test';
import { decoderEntites, extraitPropre, notesDeBasDePage } from './text';

describe('decoderEntites', () => {
  it('décode les entités d’un texte brut', () => {
    expect(decoderEntites('producteurs d&#x27;énergie &amp; autre L&#039;Union')).toBe('producteurs d’énergie & autre L’Union');
    expect(decoderEntites('Hanna &amp; Karl')).toBe('Hanna & Karl');
    expect(decoderEntites('sans entité')).toBe('sans entité');
  });
  it('est appliqué par extraitPropre', () => {
    expect(extraitPropre('il ne s&#x27;agit pas.')).toBe('il ne s’agit pas.');
  });
});

describe('notesDeBasDePage', () => {
  it('numérote les appels et rétablit le HTML en ligne des notes migrées', () => {
    const html = '<p>Texte<sup data-fn="Schaub, &lt;em&gt;Archives&lt;/em&gt;, p. 471. &lt;a href=&quot;https://ex.org/x&quot;&gt;lien&lt;/a&gt;"></sup>.</p>';
    const out = notesDeBasDePage(html)!;
    expect(out).toContain('<sup class="appel-note" id="appel-1">');
    expect(out).toContain('<li id="note-1">Schaub, <em>Archives</em>, p. 471. <a href="https://ex.org/x" rel="noopener">lien</a>');
    expect(out).not.toContain('&lt;em&gt;');
  });
  it('n’exécute rien d’autre', () => {
    const out = notesDeBasDePage('<p>a<sup data-fn="&lt;script&gt;x&lt;/script&gt; https://a.fr/b"></sup></p>')!;
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('<a href="https://a.fr/b" rel="noopener">https://a.fr/b</a>');
  });
});
