# 仕様：号令——節目で止まり、名指しで技を命じる（2026-09-10）

実装済み（2026-09-10 深夜・Claude）。この文書は設計の根拠と契約の記録。次に触る人はこれと `HANDOFF.md` §0・§2 を読む。

## 0. 一文で

**戦闘の中に、魔王の手番を一つ作る。** 戦況が動いたラウンドの終わりに一度だけ止まり、種族技を持つ軍団員から一人を名指しで命じる（か、任せる）。命じられた者は次ラウンドの冒頭で真っ先に動き、技の条件を飛ばして必ず出し、与ダメ+50%。代償にその次の手番は息が上がって動かない。

## 1. 背景（オーナー試遊 2026-09-10）

「連打して次の展開やってた。文を読み飛ばしてしまったかも」「淡々と戦闘をする繰り返しのゲームになってきた。バトルに味気がほしい」。
見立て：原因はテキスト進行の宿命ではなく、**戦闘の中にプレイヤーの手番が無い**こと。`Battle.simulate()` が結末まで一気に計算し、画面は再生するだけ。決められるのは編成と撤退の二つ。だから連打になり、連打すると文（反撃の予告も特性の台詞も）は読み飛ばされる。
オーナー選択：全員への指示（押す／引く）ではなく**個人への指示**（「ガロに技を使わせるか」）。人物が立つほうを取った。

## 2. ルール

### 2.1 節目（`order_offer`）

- `options.offerOrder` のときだけ（UI だけが渡す。sim・テスト・引数なし `deploy()` では出ない）。
- **戦況が動くたびに来る**（1ラウンドに1回、回数の上限なし。2026-09-11 に「1戦闘1回」から変更。気合と息切れが連打を抑える）。ラウンドの終わり、撤退の提案のあと、勝敗判定の前。
- 条件：**このラウンドに誰かが倒れた**（敵味方どちらでも）**か、味方の軍団員の誰かが最大HPの半分以下**。敵が残っている。候補がいる。**撤退の提案と同じラウンドには出さない**（二つ続けて聞かない）。
- 候補：戦場にいる軍団員（傭兵・召喚物・不在・息切れ中を除く）で、`order` を持つ特性を持つ者。一人一技（最初の一つ）。最大3人。
- 条件を満たさないまま終わる戦闘では出ない（短い戦闘に指示は要らない）。

### 2.2 答え

- 「任せる」：計算済みの結末のまま（今までの挙動）。
- 名指し：run.js が**同じ種・同じ入力**で `orders: { [round]: unitId }` を付けて計算し直す。提案の手前までは同じ展開（乱数は `options.seed` で決定的）、そこから先だけ分岐する。手前が一致しなければ命じなかった結末を使う（黙って別の戦闘にしない）。

### 2.3 実行（`order_exec`）

- 次ラウンドの冒頭（遅刻の到着・燃焼のあと）。本人が生きて戦場にいれば `flags.ordered = true`、行動順の先頭へ。倒れていれば空振り（何も起きない）。
- 本人の一言（`lines.order`）を `U.pick` で1回だけ消費。
- `act()`：`ctx.ordered = true` を特性の `modDealt` / `postAttack` に渡す。与ダメ ×1.5、`notes` に「号令」。追加行動（血の雄叫び・宴・強欲）には乗せない。
- 代償：`flags.winded = true`。次の手番は `note`（`winded: true`）を出して動かない（大食漢の `stuffed` と同じ形）。

### 2.4 号令できる技（`order` を持つ特性）

| 特性 | 見出し | 号令で飛ばす条件 |
|---|---|---|
| 怪力 | 怪力を出せ | 20% → 必ず |
| 火球 | 火球を放て | 別の敵1体 → 全体 |
| 先制 | 先制を仕掛けろ | ラウンド1 → いつでも |
| 悪戯 | 悪戯を仕込め | 攻撃力−1 → −3 |
| ぶちかまし | ぶちかませ | 敵3体以上 → いつでも |
| 大火球 | 大火球を放て | 奇数ラウンド → いつでも |
| 血の雄叫び | 吠えろ | 倒したとき → 倒せなくても |
| 集団戦法 | 囲め | ゴブリン3体以上 → いつでも（最低1回） |
| 疾風 | 疾風で駆けろ | ラウンド1〜2 → いつでも |

受け身の技（白骨・骨の壁・分裂・執念・腐敗・死霊術・大召集・大波・火遊び・追い剥ぎ）は対象にしない。
台詞は本人の一言3本、全角28文字以内、数値なし。

## 3. 契約（追加されたもの）

- `U.rand` が唯一の乱数入口（`pick` / `chance` / `randInt` はこれを通る）。`U.seeded(seed)` は mulberry32。
- `Battle.simulate(p, e, { seed, offerOrder, orders })`。`seed` を渡すと `U.rand` を差し替えて計算し、終わったら戻す。`result.orderOffer = { index, round, candidates, answered } | null`。
- イベント：`order_offer { round, candidates:[{unitId,name,skillId,skillName,label,note}], answered, enemies }`（`emphasis 3`, `cls "mormo"`）、`order_exec { unitId, name, skillId, skillName, label, quote }`（`emphasis 3`, `cls "order"`）、`note { unitId, winded: true }`。
- `Battle.orderCandidates(playerUnits)`。
- run.js：`deploy({ offerRetreat })` が `offerOrder` と種を渡し、`pending.replay = { playerUnits, enemyUnits, options }`（計算前の JSON 複製）を保留に入れる。節目がある戦闘は撤退の提案が無くても保留する。
  `Game.answerOrder(unitId | "none" | null)` → 新しいタイムラインか `null`。`Game.recordBattleResult(pending)`（発見・最大戦力・最大CHAIN／OVERKILL・KPI。一度だけ）。`st.orderCount`。
  `settleBattle("continue")` は号令の節目が後に控えていれば答えだけ覚えて決着を待つ。決着経路は `settleContinue` / `settleRetreat` の二つのまま。
- 描画：`BattleScene.askOrder` / `answerOrder` / `swapTimeline` / `pendingOfferAt`。`onOrderChoice(unitId)` を ui.js が `Game.answerOrder` に繋ぐ。`skip()` は答える前の提案（撤退／号令）で止まる。

## 4. 落とし穴

- **提案の手前で乱数を余計に消費しない。** 提案イベント自体は答えの有無に関わらず同じ位置に出す（`answered` だけ違う）。回帰は `tools/test-order-battle.js` の4番（手前一致）。
- **記録は確定してから。** 答える前の結果で最大CHAIN や KPI を取ると、起きなかった連鎖を刻む。`recordBattleResult` は冪等で、`settleContinue` / `settleRetreat` / ロード時の保留決着の先頭でも呼ぶ。
- **既定は「任せる」（primary）。** ブラウザテストの自動送り（`helpers.js`）は primary を押すので、既存テストは今までの挙動のまま通る。
- **`U.rand` を差し替えるテスト**（`U.rand = () => 0.5`）では種は効かない。それでよい（固定値なら決定的）。

## 5. 検証

- `tools/test-order-battle.js`（26件）、`tools/test-order-run.js`（21件）、`tools/browser-tests/order.js`（18件）。
- 引数なし `deploy()` と sim の戦闘は変わらない（`offerOrder` 無し＝提案も実行も出ない。乱数は Math.random のまま）。

## 6. 未決（次に決めること）

- **U1** 節目の条件。今は「倒れた／半分以下」。試遊で「毎戦同じ場所で止まる」と感じたら、条件を敵の増援・技の条件成立に広げる。
- **U2** 代償の重さ。息切れ1手番。軽ければ「次ラウンドの被ダメ+30%」を足す。
- **U3** sim に号令の戦略を足すか（`orderPolicy: "first"` で常に最初の候補に命じる）。バランスを見るなら要る。
- **U4** 号令の回数を結果画面・魔界史に出すか（`st.orderCount` は数えている）。
