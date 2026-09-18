# 仕様：噂の札の器と描画（2026-09-14、Claude）

設計：`docs/DESIGN_INCIDENTS_2026-09-14.md`（3・7・8節）。中身：`docs/INCIDENTS_BATCH2.md`（12枚、採点は `INCIDENTS_BATCH2_REVIEW`）。
既存の `events.js`（自然発生 B）は**触らない**。噂の札（A）は新しい器で持ち、B は第2便の3枚だけ `incidents.js` 側に置いて同じ器で動かす（events.js との二重化は避け、B の新作は今後 incidents.js に書く）。

## 0. 一文で
**決着ごとに、条件を満たす札を1枚だけ作戦会議の端に出す。めくった人だけに起き、結果は隠れた状態で分岐し、「なぜ」欄が痕跡を名指しする。**

## 1. データ（`src/data/incidents.js`、CodeX が12枚を写す）
```js
const INCIDENTS = [{
  id: "slime_pond", tier: "mid", door: "A",              // door: "A" 噂の札 / "B" 自然発生
  title: "池からの同居人",
  subject: { kind: "race", race: "スライム" },             // kind: "unit"(uid を固定) / "race" / "facility"(id)
  traces: ["sparked", "ate", "carried_materials"],       // 関連痕跡（kind）。異なる2種で開く
  state: st => Town.lv(st, "hostel") >= 1,               // いまの状態（満たしやすいもの）
  rumor: "宿舎裏の池で、スライムの数だけ水面の顔が増えている。",
  choices: ["池を調べる", "やめる"],                        // B なら ["合唱を一曲頼む", "関わらない"]
  pick: "viewer",                                        // "viewer"＝めくった後に見学者を選ぶ / null＝主役がそのまま
  hidden: { label: "スライムの数", value: st => st.roster.filter(m => m.race === "スライム").length >= 2 ? "2体以上" : "1体" },
  gain: (st, c) => { /* 意図どおりの得 */ },
  branches: {
    "2体以上": { apply: (st, c) => { /* 分身を連れ帰る */ }, text: "池の光を浴びて…寝台を埋めていた。", mormo: "お名前より先に、寝床が決まりましたネ。" },
    "1体":     { apply: (st, c) => { /* 弁当を投げる */ },   text: "…今日も弁当を二つ持って出かけた。", mormo: "鏡のぶんまで、お腹が空くんでしょうか。" }
  },
  tail: { after: 3, id: "slime_pond_tail" }              // 続き（無ければ省略）。after 決着後に同じ器で「続きの札」を出す
}];
```
- `traces` の判定：`Traces.query(st.traces)` から、主役に紐づく（unit なら subject、race なら同種族、facility なら data.facility）痕跡を集め、**異なる kind が2種以上**なら成立。開いた2本を `st.incidents.offered[id].by = [seq, seq]` に保存し、めくるまで差し替えない。
- 「なぜ」は自動生成：`by` の2本を `TRACE_KINDS[kind].template` で一文ずつ、＋`hidden.label`と実値、＋起きた枝の text の先頭。

## 2. 状態（`st.incidents`）
```js
st.incidents = { offered: { [id]: { turn, by:[seq,seq], subjectUid, expires } }, done: { [id]: { turn, branch } }, dry: 0, active: 0 }
```
- `offered` は最大 **2**、同じ id は1ランに1回（`done` にあれば出さない）。`expires = turn + 3`。
- `dry`：条件を満たす札が0の決着が続いた数。3 で次の判定だけ「異なる kind 1種」に緩める（8-3 乾き）。出たら 0。
- 続き物（tail）は同時に1本。

## 3. 流れ（`src/core/incidents.js`）
- `Incidents.settle(game)`：決着処理の末尾（`Town.settle` の直後）。`expires` 切れを消す → `offered` が2未満なら候補を集めて **1枚だけ**足す（候補が複数なら tier 大→中→小、同順なら痕跡の新しい方）。B の札は候補になった時点で**その決着に起きる**（`UI.result` に出す）。
- `Incidents.open(game, id)`：めくる。`pick === "viewer"` なら見学者の選択画面（名簿から1人。既存の人物選択の部品を流用）。→ `gain` → `hidden.value` で枝を決め `apply` → `done` に記録 → 痕跡 `incident`（新規 kind、data: {id, branch}）→ 結果画面（text・mormo・なぜ）。
- `Incidents.decline(game, id)`：やめる。A は無記録で `offered` から消す。B は「関わらない」＝`done` に branch:"ignored" で記録、効果なし。
- 主役の失効：unit の戦死・解雇・逃亡、race の全滅、facility の Lv0 → `offered` から消し、`fallen` と id を日誌に1行（7-6。弔い札は後日）。

## 4. 描画
- **作戦会議**：3〜4枚の右端に薄い5枚目 `.mission-card.rumor`（題＋rumor の一行＋「めくる」）。防衛戦だけの決着でも出す。B の札はここには出ない。
- **城下町の札**：地図の下、施設一覧の上に「張り紙」1枚（同じ札。生活寄りの見せ方。どちらから開いても同じ）。
- **めくった後**：既存のイベント画面（`UI.event` の器）を流用。見学者選び → 結果（text 3行以内・mormo・「なぜ」欄は畳んで「なぜこうなった？」を押すと開く）。
- **結果画面（決着）**：B の札の text・mormo・なぜ。A の続き（tail）が出たときの一行。
- 音：めくる＝既存 `shuffle`、結果＝`mormo`。追加の音は無し。

## 5. 痕跡3種の記録（run.js、1行ずつ）
| kind | どこで | subject / object / data |
|---|---|---|
| `carried_materials` | 留守番が建材を運んだ決着（`processDepartments` の建材産出。運んだ者ごと） | 運搬者 / null / { amount, facility: null } |
| `cooked` | 料理職が食事強化を出した決着 | 料理人 / null / { facility: "grand_kitchen" or null } |
| `trained` | 稽古（訓練）の決着に出撃した者 | 本人 / null / { tier: "案山子" 等 } |
`incident` も加えて `TRACE_KINDS` は **22**（`MAX_KINDS` を上げる。`test-traces.js` の上限も）。

## 6. 分担と触るファイル
| 誰 | 何 | 触るファイル |
|---|---|---|
| CodeX | 12枚を 1節の形式に写す（apply の中身は「TODO: 効果」のコメントでよい。text・mormo・hidden.label・choices を正確に） | `src/data/incidents.js`（新） |
| Opus | 器・流れ・描画・痕跡3種・`incident` kind・テスト | `src/core/incidents.js`（新）、`src/core/traces.js`、`src/core/run.js`（settle の1行と痕跡3行と apply の効果）、`src/ui/ui.js`（作戦会議の5枚目・結果）、`src/ui/town_ui.js`（張り紙）、`src/main.js`（actions `incidentopen`/`incidentdecline`/`incidentpick`）、`src/styles.css`、`index.html`、`tools/test-incidents.js`（新：成立判定・2枚上限・失効・乾き・B の関わらない・なぜ欄の生成）、`tools/browser-tests/incidents.js`（新：札が出る・めくる・結果）、`tools/sim.js`（戦略「札を全部めくる」「全部無視」と列「札」） |
| Claude | 12枚の apply の効果のうちエンジンに触るもの（無し。全部 run.js の範囲）。取り込みと採点 | — |

順序：CodeX（データ）→ Opus。CodeX のデータが無い間、Opus は slime_pond 1枚を手で書いて器を通す。
コミット：(a) データ受け入れと器（incidents.js・traces）、(b) run.js の settle と痕跡3種と apply の効果、(c) 描画と main.js、(d) テストと sim。**battle.js は触らない**。

## 7. 落とし穴
- `Traces.MAX` は 400。痕跡3種を足すと 1 決着で 5〜8 本増える。古いものから落ちるので、札の判定は**直近 60 決着**に限る（`Traces.query` に since を渡す）。
- `apply` の効果で名簿に人を足す（分身・骸骨・連絡兵・旅人）ときは既存の `rollApplicant` を通し、**面接の応募者として並べる**（強制採用しない）。
- 二つ名の貸し借り（general_duel）は `m.epithet` を直接書き換えず `m.epithetOverride` を2決着だけ置く。表示は `displayName`。
- 「その者だけの技」（mage_lab_light）は `m.skills` に `mage_fireball` を足すだけ。`unitSkillIds` がそのまま拾う。
- 前の主が迎えに来る（necro_visitor）は防衛戦の予約 `st.counterattack` を使い、隊列名を「○○の元の主」に差し替える。新しい戦の型は作らない。
