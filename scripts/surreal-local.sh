#!/usr/bin/env sh
# SurrealDB local pour travailler hors connexion (copie de la base cloud).
#
#   bun run db:local          → démarre le serveur (premier plan, Ctrl+C pour arrêter)
#   bun run db:local:pull     → ré-importe la base cloud (ÉCRASE la base locale)
#
# Même version que le cloud (3.2.4) : un export 3.2 réimporté dans une 3.0 peut
# échouer sur la syntaxe. Données : ~/.local/share/agone-surreal (hors dépôt).
# Identifiants locaux : lus dans .env.local (jamais commité).
set -e
BIN="${SURREAL_BIN:-$HOME/.local/bin/surreal-3.2.4}"
DATA="$HOME/.local/share/agone-surreal"
PORT="${SURREAL_LOCAL_PORT:-8123}"
cd "$(dirname "$0")/.."

[ -x "$BIN" ] || { echo "Binaire $BIN introuvable (voir docs/LOCAL-DB.md)."; exit 1; }
[ -f .env.local ] || { echo ".env.local absent : identifiants locaux introuvables."; exit 1; }
USER_LOCAL=$(grep '^SURREAL_USER=' .env.local | cut -d= -f2- | tr -d '"')
PASS_LOCAL=$(grep '^SURREAL_PASS=' .env.local | cut -d= -f2- | tr -d '"')

case "${1:-start}" in
  start)
    mkdir -p "$DATA"
    exec "$BIN" start --log info --bind "127.0.0.1:$PORT" \
      --user "$USER_LOCAL" --pass "$PASS_LOCAL" "surrealkv://$DATA/data"
    ;;
  pull)
    # Exporte le cloud (identifiants de .env) puis l'importe en local.
    set -a; eval "$(grep -E '^SURREAL_' .env | sed 's/\r$//')"; set +a
    EP=$(echo "$SURREAL_URL" | sed -E 's#/rpc/?$##')
    mkdir -p "$DATA/dumps"
    F="$DATA/dumps/agone-cloud-$(date +%Y%m%d-%H%M).surql"
    "$BIN" export --endpoint "$EP" --username "$SURREAL_USER" --password "$SURREAL_PASS" \
      --namespace "$SURREAL_NAMESPACE" --database "$SURREAL_DATABASE" "$F"
    NS=$(grep '^SURREAL_NAMESPACE=' .env.local | cut -d= -f2- | tr -d '"')
    DB=$(grep '^SURREAL_DATABASE=' .env.local | cut -d= -f2- | tr -d '"')
    echo "REMOVE DATABASE IF EXISTS \`$DB\`;" | "$BIN" sql --endpoint "http://127.0.0.1:$PORT" \
      --username "$USER_LOCAL" --password "$PASS_LOCAL" --namespace "$NS" --hide-welcome >/dev/null
    "$BIN" import --endpoint "http://127.0.0.1:$PORT" --username "$USER_LOCAL" --password "$PASS_LOCAL" \
      --namespace "$NS" --database "$DB" "$F"
    # Couvertures et images : servies en local plutôt que depuis R2 (hors connexion).
    bun run scripts/mirror-media.ts
    echo "Base locale remplacée par $F"
    ;;
  *) echo "usage : $0 [start|pull]"; exit 1 ;;
esac
