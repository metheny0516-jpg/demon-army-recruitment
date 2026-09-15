# 仕様：敵将と三本の糸・段階B/D ― 部族の首領、見逃す／雇う、最終戦の顔ぶれ（2026-09-15、Claude）

設計：`docs/DESIGN_CAMPAIGN_ROUTE_2026-09-15.md`（第2版）、`docs/DESIGN_WORLD_CAMPAIGN_2026-09-15.md` 3節・5節。
前提：段階A（`docs/SPEC_TERRITORY_A_2026-09-15.md`）が run.js に入っていること。オーナー判断（2026-09-15）：顔役3人・第一幕から・先代の英雄を含む。

## 0. 一文で

**名前のある敵将13人（村の糸1・魔界の首領7・王国の糸6）が、部族圏の守備や「⚠ ○○がいる」札や不意打ちで隊列の先頭に乗る。コマンドバトルで HP 30% を切ると「見逃す／雇う」が一度だけ出る。討った・見逃した・雇ったの記録で、最終戦の勇者一行の顔ぶれが変わる。**

## 1. エンジン側（Claude・済み 2026-09-15）

- `src/data/enemy_captains.js`：`ENEMY_CAPTAINS`（13人。thread／role／stats／traits（既存の癖1つ）／offer（spare・hire・null）／joinsHero／hire（雇ったときの種族・忠誠・職）／lines（CodeX が埋める））、`CAPTAIN_RULES`（数値はここだけ）。部族の首領は `territories.js` の `chief.id` と同じ id。
- `src/core/captains.js`：`Captains`（純粋関数）
  - `init/state/mark(st, id, status)`：`st.captains[id] = { status: unseen|alive|slain|spared|hired, seen }`。
  - `attach(units, id, st, scale)`：隊列の先頭に敵将を乗せる（`captain: { id, offer }` 付き。ポルカは会った回数で +15%/回、3回まで）。
  - `settle(st, result, captainIds)`：戦闘結果から状態を更新（`result.spared` → spared/hired、討たれて勝ち → slain、それ以外 → alive）。
  - `pickForCard(st, thread, settles)`：「⚠ ○○がいる」札に乗せる敵将（3決着に1回、討った・雇った・見逃した者は出ない）。
  - `ambush(st, alert, rng, hallAvailable)`：不意打ち（警戒 0〜10 で 0〜15%。4割は先代の英雄）。
  - `heroParty(st, baseUnits, scale)`：最終戦の隊列（勇者＋3枠を討たれず雇われもしなかった joinsHero から。足りなければ既定の3人）。
  - `summary(st)`：魔界史の材料（討った・雇った・見逃した名前）。
- `src/core/battle.js`：
  - `makeUnit` が `captain` を写す。ダメージイベントに `toCaptain`。
  - コマンドバトルの prompt に `canSpare: { id, captainId, name, kind }`（敵将が立っていて HP 30% 以下、1戦闘1回）。`enemies[].captain`。
  - `next({ spare: true })` で敵将は戦場を去る（`spare` イベント、`flags.spared`）。残りの敵との戦いは続き、敵将を数に入れずに勝敗を見る。断れば二度と聞かない。
  - `result.spared = [{ id, unitId, name, kind }]`。自動戦闘（simulate）では提案は出ない（sim は「討つ」扱い）。
- `tools/test-captains.js`（28件）。

## 2. run.js 側（Opus。段階A の後）

触るファイル：`src/core/run.js`、`src/ui/ui.js`（札の一行・提案の窓）、`src/ui/battle_scene.js`（`canSpare` の窓は**撤退の提案と同じ窓**に「見逃す／雇う」を足す。既存の `answerRetreat` の型）、`index.html`（script 2行：`src/data/enemy_captains.js` を `territories.js` の後、`src/core/captains.js` を `core/territory.js` の後）、`tools/sim.js`、テスト。**battle.js・enemy_captains.js・captains.js は触らない**。

### 2-1. 状態
- `st.captains`（`Captains.init`）。`migrateState` で旧セーブに `{}`。
- 雇った敵将：`result.spared` の `kind === "hire"` を `ENEMY_CAPTAINS[id].hire`（種族・忠誠・癖・職）で名簿に足す（`rollApplicant` と同じ形の1体。名前は敵将の short）。ザガンは「将軍候補」の職で忠誠30。

### 2-2. 隊列に乗せる（`buildMission` の後、敵の units を作るところ）
- 部族圏（段階A の suppress 型）に `chief` があり `st.captains[chief.id].status` が slain/hired でなければ `Captains.attach(units, chief.id, st, scale)`。**部族の首領は「贈る」を消す**（`Territory.tributeCost` が null を返す。既に入っている）。
- 関門（`gate: true` の土地）：`ENEMY_CAPTAINS` の `gate === landId` の者（ガレス＝h11）を乗せる。
- 「⚠ ○○がいる」札：`Captains.pickForCard(st, thread, st.settles)` が返した者を、村の糸なら村・集落の土地の候補に、王国の糸なら関所以降の土地の候補に乗せる。札の頭に `⚠ ${short}がいる`、報酬 `bountyMult`。
- 不意打ち：前哨戦を踏んでいない・訓練でも防衛でもない作戦で `Captains.ambush(st, st.alert, U.rand, hall.length > 0)`。`captain` なら attach、`hall` なら**殿堂から1体**（過去ランの功労者の名前・種族・技をそのまま。`captain: { id: "hall:" + name, offer: null }`）。開戦の一枚でモルモ「……隊列に見ない顔がいる」。
- 戦闘後：`Captains.settle(st, result, 乗せた敵将の id 一覧)`。討てば首級（金 `bountyMult`、名声 `fame`、殿堂の一行「○○を討った」）。

### 2-3. 最終戦
- 都（capital）の守備隊は `Captains.heroParty(st, ENEMY_STAGES[garrison-1].units, scale)`。勇者アレンの隣に「討たなかった者」が立つ。雇った者がこちらの隊列にいれば、開戦の一言で勇者「……お前も、そちらか」。
- ガレスを討っていれば勇者の `hero_awaken` の閾値を 50%→70% に（師を失って覚醒が早まる。`traits` は触らず、run.js が勇者の unit spec に `awakenAt: 0.7` を持たせる。`makeUnit` と `hero_awaken` は `awakenAt` を読む（済み））。

### 2-4. sim
- 列に「討った敵将」「雇った」「最終戦の顔ぶれ（既定／混成）」。sim は提案に答えないので全部「討つ」。受け入れ条件：完走、クリア率は今の帯、最終戦の顔ぶれが「既定3人」だけにならない（討ち損ねた者が残る）。

### 2-5. テスト
- `tools/test-captains-run.js` 新規（5件）：部族の首領が守備に乗る／札に「⚠」が3決着に1回／雇うと名簿に増える／討つと首級／都の隊列が討たなかった者で埋まる。
- ブラウザ `tools/browser-tests/retreat.js` に1件（見逃す／雇うの窓）。

## 3. 文章と絵（CodeX）
- `src/data/enemy_captains.js` の `lines` を埋める：13人×（登場 enter 3本・敗北 beaten 3本・見逃し spared か雇用 hired 3本）。ポルカは3回分の登場（威勢→装備→本気）。ガレスは「一人も死なせない」。ザガンは「本当の魔王軍」。中高生に伝わる言い方、1本 40 字以内。**`lines` 以外の値は触らない**。
- 履歴書写真13枚（`assets/monsters/captains/<id>.png`、既存の履歴書写真と同じ画風）、戦闘ポーズは役の絵を流用（後で）。

## 4. 貼り付け用（CodeX 用）
```
Astra へ。docs/SPEC_CAPTAINS_BD_2026-09-15.md の §3 をお願いします。src/data/enemy_captains.js の13人の lines（enter 3本・beaten 3本・spared か hired 3本）を埋めてください。lines 以外の値は触らない。ポルカは登場3回分（威勢→装備→本気）、ガレスは「一人も死なせない」、ザガンは「本当の魔王軍」。1本40字以内、中高生に伝わる言い方。履歴書写真13枚を assets/monsters/captains/<id>.png に（既存の履歴書写真と同じ画風）。ブランチ codex/captains-lines、作業ブランチ claude/hero-arrival-tavern-prototype-uy2toh から切って push。
```

## 5. 貼り付け用（Opus 用。段階A の後）
```
Opus へ。まず git pull。docs/SPEC_CAPTAINS_BD_2026-09-15.md の §2 を実装して。エンジン側は済み（src/data/enemy_captains.js・src/core/captains.js・battle.js の canSpare と result.spared。tools/test-captains.js に使い方）。触るのは run.js・ui.js・battle_scene.js（見逃す／雇うの窓＝撤退の窓に足す）・index.html（script 2行）・sim.js・テストだけ。battle.js・enemy_captains.js・captains.js は触らない。コミットは (a) 状態と隊列に乗せる (b) 見逃す／雇うと首級 (c) 最終戦の顔ぶれ (d) sim とテスト の4つ。run.js と battle.js を同じコミットに入れない。node 全件・sim 20・ブラウザテストを直列で回して緑を確認してから push。
```
