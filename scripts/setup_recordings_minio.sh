#!/usr/bin/env bash
# Self-hosted S3 (MinIO) for LiveKit Cloud Egress — path-style at paymercadogo.com
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/callmanagement}"
MINIO_BIN="${MINIO_BIN:-/usr/local/bin/minio}"
MINIO_MC="${MINIO_MC:-/usr/local/bin/mc}"
MINIO_DATA="${MINIO_DATA:-/opt/minio/data}"
MINIO_ENV="/etc/default/minio"
S3_EGRESS_ENDPOINT="${S3_EGRESS_ENDPOINT:-https://paymercadogo.com}"
S3_PUBLIC_BASE="${S3_PUBLIC_BASE:-https://paymercadogo.com}"
BUCKET="${RECORDINGS_S3_BUCKET:-callmgmt-recordings}"
PREFIX="${RECORDINGS_S3_PREFIX:-callmanagement/recordings}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

echo "==> Installing MinIO server + mc client"
if [[ ! -x "$MINIO_BIN" ]]; then
  curl -fsSL "https://dl.min.io/server/minio/release/linux-amd64/minio" -o "$MINIO_BIN"
  chmod +x "$MINIO_BIN"
fi
if [[ ! -x "$MINIO_MC" ]]; then
  curl -fsSL "https://dl.min.io/client/mc/release/linux-amd64/mc" -o "$MINIO_MC"
  chmod +x "$MINIO_MC"
fi

id minio-user &>/dev/null || useradd -r -s /sbin/nologin minio-user
mkdir -p "$MINIO_DATA"
chown -R minio-user:minio-user /opt/minio

if [[ ! -f "$MINIO_ENV" ]]; then
  ROOT_USER="callmgmt-minio-$(openssl rand -hex 4)"
  ROOT_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
  EGRESS_USER="cmegress$(openssl rand -hex 2)"
  EGRESS_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
  cat >"$MINIO_ENV" <<EOF
MINIO_ROOT_USER=${ROOT_USER}
MINIO_ROOT_PASSWORD=${ROOT_PASS}
MINIO_VOLUMES="${MINIO_DATA}"
MINIO_OPTS="--address :9000 --console-address :9001"
MINIO_SERVER_URL=${S3_EGRESS_ENDPOINT}
EOF
  chmod 600 "$MINIO_ENV"
  echo "==> Wrote ${MINIO_ENV}"
else
  # shellcheck disable=SC1090
  source "$MINIO_ENV"
  EGRESS_USER="cmegress$(openssl rand -hex 2)"
  EGRESS_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
fi

# shellcheck disable=SC1090
source "$MINIO_ENV"

cat >/etc/systemd/system/minio.service <<'UNIT'
[Unit]
Description=MinIO object storage (Call Management recordings)
After=network-online.target
Wants=network-online.target

[Service]
User=minio-user
Group=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable minio
systemctl restart minio
sleep 3
systemctl is-active minio

echo "==> Configuring bucket and egress user"
"$MINIO_MC" alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
"$MINIO_MC" mb --ignore-existing "local/${BUCKET}"

if ! "$MINIO_MC" admin user info local "$EGRESS_USER" &>/dev/null; then
  "$MINIO_MC" admin user add local "$EGRESS_USER" "$EGRESS_PASS"
fi
"$MINIO_MC" admin policy attach local readwrite --user "$EGRESS_USER"

POLICY_FILE="$(mktemp)"
cat >"$POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"AWS": ["*"]},
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::${BUCKET}/${PREFIX}/*"]
    }
  ]
}
EOF
"$MINIO_MC" anonymous set-json "$POLICY_FILE" "local/${BUCKET}"
rm -f "$POLICY_FILE"

ENV_FILE="${APP_DIR}/.env"
touch "$ENV_FILE"
grep -v '^RECORDINGS_S3_' "$ENV_FILE" >"${ENV_FILE}.tmp" || true
cat >>"${ENV_FILE}.tmp" <<EOF
RECORDINGS_S3_BUCKET=${BUCKET}
RECORDINGS_S3_ACCESS_KEY=${EGRESS_USER}
RECORDINGS_S3_SECRET=${EGRESS_PASS}
RECORDINGS_S3_REGION=us-east-1
RECORDINGS_S3_ENDPOINT=${S3_EGRESS_ENDPOINT}
RECORDINGS_S3_FORCE_PATH_STYLE=true
RECORDINGS_S3_PREFIX=${PREFIX}
EOF
mv "${ENV_FILE}.tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"
chown ubuntu:ubuntu "$ENV_FILE" 2>/dev/null || true

echo ""
echo "==> MinIO ready"
echo "    S3 endpoint: ${S3_EGRESS_ENDPOINT}  (nginx: /${BUCKET}/)"
echo "    Public reads: ${S3_PUBLIC_BASE}/${BUCKET}/"
echo "    Bucket:     ${BUCKET}"
echo "    Prefix:     ${PREFIX}/"
echo "    Egress key: ${EGRESS_USER}"
echo ""
echo "Next: ensure nginx proxies /${BUCKET}/ -> 127.0.0.1:9000/${BUCKET}/ (see scripts/deploy/nginx-minio-s3.conf), then:"
echo "  sudo systemctl restart callmanagement callmanagement-worker"