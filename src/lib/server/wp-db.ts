/**
 * Connexion LECTURE SEULE à la base MySQL de l'ancien site WordPress/WooCommerce.
 *
 * Utilisée uniquement par l'outil de synchronisation pré-production (Paramètres)
 * pour importer les derniers utilisateurs / commandes / contenus depuis la prod.
 * Aucune écriture n'est faite côté WordPress (SELECT seulement).
 *
 * Configuration (dans .env, non commité) :
 *   WP_DB_HOST, WP_DB_PORT (déf. 3306), WP_DB_USER, WP_DB_PASS, WP_DB_NAME, WP_DB_PREFIX (déf. wri_)
 *
 * La connexion est PARESSEUSE : rien n'est ouvert tant qu'un import n'est pas lancé,
 * et l'outil s'affiche « non configuré » si les variables manquent.
 */
import { env } from '$env/dynamic/private';
import mysql from 'mysql2/promise';

export function wpConfigured(): boolean {
  return !!(env.WP_DB_HOST && env.WP_DB_USER && env.WP_DB_NAME);
}

export function wpPrefix(): string {
  return env.WP_DB_PREFIX || 'wri_';
}

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!wpConfigured()) throw new Error('Connexion WordPress non configurée (WP_DB_* dans .env).');
  if (!pool) {
    pool = mysql.createPool({
      host: env.WP_DB_HOST,
      port: Number(env.WP_DB_PORT || 3306),
      user: env.WP_DB_USER,
      password: env.WP_DB_PASS,
      database: env.WP_DB_NAME,
      connectionLimit: 3,
      charset: 'utf8mb4_unicode_ci',
      dateStrings: true
    });
  }
  return pool;
}

/** SELECT sur la base WordPress (lecture seule). */
export async function wpQuery<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().query(sql, params);
  return rows as T[];
}

/** Vérifie que la connexion répond (ping simple). */
export async function wpPing(): Promise<boolean> {
  try {
    await wpQuery('SELECT 1 AS ok');
    return true;
  } catch {
    return false;
  }
}
