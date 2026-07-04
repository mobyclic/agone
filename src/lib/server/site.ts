/**
 * Réglages globaux du site (table `site_setting`).
 *
 * Chaque réglage est une paire { key, value } où `value` est un objet libre
 * (FLEXIBLE). Exemples de clés : 'banner', 'home', 'contact'.
 *
 *   const banner = await getBanner();
 *   await setSetting('contact', { email: 'hello@…', phone: '…' });
 */
import { query, recId } from './surreal';

export type SettingValue = Record<string, unknown>;

/** Bannière d'information affichée en tête du site public. */
export interface Banner {
  active: boolean;
  /** Message multilingue { fr, en } (à passer à `pickI18n`). */
  message: Record<string, string>;
  /** Style visuel : 'info' | 'warning' | 'success' | 'brand'. */
  variant: string;
}

/** Lit un réglage par sa clé. Renvoie l'objet `value`, ou `null` si absent. */
export async function getSetting<T extends SettingValue = SettingValue>(
  key: string
): Promise<T | null> {
  try {
    const rows = await query<any>(`SELECT value FROM site_setting WHERE key = $k LIMIT 1`, {
      k: key
    });
    return (rows[0]?.value ?? null) as T | null;
  } catch {
    return null;
  }
}

/**
 * Écrit (crée ou met à jour) un réglage identifié par sa clé.
 * Passe par un SELECT préalable pour respecter l'index unique sur `key`.
 */
export async function setSetting(key: string, value: SettingValue): Promise<void> {
  const existing = await query<any>(`SELECT id FROM site_setting WHERE key = $k LIMIT 1`, {
    k: key
  });
  if (existing[0]?.id) {
    await query(`UPDATE $id SET value = $v`, { id: recId('site_setting', existing[0].id), v: value });
  } else {
    await query(`CREATE site_setting SET key = $k, value = $v`, { k: key, v: value });
  }
}

/** Bannière normalisée (valeurs par défaut sûres si le réglage n'existe pas). */
export async function getBanner(): Promise<Banner> {
  const v = (await getSetting('banner')) ?? {};
  const message = (v as any).message;
  return {
    active: (v as any).active === true,
    message:
      message && typeof message === 'object'
        ? (message as Record<string, string>)
        : { fr: String(message ?? ''), en: String(message ?? '') },
    variant: typeof (v as any).variant === 'string' ? (v as any).variant : 'info'
  };
}
