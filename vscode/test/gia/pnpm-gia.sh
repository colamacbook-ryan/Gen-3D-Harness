#!/usr/bin/env bash
# pnpm GIẢ cho test tiến trình: giống pnpm thật ở chỗ nó là cha đẻ ra một tiến
# trình con (nghe cổng) rồi chờ — để kiểm "giết cả NHÓM", không chỉ cái vỏ.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "${1:-}" = "bridge" ]; then
  node "$DIR/server-gia.mjs" tcp "${GEN_STAGE_PORT:?}" &
elif [ "${1:-}" = "exec" ] && [ "${2:-}" = "vite" ]; then
  shift 2
  PORT=""; HOST=""; STRICT=0
  while [ $# -gt 0 ]; do
    case "$1" in --port) PORT="$2"; shift ;; --host) HOST="$2"; shift ;; --strictPort) STRICT=1 ;; esac
    shift
  done
  [ "$HOST" = "127.0.0.1" ] && [ "$STRICT" = 1 ] || { echo "thiếu --host 127.0.0.1 --strictPort" >&2; exit 3; }
  node "$DIR/server-gia.mjs" http "$PORT" &
elif [ "${1:-}" = "nao-local" ]; then
  # V1 — driver não giả (pnpm thật: tsx scripts/nao-local.mjs)
  node "$DIR/scripts/nao-local.mjs" &
elif [ "${1:-}" = "nao" ]; then
  node "$DIR/scripts/nao-agy.mjs" &
else
  echo "pnpm-gia: không biết lệnh $*" >&2; exit 2
fi
echo "con=$!"
wait
