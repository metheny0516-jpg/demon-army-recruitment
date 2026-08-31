#!/bin/sh
# ブラウザ回帰テスト一式。リポジトリのルートから実行する:
#   sh tools/browser-tests/run-all.sh
#
# 前提: playwright が入っていること
#   npm install playwright
# Chromium のパスは環境に合わせて CHROME 環境変数で上書きできる。
set -e
GAME="$(pwd)"
# Chromium が既定の場所にない場合: CHROME=/path/to/chrome sh tools/browser-tests/run-all.sh
SP="${SP:-$(pwd)}"
export GAME SP
for t in smoke autoplay mission clear scene cutin contrib retry softlock resume tier0 reroll eventui; do
  printf "%-10s " "$t:"
  node "tools/browser-tests/$t.js" 2>&1 | tail -1
done
printf "%-10s " "portrait:"
MODE=present node tools/browser-tests/portrait.js 2>&1 | tail -1
