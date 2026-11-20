import type { RequestHandler } from './$types';

/** Santé de l'application (Coolify, Docker) : répond dès que le serveur tourne, sans toucher la base. */
export const GET: RequestHandler = () => new Response('ok', { headers: { 'cache-control': 'no-store' } });
