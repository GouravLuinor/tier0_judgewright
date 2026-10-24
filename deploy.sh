#!/usr/bin/env bash
# Deploy Judgewright to the Nor AI VPS, following ../DEPLOYMENT_PLAYBOOK.md:
# back up, rsync, build and restart as the `deploy` user, then verify.
# Run from your laptop, in the judgewright/ directory:  ./deploy.sh
# Needs DEPLOY_CONFIRM=1 (or the `confirm` argument), so it never runs by accident.
set -euo pipefail

VPS="root@YOUR_SERVER_IP"
KEY="${DEPLOY_KEY:-${HOME}/.ssh/norai_personal_admin}"
TARGET_DIR="/var/www/judge"
PM2_NAME="judge-norai"
PORT=3005
URL="https://judge.norai.tech"

if [ "${DEPLOY_CONFIRM:-}" != "1" ] && [ "${1:-}" != "confirm" ]; then
  echo "Refusing to deploy: set DEPLOY_CONFIRM=1 or pass 'confirm'." >&2
  exit 1
fi
[ -f "${KEY}" ] || { echo "SSH key not found at ${KEY}" >&2; exit 1; }

ssh_vps() { ssh -i "${KEY}" -o IdentitiesOnly=yes "${VPS}" "$@"; }

echo "=== 1. Backup to /root/deploy-backups ==="
ssh_vps "mkdir -p /root/deploy-backups && tar --exclude=node_modules --exclude=.next -czf /root/deploy-backups/judge-\$(date +%Y%m%d-%H%M).tgz -C /var/www judge"

echo "=== 2. Sync code (the server's .env.local is never touched) ==="
rsync -az --delete --chown=deploy:deploy \
  --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='.env.local' \
  --exclude='.impeccable' --exclude='test-results' --exclude='coverage' \
  -e "ssh -i ${KEY} -o IdentitiesOnly=yes" \
  ./ "${VPS}:${TARGET_DIR}/"

echo "=== 3. Build as deploy, then restart ${PM2_NAME} ==="
ssh_vps "su - deploy -c 'cd ${TARGET_DIR} && npm ci --no-audit --no-fund && npm run build'"
ssh_vps "su - deploy -c 'pm2 restart ${PM2_NAME} || (cd ${TARGET_DIR} && pm2 start ecosystem.config.cjs); pm2 save'"

echo "=== 4. Verify ==="
sleep 3
ssh_vps "curl -fsS -o /dev/null -w 'local :${PORT} -> %{http_code}\n' http://127.0.0.1:${PORT}/tools/judgewright"
curl -fsS -o /dev/null -w "${URL} -> %{http_code}\n" "${URL}/tools/judgewright"
echo "deploy crontab (expect only the feed-fetch line):"
ssh_vps "crontab -l -u deploy"
