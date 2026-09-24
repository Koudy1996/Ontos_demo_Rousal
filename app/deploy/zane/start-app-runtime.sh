#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${ONTOS_INTERNAL_APP_PORT:-}" ]]; then
  echo 'ONTOS_INTERNAL_APP_PORT is required' >&2
  exit 1
fi

export PORT="$ONTOS_INTERNAL_APP_PORT"
envsubst '${ONTOS_INTERNAL_APP_PORT}' \
  < /etc/nginx/templates/ontos.conf.template \
  > /etc/nginx/conf.d/default.conf

npm run serve &
app_pid=$!
nginx -g 'daemon off;' &
nginx_pid=$!

cleanup() {
  kill "$nginx_pid" "$app_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
wait -n "$app_pid" "$nginx_pid"
