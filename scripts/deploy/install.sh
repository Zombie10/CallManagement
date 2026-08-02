#!/usr/bin/env bash
# Install / refresh Call Management on a VPS (systemd + optional nginx snippet).
#
# Usage:
#   sudo bash scripts/deploy/install.sh
#   sudo APP_DIR=/opt/callmanagement APP_USER=ubuntu bash scripts/deploy/install.sh
#   sudo bash scripts/deploy/install.sh --skip-nginx
#   sudo bash scripts/deploy/install.sh --no-start
#
# Prerequisites: git, curl; uv installed for APP_USER; .env present under APP_DIR.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/callmanagement}"
APP_USER="${APP_USER:-ubuntu}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
REPO_URL="${CALLMGMT_REPO_URL:-https://github.com/Zombie10/CallManagement.git}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/paymercadogo}"
SNIPPET_MARKER="# callmanagement-admin"
UNIT_DIR=/etc/systemd/system

SKIP_NGINX=0
NO_START=0
for arg in "$@"; do
  case "$arg" in
    --skip-nginx) SKIP_NGINX=1 ;;
    --no-start) NO_START=1 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/deploy/install.sh"
  exit 1
fi

if ! id "$APP_USER" &>/dev/null; then
  echo "ERROR: user '$APP_USER' does not exist (set APP_USER=...)"
  exit 1
fi

run_as_app() {
  # Prefer login-ish env so ~/.local/bin (uv) is on PATH when present.
  sudo -u "$APP_USER" -H bash -lc "$*"
}

uv_bin() {
  if run_as_app 'command -v uv' >/dev/null 2>&1; then
    run_as_app 'command -v uv'
    return
  fi
  local candidates=(
    "/home/${APP_USER}/.local/bin/uv"
    "/usr/local/bin/uv"
    "/usr/bin/uv"
  )
  for c in "${candidates[@]}"; do
    if [[ -x "$c" ]]; then
      echo "$c"
      return
    fi
  done
  return 1
}

echo "==> Install uv for ${APP_USER} (if missing)"
if ! uv_bin >/dev/null 2>&1; then
  run_as_app 'curl -LsSf https://astral.sh/uv/install.sh | sh'
fi
UV="$(uv_bin)"
echo "    uv: ${UV}"

echo "==> Sync application tree → ${APP_DIR}"
mkdir -p "${APP_DIR}/data" "${APP_DIR}/data/.cache"
chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  # If install is run from a checkout already at APP_DIR, keep it.
  if [[ -f "${APP_DIR}/pyproject.toml" ]]; then
    echo "    existing tree without .git — skipping clone"
  else
    run_as_app "git clone '${REPO_URL}' '${APP_DIR}'"
  fi
else
  # Best-effort pull; do not fail offline installs on dirty trees.
  run_as_app "git -C '${APP_DIR}' pull --ff-only" || echo "    warn: git pull skipped/failed"
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  if [[ -f "${APP_DIR}/.env.example" ]]; then
    echo "ERROR: Create ${APP_DIR}/.env first (copy from .env.example and fill secrets)"
  else
    echo "ERROR: Missing ${APP_DIR}/.env"
  fi
  exit 1
fi
chown "${APP_USER}:${APP_GROUP}" "${APP_DIR}/.env"
chmod 640 "${APP_DIR}/.env"

echo "==> Python dependencies (uv sync)"
run_as_app "cd '${APP_DIR}' && '${UV}' sync --frozen --no-dev" \
  || run_as_app "cd '${APP_DIR}' && '${UV}' sync --no-dev"

VENV_ADMIN="${APP_DIR}/.venv/bin/call-management-admin"
VENV_PY="${APP_DIR}/.venv/bin/python"
if [[ ! -x "${VENV_ADMIN}" || ! -x "${VENV_PY}" ]]; then
  echo "ERROR: venv entrypoints missing after uv sync (${VENV_ADMIN})"
  exit 1
fi

echo "==> Initialize CRM database (idempotent)"
run_as_app "cd '${APP_DIR}' && '${UV}' run python scripts/init_crm.py" || true

echo "==> Install systemd units (admin + worker + target)"
# Rewrite User/Group/paths if non-default install layout.
render_unit() {
  local src="$1" dest="$2"
  sed \
    -e "s|/opt/callmanagement|${APP_DIR}|g" \
    -e "s|^User=ubuntu$|User=${APP_USER}|" \
    -e "s|^Group=ubuntu$|Group=${APP_GROUP}|" \
    "${src}" > "${dest}"
}

render_unit "${APP_DIR}/scripts/deploy/callmanagement.service" \
  "${UNIT_DIR}/callmanagement.service"
render_unit "${APP_DIR}/scripts/deploy/callmanagement-worker.service" \
  "${UNIT_DIR}/callmanagement-worker.service"
render_unit "${APP_DIR}/scripts/deploy/callmanagement.target" \
  "${UNIT_DIR}/callmanagement.target"

systemctl daemon-reload
systemctl enable callmanagement.service callmanagement-worker.service callmanagement.target

if [[ "$NO_START" -eq 0 ]]; then
  echo "==> Start stack (callmanagement.target)"
  systemctl restart callmanagement.target
else
  echo "==> Units installed; start skipped (--no-start)"
fi

if [[ "$SKIP_NGINX" -eq 0 && -f "${NGINX_SITE}" ]]; then
  echo "==> nginx snippet for /callmgmt/ → ${NGINX_SITE}"
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
  else
    echo "    snippet already present — skip"
  fi
  if command -v nginx >/dev/null 2>&1; then
    nginx -t
    systemctl reload nginx
  fi
elif [[ "$SKIP_NGINX" -eq 1 ]]; then
  echo "==> nginx skipped (--skip-nginx)"
else
  echo "==> nginx site ${NGINX_SITE} not found — skip (see scripts/deploy/nginx-callmgmt.conf)"
fi

echo
echo "==> Done"
echo "    Manage:  sudo bash ${APP_DIR}/scripts/deploy/manage.sh status"
echo "    Logs:    sudo journalctl -u callmanagement -u callmanagement-worker -f"
echo "    Health:  curl -sS http://127.0.0.1:8080/api/health"
if [[ "$NO_START" -eq 0 ]]; then
  systemctl --no-pager --full status callmanagement.target callmanagement.service callmanagement-worker.service || true
fi
