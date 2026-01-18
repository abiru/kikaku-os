#!/bin/sh
set -e

PORT="${PORT:-8787}"
ROOT_DEVVARS="../../.dev.vars"
LOG="/tmp/kikaku-os-api-smoke-ok-$PORT-$$.log"

# ポートが既に使われてたら誤判定になるので落とす
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT already in use. Set PORT=... and retry."
  exit 1
fi

cleanup() {
  if [ -n "${PID:-}" ]; then
    # smoke.sh と同じ方式：プロセスグループ + PID を落とす
    kill -TERM -- -"${PID}" 2>/dev/null || true
    kill -TERM "${PID}" 2>/dev/null || true
    wait "${PID}" 2>/dev/null || true
  fi

  # 念のため LISTEN 残りがあれば落とす
  PORT_PIDS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ' ' || true)"
  if [ -n "${PORT_PIDS:-}" ]; then
    kill -TERM ${PORT_PIDS} 2>/dev/null || true
    sleep 1
    kill -KILL ${PORT_PIDS} 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

test -f "$ROOT_DEVVARS" || { echo "Missing $ROOT_DEVVARS (repo root)."; exit 1; }

# 起動（.dev.varsは触らない）
PORT="$PORT" pnpm dev >"$LOG" 2>&1 & PID=$!

# 起動待ち
PING="$(curl -s --retry 30 --retry-delay 1 --retry-connrefused -w '\n%{http_code}' "http://127.0.0.1:$PORT/dev/ping")"
PING_STATUS="$(printf '%s\n' "$PING" | tail -n 1)"
PING_BODY="$(printf '%s\n' "$PING" | sed '$d')"
printf 'GET /dev/ping -> %s %s\n' "$PING_STATUS" "$PING_BODY"
[ "$PING_STATUS" = 200 ]

# checkout 200 を期待（sk_*が正しく、価格も設定済みならURLが返る）
CHECKOUT="$(curl -s -w '\n%{http_code}' -H content-type:application/json -d '{"variantId":1,"quantity":1}' "http://127.0.0.1:$PORT/checkout/session")"
CHECKOUT_STATUS="$(printf '%s\n' "$CHECKOUT" | tail -n 1)"
CHECKOUT_BODY="$(printf '%s\n' "$CHECKOUT" | sed '$d')"
printf 'POST /checkout/session -> %s %s\n' "$CHECKOUT_STATUS" "$CHECKOUT_BODY"
[ "$CHECKOUT_STATUS" = 200 ]
printf '%s' "$CHECKOUT_BODY" | grep -Fq '"url":"https://checkout.stripe.com/'
