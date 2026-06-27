#!/usr/bin/env bash
# One-shot telephony bootstrap: LiveKit inbound dispatch + MinIO recordings (if missing).
# Usage (on VPS with .env containing LIVEKIT_* and XAI_API_KEY):
#   sudo APP_DIR=/opt/callmanagement PHONE=+15109379101 bash scripts/bootstrap_telephony.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/callmanagement}"
PHONE="${PHONE:-}"
LIVEKIT_PHONE="${LIVEKIT_PHONE_NUMBER:-}"

cd "$APP_DIR"
PY="${APP_DIR}/.venv/bin/python"

if [[ ! -x "$PY" ]]; then
  echo "Missing venv at ${APP_DIR}/.venv"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${APP_DIR}/.env"
set +a

for var in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    echo "Set ${var} in ${APP_DIR}/.env"
    exit 1
  fi
done

echo "==> LiveKit inbound dispatch"
ARGS=()
[[ -n "$PHONE" ]] && ARGS+=(--phone "$PHONE")
[[ -n "$LIVEKIT_PHONE" ]] && ARGS+=(--livekit-phone-number "$LIVEKIT_PHONE")
"$PY" scripts/setup_livekit_inbound.py "${ARGS[@]}"

if ! "$PY" -c "from call_management.recordings.livekit_egress import egress_configured; import sys; sys.exit(0 if egress_configured() else 1)"; then
  echo "==> Recordings S3 not configured — installing MinIO"
  sudo APP_DIR="$APP_DIR" bash "${APP_DIR}/scripts/setup_recordings_minio.sh"
else
  echo "==> Recordings S3 already configured"
fi

echo "==> Telephony diagnostic"
if [[ -n "$PHONE" ]]; then
  "$PY" scripts/test_telephony_inbound.py --phone "$PHONE" --skip-dispatch-test
else
  echo "Skip diagnostic (set PHONE=+1... to run test_telephony_inbound.py)"
fi

echo "==> Restart services"
sudo systemctl restart callmanagement callmanagement-worker
sleep 2
systemctl is-active callmanagement callmanagement-worker minio 2>/dev/null || systemctl is-active callmanagement callmanagement-worker

echo "Done. Place a test call and check Registros in the admin panel."