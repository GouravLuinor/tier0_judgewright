#!/bin/sh
# Boots the REAL production artifact: the standalone build, exactly as the
# Dockerfile and PM2 do (public + .next/static staged in, then server.js).
#
# Why a script instead of a `&&` chain in playwright.config.ts: Playwright
# kills the process it spawned. With a `npm run build && node server.js`
# chain it kills only the shell, leaving the node server as an orphan that
# keeps port 3005 — and the NEXT run then adopts that stale server, whose
# hash-named chunks the intervening `npm run build` has replaced. The symptom
# is a page that renders from SSR but never hydrates.
#
# `exec` replaces this shell with the node process, so the webServer Playwright
# spawns IS the server and is killed cleanly. No orphan, no stale adoption.
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .next/standalone/server.js ]; then
    echo "serve-standalone: no artifact found — building"
    npm run build
fi

# Standalone output must be packaged the way the Dockerfile does it, otherwise
# static assets and public/ are missing from the server root.
mkdir -p .next/standalone/public .next/standalone/.next/static
cp -r public/. .next/standalone/public/
cp -r .next/static/. .next/standalone/.next/static/

export PORT=3005
export HOSTNAME=127.0.0.1
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1

echo "serve-standalone: booting the standalone artifact on http://127.0.0.1:3005"
exec node .next/standalone/server.js
