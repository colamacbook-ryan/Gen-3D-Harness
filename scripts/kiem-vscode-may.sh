#!/usr/bin/env bash
# kiem-vscode-may.sh — `pnpm kiem:vscode`: chạy bài kiểm extension trong VS Code THẬT bằng MỘT lệnh,
# trên máy Sếp (có màn hình + GPU) hoặc máy không màn hình (tự bọc xvfb-run).
#
# - Tải VS Code bản stable + @vscode/test-electron vào .cache/kiem-vscode (gitignore), KHÔNG đụng VS Code
#   đang cài của Sếp (user-data-dir + extensions-dir riêng, workspace trust tắt chỉ trong bản tạm này).
# - Cổng riêng 9012–9017, không đụng bridge/vite của Sếp (8787–8790/5173).
# - Kết quả: docs/e2e/vscode-that.json + docs/e2e/vscode-v3-chatroom.png (dòng 👁 của V3).
#   In OK/FAIL từng bước; mã thoát 0 = tất cả OK.
#
# Biến: E2E_VSC_VERSION (mặc định stable) · E2E_VSC_GL (cờ GL thêm cho Electron; máy không GPU cần
#   "--ignore-gpu-blocklist --use-angle=swiftshader --enable-unsafe-swiftshader" — tự đặt khi chạy xvfb).
set -euo pipefail
GOC="$(cd "$(dirname "$0")/.." && pwd)"
cd "$GOC"
THU="$GOC/.cache/kiem-vscode"
mkdir -p "$THU"

if [ ! -d public/models ] || [ ! -d public/anim ]; then
  echo "Thiếu asset nhân vật/chuyển động — chạy trước: pnpm assets && bash scripts/fetch-anim.sh" >&2
  exit 2
fi
if [ ! -d "$THU/node_modules/@vscode/test-electron" ]; then
  echo "[kiem-vscode] cài @vscode/test-electron@3.1.0 vào $THU (một lần)…"
  [ -f "$THU/package.json" ] || echo '{"private":true}' >"$THU/package.json"
  npm i --prefix "$THU" --no-audit --no-fund --silent @vscode/test-electron@3.1.0
fi

echo "[kiem-vscode] build extension…"
pnpm -C vscode build >/dev/null

export E2E_VSC_DIR="$THU" E2E_VSC_CDP=1
if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  command -v xvfb-run >/dev/null || { echo "Không có màn hình và không có xvfb-run" >&2; exit 2; }
  export E2E_VSC_GL="${E2E_VSC_GL:---ignore-gpu-blocklist --use-angle=swiftshader --enable-unsafe-swiftshader}"
  exec xvfb-run -a -s "-screen 0 1280x1024x24" node scripts/kiem-vscode-that.mjs
fi
exec node scripts/kiem-vscode-that.mjs
