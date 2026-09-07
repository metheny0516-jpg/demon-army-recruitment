# CHAIN V2 表示・記録切替計画（2026-09-07）

## 1. 目的と現在地

`Chain.summarize(timeline)` と定義バージョン保存は `75ed826` で本体へ追加済み。
ただし `Chain.RECORDED_VERSION` はまだ `1` であり、戦闘中表示・戦果・魔界史・KPI・倍率・
演出閾値・ハプニング条件はすべて V1 のままである。

この計画は、プレイヤーへ「同じ実効果を一度だけ数える」V2表示を届けるまでの依存関係を固定する。
現段階では値も表示も切り替えない。

## 2. 消費者とデータ源

| 消費者 | 現在のデータ源 | V2で読むべきもの | 担当 |
|---|---|---|---|
| 戦闘中の段数・固定帯・CHAIN履歴 | timeline の raw `chainDepth` | `Chain.summarize(timeline).events[]` と `steps[]` | Sol (`src/ui/battle_scene.js`) |
| 戦果の最大CHAIN・代表経路 | `lastBattle.chainSummary`（V1） | 保存済みのV2要約 | Opusが保存、Solが表示 |
| 魔界史の最大CHAIN | record の `maxChain` | `maxChain` と `chainDefVersion` の組 | Opusが保存、Solが表示 |
| KPI | entry の `chainMax` | 同じ版の値だけで集計 | Opus (`src/core/kpi.js`, tools) |
| 倍率・ハプニング・教訓・ビルド名 | raw `chainDepth` / V1 `maxChain` | 別測定後に決定 | 別タスク |

## 3. 実装順

### A. 戦果へV2要約を保存する契約を実装（Opus、Astra承認済み）

戦闘中はtimelineから正規化できるが、`lastBattle` はtimelineを保存しない。そのため、ロード後の戦果で
V2代表経路を再構成できない。V2切替前に、`Chain.summarize(result.timeline)` のうち表示に必要な
`defVersion / maxDepth / rawMaxDepth / deepest.steps` を戦果へ保存する必要がある。

Astra承認済みの保存形は次のとおり。既存V1の `chainSummary` は破壊しない。

```js
lastBattle.chainView = {
  defVersion: 2,
  maxDepth,
  rawMaxDepth,
  deepest: { steps: [] } // 経路がなければ deepest は null
};
```

- 正規化APIの出力から作り、UIで再計算しない。
- `steps` は名前・能力・効果・根拠イベントID・行為者／宣言者・召喚の各役を保持し、
  timelineなしで再表示できる形にする。
- `pathTo` などの関数は保存せず、JSON化できる値だけにする。
- 旧セーブで `chainView` がなければV1表示へ戻す。ロード時に推定生成しない。
- V1途中ランではV1表示を維持する。`chainView.defVersion`（API出力契約）と
  ランの `chainDefVersion`（記録値の定義）を混同しない。
- 保存→ロードで代表経路と帰属が一致し、再起で対応する戦果へ戻ることを回帰テストにする。

承認範囲はこの加算保存契約まで。`maxChain`・KPI・倍率・閾値のV2切替は含まない。

#### 実装済み（2026-09-07・Opus）

`Chain.viewOf(timeline)` を追加し、`run.js` の `lastBattle` へ `chainView` を1行足した。
保存するのは `defVersion` / `maxDepth` / `rawMaxDepth` / `deepest` の4つだけで、
`deepest` は `steps` だけを持つ（`pathTo()` などの関数は保存しない）。
最後に `JSON.parse(JSON.stringify(...))` を通し、関数や循環が紛れ込んだら
**保存されてから気づくのではなくその場で落とす**。

- `migrateState()` に `chainView` の既定値は**足していない**。`chainView` の無い戦果は
  無いまま残り、読む側が V1 表示へ戻す。**ロード時に推定生成しない。**
- ランの `chainDefVersion` は **1 のまま**。`chainView.defVersion`（API出力契約の版 = 2）と
  混同しないよう、回帰テストで「2つが別の値として共存する」ことを固定してある。
- 回帰テストは `tools/test-chain-view.js`（28件）。実際に戦闘を通して
  **2段以上かつ宣言結合を含む代表経路**の戦果を作り、保存→ロードで各 step の
  行為者・宣言者・能力・効果・分岐印が1つも変わらないこと、再起でチェックポイント時点の
  戦果へ戻ること、旧セーブに要約を作らないことを見る。
- 不変性は2方向で確認した。`a44a152` と比べて
  **300戦のタイムライン・CHAIN値・倍率タグ・勝敗がバイト単位で一致**、
  **120ランの `maxChain`・教訓の提示・ビルド名・V1 `chainSummary`・OVERKILL・KPI が完全一致**。

### B. 戦闘中UIをバージョン分岐（Sol）

- `Chain.versionOf(Game.state) === 1` は現在の表示を完全維持する。
- V2だけ、eventIdから正規化イベントとstepを引く表示用indexを再生開始時に1回作る。
- 固定帯、現在段数、履歴、代表経路は構造化された `actor / declaredBy / ability / effect` から組み立て、
  raw `text` を解析しない。
- 宣言イベント単体では段を増やさず、直接の効果子を再生した時点で「《能力》による効果」を1段として出す。
- 分岐は効果stepごとに表示する。同じ宣言の重複表示は許容するが、同じstepを二度加算しない。
- 早送り・スキップも同じindexを通し、通常再生との段数差を作らない。

演出尺の保護判定、稲妻強度、モルモの「5段以上」台詞は閾値タスクに含め、ここでは変えない。

### C. 戦果UIをバージョン分岐（Sol）

- V1戦果は現在の `chainSummary.maxChain / deepest.steps` をそのまま表示する。
- V2戦果はAで保存した要約を表示し、`maxDepth` を最大CHAINとする。
- 起点・宣言者・実行者を混同せず、結合済みstepを1個の出来事として表示する。
- 旧セーブや要約欠落はV1へ戻し、V2らしい値を推測しない。

### D. 魔界史UIを版ごとに分離（Sol）

- 各カードの `chainDefVersion` を `Chain.versionOf(record)` で読む。
- V1とV2が混在する履歴では最大CHAINへ版表示を添え、直接比較できる見た目にしない。
- 単一カード内では主要記録を「最大CHAIN・最大OVERKILL」の2つから増やさない。
- 並べ替え、歴代最高値、合算など版をまたぐ集計は行わない。

### E. KPI分離（Opus）

- `chainDefVersion` ごとに `chainMax / chainAbilityMax / chainSample` を集計する。
- V1とV2を同じ最大値・平均へ混在させない。
- 旧KPIはV1。推定変換しない。

#### 実装済み（2026-09-07・Opus）

分離は `KPI.chainStatsByVersion(runs)` の1か所に集約した。版の読み出しは `Chain.versionOf()` だけを
使い、レポート側に写しを持たない（`tools/kpi-report.js` が `src/core/chain.js` と
`src/core/kpi.js` を `require` する）。

- `chainMaxMean` / `chainMaxTop` / `chainAbilityMean` / `chainAbilityTop` / `sample` は
  **すべてその版のランだけ**から作る。代表CHAINも版ごとに選ぶ。
- **`triggerKinds` は分離の対象外。** 段数の数え方ではなく「どの能力が連鎖に参加したか」なので、
  版をまたいでも意味が変わらない。
- `KPI.battleFinished()` は `Chain.RECORDED_VERSION` を読み直さない。
  ラン途中で切替コミットを跨いでも、1ランの中でV1とV2が混ざらない
  （混ざった時点でその `chainMax` はどちらの定義でもない値になり、後から分離できない）。
- レポートは**版が1つなら従来どおりの見出しと数字**を出す。混在時だけ警告と版別ブロックにし、
  統合した平均・最大・代表CHAIN・判定を出さない。
- 回帰は `tools/test-kpi-chain-version.js`（47本目）。V1のみ／V2のみ／混在／バージョン欠落・
  不正の4入力を固定し、混在時に全体平均(4.25)や版をまたいだ最高値が現れないことを見る。
- 不変性: `f0273ae` と比べて V1のみ・バージョン欠落のみのレポート出力が**バイト単位で一致**。
  120ランの `maxChain`・教訓・ビルド名・V1 `chainSummary`・OVERKILL・KPI も完全一致、
  300戦の戦闘結果も完全一致。

### F. 倍率・閾値切替（別タスク）

全15戦略×200の測定前には変更しない。対象は共通CHAIN倍率、ハプニング条件、演出閾値、
教訓 `<=2`、ビルド名 `>=6`。表示・保存切替の回帰と分離して扱う。

## 4. 切替条件

`Chain.RECORDED_VERSION = 2` にするコミットで、同時に次を満たす。

1. そのコミット以後に始める新規ランだけV2。
2. 進行中ラン、ロード、再起、再起動は保存済みV1/V2を維持。
3. `maxChain`、戦果、魔界史、KPIが同じ定義バージョンを記録。
4. V1表示のスナップショットが切替前と一致。
5. V2の期待経路9件・分岐20件がUI表示でも一致。
6. 通常再生・倍速・スキップ・ロード後戦果で同じ段数と経路になる。

## 5. テスト境界

- Node: 正規化API、途中ラン/ロード/再起/再起動/旧セーブ、V1/V2の記録分離。
- UI純関数: rawイベントと正規化stepから同じ表示モデルを作ること。宣言結合・分岐・召喚の役を固定。
- Browser: 戦闘固定帯、CHAINカウンタ、履歴、戦果、終了画面、魔界史、再起、ロード、スキップ。
- 不変性: V1ランの戦闘結果・倍率タグ・既存表示が切替準備前後で一致。

Sol環境ではPlaywrightのChromium実体が未配置のため、ブラウザ検証は実行可能環境での確認が必要。
