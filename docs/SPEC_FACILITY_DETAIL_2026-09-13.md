# 仕様：施設の詳細画面 ― 「育っている」を見せる（2026-09-13、Claude 起草。統合のあとに Opus）

オーナー（2026-09-13）：「最終的には各施設の詳細画面にジャンプしてそこでちゃんと成長している感も確認したい。グラフィックも工夫を凝らして」。
前提：`docs/SPEC_TOWN_MERGE_2026-09-13.md`（8施設）が入っていること。地図は `src/ui/map.js`、絵は `assets/map/facility/<id>-<lv>.webp`。

## 0. 一文で

**地図か一覧で施設をタップすると、その施設だけの画面が開く。大きな絵、いまの効果、次の Lv で変わること、そしてこの施設が今まで生んだもの。**

## 1. 画面（スマホ縦 390px、1画面に収める。スクロールは下の履歴だけ）

```
┌──────────────────────────────┐
│ ⌂ メインへ        ← 城下町に戻る │
│                                │
│      ［施設の絵 192px、Lv の絵］   │  ← Lv0 は空き地の絵。Lv1〜3 は同じ絵を大きく
│   🏪 市場  Lv2  ●●○              │  ← Lv の玉
│   「領地の税が増える」            │  ← 一文（line）
│                                │
│  いまの効果   税収 +2G／領地       │
│  次の Lv     税収 +3G／領地        │  ← Lv3 なら「最大」
│  値段        33G・建材7  合う職：会計（2割引） │
│  ［ 増築する ］   ［ 足りない理由 ］ │  ← 既存 Town.canBuild の文言
│                                │
│  この市場が生んだもの              │
│   税収の累計  84G                 │  ← 施設ごとの「生んだもの」（3節）
│   建てた日    第4決着              │
│   増築        第9決着（Lv2）        │
│                                │
│  🐭 モルモ「市場の帳簿、黒字デス」   │  ← 施設ごとに Lv 別1本（0〜3で4本×8施設）
└──────────────────────────────┘
```

- 入口：地図の区画タップ（今は「建てる」を直接呼んでいる → **詳細を開く**に変える。建てるボタンは詳細の中）。城下町の一覧の施設名タップも同じ。
- 戻る：「← 城下町」は `UI.castle("town")`、「⌂ メインへ」は既存の home。
- 増築したら**その場で絵が差し替わる**（0.6秒。空き地→建物、または屋根が増える。CSS のクロスフェード。低モーションでは即時）。音は `town-build.wav`（CodeX チケット I）。

## 2. 「生んだもの」（施設ごとに一つ、数字1本）

| 施設 | 累計する数字 | どこで足す |
|---|---|---|
| 市場 | 税収の上乗せ分の累計（G） | `Town.settle` の税収計算 |
| 酒場 | 忠誠を回復した合計／給与を下げた合計（G） | `Town.settle`／`rollApplicant` |
| 鍛冶場 | 気合の上限超過で貯めた回数……は測りにくいので **鍛冶場があった決着の数** | `Town.settle` |
| 研究所 | 早く覚えた技の本数 | `unlockBattlesFor` の判定で「研究所がなければまだだった」とき |
| 宿舎 | 早く治した人数／上限で余分に雇えた人数 | 負傷回復・採用 |
| 工場 | 両替した回数 | `Town.exchange`／`exchangeBack` |
| 巨大厨房 | 強化した食事の回数 | battle 結果の `facility_trigger`（`grand_kitchen`） |
| 墓地 | 呼び戻した骸骨の数 | battle 結果の `facility_trigger`（`graveyard`） |

- `st.town.stats = { [id]: { built: turn, upgraded: [turn...], value: n } }`。旧セーブは `{}`（表示は「まだ記録なし」）。
- 数字は**1本だけ**。2本目を足したくなったら別の施設の話。

## 3. 絵（CodeX、あとで）
- 詳細の大きな絵は今の 128px を 192px に拡大表示で始める。粗ければ **8施設×Lv1〜3 の 256px 版**を CodeX に。空き地は共通1枚。
- 増築のクロスフェードは同じ位置の2枚を重ねるだけ。新しい絵は要らない。

## 4. モルモの一言（32本、`src/data/mormo_lines.js`）
- 8施設 × Lv0〜3。Lv0 は「ここに○○を建てると……デス」と効果の紹介、Lv3 は褒める。中高生に伝わる言い方、1本 30 字以内。CodeX の文章仕事として出せる（データ1ファイル）。

## 5. 触るファイル（Opus。統合の後）
- `src/ui/town_ui.js`（詳細の描画 `TownUI.detail(id)`）、`src/ui/map.js`（区画タップ → 詳細）、`src/main.js`（action `towndetail`）、`src/core/town.js`（`stats` の加算口 `Town.stat(st, id, n)` と `built/upgraded` の記録）、`src/core/run.js`（研究所・宿舎・酒場・巨大厨房・墓地の加算呼び出し。**5行程度**）、`src/styles.css`、`tools/test-town.js`（+4）、`tools/browser-tests/town.js`（+2：詳細が開く・増築で絵が変わる）。
- battle.js は触らない（`facility_trigger` は既に出ている）。

## 6. やらないこと
- 施設ごとの複数指標、グラフ、施設同士の比較、ランキング。数字1本と絵で足りる。

## 7. 追記（2026-09-14 オーナー）：入口と背景
- 地図の施設をタップしたら**この詳細画面**を開く（今は「建てる」を直接呼んでいる。1節どおりに変える）。
- 詳細画面の**背景をその施設らしく**する：施設ごとに背景1枚（`assets/map/facility/bg-<id>.webp`、390×300 程度、暗めで文字が乗る）。市場なら屋台の中、鍛冶場なら炉の前、墓地なら夜の柵。絵は CodeX（8枚、第二幕の敵の絵のあとで）。無い間は既存の紙の質感のまま。

## 8. 着手（2026-09-15 オーナー「ビジュアル面を強化したい」）

順番：**CodeX の背景8枚とモルモの一言32本を先に** → 本線へ → Opus の §5（run.js を触るので Opus 一人。決めポーズの配線・大技の迫力と battle_scene.js は重ならないが、順番は一つずつ）。

### 8-1. CodeX の仕事（src/ は `src/data/mormo_lines.js` だけ）
- 背景8枚 `assets/map/facility/bg-<id>.webp`（id：market / tavern / smithy / lab / hostel / factory / grand_kitchen / graveyard）。**780×600（390×300 の2倍）**、暗めで上に白い文字が乗る（明度は画面の下半分ほど暗く）。中に入った視点：市場＝屋台の中から通りを見る、酒場＝カウンター越し、鍛冶場＝炉の前、研究所＝薬品と巻物の机、宿舎＝二段ベッドの並ぶ部屋、工場＝歯車と両替台、巨大厨房＝大鍋と湯気、墓地＝夜の柵と月。既存の紙の質感・荒い線・抑えた色。人物は描かない（モルモと施設の絵が上に乗る）。
- モルモの一言32本：`src/data/mormo_lines.js` に `MORMO_FACILITY = { market: ["Lv0の一言","Lv1","Lv2","Lv3"], ... }` の形で追加。Lv0 は「ここに○○を建てると……デス」と効果の紹介、Lv3 は褒める。語尾は既存のモルモ（「〜デス」）に合わせる。1本 30 字以内、中高生に伝わる言い方。既存の行は触らない。
- ブランチ `codex/facility-detail-art`。

### 8-2. 貼り付け用（CodeX 用）
```
Astra へ。docs/SPEC_FACILITY_DETAIL_2026-09-13.md の §8-1 をお願いします。(1) 施設の詳細画面の背景8枚 assets/map/facility/bg-<id>.webp（market / tavern / smithy / lab / hostel / factory / grand_kitchen / graveyard）、780×600、暗めで白文字が乗る、中に入った視点、人物なし、既存の紙の質感。(2) モルモの一言32本を src/data/mormo_lines.js に MORMO_FACILITY = { market: [Lv0, Lv1, Lv2, Lv3], ... } の形で追加（Lv0 は建てると何が起きるかの紹介、Lv3 は褒める、語尾「〜デス」、30字以内、既存行は触らない）。ブランチ codex/facility-detail-art、作業ブランチ claude/hero-arrival-tavern-prototype-uy2toh から切って push。src/ は mormo_lines.js 以外触らない。
```

### 8-3. 貼り付け用（Opus 用。背景が本線に入ってから）
```
Opus へ。まず git pull（作業ブランチ claude/hero-arrival-tavern-prototype-uy2toh）。docs/SPEC_FACILITY_DETAIL_2026-09-13.md の §1〜§5・§7 を実装して。地図の区画タップと城下町一覧の施設名タップで詳細画面 TownUI.detail(id) を開く（建てる／増築はその中）。背景は assets/map/facility/bg-<id>.webp（無ければ既存の紙のまま）、モルモの一言は MORMO_FACILITY[id][lv]。「生んだもの」は §2 の数字1本、st.town.stats に記録。触るのは town_ui.js・map.js・main.js・town.js・run.js（加算呼び出し5行程度）・styles.css・test-town.js（+4）・browser-tests/town.js（+2）。battle.js は触らない。run.js と battle.js を同じコミットに入れない。node 全件とブラウザテストを直列で回して緑を確認してから push。
```
