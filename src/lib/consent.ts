// CMP maison — RGPD, signale Google Consent Mode v2 + Meta Pixel.
//
// Trois catégories :
// - necessary : toujours accordé (panier, session, préférences…)
// - analytics : GA4, statistiques internes
// - marketing : Meta Pixel (Instagram/Facebook Ads), Google Ads, remarketing
//
// CMP custom : suffisant pour l'annonceur (Meta/Google Ads) couplé à GCM v2.
// Si un jour IAB TCF v2.2 est requis, migrer vers une CMP certifiée — la forme
// des dataLayer.push reste identique, les tags GTM n'ont pas à changer.

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decided_at: string; // ISO
}

const COOKIE_NAME = 'ag_consent';
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 an

export const DEFAULT_DENIED: ConsentState = { necessary: true, analytics: false, marketing: false, decided_at: '' };

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}
function writeCookie(name: string, value: string, maxAgeSec: number) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAgeSec}; path=/; SameSite=Lax`;
}

export function readConsent(): ConsentState | null {
  const raw = readCookie(COOKIE_NAME);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return { necessary: true, analytics: p.analytics === true, marketing: p.marketing === true, decided_at: p.decided_at ?? '' };
  } catch {
    return null;
  }
}

export function writeConsent(c: ConsentState) {
  writeCookie(COOKIE_NAME, JSON.stringify(c), COOKIE_MAX_AGE_SEC);
}

/** Pousse une mise à jour Consent Mode v2 dans le dataLayer.
 *  Le wrapper gtag() est requis : il pousse l'objet IArguments en une seule
 *  entrée, ce que lit le gestionnaire de consentement de GTM. Un
 *  dataLayer.push('consent','update',{...}) direct insère trois items et le
 *  signal est ignoré (GA reste « denied »). */
export function applyConsentToTags(c: ConsentState) {
  if (typeof window === 'undefined') return;
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  function gtag(..._args: unknown[]) { w.dataLayer.push(arguments); }
  gtag('consent', 'update', {
    ad_storage: c.marketing ? 'granted' : 'denied',
    ad_user_data: c.marketing ? 'granted' : 'denied',
    ad_personalization: c.marketing ? 'granted' : 'denied',
    analytics_storage: c.analytics ? 'granted' : 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted'
  });
  // Meta Pixel (fbq) — miroir du consentement marketing. Le pixel est initialisé
  // avec fbq('consent','revoke') ; sans ce grant, Meta reçoit mais n'enregistre
  // pas les événements comme utilisables.
  if (typeof w.fbq === 'function') w.fbq('consent', c.marketing ? 'grant' : 'revoke');
  w.dataLayer.push({ event: 'consent_update', consent: c });
}

export function makeAcceptAll(): ConsentState {
  return { necessary: true, analytics: true, marketing: true, decided_at: new Date().toISOString() };
}
export function makeRejectAll(): ConsentState {
  return { necessary: true, analytics: false, marketing: false, decided_at: new Date().toISOString() };
}
