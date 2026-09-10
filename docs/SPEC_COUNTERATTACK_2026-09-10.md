# 仕様：王国の反撃——防衛戦のリズムと着地（2026-09-10・確定）

実装担当者向け。この文書と `HANDOFF.md` §0・§2 だけで始められる。
迷ったら末尾「未決」を見て、無ければ**いちばん小さく、いちばん今の動作に近い**ほうを選び、コミットメッセージに書く。
担当：Opus。順番は **種族技 C・D → 全滅後の再建（`SPEC_WIPE_REBUILD`）→ この仕様**。`run.js` の作戦会議と決着処理を触るので、前の2つが入ってから。

## 0. 一文で

**王国は黙っていない。** こちらの動きで王国の警戒が溜まり、閾値を超えると討伐隊が城へ来る。次の作戦会議は「城を守る」一択。守れば警戒が下がり名が上がる。守れなければ城が荒らされる。
**そして、どのランも勇者アレン戦で終わる。** 攻めれば王都で、待てば魔王城で。開幕3日目の勇者襲来が最初の反撃、最後の勇者襲来が最後の反撃。

オーナー決定（2026-09-10）：時計は警戒度／負けたら施設・食料・遺物を失う（人は取らない）／防衛戦も出撃隊5人／開幕の勇者襲来を同じ仕組みに乗せる／着地は「攻めれば王都、待てば魔王城、どちらも勇者戦」、城陥落は再建なしの終わり。
**これはプロトタイプの着地（20戦前後）。** 確立したら中盤（新モンスター・新技・新敵）と終盤（クライマックス）を足して無料版の完成へ広げる。だから段階表・討伐隊・勇者戦は**全部データ駆動**で作り、幕を足せる形にする（7節）。

## 進め方（オーナー指示 2026-09-10・全仕様共通）

- 速度優先。軽いモデルのサブエージェントを2〜10体並列（調査・ファイル単位の編集・テスト・台詞）。担当ファイルを重ねない。統合とコミットは親。
- 重い処理は直列（sim・run-all・browser-tests は一度に一つ。4コアなら sim 3本並列は可、browser-tests と同時は不可）。
- `run.js` と `battle.js` は同じコミットで触らない。**この仕様は battle.js を触らない。**

## 1. 目的と、やらないこと

目的：
- 敵が攻めてこない、を直す。進軍のタイミングと人材の入れ替えが急かされる。
- 警戒度（`st.alert`）に意味を持たせる（今は敵の能力 +2%/pt だけで、プレイヤーに見えない）。
- 「略奪→反撃」を無限に続けられないようにし、ランの終わりを仕組みで決める。
- 開幕の勇者襲来と最後の勇者戦を同じ仕組みに乗せ、別物を減らす。

やらないこと：
- 王国側の内政・外交・和平。討伐隊の固有人物・脚本（名前と編成は段階表とバリエーションから）。
- 捕虜・行方不明（LP の仕様）。城の攻防の専用戦闘（城壁・門・籠城）。
- 留守番が防衛戦に参加すること（未決 U3。今回は出撃隊5人）。
- 中盤・終盤のコンテンツそのもの（7節は「足せる形」だけ）。

## 2. ルール

### 2.1 時計＝警戒度

`st.alert` を時計にする。新しいパラメータは作らない。値は data（`src/data/counterattack.js` 新規、`COUNTERATTACK`）に置く。

| 出来事 | 警戒度 |
|---|---|
| 略奪に勝つ | +2（既存） |
| 鎮圧に勝つ | +1（既存） |
| 進軍に勝つ | **+2**（今は 0。`missions.js` の `invade.alertDelta` を 2 に） |
| 撤退・判定負け | +1（既存の撤退と同じ） |
| **全滅** | **+3**（王国が「魔王軍は崩れた」と見る。再建して殴り続ける遊び方に反撃が先に来る） |
| 城の接収 | +既存の `SEIZE_ALERT_COST` |
| 防衛戦に勝つ | −`threshold`（0 まで） |
| 防衛戦に負ける | −`threshold / 2`（荒らして満足して帰る） |

`COUNTERATTACK.threshold = 6`。**判定**は決着処理の最後（`checkCounterattack()`）：`alert >= threshold` なら必ず予約、`alert >= threshold − 1` なら 50%（`U.chance`）で予約。予約は `st.counterattack = { pending: true, kind: "punitive" | "hero", armyName }`。既に予約中なら何もしない。

### 2.2 予告と一択

予約が立った決着の直後、モルモが報告する（`main.js battleReport()` の末尾に一言追加。撃退の分岐の後に付け足す形。「魔王様、王国が討伐隊を出しました。次は、こちらへ来マス」／勇者なら「魔王様。……勇者です。こちらへ来マス」）。
**次の作戦会議は `defend` 一択**：`prepareMissions` は `st.counterattack.pending` なら `MISSION_TYPES.defend` だけを `buildMission` して返す。作戦カードには討伐隊の名と編成のヒント（既存の `hint`）。
予告は必ず1手番前。奇襲はしない（採用と編成で備える時間を作るのが目的）。**予約中は面接・編成は通常どおり**（ここで備える）。

### 2.3 討伐隊と勇者

`MISSION_TYPES.defend`（`missions.js`）：`title: "城を守る"`、`enemyTierOffset: +1`、`enemyMult: 1.0`、`reward: 0`、`foodReward: 0`、`alertDelta: 0`（警戒の増減は 2.4 で別に扱う）、`conquestDelta: 0`。
- **討伐隊**（`kind: "punitive"`）：段階表を魔王軍レベル＋1で引く。上限は段階7（聖騎士団）。隊の名は「{段階の army}討伐隊」。バリエーションは既存の抽選。
- **勇者**（`kind: "hero"`）：予約時点で `armyLevel === 8`（最大）なら討伐隊ではなく**勇者アレン一行**（段階8）が来る。名は「勇者アレン一行」のまま。`baseStage = 8`。
- 勇者は**ラン中1回だけ**来る（`st.heroCame = true`）。勇者を退けた後に警戒が溜まっても、もう反撃は来ない（クリア済み）。

### 2.4 結末

`settleContinue` / `settleRetreat` の中で、`stageData.missionKind === "defend"` のときだけ分岐する（**三つ目の決着経路は作らない**。既存の勝敗・撤退・全滅の処理に「防衛戦なら」を足す）。

- **勝つ**：警戒度 −threshold。報酬は無いが**押収**：建材 +2・食料 +2（`notes`）。`st.renownBonus = 1`（次の面接だけ応募者 +1。`applicantCount()` で読んで消費）。`st.defenses.won++`。
  - 勇者に勝てば **クリア**（`st.phase = "clear"`。進軍でのクリアと同じ流れ。`endRun(true)`）。魔界史に「魔王城で勇者を退けた」（`record.clearedBy = "defense"`。進軍なら `"conquest"`）。
- **撤退・判定負け**：城を明け渡して山へ逃げる扱い。倒れた者は担いで帰る（負傷、既存）。**荒らされる**（下）。警戒度 −threshold/2。`st.defenses.lost++`。
  - 勇者戦での撤退は**城陥落**：`st.phase = "gameover"`、`endRun(false)`、`record.cause = "城陥落"`。再建なし。
- **全滅**：`SPEC_WIPE_REBUILD` のとおり出撃隊は戦死。さらに荒らされる。勇者戦なら城陥落。

**荒らされる**（`Game.ransack(notes)`）：施設レベル −1（`buildProgress` はその段階の `buildThreshold` に戻す。Lv0 なら何もしない）、食料半減（切り捨て）、**蔵の遺物を1つ持ち去られる**（`holderUid === null` のものから1つ。無ければ何も起きない。持ち去った遺物は `st.plundered[]` に名を控える＝後の痕跡用）。留守番は無事。`st.ransackCount++`。

### 2.5 開幕の勇者襲来（最初の反撃）

`newRun()` で `st.alert = COUNTERATTACK.threshold`、`st.counterattack = { pending: true, kind: "punitive", armyName: <段階1の army>討伐隊 }`。
開幕3日目の `prepareOpeningBattle("invade")` を `defend` に置き換える。文言（「勇者到着まであと2日」「本日、勇者襲来」）は data で「討伐隊」に直すか、段階1の隊名を「見習い冒険者たち」のまま「勇者一行（見習い）」と呼ぶ（未決 U2）。結末は 2.4 と同じ（開幕で負けると荒らされて始まる。それも歴史）。開幕の防衛戦に勝つと警戒が 0 に戻り、通常の流れへ。

### 2.6 着地

- **攻める着地**：進軍で `conquest` を 8 まで進め、王都で勇者に勝つ（既存のクリア）。
- **待つ着地**：魔王軍レベルが 8 に達した後の反撃は勇者（2.3）。勝てばクリア、負ければ城陥落。
- 魔王軍レベルはターンでも上がる（`levelPerTurn`）ので、略奪と防衛を繰り返す遊び方は必ず勇者に行き着く。目安：レベル8がターン14前後、勇者襲来がターン16〜20。
- 結果として、**どのランも勇者アレン戦で終わる**（途中で軍団が空になった場合を除く）。

### 2.7 sim の戦略

`tools/sim.js` の戦略は、作戦会議で `defend` 一択ならそれを受けるだけ（分岐を1つ足す）。「略奪4回→侵攻」は反撃で中断される（狙いどおり）。クリアの判定に `clearedBy` を足し、攻めた／待ったの内訳を集計する。

## 3. 表示

- HUD の警戒度の隣に「反撃まで」の目安（`alert / threshold` の小さなゲージ。数字は出さない。閾値−1 で赤）。
- 作戦会議：`defend` カードだけ。見出し「{討伐隊}が城へ向かっている」。勇者なら「勇者アレン一行が城へ向かっている」（`isFinalBattle` 相当の演出を防衛の勇者戦にも：`battle_scene.js` の `isFinalBattle` 判定を `baseStage === 8` だけにする。`missionKind === "invade"` の条件を外す）。
- 結果画面：勝てば見出し「城を守った」、負ければ「城が荒らされた」＋失ったもの（施設Lv−1／食料半減／{遺物}を奪われた）。勇者を退けたら既存のクリア画面、城陥落なら既存のゲームオーバー画面に「城陥落」の一行。
- モルモ：予告（2.2）、勝利「守りましたデス！ 王国は当分おとなしいはず」、敗北 worried「……蔵が、荒らされました」。**「撃退しました！」の既定分岐に入れない**（撤退のウソ報告と同じ穴）。

## 4. 契約（追加されるもの）

- `src/data/counterattack.js`：`COUNTERATTACK = { threshold: 6, nearChance: 0.5, ransack: { facilityLevels: 1, foodRatio: 0.5, relics: 1 }, seize: { materials: 2, food: 2 } }`。`index.html` とテストの読み込み順は `missions.js` の後。
- `MISSION_TYPES.defend`（`missions.js`）。`invade.alertDelta = 2`。
- ラン状態：`st.counterattack`（2.1）、`st.heroCame`、`st.defenses = { won, lost }`、`st.ransackCount`、`st.plundered[]`、`st.renownBonus`。`migrateState` と `newRun` の両方に既定値（落とし穴）。
- 関数：`Game.checkCounterattack()`（決着処理の最後）、`Game.ransack(notes)`、`Game.isDefenseBattle(stageData)`。
- 魔界史 record：`clearedBy`、`defenses`、`cause: "城陥落"`。主要記録は増やさない。
- `battle_scene.js`：`isFinalBattle` の判定変更（3）。battle.js は触らない。

## 5. 受け入れ条件

### 5.1 `tools/test-counterattack.js`（新規）

ハーネスは `tools/test-retreat-run.js` を写す（名簿は自前。`U.rand` / `U.chance` を固定）。
- 警戒6で決着 → `st.counterattack.pending`、次の `prepareMissions(true)` が `defend` 1件だけ。警戒5で `U.chance` を true に固定 → 予約、false → 予約なし。
- 予約中に面接・編成が通常どおり動く（`genApplicants` が呼べる、`toggleDeploy` が効く）。
- 防衛勝利 → 警戒0、建材+2・食料+2、`renownBonus` で次の `applicantCount()` が+1、その次は戻る。`defenses.won === 1`。
- 防衛で撤退 → 荒らされる（施設Lv 2→1、`buildProgress` が Lv1 の閾値、食料 10→5、蔵の遺物が1つ減り `plundered` に名が入る）。警戒 −3。留守番は名簿に残る。
- 施設Lv0・食料0・遺物なしで負けても落ちない（何も起きない）。
- 魔王軍レベル8で予約 → `kind === "hero"`、作戦の `baseStage === 8`。勝てば `phase === "clear"`、`record.clearedBy === "defense"`。撤退・全滅なら `phase === "gameover"`、`cause === "城陥落"`。
- 勇者を退けた後は警戒が溜まっても予約されない（`heroCame`）。
- `newRun()` 直後：`alert === 6`、`pending`、開幕3日目の作戦が `defend`。
- 進軍勝利で警戒+2。
- 既存 `tools/test-*.js` 全通過（撤退・継承・全滅・種族技のテストを含む）。

### 5.2 sim

`node tools/sim.js 50` を実装前後で各3回。**合格帯は置かない**（系統的に動く）。報告：平均クリア率（攻めた／待ったの内訳）、平均戦闘数、防衛戦の回数と勝率、荒らされた回数、城陥落の数。目安：平均戦闘数 15〜22、クリア率 35〜60%、**全滅は1ランあたり2回以下**（再建の仕様で 9回/ラン・クリア97% になった。反撃がこれを抑えるのが受け入れ条件）。「略奪4回→侵攻」が 0% なら締めすぎ、80% 超なら緩すぎ（`threshold`・全滅の警戒度・`enemyTierOffset` の順で調整して報告）。

### 5.3 UI：`tools/browser-tests/counterattack.js`

予告のモルモ → 作戦会議が一択 → 防衛戦 → 結果画面の見出し（守った／荒らされた）→ HUD のゲージ。勇者の防衛戦で `final-battle` の演出が出る。`run-all.sh` 全通過。

## 6. 実装の分割

| コミット | 触るファイル | 検証 |
|---|---|---|
| A データ | `src/data/counterattack.js`（新規）、`src/data/missions.js`（`defend`、`invade.alertDelta`）、`index.html`・テストの読み込み順 | node 全部（挙動は変わらない：`defend` はまだ誰も出さない） |
| B 進行 | `src/core/run.js`、`tools/test-counterattack.js`、`tools/sim.js`（`defend` 受け・`clearedBy` 集計）、既存テストの更新、HANDOFF §0・§2 | node 全部、sim 3回×前後 |
| C 画面 | `src/ui/ui.js`、`src/main.js`、`src/ui/battle_scene.js`（`isFinalBattle`）、`src/styles.css`、`tools/browser-tests/counterattack.js` | run-all 全通過 |

## 7. 幕を足せる形（中盤・終盤への伏線。実装はしない）

- 段階表（`ENEMY_STAGES`）は**幕ごとの配列**にできるよう、`buildMission` が「段階表を引く関数」を一つ通す（`Game.stageTable()`）。今は1幕8段階。中盤を足すときは第2幕の表を足して `MAX_CONQUEST` を伸ばすだけ。
- 討伐隊の名前と編成は段階表から作る。固有の敵を足すときは段階表に行を足す。
- 勇者は「`kind: "hero"` の反撃」として来る。終盤のクライマックスは、勇者の後にもう一段「`kind` を足す」形で作れる（例：王国軍総力、異界の何か）。
- 新モンスター・新技は `MONSTER_TEMPLATES` と `TRAITS.*.skill` に足すだけ（種族技の仕様の形）。
- 幕の切り替えを演出したくなったら、モルモの報告（`battleReport`）に1分岐足す。

## 8. 落とし穴

- **決着処理は `settleContinue` / `settleRetreat` の二つ**。防衛戦の分岐はその中。三つ目を作らない。
- **`prepareMissions` は `missionOffers` の長さで「作り直すか」を判断している**（`MISSION_TYPES.length` と比べる）。一択のときに毎回作り直されないよう、`force` と `pending` の扱いを揃える。
- **`newRun()` と `migrateState()` の既定値は別物**。`counterattack` / `heroCame` / `defenses` / `plundered` / `renownBonus` を両方に。
- **`isFinalBattle` は `missionKind === "invade"` を見ている**。防衛の勇者戦で最終戦の演出を出すには条件を `baseStage === 8` だけにする。
- **`main.js battleReport()` の既定分岐は「撃退」**。防衛の勝敗と予告は先に見る。
- **sim の戦略は作戦を `missionKind` で選ぶ**。`defend` 一択のとき `findIndex` が −1 にならないように。
- **開幕3日間の `prepareOpeningBattle` は kind を固定している**。`defend` への置き換えで `openingBattle` の分岐（食料・建材の報酬、`advanceDay`）を壊さない。

## 9. 未決（答えが無ければ既定で）

- **U1** `threshold` 6、`nearChance` 0.5。既定：そのまま。sim で決める。
- **U2** 開幕の敵の呼び名。既定：段階1の隊名のまま「見習い冒険者たち」を討伐隊として出し、モルモの台詞だけ「勇者を名乗る者たち」にする（後の勇者と対にする）。
- **U3** 留守番の防衛参加。既定：しない（出撃隊5人）。LP の後。
- **U4** 荒らされる内容。既定：施設−1・食料半減・遺物1つ。
- **U5** 勇者戦での判定負け。既定：撤退と同じ＝城陥落。

## 10. 完了の報告に含めること

- 5.2 の表（前後3回、攻めた／待ったの内訳、防衛回数と勝率、荒らされた回数、城陥落数）。
- 5.1・5.3 の通過数。
- 未決で既定にしたもの。仕様から外れた点と理由。
