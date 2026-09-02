# 戦闘の尺は事件の大きさに比例する — 実装仕様

更新日: 2026-09-02
対象契約: `GAME_DESIGN_PRINCIPLES.md` 第3節「戦闘の尺は事件の大きさに比例する」
実装者向け。設計はここで固定し、実装はこの文書どおりに行う。判断に迷う点は末尾「未決事項」に書いた。

---

## 0. 一文で

現行の「総尺45秒超で全イベントを一律加速」を廃止し、**通常攻撃と何も反応しなかった区間だけを縮め、
CHAIN・OVERKILL・シナジー初発見・逆転・蘇生・召喚・永久戦死は縮めず、むしろ大きさに応じて長く見せる。**

## 1. 責務分担（変えない約束）

```
Battle.simulate()  →  timeline[]  →  BattleScene.play(timeline)
（何が起きたか・重要度）  （唯一の真実）   （何ms見せるか・何を縮めるか）
```

- **core側**（`src/core/battle.js`、`src/core/run.js`）は「これは縮めてはいけない事件か」を判別するための
  **印**だけをタイムラインに足す。戦闘計算、ダメージ式、勝敗、乱数の消費順、バランス数値は一切変えない。
  既存イベントの `type`・`emphasis`・順序も変えない。
- **UI側**（`src/ui/battle_scene.js`）が印と因果メタデータを読んで、尺の伸縮と圧縮対象を決める。
  戦闘中に別状態を持ち回らず、必要な情報はすべてタイムラインから導出する。
- `tools/sim.js` は `battle_scene.js` を読み込まないので、バランス測定はこの変更の影響を受けない。

## 2. core側: 重要度の印（3つだけ）

### 2-1. `death.permanent`（永久戦死）

`battle.js` の `simulate()`、勝敗確定後・`result` 発行前に付ける。

- 対象: 戦闘終了時に `alive === false` の **味方** ユニット。`flags.summoned` の召喚物は除く。
- そのユニットの **最後の** `death` イベント（`[...timeline].reverse().find(...)`）へ `permanent: true`。
- 敵の死亡には付けない。「永久戦死」は軍団からの永久退場を指す。

### 2-2. `result.reversal`（逆転）

`result` イベントに `reversal: boolean` を追加。**タイムラインから導出**する（`summarizeNearMiss()` と同じ再生方式）。

- 新規関数 `Battle.detectReversal(timeline)`:
  - `battle_start.player` のスナップショットを起点に味方の現在HPを `Map` で持つ（召喚物は起点にいないので自然に除外）。
  - `attack` / `splash` の `toId`、`heal` / `revive` / `survive` の `unitId` が味方なら `hp` を更新。
  - 各イベント後に `Σhp / ΣmaxHp` を計算し、その最小値を記録。
- `reversal = victory && 最小HP割合 <= 0.30`。全滅救済（総HP0）からの勝利は自動的に含まれる。
- 閾値0.30は定数として関数内に置き、コメントで理由（「3割以下まで追い込まれてからの勝ち」）を書く。

### 2-3. `synergy.firstDiscovery`（シナジー初発見）

`run.js` の `recordDiscoveredSynergies(result)` を拡張する。既に `timeline` から `synergy` を拾って
`discoveredSynergyIds` へ登録している。**未登録だった id を登録するとき、そのイベントへ `firstDiscovery: true` を付ける。**

- キングスライム合体は `addMergeSynergy()` が先にタイムラインへ挿入しているので、そのまま対象になる。
- `discoveredSynergyIds` はラン内の記録。魔界史全体で初かどうかは見ない（判断: 各代の「初めて見た」を祝う）。

### 2-4. 付けないもの

- `chainDepth` ・ `parentEventId` は既存のまま使う。新しい深度計算はしない。
- OVERKILL の大きさは既存の `overkill.emphasis`（ランク由来 1〜3）と `percent` を使う。新フィールド不要。

## 3. UI側: 尺の決定

`src/ui/battle_scene.js` を次のように変える。既存の `DURATION` / `SPECIAL_DURATION` の基礎値は変えない。

### 3-1. 定数

| 旧 | 新 | 値 | 意味 |
|---|---|---|---|
| `AUTO_CAP_MS` | `BUDGET_MS` | 45000 | x1での目標総尺。**予算**であり上限ではない（保護区間だけで超えてよい） |
| `MIN_AUTO_SCALE` (0.62) | `MIN_COMPRESS` | 0.45 | 圧縮対象イベントの最小倍率。退屈な区間なので旧値より深く縮めてよい |
| — | `PROTECTED_TYPES` | 下記 | type だけで保護が決まるもの |

```js
PROTECTED_TYPES: new Set([
  "battle_start", "dialogue", "synergy", "facility_trigger", "trait_trigger",
  "resource_gain", "resource_forfeit", "resource_consume",
  "overkill", "revive", "summon", "survive", "incident", "result"
])
```

### 3-2. 保護判定 `isProtected(ev, hasChildren)`

`hasChildren` は「このイベントを `parentEventId` に持つイベントが存在するか」。`plan()` が事前に集計して渡す。

判定順:

1. `PROTECTED_TYPES` に含まれる → **保護**
2. `hasChildren` → **保護**（何かが反応した起点。撃破攻撃は `death` が子なので常にここで保護される）
3. `type === "death"` → `!!ev.permanent`（永久戦死だけ保護。敵の死亡・蘇生で戻る死亡は圧縮可）
4. `type === "attack" || "splash"` → `chainDepth >= 3` で保護
   （火球の追撃は深度2で圧縮可。強欲の追加行動、連鎖虐殺の伝播、暴食の宴の追加行動は深度3以上で保護）
5. それ以外（`round_start`, `note`, `heal` など）→ `chainDepth >= 2` で保護、そうでなければ圧縮可

圧縮対象になるのは結果として: 反応を生まなかった通常攻撃・追撃、ラウンド区切り、特性ログ行、再生・祈りの回復、
敵の死亡、蘇生で戻る味方の死亡。契約の「通常攻撃と何も反応しない区間」に一致する。

### 3-3. 大きさに応じた延長 `magnitude(ev)`

`durationOf(ev)` は `基礎尺 × magnitude(ev)` を四捨五入して返す。倍率は加算で積む。

| 条件 | 加算 | 意図 |
|---|---|---|
| `chainDepth >= 3` | `+min(0.5, 0.1 × (chainDepth − 2))` | 深いCHAINほど1段を長く見せる（最大+50%） |
| `type === "overkill"` | `+0.2 × emphasis` | 蹂躙+40%、粉砕+40%、消滅・魔王級+60% |
| `type === "synergy" && firstDiscovery` | `+0.45` | 1650ms → 約2390ms。カットインを読み切れる |
| `type === "result" && reversal` | `+0.65` | 1200ms → 約1980ms |
| `type === "death" && permanent` | `+0.5` | 750ms → 約1125ms |

最終決戦の `battle_start` 1450ms は現行どおり `durationOf` 内の特例として残す。

### 3-4. 計画 `plan(timeline)`（純関数・DOM非依存）

```js
plan(timeline) {
  const parents = new Set(timeline.filter(e => e.parentEventId).map(e => e.parentEventId));
  const items = timeline.map(ev => ({
    duration: this.durationOf(ev),
    protected: this.isProtected(ev, !!(ev.eventId && parents.has(ev.eventId))),
    scale: 1
  }));
  const protectedMs   = sum(items.filter(i =>  i.protected), duration);
  const compressibleMs = sum(items.filter(i => !i.protected), duration);
  const rawMs = protectedMs + compressibleMs;
  let compressScale = 1;
  if (rawMs > this.BUDGET_MS && compressibleMs > 0) {
    compressScale = clamp((this.BUDGET_MS - protectedMs) / compressibleMs, this.MIN_COMPRESS, 1);
  }
  for (const item of items) if (!item.protected) item.scale = compressScale;
  return { items, rawMs, protectedMs, compressibleMs, compressScale,
           plannedMs: sum(items, duration * scale) };
}
```

- 保護区間だけで予算を超える場合は `compressScale = MIN_COMPRESS` になり、**保護区間は1.0のまま**。予算超過を許容する。
- 総尺が予算内なら何も縮めない（現行と同じ）。
- `eventId` の無い合成タイムライン（ブラウザテスト）では `hasChildren` は常に false。テストはそれを前提に書く。

### 3-5. 再生

- `play()` で `this.pacing = this.plan(timeline)` を保持。
- `step()` で `const item = this.pacing.items[this.index]` を取り、`this.eventScale = item.scale` を設定してから `render(ev)`。
  待ち時間は `max(60, duration × item.scale / this.speed)`。
- `showAction` / `pulse` / `cutin` / `roundBanner` / `battleIntro` の補助タイマーが参照している `this.autoScale` を
  すべて `this.eventScale` に置き換える（そのイベントの倍率で付随演出も伸縮する）。
- `skip()`、速度切替 x1/x2/x4、LocalStorage 保存は変更しない。速度は圧縮の後段で掛かる。

## 4. 測定と調整

- `tools/analysis-duration.js` の `measuredMs()` を `Scene.plan(timeline).plannedMs` に置き換える。
  さらに **保護区間の占有率** `protectedMs / plannedMs` を段階別に出す列を1つ足す。
  これが契約の測定指標（戦闘時間のうち事件が占める割合）。
- 実装前後で `node tools/analysis-duration.js` を取り、READMEの「実測の平均演出尺」を更新する。
  期待: 終盤の平均は現行36〜41秒と大きく変わらないが、占有率が上がる。序盤が伸びてはいけない。
- `node tools/sim.js 50` は影響を受けないはずだが、run.js を触るので念のため流し、クリア率帯が変わらないことを確認する。

## 5. テスト

### 5-1. Node: `tools/test-battle-pacing.js`（新規）

`vm` で `battle_scene.js` を読み込み `plan()` を直接検証。DOM不要。

1. 短いタイムライン（合計 < 45秒）→ 全イベント `scale === 1`
2. 通常攻撃を大量に並べて予算超過 → 圧縮対象の `scale < 1`、かつ `>= MIN_COMPRESS`
3. 同じタイムラインに保護イベント（`synergy`, `overkill`, `revive`, `summon`, `chainDepth:4` の `attack`,
   `permanent` の `death`, `reversal` の `result`）を混ぜる → それらは `scale === 1`
4. `eventId` / `parentEventId` を付けた「通常攻撃 → resource_gain」の組 → 起点の攻撃が `protected`
5. 火球の追撃（`splash`, `chainDepth: 2`, 子なし）→ 圧縮対象
6. 保護区間だけで予算超過 → `compressScale === MIN_COMPRESS`、保護は 1.0
7. `magnitude`: `firstDiscovery` の synergy が通常の synergy より長い、`overkill` は emphasis が高いほど長い
8. core側の印: `Battle.simulate()` を HP1 の味方1体＋強い味方1体 vs 敵1体で回し、
   倒れた味方の最後の `death` に `permanent === true`、勝利なら `result.reversal` が boolean で存在
9. `Battle.detectReversal`: 手組みタイムラインで HP割合 0.25 まで落ちて勝利 → true、0.5 止まり → false
10. `Game.recordDiscoveredSynergies`: 未発見 id の synergy に `firstDiscovery === true`、2回目には付かない

「わざと壊したら落ちるか」を確認する: `isProtected` を常に false に変えて 3 と 6 が落ちること。

### 5-2. ブラウザ: `tools/browser-tests/pacing.js`（新規）

既存 `effects.js` と同じ骨組み。`Game.newRun()` 後に合成タイムラインで `BattleScene.play()`。

- 90発の通常攻撃＋保護イベント数個で `BattleScene.pacing.compressScale < 1` を確認
- 保護イベントの `pacing.items[i].scale === 1`、圧縮対象は `< 1`
- x4 で最後まで再生し `#next-btn` が表示される（per-event scale で進行が壊れていない）
- 短いタイムラインを別途 `play()` し `compressScale === 1`

`run-all.sh` の一覧へ `pacing` を追加する（`effects` の隣）。

### 5-3. 既存テストの追従

- `tools/browser-tests/effects.js`: `BattleScene.AUTO_CAP_MS` → `BattleScene.BUDGET_MS`（閾値 40000 は維持）
- `tools/browser-tests/scene.js`: `durationOf` を使う総尺計算はそのまま動く
- `tools/browser-tests/summon.js`: 変更不要
- `tools/test-chain-events.js` 等: フィールド追加のみなので通るはずだが全Nodeテストを流す

## 6. 文書更新

- `README.md`「尺のテーブル」節: 自動圧縮の段落を書き換える。
  「総尺が予算45秒を超えたら、通常攻撃と反応の無かった区間だけを縮める。CHAIN・OVERKILL・初発見・逆転・
  蘇生・召喚・永久戦死は縮めず、深さや大きさに応じて長く見せる」。延長表（3-3）と実測の平均尺を更新。
- `HANDOFF.md`:
  - 2-1節に「`permanent` / `reversal` / `firstDiscovery` は重要度の印。描画側の圧縮判定に使う。計算には使わない」を追記
  - 「設計憲法への4契約統合」の契約1の「→ 改修が必要」を「→ 実装済み（本節参照）」へ
  - 4節に完了項目「戦闘の尺は事件の大きさに比例（2026-09-02完了）」を追加。測定値と占有率を書く
  - 6節のテスト表へ `pacing` と `test-battle-pacing.js` を追加。1節の「目安45秒」を「予算45秒」へ

## 7. コミット

1タスク1コミット。メッセージに含める:

- 何を: 圧縮の向きを逆にした。保護対象と延長規則の要約
- なぜ: 第3節の契約
- 確認: `node tools/test-battle-pacing.js`、全Nodeテスト、`sh tools/browser-tests/run-all.sh` の結果、
  `node tools/analysis-duration.js` の前後比較（段階別平均尺と保護占有率）、`node tools/sim.js 50` の帯
- 残課題: 未決事項のうち持ち越したもの

## 8. 触らないもの

- `img/`、`シナジーイベント.xlsx`（ユーザー所有）
- `DURATION` / `SPECIAL_DURATION` の基礎値
- `Battle.simulate()` の計算順・乱数・ダメージ式・勝敗判定
- `skip()`、速度切替、Sound/Music の呼び出し

## 9. 未決事項（実装者が判断し、コミットメッセージに書く）

1. **敵の死亡を圧縮対象にする判断**。撃破攻撃そのものは `death` を子に持つため保護される。死亡演出750msを縮めても
   撃破の見せ場は残る、という設計だが、実機で味気なければ `death` を全面保護に戻す（1行の変更）。
2. **`MIN_COMPRESS` 0.45**。旧0.62より深い。x1で通常攻撃が約200msになる。速すぎるなら0.5へ。
3. **逆転の閾値 0.30**。判定勝ち（30ラウンド）で味方HPが低いケースも逆転扱いになる。それでよいと判断したが、
   実プレイで「逆転」の演出が安売りされていれば 0.20 へ。
4. **初発見の基準**（ラン内 vs 魔界史全体）。ラン内で確定した。魔界史全体にすると2代目以降ほぼ出なくなる。
