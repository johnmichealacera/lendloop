#!/usr/bin/env bash
# Creates n8n/.env with fresh random secrets (once) and copies the shared ones into Convex env.
# Secrets are never printed.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=n8n/.env
if [[ ! -f "$ENV_FILE" ]]; then
  site_url=$(grep -E '^NEXT_PUBLIC_CONVEX_SITE_URL=' .env.local | cut -d= -f2- || true)
  [[ -n "$site_url" ]] || { echo "NEXT_PUBLIC_CONVEX_SITE_URL missing from .env.local. Run 'npx convex dev --once' first." >&2; exit 1; }
  cp n8n/.env.example "$ENV_FILE"
  sed -i \
    -e "s|^N8N_ENCRYPTION_KEY=.*|N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)|" \
    -e "s|^N8N_WEBHOOK_SECRET=.*|N8N_WEBHOOK_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^CONVEX_CALLBACK_SECRET=.*|CONVEX_CALLBACK_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^CONVEX_SITE_URL=.*|CONVEX_SITE_URL=$site_url|" \
    "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE with new secrets."
else
  echo "$ENV_FILE already exists; keeping its secrets."
fi

value() { grep -E "^$1=" "$ENV_FILE" | cut -d= -f2-; }
npx convex env set N8N_WEBHOOK_SECRET "$(value N8N_WEBHOOK_SECRET)" >/dev/null
npx convex env set CONVEX_CALLBACK_SECRET "$(value CONVEX_CALLBACK_SECRET)" >/dev/null
echo "Convex env: N8N_WEBHOOK_SECRET and CONVEX_CALLBACK_SECRET set."
