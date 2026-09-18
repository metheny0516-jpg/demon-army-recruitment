# 仕様：張り紙を待たない ― 条件を満たした噂・事件はモルモが必ず持ってくる（2026-09-16、Claude）

オーナー決定（2026-09-16）：**「イベントは全プレイヤーに、条件を満たしたら強制でモルモを通じて表示する。分岐で出ないことはあってよいが、
張り紙を読みに行った人にしか起きない、はやめる。」**

土台：`docs/DESIGN_INCIDENTS_2026-09-14.md`（札の型・条件づけ・安全弁）、`docs/SPEC_INCIDENTS_IMPL_2026-09-14.md`（器）。
**器は変えない。変えるのは「出す口」だけ。** `Incidents.settle / open / decline / finishTail` の契約はそのまま。

## 0. 一文で

**決着ごとに `Incidents.settle()` が出した札は、次の画面に入る前にモルモが全画面で読み上げる。プレイヤーはその場で「めくる／やめる」を選ぶ。
張り紙と作戦会議の5枚目は「まだ答えていない札を読み返す場所」になる。**

## 1. なぜ

- 予兆は「これから何か起こる」という期待そのもの。見ていない人にとって事件は唐突な理不尽で、第7節の「人に話したくなる敗北」が成立しない。
- 任意で読む張り紙は、読む人と読まない人で体験が割れる。分岐で出ないのは設計者の制御、読まなかったのは制御外。
- 全画面のモルモ報告（`App.report` → `MormoScene.show`）は既に「確認するまで消えない」で運用されている。新しい画面は要らない。
- 「8割避けられる」（DESIGN_INCIDENTS 2節）は**知らずに避ける**ではなく**見たうえで「やめる」を選べる**で満たす。判断は残す。

## 2. 出す口（変更点はここだけ）

### 2-1 待ち行列 `st.incidents.pending`
```js
st.incidents.pending = [ { id, kind: "arc" | "B" | "A" | "tail", turn } ]   // 既存の st.incidents に1欄足す
```
- `Incidents.settle()` の末尾で、その決着に**新しく** `offered` に入った札・`tail.ready` になった続き・大筋の予兆（`st.arc` 側が積む。後述）を `pending` に積む。
  既に `pending` にある id は積まない。`offered` から消えた（失効・主役の死）札は `pending` からも消す。
- 順は **大筋（arc）＞ 続き（tail）＞ 自然発生（B）＞ 噂の札（A）**。同順は tier 大→中→小。

### 2-2 いつ出すか
- **決着の報告のあと、次の画面（面接・作戦会議・準備）に入る前**。`main.js` の `afterresult` で `Game.afterResult()` → `App.render()` のあと、
  既存の「遠征隊が帰還しました」報告の**前**に `App.presentPending()` を呼ぶ。
- 事件（`st.phase === "event"`）が同じ決着に立っていれば、**事件を先に**（今の順序を崩さない）。事件の選択が終わって面接へ移る前に `presentPending()`。
- **1決着に出す上限は 2 件**。残りは `pending` に残し、次の決着で出す（`expires` までに出せなかった札は張り紙にだけ残る。ここは 4節）。
- 訓練（稽古）の決着・防衛戦だけの決着でも出す（settle が走る決着はすべて対象）。

### 2-3 どう出すか（`App.presentPending()`）
```
pending の先頭を取り出す
  → MormoScene.show({
       expression: kind === "arc" ? "worried" : "report",
       kicker: kind === "A" ? "城下町の噂" : kind === "B" ? "報告" : kind === "tail" ? "噂の続き" : "予兆",
       title: "宰相モルモ",
       text: Incidents.text(st, card.rumor, Incidents.context(st, offer)),      // 札の rumor をそのまま。数字は出さない
       choices: [ { label: card.choices[0] （A: "めくる"相当 / B: "話を聞く"相当）, action: "incidentopen", id },
                  { label: card.choices[1] （"やめる" / "関わらない"）,          action: "incidentdecline", id },
                  { label: "あとで（張り紙に残す）",                              action: "incidentlater",   id } ]
     })
選んだら：
  incidentopen    → 既存 `UI.incident(id)`（見学者選び→結果）。結果の「戻る」で presentPending() に戻り、次の1件へ
  incidentdecline → 既存 `Incidents.decline`。次の1件へ
  incidentlater   → pending から外すだけ（offered には残る＝張り紙・5枚目で読める）。次の1件へ
2件出し終えるか pending が空になったら、元の流れ（帰還報告など）へ
```
- `MormoScene.show` に `choices` を渡す形は `aside` に既にある。`show` 側に同じ欄を足す（Opus）。**選択肢が出ている間は下の画面を操作できない**（既存の挙動）。
- 「あとで」を残す理由：**未読で失う予兆を作らない**が目的であって、その場で答えさせるのが目的ではない。ただし「あとで」は表示済み扱い（`pending` から外れる）。
- 音：出るとき `mormo`、めくるとき `shuffle`（既存のまま）。

### 2-4 大筋（arc）の予兆
- `DESIGN_BIG_ARCS` の予兆（「沼が動く」「研究所から煙」等）は日誌・地図の小物として出ているが、**初回だけ** `pending` に `kind:"arc"` で積み、モルモが一言で言う
  （選択肢は「わかった」1つ。分岐点ではないので判断は求めない）。2回目以降の予兆は日誌と小物だけ（毎回言うと予兆でなく警報になる）。
- 積む場所は `st.arc` を更新する側（run.js）。`Incidents` は運ぶだけ。

## 3. 張り紙と作戦会議の5枚目（降格）

- 中身は今のまま（`UI.incidentCards("A")`、`town_ui.js` の `.town-notices`）。役割が「読み返す場所」に変わる。
- 見出しを「張り紙」→「**張り紙（あとで、と言った噂）**」。`pending` に**まだ入っている**札（未表示）は張り紙に**出さない**
  （先にモルモから聞く。張り紙で先に読めると 2-3 の順序が崩れる）。
- B の札（`UI.incidentCards("B")`、結果画面）も同じ：モルモが先、結果画面は読み返し。

## 4. 失効との関係

- `expires = turn + 3` は変えない。**表示は必ず失効前に一度は起きる**（2-2 で決着ごとに最大2件、`offered` 上限が2なので溢れない。
  tail と arc が同じ決着に重なって 3 件以上になった場合だけ繰り越し、その札は次の決着で先頭に来る）。
- 「あとで」と言った札が失効したら、日誌に1行（「張り紙が風で飛んだ」）。痕跡は残さない（プレイヤーの判断なので）。
- 主役が死んで消えた札は今どおり `phase:"lost"` の痕跡＋日誌。`pending` からも消す。

## 5. 数で見る（sim）

- `tools/sim.js` の戦略「札を全部めくる」「全部無視」はそのまま使える（`pending` は表示の順序であって成立条件ではない）。
- 足す列：**表示された札／出た札**（＝1.0 になるはず。1.0 未満なら 2-2 の上限か順序に穴がある）。
- ブラウザ：`tools/browser-tests/incidents.js` に「決着のあと、面接に入る前にモルモが札を持ってくる」「あとで→張り紙に残る」「やめる→張り紙に残らない」の3本。

## 6. 分担と触るファイル

| 誰 | 何 | ファイル |
|---|---|---|
| Opus | `pending` の積み下ろし・`presentPending`・`MormoScene.show` の choices・張り紙の出し分け・テスト | `src/core/incidents.js`（settle の末尾、`later(id)`）、`src/main.js`（`afterresult` の順序・`presentPending`・action `incidentlater`）、`src/ui/mormo_scene.js`（show に choices）、`src/ui/ui.js` `src/ui/town_ui.js`（未表示の札を隠す・見出し）、`tools/test-incidents.js`（pending の順・上限2・繰り越し・失効）、`tools/browser-tests/incidents.js` |
| Claude | 大筋の予兆を `pending` に積む側（`st.arc` を触るとき） | `src/core/run.js` |
| CodeX | 札の rumor が「モルモが口で言う」形になっているか見直し（張り紙の文体＝三人称の掲示、モルモ＝二人称の報告。必要なら `rumor` とは別に `mormoLine` を1本） | `src/data/incidents.js` |

順序：Opus（器）→ CodeX（文）→ Claude（arc）。**battle.js は触らない。`Incidents` の open/decline の契約は変えない。**

## 7. やらないこと

- 札を**自動でめくる**（強制は「見せる」まで。判断はプレイヤー）。
- 表示のために失効を延ばす・条件を緩める（成立条件は DESIGN_INCIDENTS 8節のまま）。
- 「あと1つで札が出る」の予告（8-5）。
- 新しい画面。すべて `MormoScene.show` と既存の `UI.incident` で済ませる。
