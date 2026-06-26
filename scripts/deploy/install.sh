#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/callmanagement"
REPO_URL="${CALLMGMT_REPO_URL:-https://github.com/Zombie10/CallManagement.git}"
NGINX_SITE="/etc/nginx/sites-available/paymercadogo"
SNIPPET_MARKER="# callmanagement-admin"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/deploy/install.sh"
  exit 1
fi

echo "==> Installing uv for ubuntu user"
if ! sudo -u ubuntu bash -lc 'command -v uv' >/dev/null 2>&1; then
  sudo -u ubuntu bash -lc 'curl -LsSf https://astral.sh/uv/install.sh | sh'
fi

echo "==> Syncing application to ${APP_DIR}"
mkdir -p "${APP_DIR}/data"
chown -R ubuntu:ubuntu "${APP_DIR}"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  sudo -u ubuntu git clone "${REPO_URL}" "${APP_DIR}"
else
  sudo -u ubuntu git -C "${APP_DIR}" pull --ff-only
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  echo "ERROR: Create ${APP_DIR}/.env before running install (see .env.example)"
  exit 1
fi

echo "==> Python dependencies"
sudo -u ubuntu bash -lc "cd '${APP_DIR}' && ~/.local/bin/uv sync --frozen --no-dev"

echo "==> Initialize CRM database"
sudo -u ubuntu bash -lc "cd '${APP_DIR}' && ~/.local/bin/uv run python scripts/init_crm.py"

echo "==> systemd service"
cp "${APP_DIR}/scripts/deploy/callmanagement.service" /etc/systemd/system/callmanagement.service
systemctl daemon-reload
systemctl enable callmanagement
systemctl restart callmanagement

echo "==> nginx snippet for /callmgmt/"
if ! grep -q "${SNIPPET_MARKER}" "${NGINX_SITE}"; then
  cp "${NGINX_SITE}" "${NGINX_SITE}.bak.callmgmt-$(date +%s)"
  awk -v snippet="${APP_DIR}/scripts/deploy/nginx-callmgmt.conf" -v marker="${SNIPPET_MARKER}" '
    /location \/ \{/ && !done {
      print "    " marker
      while ((getline line < snippet) > 0) print line
      close(snippet)
      done=1
    }
    { print }
  ' "${NGINX_SITE}" > "${NGINX_SITE}.new"
  mv "${NGINX_SITE}.new" "${NGINX_SITE}"
fi

nginx -t
systemctl reload nginx

echo "==> Done. Admin UI: https://paymercadogo.com/callmgmt/"
systemctl --no-pager status callmanagement