#!/usr/bin/env bash
# Deploy script for Judgewright on Nor AI VPS (YOUR_SERVER_IP)
# Usage: ./deploy.sh [DOMAIN] (defaults to judgewright.norai.tech)
set -euo pipefail

DOMAIN="${1:-judgewright.norai.tech}"
TARGET_DIR="/var/www/judge"
PORT=3005

echo "=========================================="
echo "Deploying Judgewright on Nor AI VPS..."
echo "Domain: ${DOMAIN}"
echo "Port: ${PORT}"
echo "=========================================="

cd "${TARGET_DIR}"

echo "Installing production dependencies..."
npm ci

echo "Building Next.js application..."
npm run build

echo "Managing PM2 process (judge-norai)..."
pm2 restart judge-norai || pm2 start npm --name "judge-norai" -- start -- -p ${PORT}
pm2 save

echo "=========================================="
echo "Judgewright deployed successfully on PM2!"
echo "=========================================="
