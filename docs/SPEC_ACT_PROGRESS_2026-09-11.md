# 仕様：幕の進行——第一幕の着地から第二幕へ（run.js）（2026-09-11）

実装担当：Opus。設計は `docs/DESIGN_ACT2_2026-09-11.md`、中身は `docs/SPEC_ACT2_CONTENT_2026-09-11.md`（済み `d22f2e3`）。
**CodeX が `src/ui/ui.js`・`src/main.js`・`src/styles.css` を組み替え中（城のメニュー）。UI 側は触らない**（例外は 4.3 の1か所）。
迷ったら末尾「未決」を見て、無ければ**いちばん小さく、今の動作に近い**ほうを選び、コミットメッセージに書く。

## 0. 一文で

**勇者戦は幕切れ。** 王都を落としても勇者を退けても、ランは終わらず第二幕が始まる。名簿・施設・蔵・伝承・魔王軍レベルは持ち越し、警戒は0から、敵の段階表と応募の種族が広がり、勇者は段階14で戻ってくる。第二幕の着地（連合本陣の陥落 か 勇者の再撃退）で今までどおり「クリア」（魔界史）。第三幕は後日。

## 1. 触ってよいファイル

- `src/core/run.js` — 幕の状態と切り替え、段階表・征服上限・応募テンプレートの幕ごとの切り替え、討伐隊の下限、勇者の再来。
- `src/main.js` — **`battleReport()` に幕替わりの分岐を1つだけ**（4.3）。他は触らない。
- `src/data/enemies.js` `src/data/monsters.js` — 読むだけ（`ENEMY_STAGES_ACT2` `ACT_STAGE_CAP` `MONSTER_TEMPLATES_ACT2` は既にある）。
- `tools/test-act-progress.js`（新規）、`tools/sim.js`（読み込みに `counterattack.js` が無ければ足すだけ。戦略は変えない）、`HANDOFF.md` §0 に5行・§2 に契約1節。
- `tools/test-act2-content.js` の「今の幕で出ない」検査は幕1のまま通ること（`st.act` 既定 1）。

触らない：`src/ui/*`、`src/core/battle.js`、`src/data/*` の中身。

## 2. 状態と導出

- `st.act`：1 か 2（`newRun` で 1、`migrateState` で無ければ 1）。`Game.MAX_ACT = 2`（第三幕は後日）。
- `Game.actStages()`：`st.act >= 2 ? ENEMY_STAGES.concat(ENEMY_STAGES_ACT2) : ENEMY_STAGES`。
  **run.js の `ENEMY_STAGES[...]` / `ENEMY_STAGES.length` の参照を全部これに置き換える**（`stageData` / `buildMission` / `campaignLevel` の上限 / `checkCounterattack` / 段階の慣れ / 魔界史の地域）。`grep -n "ENEMY_STAGES" src/core/run.js` で漏れを確認し、報告に一覧を付ける。
- `Game.MAX_CONQUEST`：定数から **getter** に（`get MAX_CONQUEST() { return ACT_STAGE_CAP[this.state?.act || 1] || ENEMY_STAGES.length; }`）。`ui.js` は `Game.MAX_CONQUEST` を読んでいるだけなので変えなくて済む。
- `Game.templates()`：`st.act >= 2 ? MONSTER_TEMPLATES.concat(MONSTER_TEMPLATES_ACT2) : MONSTER_TEMPLATES`。run.js の `MONSTER_TEMPLATES` 参照（5か所：応募の重み・強制テンプレート・`tpl` 参照2・legacyReturn）を置き換える。tier 4 の重みは tier 3 と同じ枝で、**第二幕では ×1.5**（新しい顔が来た、と分かる程度）。
- 魔王軍レベル（`campaignLevel`）の上限は `MAX_CONQUEST`（幕の上限）。第二幕では 14 まで伸びる。応募者の伸び（`applicantGrowth`）はそのまま。

## 3. 切り替え（`Game.beginAct(next, by)`）

第一幕で今 `phase = "clear"` になる2か所（`settleContinue`：`heroDefense` の勝ち／`conquest >= MAX_CONQUEST`）を：
- `st.act < MAX_ACT` なら `beginAct(st.act + 1, "defense" | "conquest")` → `phase = "result"`、`genApplicants()`。
- `st.act >= MAX_ACT` なら今までどおり `"clear"`（`clearedBy` はそのまま "defense" / "conquest"）。

`beginAct` の中身：
- `st.act = next`、`st.actStartedTurn = st.turn`、`st.actHistory.push({ act: prev, by, turn })`。
- `st.alert = 0`、`st.counterattack = null`、`st.heroCame = false`（次の幕の勇者は段階14で来る）。
- `st.conquest` は**そのまま**（8）。第二幕の進軍は 9 から。`st.stage` の互換値も追随。
- `st.lastBattle.actAdvance = { from: prev, to: next, by }`（結果画面・モルモの報告が読む）。
- `notes.push(...)`：by が "conquest" なら「王都は落ちた。だが王は隣国へ逃げ、援軍を呼んだ。第二幕」、"defense" なら「勇者は退いた。だが隣国の援軍を連れて戻るだろう。第二幕」。
- 痕跡：`this.trace("act", null, null, { act: next, by })`（kind `act` を `TRACE_KINDS` に足す：「幕」`第{data.act}幕が始まった`。**traces.js に行を足すのは例外として許す**）。

## 4. 幕ごとの規則

### 4.1 討伐隊の下限
`checkCounterattack` の討伐隊の段階：`U.clamp(armyLevel(), floor, cap - 2)` で `floor = st.act >= 2 ? 8 : 0`（第二幕の討伐隊は段階9以上）。勇者：`armyLevel() >= MAX_CONQUEST && !heroCame` で段階 `actStages()[MAX_CONQUEST - 1]`（第二幕なら段階14「勇者アレン一行（再）」）。

### 4.2 第二幕の着地
- 王都攻略に相当：`conquest >= 14`。勇者撃退に相当：段階14の防衛戦に勝つ。どちらも `MAX_ACT` なので `"clear"`。`endRun` の record に `act: st.act` と `actHistory` を足す（魔界史の cause は「第二幕を制した」等。**ui.js の魔界史は触らないので、cause 文字列に幕を含める**：「第二幕・王都攻略」「第二幕・勇者撃退」）。
- 城陥落（勇者に負け）は幕を問わず今の規則（荒らされ・再建・勇者はまた来る）。

### 4.3 モルモの報告（main.js `battleReport()`、1分岐だけ）
`lastBattle.actAdvance` があれば、通常の勝利報告の**前に**一枚：表情 `report`、kicker「幕替わり」、文は 3 の notes と同じ内容を「デス」口調で。既存の `MormoScene.show` の呼び方を写す。他の分岐は触らない。

### 4.4 sim
`tools/sim.js` は第一幕の着地で「クリア」を数えている。第二幕が入るとランが続くので、**sim の「クリア」は `phase === "clear"`（第二幕の着地）のまま**でよい。ただし戦闘数が伸びる。煙感知器の2点（0%の戦略なし・戦闘数の急減なし）だけ見る。**クリア率が下がっても直さない**（オーナー方針）。報告に「幕替わりまで到達したラン数」と「第二幕クリア数」を1行。

## 5. テスト `tools/test-act-progress.js`
ハーネスは `tools/test-enemy-growth.js` を写す。
- 第一幕：`act === 1`、`MAX_CONQUEST === 8`、`actStages().length === 8`、`templates().length === MONSTER_TEMPLATES.length`。`rollApplicant` 200回で tier 4 が混ざらない。
- 勇者の防衛戦に勝つ → `act === 2`、`phase === "result"`、`alert === 0`、`heroCame === false`、`counterattack === null`、`conquest === 8`、`lastBattle.actAdvance.by === "defense"`、notes に「第二幕」、痕跡 `act`。
- 征服8に達する → 同じく第二幕（by "conquest"）。
- 第二幕：`MAX_CONQUEST === 14`、進軍で段階9の作戦が作れる（`baseStage === 9`）、`armyLevel()` が 14 まで伸びる、`rollApplicant` 200回で tier 4 が**混ざる**、討伐隊が段階9以上、`armyLevel() >= 14` で勇者（再）が来る（`counterattack.kind === "hero"`、armyName に「再」）。
- 第二幕で勇者（再）に勝つ → `phase === "clear"`、record.cause に「第二幕」。征服14 → 同じ。
- 第二幕で城陥落 → 幕はそのまま、勇者はまた来る。
- 旧セーブ（`act` 無し）→ 1。第一幕クリア済みの旧セーブは触らない。
- 既存 node 全通過（`test-act2-content` の「今の幕で出ない」は幕1で通る）。sim 1回。

## 6. 落とし穴
- `ENEMY_STAGES` の参照漏れ（`stageData` の既定・魔界史の `region`・`enemyPreview` 用の導出）。grep で全部。
- `MAX_CONQUEST` を getter にすると `Game.MAX_CONQUEST` を**代入**している箇所があれば壊れる（無いはず。grep）。
- `settleContinue` の `"clear"` 分岐は**2つ**（heroDefense と conquest）。片方だけ変えない。
- `heroCame` を戻すのは `beginAct` の中だけ。城陥落（`castleFalls`）の戻しは既存のまま。
- 第二幕の段階 index は 8〜13。`stageFights`（慣れ）はそのまま index で数える。

## 7. 未決（既定）
- U1 幕替わりで応募者を引き直すか。既定：引き直す（`genApplicants()`。新種族が見える）。
- U2 第二幕の討伐隊の下限。既定：段階9。
- U3 暴走（rampage）の `autoLimit` が modDealt の受け身技に効かない件。既定：この仕様では触らない（HANDOFF に残す）。
- U4 第二幕の魔界史の cause 文字列。既定：「第二幕・王都攻略」「第二幕・勇者撃退」。
