# 設計・仕様：コマンドバトル——自動戦闘をやめ、毎ラウンド全員に指示する（2026-09-11）

オーナー決定（2026-09-11 夜）：
- 自動戦闘をやめて手動にする。理由：目的が「サクッと1ラン」（Balatro 的）から「人物への愛着・育成・そこに波乱」へ移った。
  波乱が映えるには正規ルートの手応えが要り、手応えは戦闘の中身から来る。育てた技を自分で使うところに愛着が宿る。
- ロマサガ系のコマンドバトル。最初は「たたかう」「まもる」くらい。技が増え、連携・相性・バフ・痕跡からの波乱が加わって深みが出る。
- 戦闘に時間はかけてよい（普通の RPG は3分、ボスは長くてよい）。ただし おまかせ（自動）と速度倍は残す。
- 敵の構えは**大技のときだけ**見せる。**毎ラウンド全員に指示**（古き良きコマンドバトル）。テンポが死んだら考える。

段階0（この文書の実装範囲、Claude が 2026-09-11 深夜に実装）。段階1〜3 は末尾。

## 0. 一文で

**ラウンドの頭で止まり、戦場の味方それぞれに たたかう／まもる／技／おまかせ を指示し、決定で解決する。** 敵は大技の前に構えを見せる。
退くのは指示パネルのボタン。おまかせで最後まで／最後まで飛ばす は自動で回す。エンジンは「先に全部計算」から「指示を受けてラウンドごとに解決」へ。

## 1. 指示（コマンド）

| 指示 | 効果 | 備考 |
|---|---|---|
| たたかう | 通常攻撃。狙い（敵）を指定できる。指定しなければ今までどおり前から（先頭60%） | 癖・特性は今までどおり勝手に効く |
| まもる | このラウンドは攻撃せず、受けるダメージ半減（敵対攻撃のみ） | 大技の受けに使う |
| 技 | 気合（技の cost）を払い、種族技の条件を飛ばして必ず出す | 号令と違い **+50% も息切れも無い**。気合が足りなければ たたかう に落ちる |
| おまかせ | その者だけ自動（今までの自動戦闘の判断） | 既定は「たたかう」 |
| 退く | 倒れた者がいれば（撤退の提案と同じ条件）。担いで帰る | パネル下のボタン |

- 「全員たたかう」「この戦いはおまかせ」「以後もおまかせ」「退く」は先頭の者の窓の下段にだけ出す。**決定ボタンは無い**（最後の一人が決めた瞬間に開始）。

### 1.1 指示窓（ロマサガ流、2026-09-12 オーナー決定で置き換え）

ロマサガ1〜3の型：味方の帯に指示中の者のカーソル、戦場の上に浮く縦メニュー、隊列の先頭から一人ずつ、決めたら次の者、
狙いは敵の上のカーソルで選ぶ、Bで一人前へ、最後の一人で開始。これを次のように写した。

- 窓は `#scene` の中に浮く（不透明度60%・ぼかし）。**味方の列の右・戦場の中央の高さ**に置き、指示中の者を隠さない
  （斜め配置の戦場では味方が左39%、敵が右39%。窓は敵側に重なるが、狙い選び中は上の細い帯に変わって敵を全部見せる）。
- 指示中の者：札が明るく大きくなり ▼ が頭上で揺れる。他の者は暗くなる。決めた者には ⚔🛡✨🤖 の印。
- 窓の中身：ラウンド／n人目、名前・HP・気合・状態、⚠ 大技の予告。縦に たたかう／まもる／技「名」気合n／おまかせ。
  下段に もどる（先頭では押せない）。前ラウンドの選択に ▶ が付く（「前と同じ」の代わり）。
- たたかう／技 → 敵が2体以上なら狙い選び：窓が「狙う敵をタップ／前から／もどる」の帯になり、敵の札が橙に脈打つ。
  敵の札をタップで確定。敵が1体なら省いて即決定。
- 味方の札をタップすると、その者の窓へ飛べる（決め直し）。
- `#command-panel` の `data-unit`（指示中の id）と `data-mode`（`menu`／`target`）をテストが見る。

- 敵の**大技**：2ラウンド目以降、各敵は 15% で「構え」（そのラウンドは攻撃しない。`intent` イベント）。次のラウンドの攻撃は ×1.8。
  指示パネルと敵の枠に ⚠ で見せる（まもるの根拠）。自動戦闘でも同じ規則（`ENEMY_BIG_MOVE`）。
- 号令（自動戦闘の節目）は UI の既定から外れた（コマンドの「技」がその役）。エンジンには残っており、sim・テストは今までどおり動く。

## 2. 契約

### 2.1 エンジン（`src/core/battle.js`）
- `_simulate` は生成器 `*_battle(p, e, options)`。`Battle.simulate()` は生成器を自動で最後まで回す（**既定の挙動は変わらない**。ただし敵の大技が加わった）。
- `Battle.start(p, e, options)` → 取っ手 `{ timeline, next(commands), done, result, prompt }`。
  - `next()` の戻り：`{ type: "commands", round, allies: [{ id, uid, name, hp, maxHp, spirit, winded, stuffed, mercenary, skill: { id, name, label, note, cost, ready } | null }], enemies: [{ id, name, hp, maxHp, intent: "attack" | "big" }], canRetreat, downed: [名前], timelineLength }` か `{ type: "end", result }`。
  - `commands`：`{ [unitId]: { cmd: "attack" | "guard" | "skill" | "auto", target?: enemyId } }`、または `{ retreat: true }`。
  - 乱数の種（`options.seed`）は `next()` のたびに差し替えて戻す。止まっている間は他の乱数を汚さない。
  - 手動で退いた結果：`result.retreated === true`、`result.retreatOffer.contribution`（担いで帰る戦果）、`result` イベントに `retreated: true`。
  - `result.spiritSpent`：`{ uid: 払った気合 }`。
- 新イベント：`intent { unitId, name, intent: "big" }`、`note { guarding: true }`、`order_exec` に `manual: true, cost`、`retreat_offer` に `manual: true`（手動の退却。提案ではない）。
- `applyDamage`：`target.flags.guarding` で半減（`traits` に「まもる」）。`act()`：`actionOpts.target` で狙い。`flags.bigMove` で ×1.8。

### 2.2 run.js
- `Game.deploy({ manual: true })`（UI の既定）：計算せず `Battle.start` の取っ手を `Game.liveBattle` に持ち、`st.pendingBattle = { result: null, manual: true, replay, … }`、`phase = "battle"`。戻り `{ handle, notes, stageData, manual: true }`。
- `Game.finishManualBattle(result)`：気合の支払いを名簿へ反映 → `recordBattleResult` → 退いたなら `settleRetreat`、それ以外は `settleContinue`。**決着経路は二つのまま。**
- リロード：`pendingBattle.result` が無く `replay` があれば、おまかせで計算して続行として決着（指示は失われる）。
- 引数なし `deploy()`（sim・テスト）は今までどおり自動で即決着。

### 2.3 描画（`src/ui/battle_scene.js`）
- `BattleScene.playManual(handle, onEnd)`：取っ手のタイムライン（同じ配列）を再生し、末尾に来たら `awaitCommands()` → 指示パネル（`#command-panel`）。決定で `submitCommands(commands)` → `handle.next()` → 続きを再生。`type: "end"` で `onEnd(result)`（＝`Game.finishManualBattle`）。
- `skip()`／「おまかせで最後まで」：`autoRest = true` にして取っ手を自動で最後まで回してから飛ばす。**既存のブラウザテスト（`skip()` → `finished`）はそのまま通る。**
- `retreat_offer` の `manual` は止めない（字幕だけ）。`intent` は敵の枠に ⚠。
- 指示窓：`renderCommandPanel(prompt)` が `cmdSeq = { round, idx, mode, commands }` で一人ずつ進める。`decideCommand(id, cmd, target)` で
  次の者へ、最後なら `submitCommands`。敵タップ／味方タップは `bindBattlefieldTaps()`（`#scene` に一度だけ委譲）。
  `cmdall`（全員たたかう／おまかせ／退く）は先頭の窓にだけあり、押した瞬間に送る。
- `UI.battleManual(out)`（ui.js）、`main.js` の `deploy` は `Game.deploy({ manual: true })`。

## 3. 落とし穴
- **yield は生成器本体でだけ**（`act` / `applyDamage` などの閉包の中では止まれない）。指示はラウンドの頭で一括して受ける。
- **指示待ちの間に乱数を消費しない**（プロンプトの組み立てに `U.*` を使わない）。
- `U.chance = () => true` で固定するテストは敵が毎ラウンド構える → `ENEMY_BIG_MOVE.chance = 0` にして検査（`test-skills-battle`）。
- 気合はエンジンが `unit.spirit` から引き、`spiritSpent` で名簿へ戻す。二重に引かない。
- おまかせの一人だけ自動：技は今までの規則（お披露目以外は出ない）。「おまかせなら技も勝手に出る」にはしていない（未決 U2）。

## 4. 検証
- `tools/test-command-battle.js`（25件）：指示待ちの形、まもる、狙い、技（気合・+50%なし・息切れなし）、退く、おまかせ＝simulate と一致、大技の構え。
- node 全通過、run-all 全通過（`retreat.js` `order.js` は手動の導線に書き換え）。

## 5. 未決（既定）
- U1 まもるの半減率 50%。既定 50%。
- U2 おまかせの一人が技を使うか。既定：使わない（自動戦闘の規則のまま）。
- U3 大技の頻度 15%・倍率 1.8。既定のまま、試遊で見る。
- U4 号令（自動戦闘の節目）をエンジンから消すか。既定：残す（sim とテストの土台。UI からは外れている）。

## 6. 次の段階
- **段階1 隊列**：前列2・後列3を明示。単体攻撃は前列にしか届かず、前列が倒れると後列が晒される。今の「先頭60%」を目に見える規則に。
- **段階2 連携と相性**：同じラウンドに味方が続けて技を使うと連携（CHAIN と戦意を流用）。攻撃の種類（斬・打・術）と敵の弱点。
- **段階3 波乱**：痕跡と癖が命令に干渉（酒が残って命令を聞かない、臆病者が勝手に下がる、敵の乱入）。
