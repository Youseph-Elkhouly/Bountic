#!/bin/bash
# Starts the Bountic API (4000) and web app (3000) on this Mac.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"
echo "node: $(node -v)"
(cd services/security && npm install --silent && npm run build --silent)
(cd services/api && npm install --silent)
(cd apps/web && npm install --silent)
(cd services/api && npm run dev) &
(cd apps/web && npm run dev) &
sleep 12; open http://localhost:3000
wait
