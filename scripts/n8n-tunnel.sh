#!/usr/bin/env bash
# Opens a Cloudflare quick tunnel to n8n, points n8n and Convex at the new public URL,
# restarts n8n so it uses it, then keeps the tunnel open until Ctrl+C.
# Quick-tunnel URLs change on every run, which is why this is scripted.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v cloudflared >/dev/null || { echo "cloudflared not installed (see README)." >&2; exit 1; }

log=$(mktemp)
cloudflared tunnel --no-autoupdate --url http://localhost:5678 >"$log" 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null; rm -f "$log"' EXIT

url=""
for _ in $(seq 1 30); do
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1 || true)
  [[ -n "$url" ]] && break
  sleep 1
done
[[ -n "$url" ]] || { cat "$log" >&2; echo "Tunnel did not start." >&2; exit 1; }

sed -i "s|^N8N_WEBHOOK_URL=.*|N8N_WEBHOOK_URL=$url/|" n8n/.env
npx convex env set N8N_WEBHOOK_URL "$url" >/dev/null
docker compose up -d --force-recreate n8n >/dev/null

echo "Public n8n URL: $url"
echo "Test:           curl $url/webhook/lendloop-ping"
echo "Convex env N8N_WEBHOOK_URL updated. Ctrl+C closes the tunnel."
wait $pid
