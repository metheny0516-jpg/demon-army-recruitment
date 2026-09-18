# 仕様：履歴書の整理（スマホ1画面）と、めくる演出（2026-09-18）

オーナー指示（試遊 2026-09-18）：
「応募者の履歴書をスマホで1ページ、スクロールせずに見られるように情報を整理する。順は基礎ステータス → 希望給与 → 前職・短所などの特徴 → 特性 → 採用ボタン。
食料消費・軍団との接続・覚える技はネタバレなので載せない（あえてノーヒント）。そのうえで、履歴書を一枚ずつめくる体の紙のアニメーションと音を足す」。

担当：**A（整理）は Opus**、**B（めくり）は CodeX**。A が先。B は A の札の構造（3節）を前提にする。
迷ったら末尾「未決」の既定で進め、コミットメッセージに書く。

## 0. 一文で

**履歴書を「一枚の紙」にする。** 390×844 の画面に、写真・名前・基礎ステータス・給与・人物欄・特性・採用ボタンが**スクロールなしで**収まる。
攻略のヒント（食料・接続・技）は載せない。めくる動きと音で、面接の手触りにする。

## A. 整理（Opus）

### A-1. 触ってよいファイル

- `src/ui/ui.js` … `monsterCard(m, { resume: true })` の中身と `recruit()` の応募者部分だけ。`memberDetail` / 編成の札（`resume` 無し）は触らない。
- `src/styles.css` … `.card.resume` 以下の新しい規則。既存の `.card` の規則は消さない（編成・城で使っている）。
- `tools/browser-tests/recruitment.js` … 受け入れ条件（A-4）を足す。
- `HANDOFF.md` §0 に3行。

触らない：`src/core/*`、`src/data/*`、`main.js`、他の画面。

### A-2. 載せるもの・順・載せないもの

| 順 | 区画 | 中身 | 大きさの目安（390px） |
|---|---|---|---|
| 1 | 頭 | 証明写真（左・3:4・高さ 96px）、名前、階級札、種族／職 | 高さ 100 |
| 2 | 基礎 | HP・攻撃・防御・速度の4枠を**横一列** | 高さ 52 |
| 3 | 条件 | 希望給与・忠誠。気合は**載せない**（採用前の値に意味が無い） | 高さ 28 |
| 4 | 人物 | 前職・志望動機・短所の3行。長い文は2行まで、それ以上は省略記号（全文は `member` の詳細で読める） | 高さ 84 |
| 5 | 特性 | 名前だけの札（`.trait-chip`）を横並び。**説明文は載せない**（タップで詳細＝既存の `member` 画面へ） | 高さ 32〜64 |
| 6 | 縁・歴戦・遺物 | あれば1行（🕯 縁 / 🎖 歴戦 / 🏺 持って来た）。無ければ区画ごと出さない | 0〜24 |
| 7 | 採用 | 採用ボタン（`data-action="hire"`）。文言は今のまま（無料枠／追加紹介料） | 高さ 48 |

合計の目安は 400〜430px。HUD（約 110px）と応募者の切り替え（B-2）を足して 844 に収める。**1枚に収まらない場合は、人物欄を2行→1行に縮める**（特性の札は減らさない）。

**載せない**（`resume: true` のときだけ外す。編成・詳細では今までどおり）：
- 🍖 採ると消費…（`hire-food`）
- 🔗 今の軍団との接続（`applicantConnections`）
- ✨ 3戦で技…／🗡 8戦で…（`nextSkillNote`）
- 特性の説明文（`desc`）
- 気合・戦功・出撃回数

「ノーヒント」の意味：**接続と技は、採ってから軍団で発見する**。履歴書はそのための手掛かり（前職・短所・特性名）だけを持つ（`GAME_DESIGN_PRINCIPLES.md` 第8節「履歴書は人物の手掛かり」）。

### A-3. 札の構造（B が前提にする契約）

```html
<div class="applicant-member" data-action="member" data-index="i">
  <div class="card resume" data-resume-index="i">
    <div class="resume-head">…</div>
    <div class="resume-stats">…</div>
    <div class="resume-terms">…</div>
    <div class="resume-person">…</div>
    <div class="resume-traits">…</div>
    <div class="resume-notes">…</div>      ← 無ければ出さない
  </div>
  <button class="primary wide" data-action="hire" data-index="i">…</button>
</div>
```

- 応募者は今までどおり `st.applicants` の全員を描く（B が「一枚ずつ」に見せる。A は並べるだけ）。
- `data-resume-index` は B がめくる対象を特定するための印。値は `st.applicants` の添字。
- 幅は 100%（親に任せる）。高さは固定しない（B が `max-height` を測る）。

### A-4. 受け入れ条件（`tools/browser-tests/recruitment.js` に追加）

- 390×844 で、応募者1枚の `.applicant-member`（採用ボタン込み）の高さが **560px 以下**。
- `resume: true` の札に `hire-food` / `applicantConnections` の要素 / `nextSkillNote` の文字（「戦で技」）が**無い**。
- `member` の詳細画面には今までどおり接続・技・特性の説明が**ある**（ヒントを消したのではなく、履歴書から外しただけ）。
- 1128px でも崩れない（PCでは2列のまま）。
- run-all 全通過。

## B. めくる演出（CodeX）

### B-1. 触ってよいファイル

- `src/ui/ui.js` の `recruit()` … 応募者の入れ物（`.applicant-deck`）と、めくるボタン。**札の中身（A の `monsterCard`）は触らない。**
- `src/styles.css` … `.applicant-deck` / `.resume` のめくり（transform / transition / keyframes）。
- `src/ui/sound.js` … 合図 `page`（めくる音）。**外部素材のみ**（自作合成音はオーナーが禁止。`assets/sfx/LICENSES.md` に追記）。
- `src/main.js` … action `resumenext` / `resumeprev`（表示だけ。`st` は変えない）。
- `tools/browser-tests/resume-flip.js`（新規、run-all に登録）。
- `HANDOFF.md` §0 に3行。

触らない：`src/core/*`、`src/data/*`、A の札の中身、採用の経路（`hire` / `reroll` / `skip` の action と `Game.*`）。

### B-2. 見え方

- 応募者は**一枚ずつ**見せる（束の一番上）。下に「◀ 前の一枚」「次の一枚 ▶」と「n / 総数」。
  PC（≥ 900px）では今の2列並びのまま（めくりは無し）。
- 「次の一枚」で、いまの札が**右上を持ち上げて左へ裏返る**（0.35s、`transform: perspective(900px) rotateY(-180deg)`、途中で裏面の紙色）。裏返り切ったら次の札が下から現れる。
  「前の一枚」は逆向き。
- 採用（`hire`）で札が**束から抜けて上へ滑り出る**（0.3s）。再抽選（`reroll`）で束ごと裏返して新しい束（0.45s）。
- `prefers-reduced-motion: reduce` では動きを消して即切り替え（既存の戦闘演出と同じ扱い）。
- 音：めくるとき `page`（紙が擦れる短い音、0.2〜0.4s）。採用は既存の `hire`、再抽選は既存の `shuffle`。
- 束の状態（いま何枚目か）は UI の変数（`UI.resumeIndex`）に持ち、**セーブしない**。画面を出し直したら1枚目。
  面接で採用したら、次の応募者が同じ位置に来る（添字を保つ。末尾なら一つ戻る）。

### B-3. 受け入れ条件（`tools/browser-tests/resume-flip.js`）

- 390×844：応募者が1枚だけ見え、「次の一枚」で `data-resume-index` が進み、末尾で止まる（または先頭へ戻る。未決 U2）。
- めくり中も `hire` が押せる（押したら演出を待たずに採用される。演出は後追い）。
- `prefers-reduced-motion` で transition が無い。
- 音：`page` が `Sound.cue` の経路で鳴る（ミュートで鳴らない）。既存 `sound.js` のテストが通る。
- 1128px：今までの2列表示のまま（`.applicant-deck` の切り替えボタンが出ない）。
- run-all 全通過。

## 未決（既定で進めてよい）

- U1 人物欄の3行が2行に収まらない長文（前職の最長は約20文字）→ 既定：2行で省略記号。
- U2 末尾で「次の一枚」→ 既定：**先頭へ戻る**（束を一周する）。
- U3 めくり中に `reroll` → 既定：演出を打ち切って新しい束。
- U4 PC でもめくりたいか → 既定：しない（2列で見比べるほうが速い）。

## 順番

1. Opus：A を1コミット（`claude/resume-card`）。run-all 通過を確認して Pages ブランチへ。
2. CodeX：B を1コミット（`codex/resume-flip`）。A の構造を前提にする。素材のライセンスを `LICENSES.md` へ。
3. オーナー試遊：1画面に収まっているか、めくりの尺（0.35s）が待たされないか、音が耳障りでないか。
