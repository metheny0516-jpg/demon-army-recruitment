# 仕様：戦闘の施設3つを城下町に統合する（2026-09-13）

オーナー：「巨大厨房・恐喝帳簿・墓地も城下町に統合したい」。
今は施設が**2系統**ある。旧「戦闘の施設」（1つだけ選んで建材を積み上げて Lv を上げる。留守番の施工で進む）と、
新「城下町」（6つ。金と建材で即時に建つ。1決着1件）。遊ぶ人に2つの建て方を覚えさせる理由はないので**1系統にする**。

## 0. 一文で

**恐喝帳簿・巨大厨房・墓地は城下町の施設になる（合計9）。建て方は城下町の1種類だけ。旧の「施工で積む」仕組みは消す。**

## 1. 3施設の新しい姿

| 施設 | Lv1 の値段 | 効果（Lv で回数が増える。中身は今のまま） | 一文 | 職業一致（2割引） |
|---|---|---|---|---|
| 恐喝帳簿 📒 | 12G・建材2 | 会計職が出撃中、予約金貨3Gごとに次の味方攻撃 +40%。Lv 回まで | 「会計がいると殴りが強くなる」 | 会計・経理 |
| 巨大厨房 🍖 | 15G・建材3 | 戦闘糧食を追加で1消費し、大食漢と料理人の食事強化を (Lv+1) 倍 | 「よく食べてよく殴る」 | 料理・給食 |
| 墓地 🪦 | 18G・建材3 | 留守番の死霊術師が、戦死者を骸骨従者として召喚。Lv 体まで | 「死んだ仲間が骸骨になって戻る」 | 死霊術師（種族。職業ではないが同じ扱い） |

- 値段の段は他の城下町施設と同じ伸び（Lv2 ≈ ×1.6、Lv3 ≈ ×2.2）。
- **3つ同時に持てる**ようになる（今は1つだけ選ぶ）。これは強化なので、代わりに値段で払う。
- battle.js が読む `options.extortionLedger / grand_kitchen / graveyard / facilityWorks` は変えない。run.js が城下町の Lv から組むだけ（`facilityWorks` は施設ごとに Lv を渡す。今は共通1本なので `options.facilityWorks` を `{ extortion_ledger: lv, grand_kitchen: lv, graveyard: lv }` にも対応させる。battle.js は数値なら今までどおり、オブジェクトなら施設別に読む）。

## 2. 消すもの・残すもの

| 今 | これから |
|---|---|
| `st.facilityLevel` / `st.activeFacilityId` / `st.buildProgress` / `FACILITY_LEVELS` | **消す**。旧セーブは 3節で城下町へ写す |
| 留守番の「施工」（建材を進捗に変える） | 消す。留守番は建材を**運ぶ**だけ（今の建材の入り方はそのまま）。施工能力の表示行は消す |
| 拠点の接収（勝った拠点をそのまま最初の施設に。run.js 815 行付近） | 「接収した拠点の分だけ**建材 +3**」に置き換える（一度だけの追い風は残す） |
| 荒らし（防衛戦の負け）で `facilityLevel -1` | **城下町の施設1つの Lv を1落とす**（一番 Lv が高いもの。同点なら値段が高いもの）。銀行の差し押さえと同じ処理を使う |
| `events.js` の施設イベント（巨大厨房の check、`oweDebt kind:"facilityLevel"`） | check は `Town.level(st,"grand_kitchen") >= 1` に。`oweDebt` の `facilityLevel` は「城下町の施設1つの Lv -1」に置き換える |
| 城メニュー「軍団」札の施設パネル（`facilityPanel`）と決着画面の施設報告 | 城下町の札に寄せる。決着画面には「施設が発火した回数」だけ残す（`facility_trigger` イベントは今のまま） |
| sim の施設列（4か所） | 城下町の Lv 合計に置き換え |

## 3. 旧セーブ（`migrateState`）
- `activeFacilityId` と `facilityLevel >= 1` があれば、その施設を城下町に**同じ Lv で建てた扱い**にする（金も建材も取らない）。
- `buildProgress` は捨てる。途中の積み上げは建材で返す（`materials += floor(buildProgress / 2)`、上限 6）。
- 3つの欄は削除。`FACILITY_LEVELS` を参照するコードは全部消す（events.js 565 行を含む）。

## 4. 見た目
- 城下町の札に 3 施設を足す。**9 施設を2つの見出しで分ける**：「町（6）」「軍（3）」。長くなるので、施設ごとの説明は一文＋「効果」の1行。
- 全体マップ（`docs/WORLD_MAP_DESIGN_2026-09-13.md`）の城下町区画は空き地 **9** に増やす。まだ絵に入っていないので、CodeX への (a) の依頼に「空き地9」と書き足す。

## 5. 分担と触るファイル

| 誰 | 何 | 触るファイル |
|---|---|---|
| **Claude** | battle.js：`facilityWorks` の施設別対応（数値でもオブジェクトでも動く）。テスト2件 | `src/core/battle.js`、`tools/test-facility-*.js` の該当 |
| **Opus** | run.js：旧3欄の削除・施工の削除・接収→建材・荒らし→城下町・battle への options 組み立て・移行。town.js/town.js data：3施設追加、`Town.level(st,id)`、`Town.demolishOne(st)`（荒らし・差し押さえ共通）。events.js の2か所。UI：城下町の札の見出し2つ、軍団札の施設パネル削除、決着の施設報告。sim | `src/core/run.js`、`src/data/departments.js`（FACILITIES・FACILITY_LEVELS 削除）、`src/data/town.js`、`src/core/town.js`、`src/data/events.js`、`src/ui/ui.js`、`src/ui/town_ui.js`、`tools/sim.js`、`tools/test-town.js`（+6）、`tools/test-facility-report.js`／`test-facility-*.js`（書き換え）、`tools/browser-tests/town.js`（+2） |

順序：Claude → Opus。1つの PR 相当だが、コミットは (a) データと town.js、(b) run.js の置き換えと移行、(c) UI と sim とテスト、の3つ。**battle.js と run.js は同じコミットに入れない**。

## 6. 落とし穴
- `facility_trigger` イベントの `facilityId` は描画側（battle_scene.js）が字幕に使っている。id は変えない。
- 墓地は「留守番に死霊術師がいる」条件が今もある。城下町に建てただけでは発火しない（一文に書く）。
- 3つ同時に持てるようになると強くなる。sim の勝率が 5 ポイント以上動いたら、恐喝帳簿の +40% を +30% に落とす（`battle.js` の定数）。
- `oweDebt` の `facilityLevel` は「イベントの借り」で、期限が来たら施設が落ちる仕組み。置き換え先の `Town.demolishOne` は銀行の差し押さえとも共用なので、通知文は呼び元で変える。
- 旧セーブで `activeFacilityId` が城下町に**既にある**施設だったことはない（id が別）。衝突は起きない。

## 7. 貼り付け用
Opus：
```
docs/SPEC_TOWN_MERGE_2026-09-13.md の Opus の欄を実装して。作業ブランチ claude/hero-arrival-tavern-prototype-uy2toh から切って同じブランチへ push。
Claude の battle.js 側（facilityWorks の施設別対応）が入ってから着手。battle.js は触らない。
コミットは (a) データと town.js、(b) run.js の置き換えと移行、(c) UI と sim とテスト、の3つ。node テストは全部通し、ブラウザテストは直列で。
```
