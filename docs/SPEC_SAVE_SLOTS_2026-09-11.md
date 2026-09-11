# 仕様：セーブスロット3つと、書き出し／読み込み（2026-09-11）

実装担当：Opus。オーナー：「セーブデータが恒久的に保存されて3つくらいスロットが欲しい。今はリロードしたら消える」。
迷ったら末尾「未決」を見て、無ければ**いちばん小さく、今の動作に近い**ほうを選び、コミットメッセージに書く。
**CodeX が `src/ui/ui.js` の面接・編成・城のメニューを組み替え中。ui.js は `title()` と `history()` の中だけ触る。**

## 0. 一文で

**ランの保存は3つのスロットに分け、タイトルで選んで続ける。** 自動保存は今までどおり（決着・採用のたびに、選んでいるスロットへ）。加えて JSON の書き出し／読み込みで、端末を変えても持ち運べる。魔界史（`maou_history`）はスロットをまたいで一つのまま。

## 1. 今の作りと、消える原因の切り分け

- 保存は `localStorage` の `maou_save` 一つ。`Game.save()` はラン中に35か所から呼ばれ、決着・採用・作戦選択ごとに書いている。`clearRun()` はランの終わり（`endRun`）だけ。保存の大きさは12戦で約11KB（容量超過ではない）。
- つまりコード上は「リロードで消える」経路が無い。**先に原因を切り分けてから実装する**：
  1. タイトルに「続きから」が出ているか（出ていれば保存はある。押さずに「新規」を押すと上書きで消える）。
  2. 端末とブラウザ（iOS Safari のプライベート／「サイト越えトラッキングを防ぐ」で消える、PC のシークレット窓、ブラウザの「終了時にサイトデータを削除」）。
  3. URL が同じか（`github.io/demon-army-recruitment/` と `file://` と `localhost` は別の保存領域）。
  切り分けの結果を HANDOFF §0 に1行。原因が 2〜3 なら仕様どおりスロット＋書き出しで対応（書き出しが「恒久」の保証になる）。原因が 1 なら 3.3 の「新規は空きスロットへ」で塞がる。

## 2. 保存の形（`src/core/storage.js`）

- `Storage.SLOTS = 3`。鍵 `maou_save_1` 〜 `maou_save_3`。選んでいるスロット `maou_active_slot`（1〜3、無ければ 1）。
- `saveRun(state)` → 選んでいるスロットへ。`loadRun(slot?)` → 指定が無ければ選んでいるスロット。`clearRun(slot?)` 同様。`selectSlot(n)`。
- `slotMeta(n)`：`{ slot, empty, kingName, generation, act, turn, conquest, rosterCount, savedAt }` を保存本体から導く（別の meta 鍵は持たない。二重管理しない）。`savedAt` は `saveRun` が `state.savedAt = Date.now()` を書く。
- **旧セーブの移行**：`maou_save` があれば初回の `loadRun` で `maou_save_1` へ移し、`maou_save` を消す。
- 書き出し：`exportRun(slot)` → 保存本体の JSON 文字列（そのまま）。読み込み：`importRun(slot, text)` → JSON として読めて `typeof === "object"` で `phase` があるものだけ受け、`migrateState` を通してから保存。壊れた文字列は `false`。

## 3. 画面（`ui.js` の `title()` だけ）

### 3.1 スロットの札（3枚、縦）
各札：「スロット n」＋ 中身があれば「{魔王名}・第{代}代・第{幕}幕・作戦{turn}・王国攻略 {conquest}/{上限}・軍団{n}人・最終保存 {日時}」、無ければ「空き」。
ボタン：中身あり → 「続きから」「書き出し」「削除（確認あり）」。空き → 「ここに新規」（魔王の選択は今までどおり札の中で。`data-slot` を足す）、「読み込み」。
### 3.2 書き出し／読み込み（オーナー 2026-09-11：手違いで消したことがある。GitHub 側には保存の仕組みが無いので、手元のファイルが「恒久」）
書き出し：**「ファイルに保存」**（`Blob` → `<a download="maou-save-slot{n}-{日付}.json">` を作ってクリック）を主に、
`<textarea readonly>` に JSON を出して「コピー」も併置（`navigator.clipboard` が無ければ選択状態にするだけ）。
読み込み：**「ファイルを選ぶ」**（`<input type="file" accept=".json">` → `FileReader`）を主に、`<textarea>` に貼る道も残す。
壊れていればモルモの一言「読めませんデス」。`file://` でも動く形（`fetch` は使わない）。
GitHub Gist などのオンライン保存は**この仕様では入れない**（トークンをブラウザに置く形になり、公開版に使えない。オーナー専用の任意機能として別仕様）。
### 3.3 新規は空きスロットへ
「新規」は**必ずスロットを指定**して始める（`data-slot`）。中身のあるスロットへの新規は確認（「上書きしますか」）。これで「続きから」を押し損ねて消える事故が無くなる。
### 3.4 ゲーム中
HUD に「保存中：スロット n」の小さな表示（`hud()` に1つ。CodeX の HUD 2行と衝突しうるので**文字1つのspan だけ**）。ラン中のスロット切替は無し（タイトルからだけ）。

## 4. 触ってよいファイル
- `src/core/storage.js`（2節）、`src/core/run.js`（`newRun(king, slot)` / `load(slot)` / `endRun` の `clearRun` は選んでいるスロット。`save()` に `savedAt`）。
- `src/ui/ui.js` — `title()` と `hud()` の1 span だけ。`src/main.js` — action `new` `continue` に `data-slot`、`exportsave` `importsave` `deletesave` を足す。
- `src/styles.css` — 札の最小限。
- `tools/test-save-slots.js`（新規）、`tools/browser-tests/resume.js`（既存。スロットに合わせて直す）、`tools/browser-tests/slots.js`（新規、run-all に追加）。`HANDOFF.md` §0・§2。

## 5. 受け入れ条件
- node：3スロットに別々のランを保存して、それぞれ読める／`maou_save` の旧セーブが1へ移る／書き出した文字列を別スロットへ読み込むと同じ状態（`JSON.stringify` 一致、`savedAt` 除く）／壊れた文字列は拒否／`endRun` は選んでいるスロットだけ消す／`selectSlot` の範囲外は無視。
- browser：ファイル保存はブラウザテストでは「download イベントが起きる」まで、読み込みは `setInputFiles` で。タイトルで3札が見える → 空きへ新規 → 2戦進めて**リロード** → タイトルの札に「作戦3」と出て「続きから」で同じ状態（`Game.state.turn` 一致）／別の空きへ新規 → 前のスロットは残る／書き出し→削除→読み込みで復元。JS エラーなし。`run-all.sh` 全通過（`resume.js` 含む）。

## 6. 落とし穴
- `Storage.loadRun()` を「保存があるか」の判定に使っている箇所（`main.js` の `UI.title(!!Storage.loadRun(), …)`）は `Storage.slotMeta` に置き換える。
- テスト（node）は `localStorage` を自前の辞書で偽装している。鍵が増えても `getItem/setItem/removeItem` だけで動くこと。
- `UI.set()` の scene 推定：`title` は既存のまま。
- 魔界史はスロットの外。`endRun` の `appendHistory` は変えない。

## 7. 未決（既定）
- U1 スロット数。既定 3。
- U2 ラン中のスロット切替。既定：無し。
- U3 ファイル保存の名前。既定：`maou-save-slot{n}-{YYYYMMDD}.json`。
