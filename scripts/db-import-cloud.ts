import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * Importe un fichier .surql dans SurrealDB Cloud.
 *
 * Usage : bun run db:import:cloud <fichier.surql>
 *
 * Pré-requis : un fichier .env.cloud contenant les credentials cloud :
 *   SURREAL_URL=wss://<id>.surreal.cloud
 *   SURREAL_NAMESPACE=castingbretagne
 *   SURREAL_DATABASE=main
 *   SURREAL_USER=<user>
 *   SURREAL_PASS=<pass>
 */

const envFile = process.env.SURREAL_ENV_FILE ?? '.env.cloud';
if (!existsSync(envFile)) {
  console.error(`✗ Fichier ${envFile} introuvable. Crée-le avec les credentials du cloud.`);
  console.error(`  Tu peux aussi définir SURREAL_ENV_FILE=<autre-fichier>.`);
  process.exit(1);
}
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const input = process.argv[2];
if (!input) {
  console.error('✗ Fichier .surql manquant. Usage : bun run db:import:cloud <fichier.surql>');
  process.exit(1);
}
if (!existsSync(input)) {
  console.error(`✗ ${input} introuvable.`);
  process.exit(1);
}

const wsToHttp = (url: string) => url.replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://')).replace(/\/rpc\/?$/, '');
const endpoint = wsToHttp(process.env.SURREAL_URL!);
const ns = process.env.SURREAL_NAMESPACE!;
const db = process.env.SURREAL_DATABASE!;

console.log(`→ Import ${input} vers ${ns}/${db} sur ${endpoint}`);

const result = spawnSync(
  'surreal',
  [
    'import',
    '--endpoint', endpoint,
    '--username', process.env.SURREAL_USER!,
    '--password', process.env.SURREAL_PASS!,
    '--namespace', ns,
    '--database', db,
    input
  ],
  { stdio: 'inherit' }
);

process.exit(result.status ?? 1);
