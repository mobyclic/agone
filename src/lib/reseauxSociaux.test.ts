import { describe, expect, it } from 'bun:test';
import { detecterReseau, idYoutube, idVimeo, nettoyerUrl, refBluesky } from './reseauxSociaux';

describe('detecterReseau', () => {
  it('reconnaît les sept réseaux', () => {
    expect(detecterReseau('https://www.instagram.com/reel/DYhfs6IAOiP/?utm_source=ig_embed')).toBe('instagram');
    expect(detecterReseau('https://www.instagram.com/editions_agone/')).toBeNull(); // un profil, pas une publication
    expect(detecterReseau('https://www.facebook.com/agone.editions/posts/pfbid0abc')).toBe('facebook');
    expect(detecterReseau('https://x.com/agone/status/1234567890')).toBe('x');
    expect(detecterReseau('https://twitter.com/agone/status/1234567890')).toBe('x');
    expect(detecterReseau('https://www.tiktok.com/@agone/video/7300000000000000000')).toBe('tiktok');
    expect(detecterReseau('https://youtu.be/gGO4MM9N10o?si=abc')).toBe('youtube');
    expect(detecterReseau('https://www.youtube.com/watch?v=gGO4MM9N10o')).toBe('youtube');
    expect(detecterReseau('https://vimeo.com/234693106')).toBe('vimeo');
    expect(detecterReseau('https://bsky.app/profile/bsky.app/post/3mx5e63uvns2d')).toBe('bluesky');
    expect(detecterReseau('https://agone.org/livre/x')).toBeNull();
    expect(detecterReseau('pas une url')).toBeNull();
  });
});

describe('nettoyerUrl', () => {
  it('retire les paramètres de suivi et canonise', () => {
    expect(nettoyerUrl('https://www.instagram.com/reel/DYhfs6IAOiP/?utm_source=ig_embed&utm_campaign=loading')).toBe('https://www.instagram.com/reel/DYhfs6IAOiP/');
    expect(nettoyerUrl('https://youtu.be/gGO4MM9N10o?si=Kxxa34tFTxiDef3G')).toBe('https://www.youtube.com/watch?v=gGO4MM9N10o');
    expect(nettoyerUrl('https://player.vimeo.com/video/234693106?h=abc')).toBe('https://vimeo.com/234693106');
    expect(nettoyerUrl('https://twitter.com/agone/status/1?s=20')).toBe('https://x.com/agone/status/1');
  });
});

describe('identifiants', () => {
  it('extrait les ids', () => {
    expect(idYoutube('https://www.youtube.com/embed/gGO4MM9N10o?si=x')).toBe('gGO4MM9N10o');
    expect(idYoutube('https://www.youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk');
    expect(idVimeo('https://vimeo.com/8087598')).toBe('8087598');
    expect(refBluesky('https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/post/3mx5e63uvns2d')).toEqual({ acteur: 'did:plc:z72i7hdynmk6r22z27h6tvur', rkey: '3mx5e63uvns2d' });
  });
});
