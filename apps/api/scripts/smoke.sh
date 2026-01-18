#!/bin/sh
set -e

PORT="${PORT:-8787}"
ROOT_DEVVARS='../../.dev.vars'
LOG="/tmp/kikaku-os-api-smoke-$PORT-$$.log"
BAK="/tmp/kikaku-os-api-devvars-$PORT-$$.bak"

# ポートが既に使われてたら誤判定になるので落とす
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT already in use. Set PORT=... and retry."
  exit 1
fi

cleanup() {
  if [ -n "${PID:-}" ]; then
    # プロセスグループごと落とす（wrangler の子プロセス残り対策）
    if [ -n "${PGID:-}" ]; then kill -TERM -"${PGID}" 2>/dev/null || true; fi
    kill -TERM "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    PORT_PIDS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ' ')"
    if [ -n "${PORT_PIDS:-}" ]; then
      kill -TERM $PORT_PIDS 2>/dev/null || true
      sleep 1
      kill -KILL $PORT_PIDS 2>/dev/null || true
    fi
  fi
  if [ -f "$BAK" ]; then mv "$BAK" "$ROOT_DEVVARS" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

test -f "$ROOT_DEVVARS" || { echo "Missing $ROOT_DEVVARS"; exit 1; }
cp "$ROOT_DEVVARS" "$BAK"
perl -0777 -i -pe 's/^\s*STRIPE_SECRET_KEY\s*=.*$/STRIPE_SECRET_KEY=pk_test_xxx/m' "$ROOT_DEVVARS"

if command -v setsid >/dev/null 2>&1; then
  PORT="$PORT" setsid pnpm dev >"$LOG" 2>&1 & PID=$!
  PGID="$PID"
else
  set -m
  PORT="$PORT" pnpm dev >"$LOG" 2>&1 & PID=$!
  PGID="$PID"
  set +m
fi

PING="$(curl -s --retry 30 --retry-delay 1 --retry-connrefused -w '\n%{http_code}' "http://127.0.0.1:$PORT/dev/ping")"
PING_STATUS="$(printf '%s\n' "$PING" | tail -n 1)"
PING_BODY="$(printf '%s\n' "$PING" | sed '$d')"
printf 'GET /dev/ping -> %s %s\n' "$PING_STATUS" "$PING_BODY"
[ "$PING_STATUS" = 200 ]
printf '%s' "$PING_BODY" | grep -Fq '"dev_mode":true'
printf '%s' "$PING_BODY" | grep -Fq '"name":"kikaku-os-api"'

CHECKOUT="$(curl -s -w '\n%{http_code}' -H 'content-type:application/json' -d '{"variantId":1,"quantity":1}' "http://127.0.0.1:$PORT/checkout/session")"
CHECKOUT_STATUS="$(printf '%s\n' "$CHECKOUT" | tail -n 1)"
CHECKOUT_BODY="$(printf '%s\n' "$CHECKOUT" | sed '$d')"
printf 'POST /checkout/session -> %s %s\n' "$CHECKOUT_STATUS" "$CHECKOUT_BODY"
[ "$CHECKOUT_STATUS" = 500 ]
printf '%s' "$CHECKOUT_BODY" | grep -Fq '"code":"STRIPE_SECRET_KEY_INVALID"'

# ここまで来たら成功。EXIT で trap が走って確実にサーバーが落ちる
exit 0
