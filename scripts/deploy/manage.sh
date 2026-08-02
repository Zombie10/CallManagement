#!/usr/bin/env bash
# Convenience wrapper for Call Management systemd units.
#
# Usage:
#   sudo bash scripts/deploy/manage.sh status
#   sudo bash scripts/deploy/manage.sh restart
#   sudo bash scripts/deploy/manage.sh logs
#   sudo bash scripts/deploy/manage.sh logs worker
#   sudo bash scripts/deploy/manage.sh health
#   sudo bash scripts/deploy/manage.sh start|stop|enable|disable|reload-units
set -euo pipefail

TARGET=callmanagement.target
ADMIN=callmanagement.service
WORKER=callmanagement-worker.service
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/api/health}"

cmd="${1:-status}"
shift || true

need_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run as root: sudo bash scripts/deploy/manage.sh $cmd $*" >&2
    exit 1
  fi
}

case "$cmd" in
  status)
    systemctl --no-pager --full status "$TARGET" "$ADMIN" "$WORKER" || true
    ;;
  start)
    need_root
    systemctl start "$TARGET"
    systemctl --no-pager --full status "$TARGET" || true
    ;;
  stop)
    need_root
    systemctl stop "$TARGET"
    ;;
  restart)
    need_root
    systemctl restart "$TARGET"
    systemctl --no-pager --full status "$TARGET" || true
    ;;
  reload-units|install-units)
    need_root
    APP_DIR="${APP_DIR:-/opt/callmanagement}"
    if [[ ! -d "${APP_DIR}/scripts/deploy" ]]; then
      echo "APP_DIR=${APP_DIR} missing deploy units" >&2
      exit 1
    fi
    # Re-run unit install without nginx clone.
    bash "${APP_DIR}/scripts/deploy/install.sh" --skip-nginx --no-start
    systemctl daemon-reload
    systemctl restart "$TARGET"
    ;;
  enable)
    need_root
    systemctl enable "$ADMIN" "$WORKER" "$TARGET"
    ;;
  disable)
    need_root
    systemctl disable "$TARGET" "$ADMIN" "$WORKER" || true
    ;;
  logs)
    unit="${1:-}"
    case "$unit" in
      ""|all|stack)
        journalctl -u "$ADMIN" -u "$WORKER" -f -n 100 --no-pager
        ;;
      admin)
        journalctl -u "$ADMIN" -f -n 100 --no-pager
        ;;
      worker)
        journalctl -u "$WORKER" -f -n 100 --no-pager
        ;;
      *)
        echo "logs [all|admin|worker]" >&2
        exit 1
        ;;
    esac
    ;;
  health)
    echo "GET ${HEALTH_URL}"
    if curl -fsS "$HEALTH_URL"; then
      echo
      echo "admin: ok"
    else
      echo
      echo "admin: FAIL" >&2
      exit 1
    fi
    systemctl is-active --quiet "$WORKER" && echo "worker: active" || {
      echo "worker: inactive" >&2
      exit 1
    }
    ;;
  -h|--help|help)
    sed -n '2,12p' "$0"
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo "Try: status|start|stop|restart|logs|health|enable|disable|reload-units" >&2
    exit 1
    ;;
esac
