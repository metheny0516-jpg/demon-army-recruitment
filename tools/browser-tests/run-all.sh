#!/bin/sh
# ブラウザ回帰テスト一式。リポジトリのルートから実行する:
#   sh tools/browser-tests/run-all.sh
#
# 前提: playwright が入っていること
#   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-save playwright
# Chromium のパスは環境に合わせて CHROME 環境変数で上書きできる。
#   CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome sh tools/browser-tests/run-all.sh
GAME="$(pwd)"
SP="${SP:-$(pwd)/.screenshots}"
mkdir -p "$SP"
export GAME SP

# CHROME 未指定なら playwright 同梱の場所を探す（コンテナ環境では別置きのことがある）
if [ -z "$CHROME" ]; then
  for c in /opt/pw-browsers/chromium-*/chrome-linux/chrome; do
    [ -x "$c" ] && CHROME="$c" && break
  done
  [ -n "$CHROME" ] && export CHROME
fi

TMP="${TMPDIR:-/tmp}/dar-browser-tests.$$"
failed=""
run() {
  name="$1"; shift
  printf "%-10s " "$name:"
  if env "$@" node "tools/browser-tests/$name.js" > "$TMP" 2>&1; then
    tail -1 "$TMP"
  else
    # 失敗したテストは「最後の1行」では分からない。落ちた行をそのまま出す。
    echo "✗ FAILED"
    grep -E '✗|Error|error' "$TMP" | head -8 | sed 's/^/           /'
    failed="$failed $name"
  fi
}

for t in smoke autoplay mission clear scene cutin contrib retry softlock resume tier0 reroll eventui; do
  run "$t" DUMMY=1
done
run portrait MODE=present

rm -f "$TMP"
echo
if [ -n "$failed" ]; then
  echo "✗ 失敗:$failed"
  exit 1
fi
echo "✓ 全テスト通過"
