import { describe, expect, it } from 'bun:test';
import { imagesPourMail } from './text';

describe('imagesPourMail', () => {
  it('traduit les réglages de l’éditeur en styles inlinés', () => {
    const html = '<p>a</p><img src="x.webp" alt="" data-align="left" data-taille="50" data-border="1" style="width:50%"><p>b</p>';
    const out = imagesPourMail(html);
    expect(out).toContain('float:left');
    expect(out).toContain('width:50%');
    expect(out).toContain('border:1px solid');
    expect(out.match(/style=/g)?.length).toBe(1);
  });
  it('laisse une image sans réglage en bloc', () => {
    expect(imagesPourMail('<img src="x.jpg">')).toBe('<img style="max-width:100%;height:auto;display:block;margin:16px 0" src="x.jpg">');
  });
});
