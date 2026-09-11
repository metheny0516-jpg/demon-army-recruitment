# 仕様：撤退の判断（2026-09-10）

実装担当者向けの仕様書。この文書と `HANDOFF.md` §0・§2 だけで実装を始められるように書いてある。
方針の相談・設計の変更はオーナーと設計担当（この文書の書き手）に戻す。実装中に判断が要る箇所は末尾「未決」に集めた。
未決に無い判断で迷ったら、**いちばん小さく、いちばん今の動作に近い**ほうを選び、コミットメッセージに書く。

## 0. 一文で

**味方が初めて倒れたラウンドの終わりに、モルモが一度だけ戦闘を止めて「退きますか」と聞く。退けば倒れた者を担いで帰れる（戦死しない）が、報酬は無い。続ければ今まで通り。**

オートバトルにプレイヤーの判断が**一回だけ**入る。これが本編に入る最初の「戦闘中の選択」なので、ここで作る仕組み（戦闘を途中で分岐させる形）は後の「戦闘不能とLPの二層」でも使う。

## 1. 目的と、やらないこと

目的：
- 「あっさり負けた」を「退くか、賭けるか」の判断に変える。負けが物語になる（設計会話 §3「撤退」）。
- 今の仕様では**勝っても、倒れたまま終わった者は戦死する**（`contribution.survived = alive`）。だから「今なら担いで帰れる／続ければ敵将まであと少しだが倒れた者は死ぬ」が本当の二択になる。
- オーナーが試遊で気に入った「戦闘中に止まって状況説明」の枠（`BattleScene.speakAside` → `MormoScene.aside`）をそのまま使う。

やらないこと（この仕様の外）：
- HP と生命力（LP）の二層。戦闘不能→死の余裕は次の仕様。
- 撤退中の追撃戦・殿（しんがり）・逃走失敗。撤退は必ず成功する。
- 敵側の撤退。判定勝ちの文言にある「勇者軍は撤退した」は今のまま。
- 撤退したときの新しい事件・台詞の分岐（「臆病者と呼ばれた」等）。台詞はモルモの一言と結果画面の一文だけ。
- 傭兵（`mercenary`）の扱いの変更。傭兵は今と同じ（戦死しても欠員にならない）。
- 再起（`retry` / `checkpoint`）の仕様変更。

## 2. ルール

### 2.1 いつ聞くか（提案の条件）

以下を**すべて**満たしたラウンドの終わり（`resolveRecoveryHooks(false)` の後、勝敗判定の前）に一度だけ：

1. このラウンドで、軍団員（`flags.summoned` でない味方）が初めて倒れた（`alive === false`）。蘇生で戻った者は「倒れた」に数えない（ラウンド終了時点で `alive` なら対象外）。
2. 敵が全滅していない。味方も全滅していない（立っている軍団員が1人以上）。
3. まだ提案していない（1戦闘1回）。

満たさなければ一度も聞かない。全滅で終わる戦闘に「退けば良かった」は無い。それは今の全滅と同じ結末で良い。
遅刻で不在（`flags.absent`）の者は「立っている」に数えない。到着前に全員倒れたら提案しない（`onField` を使う。`alive` ではない）。

開幕3日間（`st.openingPrototype`）の戦闘でも聞く。理由：最初の防衛戦で「退く」を覚えるのは悪くない。ただし**未決 U1** を見よ。

### 2.2 退いたときの結末（撤退）

- 勝敗：敗北でも勝利でもない第三の結末。`victory: false, retreated: true`。
- 軍団：提案時点で立っていた者はそのまま。**倒れていた者は「担いで帰る」＝生存**。`survived: true`。ただし `injured: true` を付け、run.js 側で**負傷**にする（2.4）。
- 報酬：作戦報酬（`stageData.reward`）は無し。戦闘中の略奪金貨（`resourceChanges.gold`）も確定しない（提案時点までの分も含めて没収）。理由：「退けば無傷で持ち帰れる」は撤退を安全な選択にしすぎる。
- 作戦の結果：`applyMissionOutcome` は呼ばない（征服は進まない）。警戒度だけ `alertDelta` の分上がる（敵に見つかった事実は残る）。`alertDelta` が無い作戦なら +1。
- 給与：**払う**（出撃隊は満額、留守番は手当）。理由：未払いは戦闘前の方針（`payrollPolicy`）で決めるもの。撤退したから払わない、は「わざと退けば給与が浮く」抜け道になる。
- 留守番の仕事（食料・建材、`processDepartments`）：**行う**。城に残った者の仕事は戦場の結果と無関係。
- ツケ（`settleDebts`）：今の敗北と同じく行う。
- 戦功（`awardMerit`）：提案時点までの `contribution` で行う。倒れる前の働きは残る。
- 日数・ターン：`st.turn += 1`。作戦は消える（`st.missionOffers = []`）。フェーズは `"result"`（敗北の `"defeat"` ではない）。結果画面は「撤退」の見出しで出す（3.3）。
- 記録：`st.retreatCount = (st.retreatCount||0) + 1`。魔界史の主要記録には増やさない（設計憲法 第11節）。ラン終了の記録（`endRun`）に `retreats` を一項目足すだけ。

### 2.3 続けたときの結末

今と完全に同じ。撤退を実装しても、続けた場合の勝敗・報酬・戦死・sim の数字は**1ビットも変わらない**こと。これが最重要の受け入れ条件（4.1）。

### 2.4 負傷

撤退で担いで帰った者（提案時点で `alive === false` だった軍団員）は `m.injured = 1` になる。

- 負傷者は出撃できない。`toggleDeploy` / `assignDepartment(uid, "combat")` は `false` を返す。留守番としては働く（包帯を巻きながら帳簿は付けられる）。
- 戦闘が一つ決着するたび（勝利・敗北・撤退のいずれでも、`deploy()` の決着処理の最後で）全員の `injured` を 1 減らす。0 になったら出撃できる。つまり**次の1戦だけ休む**。
- 旧セーブに `injured` が無ければ 0 扱い（`migrateState` で `m.injured = m.injured || 0`）。
- 編成画面では負傷者の札に「🩹 負傷（次の戦いまで）」のバッジ。出撃ボタンは無効。
- 負傷中に戦死・解雇された場合は今の処理のまま（特別扱い無し）。

## 3. 契約（イベントと関数）

### 3.1 battle.js が出すもの

`Battle.simulate()` は今まで通り**最後まで**計算する（続行した場合の結末）。それに加えて：

- タイムラインに `retreat_offer` イベントを**一度だけ**入れる（2.1 の条件を満たしたとき）。
  ```js
  {
    type: "retreat_offer", round, emphasis: 3,
    downed:   [snap...],   // このラウンド終了時点で倒れている軍団員（担いで帰る候補）
    standing: [snap...],   // 立っている軍団員（onField）
    enemies:  [snap...],   // 立っている敵
    text: "　モルモ「魔王様、${downed[0].name}殿が倒れました。今なら担いで退けます」", cls: "mormo"
  }
  ```
  `snap` は既存の `snap(u)`（id, name, hp, maxHp, alive, late …）。
- 戻り値に `retreatOffer` を足す。無ければ `null`。
  ```js
  result.retreatOffer = {
    index,                 // timeline 内の retreat_offer の位置
    round,
    contribution: [...]    // 提案時点の contribution（既存の contribution と同じ形）。
                           // ただし survived は「軍団員なら true」、倒れていた者に injured: true。
                           // 傭兵・召喚物は今の contribution と同じ扱い。
  }
  ```
  `contribution` の作り方は既存の末尾の処理（`late`, `lateCause`, `survived` 等を組む所）を関数に切り出して、提案時点と終了時点の両方で呼ぶ。二つの場所で別々に組まない。
- `result` イベント・`victory`・`contribution`・`resourceChanges` は**変えない**。

`retreat_offer` は「重要度の印」の仲間で、戦闘計算には一切影響しない（`permanent` / `reversal` と同じ扱い）。乱数の消費順も変えない。イベントを一つ足すだけで乱数列がずれると sim の数字が変わるので、`U.rand` / `U.chance` / `U.pick` を新たに呼ばないこと。

### 3.2 run.js の分割

`Game.deploy()` は今、シミュレーションと決着（報酬・戦死・給与・フェーズ）を一つの関数でやっている。これを分ける。

```js
Game.deploy(options = {})
  // 今と同じ引数なし呼び出し（sim・テスト・旧コード）は、今と同じ挙動：シミュレーションして即決着（続行）。
  // options.offerRetreat === true（UI だけが渡す）かつ result.retreatOffer があるとき：
  //   決着を保留する。st.pendingBattle = { result, stageData, notes, battleRations, openingBattle, goldBefore ... 決着に要る全部 }
  //   st.phase = "battle"（新フェーズ。セーブされる。リロードしたら 3.4）
  //   戻り値は今と同じ result（UI はこれで BattleScene を回す）
Game.settleBattle(choice)   // choice: "continue" | "retreat"
  // st.pendingBattle を消費して決着する。"continue" は今の deploy() 後半そのもの。
  // "retreat" は 2.2。戻り値は phase 名（afterResult と同じ流儀）。
  // pendingBattle が無ければ false。
```

決着処理の本体（今の `deploy()` の `const result = Battle.simulate(...)` より後ろ）を `settleContinue(pending)` と `settleRetreat(pending)` に分け、`deploy()` の即決着は `settleContinue` を呼ぶだけにする。**続行の経路のコードを二つ持たない**（4.1 を守る最短の方法）。

`st.lastBattle` は決着時に書く（今と同じ場所）。撤退なら `lastBattle.retreated = true`、`lastBattle.notes` に撤退の一文（3.3）。

### 3.3 文言

- モルモの一言（`retreat_offer`、下半分の一言で止める）：
  「魔王様。{downed}殿が倒れました。今なら担いで退けます。……敵は残り{n}」
  downed が2人以上なら「{downed[0]}殿たち」。
- 選択ボタン：「⚔ 続ける」「🏰 退く」。既定フォーカスは「続ける」（今までの挙動が既定）。
- 退いたとき、戦場に一拍：`　魔王軍、撤退。{downed}を担いで城へ戻った` を字幕で出して終わる（新イベントは作らず、描画側で出す）。
- 結果画面の見出し：「撤退」。本文一行目：「{army} から退いた。{downed}は生きている。報酬は無い。」
  以降は今の `notes`（給与・留守番の仕事・ツケ）。
- 負傷バッジ：「🩹 負傷（次の戦いまで）」。

### 3.4 保存と復帰

`st.phase === "battle"` かつ `st.pendingBattle` があるセーブをロードしたとき：戦闘を再生し直さず、**続行として決着する**（`settleBattle("continue")`）。理由：再生し直すと同じ戦闘を二度見る。撤退の機会は一度だけで、リロードで取り直せない。`migrateState` で行う。

## 4. 受け入れ条件

### 4.1 続行が変わらない（最重要）

`node tools/sim.js 50` の全戦略の平均クリア率が、実装前後で**同じ乱数列なら完全一致**すること。sim は乱数を固定していないので、実装前後で各 3 回流して平均の差が ±3pt 以内なら合格とする。それを超えたら 3.1 の「乱数を新たに消費しない」を疑う。
加えて `tools/test-*.js` 58本が全部通ること。これらは `deploy()` を引数なしで呼ぶので、続行の経路が変わっていないことの検査になる。

### 4.2 battle.js（コミットA）：`tools/test-retreat-battle.js`（新規）

vm ハーネスは `tools/test-tinkerer.js` を写す。`U.rand` を固定して決定的にする。

- 味方2人・敵1人（HP高め）で、味方の一人が途中で倒れ、もう一人が立っている状況を作る → `retreat_offer` が**ちょうど1回**出る。`downed` に倒れた者、`standing` に立っている者、`enemies` に敵。
- `result.retreatOffer.contribution` で、倒れた者が `survived: true, injured: true`、立っている者が `survived: true`、`injured` 無し。
- 同じ戦闘の `result.contribution`（続行の結末）は、**この実装の前と同じ**（倒れたまま終われば `survived: false`）。
- 味方が一人も倒れずに勝つ戦闘では `retreat_offer` が出ず、`retreatOffer === null`。
- 味方が全員同じラウンドに倒れる戦闘（全滅）では出ない。
- 遅刻で不在の者だけが「立っている」場合は出ない（`onField`）。
- 蘇生（`onRoundEnd` で戻る特性）で倒れた者がラウンド終了時に立っていれば、そのラウンドでは出ない。
- `retreat_offer` の前後で乱数の消費回数が変わらない：`U.rand` の呼び出し回数を数えるスタブで、提案あり／なしの同じ戦闘（提案条件だけ変えて）を比べる……は作りにくいので、代わりに**同じ seed で実装前後のタイムラインの `attack` イベント列が一致**することを `git stash` で確認し、コミットメッセージに書く。

### 4.3 run.js（コミットB）：`tools/test-retreat-run.js`（新規）

ハーネスは `tools/test-tinkerer-run.js` を写す（名簿は自前で作る。`Game.newRun()` 直後は空）。

- `Game.deploy()`（引数なし）：`retreatOffer` があっても即決着。`st.pendingBattle` は無く、`phase` は今まで通り（`result` か `defeat`）。
- `Game.deploy({ offerRetreat: true })` で `retreatOffer` がある戦闘：`st.phase === "battle"`、`st.pendingBattle` あり、所持金・名簿・警戒度が**まだ変わっていない**。
- `Game.settleBattle("continue")`：引数なし `deploy()` と同じ状態になる（所持金・名簿・phase・`lastBattle.victory` を比べる。乱数を固定して同じ戦闘にする）。
- `Game.settleBattle("retreat")`：倒れていた者が名簿に残り `injured === 1`、`activeUids` から外れている、所持金は作戦報酬ぶん増えていない、給与は払われている、警戒度が上がっている、`phase === "result"`、`lastBattle.retreated === true`、`st.retreatCount === 1`。
- 負傷者に `toggleDeploy` / `assignDepartment(uid, "combat")` → `false`。次の戦闘を一つ決着させると `injured === 0` になり、出撃できる。
- `pendingBattle` が無いときの `settleBattle` → `false`。
- `phase === "battle"` のセーブをロードすると続行として決着している（3.4）。

### 4.4 UI（コミットC）：`tools/browser-tests/retreat.js`（新規）

`tools/browser-tests/late-arrival.js` を写す（`MormoScene.aside` を包んで記録、自動クリック、`BattleScene.speed = 4`）。

- `retreat_offer` で戦闘が止まり、モルモの一言に倒れた者の名前と「退けます」が入り、ボタンが2つある。
- 「続ける」を押すと再生が続き、終了後に `Game.state.phase` が `result` か `defeat`。
- 「退く」を押すと `retreat_offer` より後の攻撃が**描画されない**（記録した `attack` の描画回数が提案時点で止まる）。結果画面の見出しが「撤退」。
- 「最後まで飛ばす」（`skip()`）は提案に**答える前は提案の位置で止まる**。答えた後は今まで通り最後まで飛ぶ。
- 提案が無い戦闘では今まで通り止まらない。
- `sh tools/browser-tests/run-all.sh` 全通過。

## 5. 実装の分割

CLAUDE.md の「`run.js` と `battle.js` は同時に触らない」を守る。3コミット。各コミットで node テストが全通過し、push する。

| コミット | 触るファイル | 計測・検証 |
|---|---|---|
| A 戦闘側 | `src/core/battle.js`、`tools/test-retreat-battle.js`、`HANDOFF.md` §2（契約） | `node tools/test-*.js` 全部、`node tools/sim.js 50`（続行不変の確認、4.1） |
| B 進行側 | `src/core/run.js`、`tools/test-retreat-run.js`、`HANDOFF.md` §0 | `node tools/test-*.js` 全部、`node tools/sim.js 50` |
| C 画面側 | `src/ui/battle_scene.js`、`src/ui/mormo_scene.js`（ボタン2つ）、`src/ui/ui.js`（結果画面・負傷バッジ・`deploy({offerRetreat:true})`・`settleBattle` 呼び出し）、`src/styles.css`、`tools/browser-tests/retreat.js`、`run-all.sh` に登録 | `run-all.sh` 全通過 |

A と B の間は「battle.js が出すが run.js が読まない」状態で、ゲームの挙動は変わらない（改造癖のコミットA/Bと同じ形）。B と C の間は「run.js が受けられるが UI が渡さない」状態で、これも挙動は変わらない。

## 6. 落とし穴（既に踏んだもの）

- **`alive` と `onField`**：戦闘中に「行動する側」「立っている側」を探すときは `onField`（生きていて不在でない）。`alive` は生死判定にだけ使う。「暴食の宴」が `alive` で判定して、遅刻で不在のオーガが透明のまま殴っていた。
- **`skip()` は `render()` を通らない**：早送りは独自経路。`render()` にだけ処理を足すと、飛ばしたときに状態が残る（遅刻の「遅刻中」枠が残った）。共通の関数に切り出して両方から呼ぶ。撤退では「提案に答える前は提案で止まる」を `skip()` にも入れる。
- **`speakAside` は二重に止まらない**：`mormoAwaiting` 中に呼ぶと `false` を返して字幕へ落ちる。提案の直前に別の一言（大食漢の食事など）が止めていると提案が字幕に落ちて選べなくなる。提案は**必ず止める**必要があるので、`speakAside` ではなく専用の入口（`askRetreat`）を作り、`mormoAwaiting` を待ってから出すか、提案イベントの描画時点で先の一言を強制的に閉じる。どちらでも良いが、テスト 4.4 で「大食漢が同じラウンドに食べた戦闘」を一つ入れて確かめる。
- **`UI.set()` は見出し文字列から scene クラスを推定する**：結果画面の見出しを「勝利！」から変えると `game-scene-report` 等の推定が外れることがある。`set(html, "report")` のように第2引数で明示する。
- **`departmentRoster("combat")` は「今出撃している者」**：出撃候補の全員が欲しければ `st.roster`。負傷の判定を足すときに間違えやすい。
- **`deploy()` は sim とテスト58本が引数なしで呼ぶ**：既定の挙動を変えると全部が別の意味になる。`offerRetreat` は UI だけが渡す。
- **KPI・戦果の1文（`spotlightSentence`）・魔界史は `lastBattle` を読む**：撤退の `lastBattle` にも `contribution`・`timeline`・`chainSummary` を今と同じ形で入れる。欠けると結果画面や魔界史で落ちる。`grep -n "lastBattle\." src/ui/ui.js src/core/*.js` で読み手を洗ってから形を決める。

## 7. 未決（実装前にオーナーへ。答えが無ければ括弧内の既定で進める）

- **U1** 開幕3日間の防衛戦（`openingPrototype`、勇者が城に来る戦い）で退くと何が起きるか。城を明け渡す意味になるが、今は「防衛失敗＝敗北」の処理しか無い。（既定：開幕の防衛戦では**提案しない**。遠征では提案する。防衛戦の撤退は LP の仕様と一緒に決める）
- **U2** 最終戦（`isFinalBattle`）で退けるか。（既定：退ける。結末は通常の撤退と同じで、征服は進まない）
- **U3** 撤退時の略奪金貨。2.2 では没収にした。「退く判断を軽くしすぎない」ため。（既定：没収）
- **U4** 負傷の長さ。2.4 では「次の1戦だけ」。（既定：1戦。LP の仕様で見直す）

## 8. 完了の報告に含めること

- 4.1 の sim 数値（実装前 3 回・後 3 回の平均）。
- 4.2〜4.4 のテスト結果（通過数）。
- 未決 U1〜U4 のうち既定で進めたもの。
- 仕様から外れた点があれば、何をどう変えたかと理由。
