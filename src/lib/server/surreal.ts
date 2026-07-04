// Connexion à Surreal en HTTP (req/rép, sans état) — pas de WebSocket.
// L'app est SSR : seul ce module (serveur) parle à Surreal, et aucune LIVE
// query n'est utilisée. HTTP évite la fragilité du socket partagé (un socket
// fermé suite à une erreur bloquait les requêtes concurrentes en vol).
import { error } from '@sveltejs/kit';
import { Surreal, RecordId, DateTime } from 'surrealdb';
import {
  SURREAL_URL,
  SURREAL_NAMESPACE,
  SURREAL_DATABASE,
  SURREAL_USER,
  SURREAL_PASS
} from '$env/static/private';

/** Détecte une erreur de connexion à SurrealDB (DB éteinte, refus, timeout…). */
function isConnectionError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as any)?.message ?? err).toLowerCase();
  const code = String((err as any)?.code ?? (err as any)?.cause?.code ?? '').toUpperCase();
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('websocket') ||
    msg.includes('disconnected') ||
    msg.includes('not connected') ||
    msg.includes('connection closed') ||
    msg.includes('socket hang up') ||
    // Bug fetch (Bun/undici) sur connexion keep-alive réutilisée : la réponse est
    // tronquée vs son Content-Length. Reconnecter + rejouer sur une socket fraîche.
    msg.includes('content-length') ||
    msg.includes('body timeout') ||
    msg.includes('terminated')
  );
}

/**
 * Détecte une erreur d'authentification (token expiré, session perdue).
 * En HTTP le token du signin a une durée de vie limitée : à l'expiration,
 * il faut se reconnecter (connect + use + signin) pour repartir d'un token frais.
 */
function isAuthError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as any)?.message ?? err).toLowerCase();
  return (
    msg.includes('anonymous access') ||
    msg.includes('not enough permission') ||
    msg.includes('not allowed') ||
    msg.includes('unauthorized') ||
    msg.includes('authentication') ||
    msg.includes('token') ||
    msg.includes('expired') ||
    msg.includes('invalid signin')
  );
}

let db: Surreal | null = null;
let connectPromise: Promise<Surreal> | null = null;

const CONNECT_TIMEOUT_MS = 2000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms (ECONNREFUSED)`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function connect(): Promise<Surreal> {
  const instance = new Surreal();
  await withTimeout(instance.connect(SURREAL_URL, { versionCheck: false }), CONNECT_TIMEOUT_MS, 'connect');
  await instance.use({ namespace: SURREAL_NAMESPACE, database: SURREAL_DATABASE });
  await instance.signin({ username: SURREAL_USER, password: SURREAL_PASS });
  return instance;
}

async function getDb(): Promise<Surreal> {
  if (db) return db;
  if (connectPromise) return connectPromise;
  connectPromise = connect()
    .then((instance) => {
      db = instance;
      connectPromise = null;
      return instance;
    })
    .catch((err) => {
      connectPromise = null;
      db = null;
      throw err;
    });
  return connectPromise;
}

function invalidate() {
  const old = db;
  db = null;
  connectPromise = null;
  if (old) old.close().catch(() => {});
}

export function toPlain<T = any>(value: any): T {
  if (value === null || value === undefined) return value;
  if (value instanceof RecordId) {
    const tb = (value as any).table?.name ?? (value as any).tb ?? '';
    return `${tb}:${String(value.id)}` as any;
  }
  if (value instanceof DateTime) return value.toISOString() as any;
  if (value instanceof Date) return value.toISOString() as any;
  if (Array.isArray(value)) return value.map(toPlain) as any;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out as T;
  }
  return value;
}

export async function query<T = unknown>(
  sql: string,
  vars?: Record<string, unknown>
): Promise<T[]> {
  async function run(c: Surreal) {
    const result = await c.query<T[]>(sql, vars);
    let rows: T[];
    if (Array.isArray(result) && result.length === 1) rows = result[0] as T[];
    else rows = result as T[];
    return toPlain<T[]>(rows);
  }
  let conn: Surreal;
  try {
    conn = await getDb();
  } catch (err) {
    invalidate();
    if (isConnectionError(err)) {
      throw error(503, { code: 'DB_DOWN', message: 'Base de données injoignable' });
    }
    throw err;
  }
  try {
    return await run(conn);
  } catch (err) {
    // On ne reconnecte que sur une erreur de connexion OU d'auth (token expiré).
    // Une erreur de requête (parse, contrainte…) est renvoyée telle quelle.
    if (!isConnectionError(err) && !isAuthError(err)) throw err;
    invalidate();
    try {
      conn = await getDb();
      return await run(conn);
    } catch (retryErr) {
      invalidate();
      if (isConnectionError(retryErr)) {
        throw error(503, { code: 'DB_DOWN', message: 'Base de données injoignable' });
      }
      throw retryErr;
    }
  }
}

export function recId(table: string, id: string | RecordId): RecordId {
  if (id instanceof RecordId) return id;
  return new RecordId(table, String(id).replace(new RegExp(`^${table}:`), ''));
}
