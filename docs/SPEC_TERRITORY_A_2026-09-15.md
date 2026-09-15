# 仕様：地図の上の戦争・段階A ― 一本道を面にする（2026-09-15、Claude）

設計：`docs/DESIGN_WORLD_CAMPAIGN_2026-09-15.md`。オーナー判断（2026-09-15）：規模は土地20＋部族10、「贈る」あり、進め方は任せる。
姉妹：`DESIGN_CAMPAIGN_ROUTE_2026-09-15.md`（三本の糸。段階D）。

## 0. 一文で

**3択の中身を「略奪／反乱／進軍の固定」から「地図で隣接する候補3つ」に変える。落とした土地・従えた部族が領土になり、領土の効き目（食料・金・応募者）が毎決着に効く。巡回の札で何度でも雑魚と戦える。既存の征服度・段階表・sim はそのまま動く。**

## 1. エンジン側（Claude・済み 2026-09-15）

- `src/data/territories.js`：`TERRITORY_KINDS`（土地の種類10）、`TERRITORY_LANDS`（20）、`TERRITORY_TRIBES`（10・首領は6か所）、`TERRITORY_RULES`（数値はここだけ）。
- `src/core/territory.js`：`Territory`（純粋関数。ブラウザAPI・Game に触らない）
  - `init(st)` 旧セーブは `{ lands: [], tribes: [] }`。
  - `frontier(st)` 領土に隣接する未領土（幕で絞る）。`candidates(st, rng)` 候補3つ（人間界と魔界を決着の偶奇で交互に厚く。両方あれば両方混ぜる）。
  - `take(st, id)` / `lose(st, id)` 領土の増減。`effects(st)` 効き目の合計 `{ food, gold, applicants, defenseLine, noPriest, wageMult, landing, recruit[] }`。
  - `tributeCost(id)` 贈る値段（首領がいる部族と人間界は null）。`conquestOf(st)` 既存の征服度 0〜8 への写し。`patrolStage(st)` 巡回の守備段階。
- `tools/test-territory.js`（24件）。

## 2. run.js 側（Opus）

触るファイル：`src/core/run.js`、`src/ui/ui.js`（札の一行）、`src/ui/map.js`（領土の色と候補の光り）、`index.html`（script 2行：`src/data/territories.js` を `map.js` の後、`src/core/territory.js` を `core/town.js` の後）、`tools/sim.js`、`tools/test-*.js`。**battle.js・territories.js・territory.js は触らない**（足りない関数があれば Claude に言う）。

### 2-1. 状態
- `st.territory`（`Territory.init`）。`migrateState` で旧セーブに空を入れる。
- `st.conquest` は今までどおり持つが、**決着のたびに `Territory.conquestOf(st)` で上書き**する（段階表・討伐隊・勇者の判定はこの値を見ているので、そのまま動く）。
- `st.patrolCount`（巡回の回数、sim の列用）。

### 2-2. 作戦会議の札（3枚＋常設2枚）
- 通常：`Territory.candidates(st, U.rand)` の3つを `buildMission` で作戦に写す。**種類（type）は場所から決める**：
  - 人間界の土地 → `invade` の型（守備隊＝`ENEMY_STAGES[garrison-1]`、警戒・報酬は invade と同じ）。札の一行は `TERRITORY_KINDS[kind].line`。落とすと `Territory.take`。
  - 部族圏 → `suppress` の型（守備隊＝同じ段階表、名前は `enemyNames` で「○○の群れ」）。勝てば `Territory.take`（従える）。首領がいる部族は段階Bまで**首領なしの群れ**として扱う（`chief` は無視）。
  - 札の中で「落とす／略奪」を切り替えられる（略奪＝`raid` の型、報酬 `TERRITORY_RULES.raid.rewardMult`、警戒 `+alert`、その土地は次回 `garrisonBonus` 段階硬い。`st.raided[id] = n`）。
  - 部族圏の札に「贈る」（`Territory.tributeCost(id)` が null でないとき）：金と食料を払って戦わずに `take`。決着は1つ進む（`turn` は加算）。
- 常設2枚：「訓練場で稽古」（今のまま）と**「領内を巡回」**（`patrol`）：守備隊＝`ENEMY_STAGES[Territory.patrolStage(st)-1]`、名前は「辺境のパトロール隊」（人間界の領土が1つ以上）か「反乱の残党」（部族圏が1つ以上、どちらもあれば交互）。報酬 `patrol.rewardMult`、征服は進まず、警戒は上がらない。戦死はある。
- 防衛の予約（討伐隊・勇者）は今のまま。予約中は「防衛＋訓練＋巡回」の3枚。
- 候補が0（幕の全部を落とした）なら、都を落としているはずなので幕の着地へ（今の `conquest >= MAX_CONQUEST` の経路）。

### 2-3. 決着ごとの効き目
- `Territory.effects(st)` を `settle`（決着）で読む：`food` を食料へ、`gold` を金へ、`applicants` を応募者数へ、`recruit` の種族を**応募者に1人ずつ混ぜる**（`genApplicants` で種族指定の応募を足す口。無ければ Claude に言う）。`wageMult` は応募者の給与に掛ける。
- `defenseLine`・`noPriest`・`landing` は段階Cで使う。今は保存だけ（読まない）。
- 城下町の税（`Town.settle`）は `Town.territories(st)` が `st.conquest` を読んでいるので変えない。

### 2-4. 地図（`src/ui/map.js`）
- 領土の地点を色で塗る（既存の pin-owned）。候補3つを光らせ、タップで作戦会議のその札へ。
- **座標**：今の地点14は段階＝土地の対応で仮に使う（h01→p1 … h12→p8、h13→p9 … h20→p14。部族圏は城下町の下に横一列で仮置き）。正しい配置は段階E（CodeX の絵と `map.js` の座標表）。

### 2-5. sim（`tools/sim.js`）
- 戦略を2本足す：「近い順に落とす」（候補の先頭）と「港と町を優先」。列に「領土数」「巡回回数」。
- 受け入れ条件：全戦略が完走、クリア率は今の帯（主要 100%・勇者据え置き）から大きく動かない、全滅 4〜6 回/10ラン。

### 2-6. テスト
- `tools/test-territory-run.js` 新規（4件）：候補3つが作戦会議に出る／落とすと領土と征服度が進む／贈るで金と食料が減って領土になる／巡回は征服が進まず警戒も上がらない。
- ブラウザ `tools/browser-tests/map.js` に1件：領土の色と候補の光り。

## 3. 絵（CodeX・段階E の前倒し分だけ）
- 土地の種類10種の**印**（地図に置く小さな絵、64×64 透過、既存の pin と同じ画風）：村・集落・橋・峠・関所・砦・港・神殿・町・都。
- 部族圏10の印（64×64）：種族の顔が分かる程度。
- 背景の描き直しは段階E。今は印だけ。

## 4. 貼り付け用（Opus 用。決めポーズの配線と施設の詳細画面の後）
```
Opus へ。まず git pull（作業ブランチ claude/hero-arrival-tavern-prototype-uy2toh）。docs/SPEC_TERRITORY_A_2026-09-15.md の §2 を実装して。エンジン側は済み（src/data/territories.js と src/core/territory.js、tools/test-territory.js に使い方）。触るのは run.js・ui.js・map.js・index.html（script 2行）・sim.js・テストだけ。battle.js・territories.js・territory.js は触らない（足りない関数があれば言って）。3択を Territory.candidates の候補3つに、常設に「領内を巡回」を足す、決着ごとに Territory.effects を読む、st.conquest は Territory.conquestOf で上書き。コミットは (a) 状態と候補 (b) 効き目と巡回 (c) 地図 (d) sim とテスト の4つ。run.js と battle.js を同じコミットに入れない。node 全件・sim 20・ブラウザテストを直列で回して緑を確認してから push。
```

## 5. 貼り付け用（CodeX 用）
```
Astra へ。docs/SPEC_TERRITORY_A_2026-09-15.md の §3 をお願いします。地図に置く印を20枚：土地の種類10種（村・集落・橋・峠・関所・砦・港・神殿・町・都）と部族圏10（src/data/territories.js の TERRITORY_TRIBES の name と race）。64×64 透過 webp、既存の assets/map/pin-*.webp と同じ画風。ファイル名は assets/map/pins/kind-<kind>.webp と assets/map/pins/tribe-<id>.webp。ブランチ codex/territory-pins、作業ブランチから切って push。src/ は触らない。
```
