# 引き継ぎメモ（Claude → CodeX）

最終更新: 2026-09-12（§0 の古い項と §1・§3・§4・§5 は docs/HANDOFF_ARCHIVE.md へ移した）

このファイルは開発を引き継ぐ人（AI含む）向けのメモ。
ここには「READMEに書ききれない、踏むと痛い所」と「次にやること」を書く。

読む順番:

1. **[`GAME_DESIGN_PRINCIPLES.md`](GAME_DESIGN_PRINCIPLES.md)** — 最上位の設計指針。
   何を作るか・作らないかの判断は常にここが優先する。最重要KPIは「もう1回遊びたいか」
2. **[`README.md`](README.md)** — いま何がどう実装されているか
3. このファイル — 落とし穴とバックログ

**「現状を整理して」「レビューして」と頼まれたときは、まず
[`docs/DIRECTION_BRIEF_2026-09-04.md`](docs/DIRECTION_BRIEF_2026-09-04.md) を読むこと。**
直近の変更・実測値・一度踏んだ失敗・未決の論点・分担の制約がそこに集約してある。
古いコミットや推測で判断すると、過去のレビューと同じ誤認を繰り返す。

---

## 0. 次チャットの開始点（最新が上。2026-09-12 現在）

### 済み：前哨戦・お披露目（Opus）と城下町の経済（Claude）を本線へ（2026-09-12 深夜・Claude）

- Opus `001db03`（お披露目の光り・モルモの文言）、`346ee4d`／`b0c7bee`（前哨戦→本戦。進軍が2戦、段階1と最終段階は1戦。`TWO_STAGE_REWARD_MULT` は仕様の1.15ではなく **1.3**：1.15では未払い率が51%に跳ねた）。
- Claude `9fb5e93`：城下町の経済をマージ（`docs/DESIGN_ECONOMY_2026-09-12.md` 5節に実装の見取り図）。styles.css の衝突は両方の追記を残しただけ。
- sim は城下町（税）を読む。`SIM_NO_TOWN=1` で切れる（再起の回帰テストは全滅が起きる前提なので切って測る）。税だけで未払い率 30〜58% → 13〜27%。
- 夜間の通し試遊（`tools/browser-tests/fuzz.js`、130戦）：エラー0・停滞0。
- **遊べる状態**：前哨戦の帯（青）→本戦（金）、城メニューの「城下町」札（税・施設6・銀行・家計簿）、お披露目の光り。
- 見る点：前哨戦のテンポ（1段階2戦は長いか）、税で金が余るか（余るなら `TOWN_RULES.taxPerTerritory` を 2→1）、建てたい施設が迷わず選べるか、銀行を使う場面があるか。
- 残り：CodeX の全体マップ設計（`codex/world-map-design`、本人の経路で）。カタログ31技の割り当て（オーナー判断）。`traits.js` の desc 4本と ui.js の「お披露目済み」の古い言い回し（軽い票）。

### 済み：試遊の3件（2026-09-12・Claude）

- **逃亡の猶予と慰留**：忠誠0で即去るのをやめた。一度目は「荷物をまとめる」（`m.leaving`、札に 🎒 去りかけ）。次の決着まで0のままなら去る。
  詳細画面に「慰留する（給与2回分G・忠誠+30）」（`Game.retain`。忠誠20以下か去りかけのとき）。`tools/test-retain.js`。
- **選んだ敵と違う敵に当たる**：バグではなく盾役（shield）の かばう が黙って効いていた。`cover` イベントで字幕「○○が△△をかばった！」、
  狙い選びで「🛡 …に守られている（狙うと盾役が受ける）」の予告、札に 🛡。`prompt.enemies[].coveredBy`。
- **技を出していないのに技の台詞**：上位技のお披露目（覚えた直後の戦いで勝手に1回出る）が正体。手動では出さず窓で光る方式へ（`docs/SPEC_DEBUT_2026-09-12.md`、エンジン済み。UI の光りは Opus）。

### 済み：技と敵の役割の統合と片付け（2026-09-12・Claude）

- カタログ（CodeX `codex/skill-catalog`）を本線へマージ（`2f5eb60`）。技の効き20・痕跡派生5・敵の役6。**誰にも割り当てていない**（次は「誰に・いつ」の会。オーナー試遊のあと）。
- 上位技の顔を `SKILLS.UPPER_SKILLS`（kind "trait"）へ一本化（`e06a3ee`）。battle.js は `TRAITS.order` を読まない。
- レビューで見つけた実バグ2件：旧移行がゴブリンに追い剥ぎを戻していた（`45e7938`）、1段目の癖が窓に技として並んでいた（`ab19e28`）。
- HANDOFF を現在地だけに整理、旧仕様に廃止／改定の注記。

### 済み：技と敵の役割（2026-09-12・Claude エンジン／CodeX 敵データ／Opus 開放と窓）

オーナー決定：癖（勝手に効く）と技（気合を払って選ぶ）を分ける。種族技は3戦目、上位技は8戦目（戦闘回数も増やす）。
気合は戦闘中に増える（まもるで大技を受け切る＋1、味方が倒れる＋1）。敵に役割（僧侶・術士・盾役・弓・斥候・隊長・大男）。
- 仕様 `docs/SPEC_SKILLS_2026-09-12.md`、チケット `docs/TICKETS_SKILLS_2026-09-12.md`（A＝CodeX 敵データ・テンプレート移行、B＝Opus 開放と指示窓、C＝前哨戦は別紙）。
- 済み（`05d0506`）：`src/data/skills.js` の SKILLS 17技、battle.js の解決・気合の増減・敵の役割の計画、`tools/test-skills-command.js`。
- 済み（CodeX `8de6300`／`c6375ae`）：敵91件に role、テンプレートの癖11個を技へ移行（`skills`）、17技の台詞。
- 済み（Opus `83471e2`／`5260e15`）：種族技3戦・上位技8戦・遅咲き（6戦／12戦、内政+1）・移行・`spiritGained` 反映、指示窓の技2枠・味方狙い・役の印・構えの予告・字幕。
- 済み（Claude）：癖→技の移行で落ちた3本のテスト（act2-content／chain-api／loot-chain）を新しい前提に直した。モルモの遅咲きの一言は main.js の採用処理（一度だけ、`st.lateBloomerHinted`）。
- **遊べる状態**。見る点：3戦目で技を覚えるか、窓に技が2枠出るか、敵の役（盾・僧・術・弓）で「誰を先に倒すか」が生まれるか、気合が戦闘中に増える手触り。
- 次：チケットC（前哨戦→本戦で戦闘回数を14〜20に。別紙を Claude が書く）。

### 済み：コマンドバトル 段階0（2026-09-11 深夜・Claude／オーナー試遊待ち）

オーナー決定：自動戦闘をやめ、古き良きコマンドバトルへ（目的が「サクッと1ラン」から「愛着・育成・波乱」へ移ったため）。
毎ラウンド全員に指示。おまかせ／速度倍は残す。敵の構えは大技のときだけ。設計と契約は `docs/SPEC_COMMAND_BATTLE_2026-09-11.md`。

- **遊び方**：戦闘はラウンドの頭で止まり、味方ごとに たたかう（狙い指定可）／まもる（被ダメ半減・攻撃しない）／技（気合を払って
  条件を飛ばす。+50%も息切れも無し）／おまかせ。下に 全員たたかう／この戦いはおまかせ／以後もおまかせ／退く／決定。
  敵は2ラウンド目以降たまに「大技の構え」（1ラウンド攻撃を捨て、次に×1.8）。⚠ で見える。まもるで受ける。
- **仕組み**：battle.js の本体を生成器にし、`Battle.start()` がラウンドごとに止まる取っ手を返す。`simulate()` は生成器を自動で
  回すだけなので sim・node テストは今までどおり（敵の大技だけ加わった）。run.js は `deploy({ manual: true })` と
  `finishManualBattle`。描画は `playManual` と指示パネル。「最後まで飛ばす」は残りをおまかせで回す。
- 号令（自動戦闘の節目）は UI から外れた（コマンドの「技」がその役）。エンジンには残る（sim・テストの土台）。
- コミット：`6a0b89b`（エンジン）、run/ui、docs。node 78/78、run-all 全通過。
- **2026-09-12 指示窓をロマサガ流に置き換え（オーナー試遊の感想）**：下部パネルをやめ、戦場の中に浮く不透明度60%の窓。
  隊列の先頭から一人ずつ、決めたら次の者、狙いは敵の札をタップ、最後の一人で即開始（決定ボタン無し）。指示中の者は
  明るく大きく ▼ 付き、他は暗く。SPEC 1.1 節。テスト `order.js`／`retreat.js` を新しい流れに合わせた。
- **見る点（試遊）**：1戦にかかる時間と押す回数。まもるを選ぶ場面があったか（大技の構えが見えたか）。技を自分で切る手応え。
  テンポが死んでいたら「おまかせ既定」や「前と同じ」ボタンを足す。
- **次の段階**：1 隊列（前列2・後列3）→ 2 連携と相性 → 3 痕跡と癖の干渉（設計は SPEC の6節）。

### ブランチの整理（2026-09-11・Claude）

- GitHub の既定ブランチ `claude/demon-king-recruitment-game-sapqsx` を作業ブランチ `claude/hero-arrival-tavern-prototype-uy2toh` の
  内容で更新した（マージ `7c77012`。両者は同一内容）。CodeX の修正が古い既定に落ちた事故（`60b1508`）の再発防止。
- **以後、CodeX / Opus は作業ブランチから切る**（既定から切っても同内容なので今は問題ないが、次に差が出たら既定を追随させる）。
- 取り込み済みで不要なリモートブランチ（codex/* 8本と claude/* 9本）は、このセッションからは削除できない（git の削除が
  プロキシで通らない）。**オーナーが GitHub の Branches 画面で削除するか、CodeX にローカルから `git push origin --delete` させる。**
  残すもの：`codex/two-wins`（不採用の実験。参照用）、`codex/f-wip`（古い退避。中身が要るか CodeX に確認してから消す）。

### 次のタスク（2026-09-11・仕様書あり）

- **済み（Opus `9a44f9d`）**：セーブスロット3つ＋ファイル書き出し／読み込み（`docs/SPEC_SAVE_SLOTS_2026-09-11.md`）。オーナーは保留と言ったが
  先に実装が上がったので取り込んだ。旧 `maou_save` はスロット1へ移行。タイトルに3札。HUD の「保存中：スロット n」は畳んだ行（hud-extra）へ。

- **完了（CodeX）**：`docs/SPEC_CASTLE_MENU_2026-09-11.md`。面接→作戦→編成→戦闘→結果の流れは変えず、常設情報を「🏰 城」へ分離。
- 面接に現在の軍団一覧を追加し、応募者と軍団員は共通の `UI.memberDetail()` で詳しく読む。解雇は詳細と軍団札で確認を挟む。
- 城は軍団／記録／参謀の3札。元の `st.phase` を変えずに開閉し、編成は軍団札と同じ名簿＋出撃操作を使う。
- 560px以下はHUDを資源／進行の2行へ畳み、編成・結果・準備の主操作を下端へ固定。作戦3択は各札の下端へ追従。
- `tools/browser-tests/castle.js`（A/B/C段階）をrun-allへ登録。1128px／390pxの面接・編成・城メニューを保存し、全回帰通過。
- **設計済み**：勇者を退けたあと＝三幕構成 `docs/DESIGN_ACT2_2026-09-11.md`（第二幕「援軍」段階9〜14、第三幕「決戦」15〜18。
  どちらの着地からも次の幕へ。名簿・施設・伝承は持ち越し）。
- 済み：**第二幕の中身**（Opus `d22f2e3`、`docs/SPEC_ACT2_CONTENT_2026-09-11.md`）。新種族3は `MONSTER_TEMPLATES_ACT2`、
  敵段階9〜14は `ENEMY_STAGES_ACT2`、`ACT_STAGE_CAP = {1:8, 2:14}`。今の幕では応募に混ざらず段階9へ進めない（test-act2-content 76件）。
  Claude が chain.js の CLASSIFY に5技を足して `ctx.trigger` へ戻した。
  **幕の進行の仕様（次、Claude）で扱うこと**：`MONSTER_TEMPLATES_ACT2` の解禁（`rollApplicant` は tier 3/4 を区別しない）、
  `ENEMY_STAGES_ACT2` の接続と `MAX_CONQUEST` の幕ごとの上限、勇者戦後の切り替え場面、討伐隊の下限、`rampage` の autoLimit
  （modDealt の受け身技には効かない）、突進の押し下げが「ラウンドの終わり」になっている点（未決U3）。
- 済み：**幕の進行**（Opus、`docs/SPEC_ACT_PROGRESS_2026-09-11.md`）。第一幕の着地（勇者撃退／王都攻略）でランは終わらず第二幕へ。
  `st.act` / `st.actHistory` / `st.actStartedTurn`、`Game.actStages()`・`Game.templates()`・`Game.beginAct()`、
  `MAX_CONQUEST` は**定数ではなく幕ごとの getter**（`ACT_STAGE_CAP` 1:8 / 2:14）。第二幕の討伐隊は段階9以上、勇者（再）は段階14、
  tier4 の応募重み ×1.5。`ENEMY_STAGES` / `MONSTER_TEMPLATES` の直参照は run.js から一掃した（残るのは getter 内の退避だけ）。
  `phase === "clear"` は**第二幕の着地でしか起きない**。魔界史の cause は「第2幕・勇者撃退／王都攻略」。test-act-progress 48件。
  **城陥落はもう終わりではない**ので、`castleFell` で `gameover` を期待するテストを書かないこと（test-counterattack を直した）。
  sim 50：0%の戦略なし、クリア率 94〜100%、平均勝利 16〜25戦（＝ほぼ全ランが幕替わりを越えて第二幕を着地している）。
  **残り**：第三幕（段階15〜18）は未実装（`MAX_ACT: 2`）。第二幕の技は5つが `ctx.trigger()` 済み（CLASSIFY に役あり `f7c2c59`）。
  暴走（rampage）だけ受け身で trigger 無し。U3 `rampage` の autoLimit は modDealt の受け身技には効かない（仕様どおり放置）。
- 済み：**新種族3の絵**（CodeX `codex/act2-art` 7コミット、マージ済み）。立ち絵 768×1024・6ポーズ WebP・BATTLE_SPRITES 登録。
  art-coverage / portrait / species（3種）通過。表情差分は無し（任意）。

- **完了（CodeX）**：痕跡を本体へ接続し、「城の記録」画面（日誌・蔵・去った者）を追加。
- 作戦会議・編成・面接・結果の HUD から開け、元の phase を変えずに戻れる。
- 日誌は新しい順40件を日ごとにまとめ、モルモの言葉で表示する。数字は本文へ出さない。
- 蔵は閲覧専用、去った者は既存表示を流用。戦闘中には入口を出さない。
- 契約は `st.traces` / `Game.journal()` / `UI.records()` と action `records` / `backrecords`。
- **Opus**：`docs/SPEC_EXPERIENCE_GRANT_2026-09-11.md` — A 共通特性の付与（run.js）、B 事件文の種族決め打ちさらい（events.js）。別コミット。
- 済み：`test-chain-measure-retry` の採番上限（Opus `8ab11a2`）、勝利ファンファーレ（CodeX `1a6cf66`）、
  共通特性の付与（Opus `7d2a1ac`。判定は lastBattle を組む直前＝homeStays が足された後）、事件文さらい（Opus `8aa9e5f`、2件）、
  `test-sound` の落ち（ファンファーレ差し替えで合成音の経路が変わっていた。Claude が直した）。
- 済み：**セーブスロット3つ＋書き出し／読み込み**（Opus、`docs/SPEC_SAVE_SLOTS_2026-09-11.md`）。
  **「リロードで消える」の切り分け結果**：コード上に消える経路は無く、`file://` で実測しても
  リロードで `maou_save` は残り「続きから」も出た。残る原因は (1)「続きから」を押さずに「新規」を押した上書き、
  (2) ブラウザ側の保存削除（プライベート窓・サイトデータ削除・別 URL）。(1) は「新規は必ずスロットを指定」で塞ぎ、
  (2) は書き出し／読み込み（textarea のコピー）で持ち運べるようにした。
- クリア率が全戦略 90〜100% に上がっている件は**今は気にしない**（オーナー 2026-09-11。システムが揃ってから難度を選ばせる）。


### これより前の §0（2026-09-03〜09-11 の各項）は `docs/HANDOFF_ARCHIVE.md` にある

設計の現在地は `docs/SPEC_SKILLS_2026-09-12.md`（技と敵の役割）、`docs/SPEC_COMMAND_BATTLE_2026-09-11.md`（指示窓）、
`docs/DESIGN_ACT2_2026-09-11.md`（三幕構成）。廃止・改定された仕様は各文書の頭に注記がある（号令 → 技、6戦置き換え → 3戦/8戦）。

### 廃止待ちの仕組み（動くが役目を終えた。消すときは一緒に）

- **号令エンジン**（`options.offerOrder`、`Game.answerOrder`、`orderOffers`、`TRAITS[x].order`）：UI からは外れた。sim と旧テストの土台として残る。
  手動戦闘が定着したら run.js の 12 か所とテスト5本を落とす。上位技の「顔」は `SKILLS`（`UPPER_SKILLS`）が正本になった（2026-09-12）。
- **お披露目（debut）の自動発動**：上位技を覚えた直後の戦いで勝手に出る。手動戦闘では「窓で光る」方が筋。カタログ割り当ての仕様で決める。

## 2. 壊してはいけない設計の約束

ここを崩すと後で高くつく。理由つきで書く。

### 2-00. ランの保存はスロット。鍵を直接読まない

`maou_save_1` 〜 `maou_save_3`、選んでいるスロットは `maou_active_slot`。旧 `maou_save` は
`Storage.migrateLegacy()`（読み書きのたびに一度だけ効く）がスロット1へ移して消す。

- 「保存があるか」は `Storage.hasAnySave()` / `Storage.slotMeta(n)`。**`loadRun()` を有無の判定に使わない**
  （保存本体を毎回 JSON.parse することになる）。
- 札に出す進み具合は `slotMeta` が**保存本体から導く**。meta 用の鍵を別に持たないこと（必ず食い違う）。
- `Game.save()` / `endRun` の `clearRun()` は**選んでいるスロット**へ効く。スロットを渡すのは
  タイトルからの `Game.newRun(king, slot)` / `Game.load(slot)` / `Game.importRun(slot, text)` だけ。
- テスト（node）で保存の中身を覗くときは `store[Storage.slotKey(Storage.activeSlot())]`。
- `savedAt` は `Storage.saveRun` が書く。書き出し／読み込みの往復比較では除く。
  なお `newRun` の初期値と `migrateState` の既定値は別物なので、往復の一致は**両方 migrate を通してから**比べる。

### 2-0. 幕（act）の切り替えは `Game` の getter を通す

段階表・応募テンプレート・征服上限は幕で変わる。**データ配列を直接参照しないこと。**

| 欲しいもの | 使うもの | 直接読んではいけないもの |
|---|---|---|
| 敵の段階表 | `Game.actStages()` | `ENEMY_STAGES` |
| 応募テンプレート | `Game.templates()` | `MONSTER_TEMPLATES` |
| 征服の上限 | `Game.MAX_CONQUEST`（getter） | `ENEMY_STAGES.length` |

`MAX_CONQUEST` は `ACT_STAGE_CAP[st.act]` を引く **getter** である。代入するとプロパティごと壊れる。
幕を進める入口は `Game.beginAct(next, by, notes)` ただ一つ（警戒・予約・`heroCame` を戻し、段階を引き上げ、履歴を積む）。
`heroCame` を戻すのはここだけ。決着側で戻すと「勇者が二度来る／二度と来ない」が静かに起きる。

### 2-1. 戦闘は「計算」と「見せ方」を分離してある

`Battle.simulate()` はイベントタイムラインを返すだけで、描画を一切知らない。
`BattleScene`（`src/ui/battle_scene.js`）がそれを再生する。

```
Battle.simulate() → timeline[] → BattleScene.play(timeline)
（ルール・バランス）  （契約）     （DOM/CSS・差し替え可能）
```

**タイムラインが唯一の真実**。ログも、戦果集計も、全部ここから導出している。
新しい情報が欲しくなったら、戦闘中に状態を持ち回るのではなく
「タイムラインから後で導出できないか」をまず考えること。

`emphasis`（0〜3）は「どれくらい重要か」だけを伝え、**尺（何ms見せるか）は描画側が決める**。
この分担を守っている限り、Canvas版やネイティブ版へ戦闘シーンだけ差し替えられる。

`death.permanent` / `result.reversal` / `synergy.firstDiscovery` も同じ性格の**重要度の印**である。
描画側の圧縮判定（`BattleScene.isProtected` / `magnitude`）だけが読み、**戦闘計算には一切使わない**。
`permanent` と `reversal` は勝敗確定後にタイムラインから導出して付け、`firstDiscovery` は
`Game.recordDiscoveredSynergies()` が登録時に付ける。増やすときも同じ作法（計算に混ぜない）を守ること。
`result.wipe`（`"player"` / `"enemy"` / `null`）も同じ印。**判定決着と全滅を見分ける**ためだけにあり、
勝敗そのものは `victory` が持つ。描画側（モルモの一言）しか読まない。

戦果の集計もすべてタイムラインからの導出で完結している。`chainSummary.deepest`（代表CHAIN経路）と
`contribution` の非ダメージ項目（`traitTriggers` / `resources` / `revivesGiven` / `selfRevives` / `healed`）は
`sourceId` と `parentEventId` だけを根拠にする。**誰の手柄か言えないものは個人へ帰属させない**
（施設由来の発火、召喚ユニットの行動）。これらは表示専用で、戦功・昇進・報酬には接続しない。
施設の働きは個人へ付けない代わりに `facilitySummary` / `deathChains`（同じくタイムライン導出）として
戦果へ残す。**新しい施設を足したら `facility_trigger` に `facilityId / name` を付ける**こと。
付いていないと戦果の施設行に出ない。

**契約追加（2026-09-05・Claude / 作業表 B）**: `st.lastBattle.momentumPeak`（数値・戦意の到達倍率）。
`run.js` がタイムラインの `momentum` イベントの `mult` の最大値を取るだけの導出で、戦闘式・数値は変えていない。
戦意は戦闘中の帯にしか出ず、終わると消えていたので戦果に残らなかった。**古いセーブには無い**ので、
表示側は `1` として扱い、`1` のときは1行サマリから戦意を落とす（`UI.breakthroughPanel`）。

### 2-2. アニメーションは `transform` と `opacity` だけ

将来 Capacitor でスマホアプリ化する前提。`left/top/width/height` を毎フレーム変えると
レイアウトが走り、実機で確実にカクつく。HPバーも `width` ではなく
`transform: scaleX()`（`transform-origin: left`）で伸縮させている。

### 2-3. `core/` と `data/` にブラウザAPIを持ち込まない

現在この2層はDOM非依存で、`node tools/sim.js` がブラウザ無しで全ゲームロジックを走らせられる。
`storage.js`（31行）だけが LocalStorage に触れており、ネイティブ保存への差し替え口になっている。
**ゲームロジックからDOMを読まない**（DOMは書き込み専用の出力先）。

### 2-3a. 痕跡（`Traces`）は事実の保存器であり、因果の実行器ではない

`src/core/traces.js` は、ラン中の「誰が・何を・いつ」をJSONだけで記録する。本体が記録する場所、日誌の文章、条件から起きる展開は別仕様であり、この器から直接ゲーム状態・戦闘・UIを変えない。
kind は `TRACE_KINDS` の登録制（現在16種）。`record()` は未知kind・深いdata・不正UIDを例外なく拒否し、`record()` と `prune()` だけが配列を変更する。
既定上限は400件。古い通常痕跡から落とすが、`fallen` と `retreated` はランの歴史として残す。新しいkindの追加は設計担当へ戻す。

### 2-3b. 城の記録（日誌）契約

- `st.traces: Trace[]` はセーブ対象。新規ランと旧セーブ移行で必ず配列にし、上限400件の管理は `Traces` に任せる。
- `Game.journal(limit = 40)` は新しい順の痕跡を日ごとにまとめ、`[{ day, turn, lines: [{ seq, kind, text }] }]` を返す。
- `UI.records()` と action `records` / `backrecords` は `st.phase` を変えず、`UI.set(html, "records")` で専用 scene を明示する。
- `TRACE_KINDS` は `fired` / `deserted` / `retired` / `ordered` / `defended` / `ransacked` を含む。

### 2-3c. 城のメニューと人物詳細のUI契約

- HUDの常設入口は `data-action="castle"`（表示「🏰 城」）。`castle` / `castletab` / `backcastle` は `st.phase` を変更せず、`UI.castle()` は `UI.set(html, "castle")` を明示する。
- 城の札は軍団／記録／参謀の3つだけ。編成の名簿は軍団札と `UI.memberRow()` を共有し、別DOMへ二重実装しない。
- 人物は軍団員の `data-uid` または応募者の `data-index` から `UI.memberDetail()` を開く。詳細は `UI.set(html, "member")` を明示し、閉じると呼び出し元へ戻る。
- `deploy` / `toggledeploy` / `up` / `down` / `front` / `fire` / `hire` のaction名とdata属性は互換契約。新しい画面でも変更しない。
- 560px以下のHUDは、1行目＝所持金・食料・建材、2行目＝魔王軍Lv・王国攻略・警戒・城。その他の進行情報は記録札で読む。
- `MORMO_LINES.journal` は kind ごとの日誌用文面を持ち、ゲーム上の数値は日誌本文へ出さない。

### 2-4. コンテンツはデータ追記だけで増える

| 増やしたいもの | 触るファイル |
|---|---|
| モンスター | `src/data/monsters.js` |
| 特性 | `src/data/traits.js`（5種のフック関数） |
| シナジー | `src/data/synergies.js`（`check`/`apply`） |
| 敵 | `src/data/enemies.js` |
| 作戦 | `src/data/missions.js` |
| 昇進階級 | `src/data/promotions.js` |
| ハプニング | `src/data/events.js` |
| 実績 | `src/data/achievements.js` |
| 魔王 | `src/data/demon_kings.js` |
| 立ち絵 | `assets/monsters/{id}.png` ＋ `src/data/portraits.js` |

ロジック側を触らずに済む形を保つこと。

### 食事強化の伝票 `mealPlan`（2026-09-06・V2a で追加した契約）

`Game.mealPlan(rations)` が **食事強化の起点・対象・効果量を決める唯一の場所**である。

- `Game.preparedRoster(rations, plan?)`（本番の倍率）、編成画面の予告、
  `Battle.simulate` へ渡す `rations.meal`、`st.lastBattle.mealPlan` は**すべてこの戻り値を読む**。
  **どこかで倍率を再計算しないこと。** 表示だけが古くなる事故はここから始まる。
- 主なフィールド: `cookUid/cookName`（起点）、`targetUid/targetName/targetAppetite`（対象）、
  `tiedUids`（食欲が同値で並んだ者）、`boost/boostPercent`（効果量）、`kitchenMult`、
  `bigEaters[]`、`hungerUid`、`feast`、`targetEatsNothing`。
- **対象の決定規則: 食欲が最大の1体。同値なら出撃順（`activeUids`）の先頭。**
  `sort` が安定なので並び順だけで決まる。この規則を変えると予告と本番がずれる。
- 効果量が0のときは `targetUid` を `null` にする（0%の強化を誰かに帰属させない）。
- `targetEatsNothing` は「食欲0の者に料理が乗っている」現行挙動の**印**であって修正ではない。
  可否の判断は V2b。ここを直すと数値が動く。
- `rations.meal` は battle.js がまだ読まない追加フィールドである。
  **説明用のフィールド追加で発火順・回数・chainDepth を変えないこと**（`tools/test-food-attribution.js` が検証）。
- 古い戦果には `mealPlan` が無い。表示側は**その表示だけを省略**する。

### 食事強化の因果イベント（2026-09-06・V2b で追加した契約）

**新しいイベント種別は増やしていない。既存イベントへの情報追加だけである。**
伝票（`rations.meal`）が無い戦闘・古いセーブでは何も足さないので、表示側はその表示だけを省く。

1. **`trait_trigger`（`traitId: "demon_cook"`）＝ 起点・対象・効果量**
   追加フィールド: `targetId` / `targetName`（強化された者。効果量0なら `null`）、
   `amount`（0.24 など）/ `amountPercent`（24）、`consumed`、`kitchenMult`、
   `tiedIds`（食欲が同値で並んだ者の戦闘ID。「なぜこの人が受けたか」の説明用）、
   `targetEatsNothing`。`text` も対象と％を含む文言になった。
2. **強化された者の「最初の有効打」＝ 既存の `attack` / `splash` に `mealBoost` が付く**
   `{ first: true, sourceId, sourceName, targetId, targetName, amount, amountPercent }`。
   **1戦闘に1件だけ**。付く条件は **敵へのダメージ** かつ **仲間割れ（incident）でない**こと。
   仲間割れの同士討ちは `unit.atk * 0.7` の生ダメージで `mods.dmgMult` を通らない＝
   食事強化が反映されていないので、印を付けない。**対象外の回では印の権利も消費しない**
   （仲間割れの後に出た本当の初撃へちゃんと付く）。
   一度も有効打が無ければどこにも付かない（嘘の着地を作らない）。
3. **`result.mealSummary`** … タイムラインから導出するだけの要約。
   `{ sourceId, targetId, targetName, amount, amountPercent, consumed, kitchenMult,
   tiedIds, targetEatsNothing, triggerEventId, firstHit: { eventId, type, toId, dmg, dead } | null }`。
   伝票が無い戦闘では `null`。

**壊してはいけない約束**: ここで足したのは説明用フィールドだけで、
**ダメージ・発火順・回数・chainDepth は1つも変えていない**
（`tools/test-meal-attribution-battle.js` が指紋比較で検証。`BATTLE_BEFORE=<旧battle.js>` を
渡すと変更前の実装と直接つき合わせる）。今後ここへ手を入れるときも同じ検証を通すこと。
**食欲0の者へ強化が乗る現行挙動は維持**しており、`targetEatsNothing` は印にすぎない。

イベントチェーンの最小契約は `state.laborDispute`（通常 `null`）。現在は
`{ stage: "march", actorUid, startedTurn }` だけを持ち、給与抗議を無視したときに作成、
ストライキ行進の解決時に必ず `null` へ戻す。汎用フラグ基盤へ抽象化しない。

敵段階は従来の `units` を基本隊列として保ち、任意の `variants[]` に
`{ id, name, hint, units }` を足せる。作戦契約には `formationId / formationName /
formationHint` が加わり、UIは未設定の旧セーブを「基本隊列」として表示する。
`formationId` は同じ作戦会議中の再生成でも保持し、戻る操作を敵の引き直しにしない。

敵ユニットの任意契約 `introQuote` は `Battle.makeUnit()` と開始スナップショットを通り、
`dialogue { unitId, name, side, quote }` として戦闘タイムラインへ出る。DOM側へ敵名を直書きせず、
台詞追加は `src/data/enemies.js` だけで行う。現在は最終戦の勇者アレンに1行だけ設定済み。

### 2-5. 2026-09-02 に増えた契約（データを触る前に読む）

**シナジーの効果量を説明文へ二重に書かない。**
編成画面の「いま ×1.15／あと1体で ×1.30」は `Synergy.preview()` が
**使い捨ての写しへ実際に `apply()` して測った値**である。`desc` は文章としてだけ使う。
したがって `synergies.js` へ新しいシナジーを足すと、**表示は自動で追従する**（追加作業は不要）。
逆に `desc` に数値を書いても表示はそちらを見ない。`apply()` が本体。

同じく `Synergy.traitEffects()` が特性の `modDealt` を中立な状況
（敵HP満タン・ラウンド2・乱数0.5）で呼び、編成で決まる倍率だけを拾う。
**新しい特性も `modDealt` を持つなら自動で編成画面に出る。**
状況で決まるもの（敵HPを見る、ラウンドを見る、乱数を引く）は自然に外れる。

**merge型シナジーは「実際に合体した戦闘」でだけイベントに載る。**
`battle.js` は `type === "merge"` を synergy イベントと `activeSynergies` の両方から除外し、
合体を実行した `run.js` が `addMergeSynergy()` で差し込む。条件を満たしただけで
「合体する！」と宣言しないための分担。**新しい merge型を足すなら `run.js` 側の合流処理が要る。**
キングスライム合体は既定で行うが、編成画面で断れる（`st.kingSlimeMerge`、既定 true）。

**傭兵は軍団員ではない。** `flags.mercenary` を持つ戦闘ユニットで、`contribution` の行に
`mercenary: true` が付く。欠員・戦没者名簿・戦功・昇進・給与・魔界史のいずれにも入らない。
`st.mercenaries`（雇用中）と `st.mercenaryOffers`（候補）は戦闘後に空へ戻る。

**ラン状態へ増えたフィールド**（`migrateState()` の defaults にも入れてある）:
`maxChain` / `maxOverkill` / `mercenaryOffers` / `mercenaries` / `kingSlimeMerge` /
`extraHiresThisPhase` / `activeFacilityId` / `pendingFacilityChoiceLevel`。
**新しい状態を足したら defaults にも足すこと**（旧セーブが壊れる）。

**無料採用枠が0になっても `hire()` は面接を自動終了しない。** 以後は紹介料4Gから倍増し、
`extraHiresThisPhase` が料金段階を持つ。終了は `skipHire()` の明示操作だけ。戦後の
`nextRecruit()` で無料枠と追加料金段階をリセットする。simの基準戦略は従来比較を守るため無料枠だけ使う。
KPIは `paidHires / paidHireGold` をラン状態の外へ記録する。simには狙いのゴブリンが候補にいて、
紹介料を払っても6G残る場合だけ追加採用する比較戦略を持つ。
200ラン比較ではゴブリン統一33.0%、追加採用33.5%、求人引き直し22.0%。追加採用は287人・1196G、
最大CHAIN平均は通常3.9→追加4.6。勝率の自動正解にはならず、連鎖完成へ寄与しているため、現時点で
紹介料や採用後の無料引き直しリセットは弱体化しない。実プレイで「毎戦とりあえず4G」になるかを見る。

**新しい「編成の判断」を足したら KPI の指紋にも足す。**
`KPI.fingerprint()` が「ビルド試行」を数える根拠で、現在は出撃隊・部門配属・施設Lv・給与方針・
雇った傭兵・合体の可否・作戦種別を見ている。足し忘れると、その判断は試行として数えられず、
KPIが実際より少なく出る。

---

### 遅刻（2026-09-09・Claude）── 特性は数値ではなく出来事の順番に効かせる

- 特性フック **`lateArrival(ctx)`**（`ctx.unit`, `ctx.rng`）を追加。返した整数ラウンド数だけ、その味方は開戦時に不在。
  敵側には適用しない（採用していない者に癖は無い）。
- 不在中は `flags.absent = true`。**`battle_start.player` に入らず、口上を言わず、狙われず、行動順にも入らない。**
  戦場判定は battle.js の `onField(u)`（= alive かつ !absent）に一本化してある。新しい「alive で選ぶ」処理を書くときはこれを使うこと。
- 到着はラウンド頭で **`summon` イベント**（`late: true`, `sourceUnitId: null`, `unit.summoned: false`）。
  描画側は `addSummon` が `late` を見て召喚札を付けない。**`flags.summoned` は立てない**ので戦功・欠員・戦没者に数える。
- Snap に **`late`**（boolean）を追加。`contribution` に **`late`**（遅刻ラウンド数、0=開戦から居た）を追加。どちらも表示用の追加フィールドで、計算には使わない。
- 味方が全員倒れたあとに遅刻者が一人で着くことがある。これは仕様。`wiped(playerUnits)` は不在者を alive と数えるので敗北にならない。
- 既知の穴：`summarizeFacility` の「全滅回避」判定は `battle_start.player` から生存表を作るため、遅刻者を数えない。表示専用なので放置。
- データ側：`traits.drunkard`（酒好き、1〜2ラウンド）を末尾追記。オークの `traitPool` に入れた（fixed ではない。出るのはたまに）。
- 見せ方（2026-09-10 試遊で「召喚が付いてきた」「遅刻が明示されない」を受けて）：
  `battle_start.absent`（Snap[]）を追加し、描画側は不在者を薄い枠＋「遅刻中」で最初から置く。
  開戦時に `dialogue`（`late: true`, name "モルモ"）で不在を言う。到着の `summon` は `quote` を持ち、
  描画側は枠へ入れて「到着！」を浮かせる（「召喚！」は出さない）。
- 台詞は `traits.drunkard.lines.{absent, absentSelf, arrive}` のプール。`{name}` が置換される。人物ごとの脚本にはしない。
  開幕は二拍（モルモ→本人が戦場の外から `offstage: true`）。
- 一言の契約：`dialogue` に `late` / `offstage`、`summon` に `quote`、`trait_trigger` に `quote` を追加（表示用）。
  `MormoScene.aside(options)` に `speaker: { name, src }` を追加（省略時はモルモ）。`BattleScene.speakAside()` が
  一言で止める共通経路で、既に止まっていれば false を返して字幕へ落とす（二重に止めて詰まらせない）。
  `asideUsed` で「大食漢の一口」は1戦闘1回だけ止める。
- **落とし穴**：`BattleScene.skip()` は `render()` を通らない独自の早送り経路。到着処理は `clearAbsent()` に共通化して
  両経路から呼ぶこと。最初の実装は render 側だけで、「飛ばしたときだけ遅刻中の枠が残る」バグになった（テストが検出）。
- 検証：`node tools/test-late-arrival.js` ／ `tools/browser-tests/late-arrival.js`。

### 撤退の提案（2026-09-10・Claude）── オートバトルに一度だけ入るプレイヤーの判断

仕様は `docs/SPEC_RETREAT_2026-09-10.md`。battle.js 側の契約はこれだけ。

- **`retreat_offer` イベント**（1戦闘1回、`emphasis: 3`, `cls: "mormo"`）。
  `{ round, downed: Snap[], standing: Snap[], enemies: Snap[], text }`。
  出す条件はラウンドの終わり（`resolveRecoveryHooks(false)` と暴食の宴のあと、勝敗判定の前）に
  **軍団員（`flags.summoned` でない味方）が倒れたまま／敵が全滅していない／立っている軍団員が1人以上**。
  「立っている」は `alive` ではなく **`onField`**（遅刻で不在の者は数えない）。
  蘇生でラウンド終了時に立っていれば、そのラウンドでは出ない。
- **`result.retreatOffer`** = `{ index, round, contribution }`、無ければ `null`。
  `index` は timeline 内の位置。`contribution` は**既存の `summarizeContribution()` をそのまま提案時点で呼んだもの**で、
  軍団員の行だけ `survived: true` に上書きし、倒れていた者へ `injured: true` を足す（担いで帰る＝戦死しない）。
  傭兵・召喚物は今までどおり。**二か所で別々に組まないこと。**
- **`options.noRetreatOffer`**（真なら提案を出さない）。開幕の防衛戦（未決U1の既定＝提案しない）で run.js が渡す。
- `retreat_offer` は `permanent` / `reversal` と同じ**重要度の印**である。
  `simulate()` は提案を出しても止まらず最後まで計算する（＝続けた場合の結末）。
  **`U.rand` / `U.chance` / `U.pick` を新たに呼ばない**こと。呼ぶと sim の数字が全部ずれる。
  回帰は `tools/test-retreat-battle.js` の9番（提案あり／なしで `attack` 列と `contribution` が完全一致）。

### 号令（2026-09-10・Claude）── 戦闘の中の魔王の手番

仕様は `docs/SPEC_ORDER_2026-09-10.md`。契約の要点：

- **`U.rand` が唯一の乱数入口**（`pick` / `chance` / `randInt` はこれを通る）。`U.seeded(seed)` は mulberry32。
  `Battle.simulate(p, e, { seed })` は `U.rand` を差し替えて計算し、終わったら戻す。種を渡さなければ Math.random。
- **`order_offer`**（`options.offerOrder` のときだけ、1戦闘1回、`emphasis 3`, `cls "mormo"`）
  `{ round, candidates:[{unitId,name,skillId,skillName,label,note}], answered, enemies }`。
  出す位置はラウンドの終わり、**撤退の提案のあと、勝敗判定の前**。撤退の提案と同じラウンドには出さない。
  条件：このラウンドに誰かが倒れた／味方の軍団員が最大HPの半分以下、敵が残っている、候補がいる。
  候補は `Battle.orderCandidates()`（軍団員で `order` を持つ特性を持つ者。傭兵・召喚物・不在は除く。最大3人）。
- **`options.orders[round] = unitId`** で次ラウンド冒頭に **`order_exec`** `{ unitId, name, skillId, skillName, label, quote }`。
  本人は行動順の先頭、`ctx.ordered = true`（特性が条件を飛ばす）、与ダメ×1.5、`notes` に「号令」。
  代償は `flags.winded`（次の手番に `note { unitId, winded: true }` を出して動かない）。
- **提案イベントは答えの有無に関わらず同じ位置に出す**（`answered` だけ違う）。提案の手前で乱数を余計に消費しない。
  回帰は `tools/test-order-battle.js` の4番（手前一致）。
- **run.js**：`deploy({ offerRetreat })` が `offerOrder` と種を渡し、`pending.replay` に計算前の入力を JSON で取る。
  `Game.answerOrder(unitId)` → 名指しなら計算し直して新しいタイムラインを返す（任せるなら `null`）。
  `Game.recordBattleResult(pending)` は発見・最大戦力・最大CHAIN／OVERKILL・KPI を**確定後に一度だけ**取る（冪等。
  `settleContinue` / `settleRetreat` / ロード時の保留決着の先頭でも呼ぶ）。`settleBattle("continue")` は号令が後に控えていれば
  答えだけ覚えて待つ。決着経路は二つのまま。
- **描画**：`askOrder` は撤退と同じく必ず止める。既定（primary）は「任せる」なので `helpers.js` の自動送りで既存テストは変わらない。
  名指し後は `swapTimeline(next)` で尺の計画と因果の索引だけ作り直す（位置と盤面はそのまま）。`skip()` は `pendingOfferAt()` で止まる。

### 継承と魔王軍レベル（2026-09-10・Claude）── 人は消えるが、残したものは消えない

- **永久離脱の4種は全部 `Game.recordDeparture(monster, cause, extra)` を通る。**
  `cause` は `fallen`（`processCasualties`）/ `fired`（`fire`）/ `deserted`（`processDepartures`）/
  `retired`（`settleRetreat`：負傷が明ける前にもう一度担がれた）。
  **離脱の処理を4か所に書かないこと。** 書くと片方だけ遺物を残さない・片方だけ履歴に載らない、が静かに起きる。
- `st.departed[]` の1件は仕様3.2の形（`record` は離脱時点の写し、`relicId` は残した品）。
- **遺物 `st.relics[]`**：`{ id, name, traitId, from, holderUid, granted }`。
  `granted` は「この品が実際に特性を足したか」。元から同じ特性を持つ者に渡して返させたときに
  取り上げてしまわないための印。`giveRelic` が立て、`storeRelic` が見る。
  遺物は数値を動かさない。**癖が一つ移るだけ。**
- **個人カウンタ `m.record`**（`battles/wins/downed/carried/late/ate`）は
  痕跡の器（`src/core/traces.js`）が入るまでの**つなぎ**。器が入ったら器の集計で置き換える。
  更新は `tallyBattleRecords()` で、**`settleContinue` と `settleRetreat` の両方の冒頭**（名簿が動く前）。
  `deploy()` の途中に書くと引数なし呼び出しと UI 経由でずれる。読むときは必ず `memberRecord(m)` を通す
  （旧セーブには無く、`record.battles++` が落ちる）。
- **軍風 `Game.armyCulture()` は表示専用。** 撤退回数と戦死者数の比から導くだけで、
  数値・確率・抽選には一切効かせない。効かせた瞬間に「軍風を狙って作る」最適化ゲームになる。
  回帰は `tools/test-inheritance.js` の8番（軍風を変えても応募者の種族・能力が1ビットも変わらない）。
- **魔王軍レベル `Game.armyLevel()` は `campaignLevel()` の別名。新しいパラメータは作らない。**
  応募者・敵・HUD が同じ一つの値を読む。係数は data（`MONSTER_RULES.applicantGrowth` /
  `levelPerTurn`）。**敵の段階は征服段階ではなく魔王軍レベルで引く**（`buildMission`）。
  征服段階は「どこまで攻め落としたか（クリア判定）」の意味だけ残っている。
- **縁の応募者は `legacyReturn`（魔界史の帰還者）とは別の枠**に入れる。同じ枠だと片方が消える。
  予約は `st.pendingBond` に1件だけ持ち、次の `genApplicants()` で消費する。
- `src/data/bonds.js`（`BOND_MOTIVES`）を新設した。**読み込み口は `index.html` と `tools/sim.js` の
  ファイル一覧の両方**。run.js 側は `typeof BOND_MOTIVES` で守ってあるので、足し忘れても落ちはしないが
  志望理由が既定のままになる。

### 種族技（2026-09-10・CodeX／戦闘フックBまで完了）── 上位技は条件を満たしたときだけ起きる

- `src/data/skills.js` の **`SKILL_RULES`** は `{ unlockBattles: 6, growthPerBattle: 0.025,
  growthCapBattles: 12 }`。`traits.js` の後に読む。解放・小成長・保存はまだC（`run.js`）なので、
  現時点の既存名簿へは自動で技を付けない。
- tier 2 の `TRAITS.*.skill` は `{ species, tier: 2, replaces }`。`lines.unlock` は結果画面用、
  `lines.use` は戦闘の既存 `trait_trigger.quote` 用。11技は `ogre_charge` / `great_fireball` /
  `blood_howl` / `goblin_tactics` / `gale` / `split` / `bone_wall` / `decay` / `fire_play` /
  `grand_summon` / `tidal_wave`。**敵には技を付与しない**（Cでの解放も応募者のみ）。
- 新フック **`onAllyHit({ unit, ally, attacker, dmg, round, log })`**：敵対ダメージの直前、
  同陣営で戦場に立つ者を順に見る。最初に0以上の数値を返した特性が肩代わり先となり、返り値が
  実ダメージ（`bone_wall` は60%）。肩代わり元は無傷。`incident` の仲間割れには発火させない。
  行動・対象・人数の判定には **`onField`** を使う。
- スキル用の `trait_trigger` は既存イベントで、`sourceId / traitId / name / quote` を持つ。
  大火球の燃焼は flag に元の発動イベントを持ち、**次ラウンド開始時**にその子 `splash { label:"燃焼" }`
  として解決する。新イベント種別は増やさない。
- `split` の `onLethal` は `{ survive: true, hp }` と `ctx.summon(spec)` を返せる。battle.js が
  `summon` イベントと戦闘専用ユニットを作る。既存の `true`（HP1で耐える）との互換を守ること。
- `gale` は既存の速度ソートを先に済ませてから、ラウンド1の技持ちを先頭へ移す。
  これで技無し編成に乱数消費を足さない。`fire_play` はラウンド終了時に敵配列の先頭と次の生存者を
  入れ替え、次ラウンドの標的順だけを変える（最大2回）。
- 回帰は `node tools/test-skills-battle.js`（24件）と既存Node全件。Cで解放を接続したら、
  `tools/sim.js` の読み込み列へ `skills.js` を足し、仕様5.1の4条件×3回と技別発動集計を実施する。

### 育成：種族技と小成長（2026-09-10・Claude／コミットC）

- **技は特性として実装されている。** 判定は `TRAITS[id].skill`（`{ species, tier, replaces }`）の有無で行い、
  **技の id をベタ書きしない**（技が増えたら勝手に追従するように）。`tier: 1` は既存の種族固有特性。
- **1段目は種族をまたいで共有されている。** 怪力（`brute`）＝オーガとオーク、
  粘体（`slime_body`）＝スライムとキングスライム。次に覚える技を引くときは
  **`skill.species === m.tplId` で必ず絞る**。`replaces` だけで引くとオークが「ぶちかまし」を覚える。
  入口は `Game.nextSkillFor(monster)` の1か所（面接の札もここを読む。二か所で探さない）。
- **`chain.js` の `CLASSIFY.trait_trigger` に技を足さないとゲームが止まる。**
  未分類の因果イベントは黙って0段扱いにせず例外で止める設計なので、技が1つ発動した瞬間に落ちる。
  役の決め方：効果を子イベント（伝播ダメージ・追加行動・召喚・蘇生・肩代わりの一撃）が担うなら
  `declaration`、そのイベント自体が唯一の表現なら `effect`。**新しい技を足したらここも足す。**
- **解放と小成長は `settleContinue` と `settleRetreat` の両方から**（`trainSurvivors`）。
  `deploy()` の途中に書くと引数なし呼び出し（sim・テスト）と UI 経由（`offerRetreat`）でずれる。
  数えるのは `contribution` の uid（出撃した者だけ。留守番は育たない）。傭兵は育たない。
- **小成長は差分方式**（`m.base` から目標値を出し、`m.grown` が積んだ量を覚えて差分だけ足す）。
  仕様は「毎回 base から組み直す」だったが、城内事件が HP を恒久的に減らす（`events.js`）ため、
  組み直すとその傷が黙って治る。差分でも二重加算は起きない。
  **昇進の boost は現在値へ直接かかる別枠。`m.base` と `m.grown` には触らないこと。**
- 旧セーブは現在値を `base` にし、`grown` は 0（それまでの伸びは「もう入っている」扱い）。
  0 にせず組み直すと、ロードした瞬間に古参が突然強くなる。
- `SKILL_RULES` は `src/data/skills.js`。**sim のオン・オフはこの値で切る**
  （`unlockBattles: 999` で技オフ、`growthPerBattle: 0` で小成長オフ）。読み込み順は `traits.js` の後。

## 6. テストの走らせ方

### バランス検証（ブラウザ不要・速い）

```bash
node tools/sim.js 50
```

各戦略の行の直後に「施設到達: Lv1以上 xx%（Lv3 yy%）／選択 …／拠点接収 N回」と
「ビルド名: N種/Mラン　多い順 …」が出る。到達率が0の戦略で施設の効果を語らないこと。

ビルド名の行は**ランごとの差が出ているかの物差し**として読む。1種類の名前が半分以上を
占めていたら、その戦略は毎回同じことをしている（または修飾の優先順位が珍しさを表していない）。

14種類の採用・作戦・部門・給与戦略で通常はそれぞれ50ランを回し、クリア率・敗北ステージ・
施設Lv・食料不足・給与方針・シナジー出現数・再起/求人/事件の回数を出す。**データを触ったら必ず流すこと。**
オーナー判断（2026-09-01）により、多少の変なバランスは本作の味として許容し、通常変更で
200ランの厳密さは求めない。戦闘式や経済式を大きく変えた場合だけ100〜200へ増やす。

昇進実装後の想定クリア率（再起1回を使う前提）は、通常ビルドがおおむね10〜70%。
略奪4回ルートは約30%、慎重経営は約45〜55%。古参が育つぶん以前より高いが、
寄り道と育成が報われることを優先した意図的な変化。80〜90%が常態化したら将軍量産を疑う。

軍団と出撃隊の状態契約だけを素早く検証する場合:

```bash
node tools/test-army.js
```

魔界史のビルド名（何が名前になるか・珍しさの順序）を検証する場合:

```bash
node tools/test-build-name.js
```

三部門の給与・食料・建設・施設補正・旧セーブ移行を検証する場合:

```bash
node tools/test-departments.js
```

通常支給・意図的未払い・前払い厚遇の契約を検証する場合:

```bash
node tools/test-payroll.js
```

昇進の閾値・能力上昇・将軍の号令を検証する場合:

```bash
node tools/test-promotions.js
```

戦闘中ハプニングを決定的乱数で検証する場合:

```bash
node tools/test-battle-happenings.js
```

効果音キュー・音量保存・ミュートをブラウザ無しで検証する場合:

```bash
node tools/test-sound.js
```

BGMが軍団の状態を正しく演奏へ翻訳しているか検証する場合:

```bash
node tools/test-music.js
```

尺が事件の大きさに比例しているか（保護対象・圧縮対象・延長規則）を検証する場合:

```bash
node tools/test-battle-pacing.js
```

代表CHAIN経路と非ダメージ貢献の帰属を検証する場合:

```bash
node tools/test-battle-report.js
```

施設の発火要約・全滅回避判定・死者ごとの連鎖と、戦果の `facility` 契約を検証する場合:

```bash
node tools/test-facility-report.js
```

ラン全体の主要記録（最大CHAIN・最大OVERKILL）と魔界史保存を検証する場合:

```bash
node tools/test-run-records.js
```

KPI測定契約（ビルド試行・リトライ・テンポ・離脱箇所）を検証する場合:

```bash
node tools/test-kpi.js
```

編成画面のシナジー予告（実効倍率・入れ替え案内）を検証する場合:

```bash
node tools/test-synergy-preview.js
```

傭兵市場（金貨の出口）の状態契約を検証する場合:

```bash
node tools/test-mercenary.js
```

### ブラウザ回帰テスト（26本）

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-save playwright   # 初回のみ
sh tools/browser-tests/run-all.sh
```

`run-all.sh` は `/opt/pw-browsers/chromium-*/chrome-linux/chrome` を自動で探す。
別の場所にある場合だけ `CHROME` で指定する:

```bash
CHROME=/path/to/chrome sh tools/browser-tests/run-all.sh
```

**npm が入れた playwright と同梱ブラウザの版が食い違うと**
「Please run `npx playwright install`」で全滅する。`npx playwright install` は
走らせず（帯域も容量も食う）、`CHROME` で既存のバイナリを指すこと。

落ちたテストは `✗ FAILED` と落ちた行を表示し、`run-all.sh` 自体も 1 で終了する。
最後に `✓ 全テスト通過` が出たときだけ通ったと見なしてよい。

**モルモの全画面報告は自動で閉じない。** 報告が出ている間、下の画面のボタンは覆われていて
クリックできない（実プレイでは人が送るので問題にならない）。新しいテストを書くときは
`tools/browser-tests/helpers.js` の `autoDismissMormo(page)` を `goto` の前に呼ぶこと。
報告そのものを見たいときだけ `dismissMormo` / `silenceMormoFromNow` を使う。
開幕3日間プロトタイプより後（作戦会議以降）を見るテストは `enterMissionPhase(page)` を通す。

個別に走らせるときは `GAME` にリポジトリの絶対パスを渡す:

```bash
GAME=$(pwd) CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  node tools/browser-tests/smoke.js
```

スクリーンショットは `.screenshots/` に出る（`.gitignore` 済み）。

| テスト | 見ているもの |
|---|---|
| `smoke` | モルモ表示、タイトル→採用→三部門・給与方針→出撃→勤務報告→セーブ復元の一周 |
| `autoplay` | ラン完走×3、魔界史の蓄積、決着後にセーブが消えること |
| `mission` | 作戦3択・収支表示・略奪後の警戒度と攻略進行 |
| `retry` | 再起の巻き戻し・所持金半減・回数制限・セーブの生死 |
| `softlock` | 部隊0体で詰まないこと |
| `reroll` | 求人の費用が倍々に増えること、採用枠を消費しないこと |
| `eventui` | ハプニングの表示と選択、採用フェーズへの復帰 |
| `contrib` | 戦果パネルの数値とバー |
| `nearmiss` | 敗北時の最も追い詰めた敵HP・割合・最後の出来事 |
| `portrait` | 立ち絵の表示と絵文字フォールバック（`MODE=none/present/broken`） |
| `tier0` | 決着表示の重なり、解雇ボタンの間隔、ヒント文言 |
| `scene`/`cutin` | 戦闘演出とシナジーのカットイン |
| `effects` | ラウンド区切り、攻撃者表示、最終決戦、観戦テンポ |
| `report` | 戦果画面の主要記録2つ・代表CHAIN経路・非ダメージバッジ（クリック非依存） |
| `records` | 終了画面と魔界史カードの最大CHAIN・最大OVERKILL表示（クリック非依存） |
| `kpi` | 速度変更・スキップ・モルモ早送り・画面記録が端末内へ残ること（クリック非依存） |
| `synergy` | 編成画面の実効倍率・入れ替え案内・「あと○体」（クリック非依存） |
| `spectacle` | 見せ場の演出：帯と全画面の出し分け・積み上がるCHAIN・締め・伝播の稲妻・熱・倍速・スキップ・低モーション |
| `synergy-pool` | 発火条件を出撃枠の外まで数えること・効果は出撃者だけ・重ねがけ・予告と本番の一致 |
| `brief` | 指名求人の中盤解禁・倍々の求人費・条件に寄るが確定でない・面接をまたがない |
| `feast` | 宴の成立条件・大食漢と料理人の倍率・アンデッド不成立・備蓄上限の腐敗・飢餓3戦→飢餓適応 |
| `mercenary` | 傭兵市場の雇用・出撃・戦果表示・契約終了（クリック非依存） |
| `kingslime` | キングスライム合体の既定と、編成画面で断れること（クリック非依存） |
| `pacing` | 事件は縮めず通常攻撃だけを圧縮すること、個別倍率でも最後まで再生できること |
| `sound` | 最初の操作での音声解禁、音量・ミュート保存 |
| `music` | BGMの演奏開始、編成・場面への追従、未払いの反映、オンオフ保存 |
| `mormo` | 全画面報告、タイプ表示、発話音、タップ／キー操作、作戦から編成への遷移 |
| `clear`/`resume` | 全クリア画面、履歴書欄 |
| `casualty` | 戦死者の永久退場、欠員募集、蘇生した者が残ること |

### 分析用スクリプト（使い捨て、必要なときだけ）

`tools/analysis-*.js` に、実際に設計判断へ使った測定を残してある。

| ファイル | 測るもの |
|---|---|
| `analysis-casualty.js` | 勝利時の戦死数の分布 |
| `analysis-racecheck.js` | 純粋種族軍 vs 混成軍の勝率を直接比較 |
| `analysis-loyalty.js` | 未払いの発生率と離脱率 |
| `analysis-duration.js` | 戦闘演出の実尺と、尺のうち「縮めない事件」が占める割合（ステージ別） |
| `kpi-report.js` | 実機のKPI（`copy(KPI.export())` で書き出したJSON）を読む。分析画面の代わり。ビルド試行・シナジー接続（トリガー種類／最大CHAIN／代表CHAINの能力数）・停止画面 |
| `analysis-events.js` | ハプニング16種の出現と解決の検証 |
| `test-labor-events.js` | 給与抗議→ストライキ行進の予約・解決・配属変更・旧セーブ移行 |
| `test-enemy-formations.js` | 敵の代替隊列、戦力帯、事前開示、戻る操作で再抽選されないこと |
| `analysis-voices.js` | 戦闘後の一言が状況どおり選ばれるか |
| `analysis-shape.js` | 戦闘のラウンド数・ログ行数 |

### 勇者襲来の縦切り試作（`hero-arrival.html`）

本編とは独立している。本編のデータを変えても壊れないし、逆に試作を変えても本編は動く。

```bash
node tools/test-hero-arrival.js      # 世界ロジックと境界（ブラウザ不要・速い）
node tools/sim-hero-arrival.js 300   # 迎撃の数値校正。編成・育成・酔いで差が出るか
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  GAME="$(pwd)" SP="$(pwd)/.screenshots" node tools/browser-tests/hero-arrival.js
```

ブラウザテストは実機で B を一周し、発見の一言・敵情への接続・台帳を見たうえで、
**本編の localStorage が試作の前後で1文字も変わらないこと**を差分で確認する。
試作の数値（`HERO_PARTY` / 人物の `base`）を触ったら `sim-hero-arrival.js` を流し直すこと。
本編の `tools/sim.js` は試作とは無関係（試作は `src/data/` を読んでいない）。

---

## 7. オーナーの意向として覚えておくべきこと

過去のやり取りで繰り返し出てきた方向性。

- **「実装できるか」より「もう一回遊びたくなるか」を優先する**
- **恒久成長を「攻撃力+1%」にしない**。増やすのは
  選択肢・組み合わせ・発見・歴史であって、強さそのものではない
- **くすっと笑える世界観を守る**。プレイヤーの意識が効率化に寄りすぎると
  「数字だけのゲーム」になる。履歴書・戦闘後の一言・ハプニングは全部この対策
- **鬼畜・ハプニング寄りのネタを歓迎**（仲間割れ、見せしめ、引き抜き、賭博 等）
- BGMは実装済み（軍団が演奏する方式）。音源の差し替えとSFX候補の採用は、
  オーナーが試聴してから決める
- 画像は CodeX 側で生成する。仕様は README の「絵を発注するときの仕様」を参照
- 変更したら**小さい単位でコミットし、何を・なぜ・どう確認したか・残る問題**を報告する
