# 仕様：モルモの日誌——痕跡の接続と「城の記録」メニュー（2026-09-11）

実装担当：CodeX（Terra）。この文書と `HANDOFF.md` §0・§2 だけで始められる。
迷ったら末尾「未決」を見て、無ければ**いちばん小さい選択**をしてコミットメッセージに書く。

## 0. 一文で

**ランの小さな出来事（痕跡）を本体に繋ぎ、モルモの日誌として読めるようにする。** 日誌・蔵（遺物）・去った者を「城の記録」という一つの画面にまとめ、作戦会議・編成・面接のどこからでも開ける。内政メニューの最初の一枚。

## 進め方（オーナー指示・全仕様共通）

- 速度優先。軽いモデルのサブエージェントを2〜10体並列（調査・ファイル単位の編集・テスト・台詞）。担当ファイルを重ねない。統合とコミットは親。
- 重い処理は直列（run-all・browser-tests は一度に一つ）。sim は不要（戦闘・進行の数値は変えない）。
- **`battle.js` は触らない。** `run.js` は「記録を呼ぶ1行」を各所に足すだけ（決着の経路や順序は変えない）。

## 1. 触ってよいファイル（これ以外は触らない）

- `index.html` — `src/core/traces.js` の `<script>` を `run.js` の**前**に足す（`spotlight.js` の次）。
- `src/core/run.js` — `st.traces` の初期化・移行、`Traces.record` を呼ぶ行（2.1）、`Game.journal()`（2.2）。
- `src/ui/ui.js` — `records()` 画面（2.3）、HUD のボタン。`departedPanel` と蔵の描画は**そのまま流用**（移動しない。呼ぶだけ）。
- `src/main.js` — `records` / `backrecords` の action。
- `src/styles.css` — 記録画面の最小限の見た目。
- `src/data/mormo_lines.js` — 日誌の言い回し（2.2）。
- `tools/test-journal.js`（新規）、`tools/browser-tests/records.js`（新規、`run-all.sh` に追加）。
- `HANDOFF.md` §0 に5行、§2 に契約1節。

触らない：`src/core/battle.js`、`src/ui/battle_scene.js`、`src/core/traces.js`（器は完成している。足りなければ「未決」に書いて既定で進める）、`tools/sim.js`。
作業ブランチ：`claude/hero-arrival-tavern-prototype-uy2toh` から `codex/journal`。1タスク＝1コミット＝即push。

## 2. ルール

### 2.1 痕跡を積む（run.js）

`st.traces = []`（`newRun` と `migrateState` で無ければ作る）。`Traces.record(st.traces, { kind, subject, object, data, day: st.day, turn: st.turn })`。
`subject` / `object` は `uid`。**seq・上限（400）・保護（fallen / retreated）は器が面倒を見る。** run.js は呼ぶだけ。

| kind | どこで | subject / object / data |
|---|---|---|
| `hired` | `hire()` | 新入り / — / `{ day, lore: !!m.loreSkill }` |
| `fallen` | `recordDeparture(m, "fallen")` | 本人 / — / `{ army: stageData.army }` |
| `fired` `deserted` `retired` | 同じく `recordDeparture` の各 cause（kind は cause と同名。**器の TRACE_KINDS に無い kind は足してよい**：`fired`「解雇」`deserted`「逃亡」`retired`「引退」の3つだけ、`traces.js` の表に行を足す。これは例外として許す） | 本人 / — / `{}` |
| `retreated` | `settleRetreat`（判定負けは除く） | — / — / `{ army, carried: 担がれた名前の配列 }` |
| `carried` | `settleRetreat` の担がれた者ごと | 本人 / — / `{ army }` |
| `downed` | 決着（両経路）で `contribution` の `survived === false || injured` の者 | 本人 / — / `{ round: 分からなければ null }` |
| `late` | 決着で `contribution.late > 0` の者 | 本人 / — / `{ rounds: late, cause: lateCause }` |
| `ate` | `record.ate` が増えた者（既存カウンタの差分で） | 本人 / — / `{}` |
| `promoted` | `promote()` | 本人 / — / `{ rank: rank.name }` |
| `ordered` | `answerOrder` の名指し | 本人 / — / `{ skill: skillName, round }`（**新 kind。表に行を足す**：「号令」`{subject}に「{data.skill}」と命じた`） |
| `defended` / `ransacked` | 防衛戦の決着 | — / — / `{ army }`（**新 kind 2つ**。「防衛」「荒らされた」） |

**決着の中では `tallyBattleRecords` の直後に、名簿が動く前に積む**（戦死者の uid がまだ引ける位置）。
`Traces.record` が `null` を返しても落とさない（validate に落ちたら黙って捨てる。テストで形を守る）。

### 2.2 日誌の文（`Game.journal(limit)`）

`st.traces` を新しい順に `limit`（既定 40）件、**日ごとにまとめて**返す：`[{ day, turn, lines: [{ seq, kind, text }] }]`。
`text` は `Traces.describe(trace, nameOf)` を**モルモの口調**に包む。`MORMO_LINES.journal[kind]` に kind ごとの言い回しを2〜3本置き、`{text}` を差し込む。
例：`hired` →「{text}デス。履歴書は私が保管しておきますデス」／`fallen` →「{text}……。名簿から線を引きましたデス」／`carried` →「{text}デス。担いだ者の腰が心配デス」。
名前は `nameOf(uid)`：名簿にいれば名前、去った者は `st.departed` から、無ければ「誰か」。
**数値は言わない**（`{data.rounds}` などが文に入る kind はテンプレートを日誌用に丸める：「遅れて着いた」でよい）。

### 2.3 「城の記録」画面（`UI.records()`）

- 入口：HUD に「📖 城の記録」ボタン（`data-action="records"`）。**作戦会議・編成・面接・結果の各画面から開ける**。戦闘中は出さない。
- 画面：見出し「城の記録」、三つの節を縦に。**日誌**（2.2 の返り値。日ごとに「◯日目」の小見出し、モルモの一言を箇条書き。空なら「まだ何も書いていませんデス」）、**蔵**（既存の遺物パネルの描画をそのまま呼ぶ。渡す／戻すのボタンはこの画面では出さない＝読むだけ）、**去った者**（既存 `departedPanel()` をそのまま）。
- 戻る：「← 戻る」（`data-action="backrecords"`）で**開く前の画面**へ（`st.phase` は変えない。UI 側で `this.recordsFrom = st.phase` を覚えて `App.render()` に戻すだけ）。
- `UI.set(html, "records")` で scene を明示（見出し文字からの推定に頼らない。落とし穴既知）。

## 3. 契約（追加されるもの）

- `st.traces: Trace[]`（器の形。セーブに入る。上限400）。旧セーブは `[]`。
- `Game.journal(limit)`、`UI.records()`、action `records` / `backrecords`。
- `TRACE_KINDS` に `fired` `deserted` `retired` `ordered` `defended` `ransacked` を足す（既存の kind の形は変えない）。
- `MORMO_LINES.journal: { [kind]: string[] }`。

## 4. 受け入れ条件

### 4.1 `tools/test-journal.js`
ハーネスは `tools/test-spirit-run.js` を写す（vm、`traces.js` を読み込みに足す）。
- 採用・戦死・撤退（担ぎ）・号令・防衛の決着で、対応する kind が `st.traces` に入る（uid・army が正しい）。
- `Game.journal()` が日ごとにまとまり、文に数字が無く、名前が名簿／去った者から引ける。去った者の名前も出る。
- 旧セーブ（`traces` 無し）を `migrateState` して落ちない。
- 400件を超えても `fallen` / `retreated` が残る（器のテストが既にあるなら参照だけ）。
- 既存 node テスト全通過。

### 4.2 `tools/browser-tests/records.js`
作戦会議から「城の記録」を開く → 日誌に採用の一行がある → 「← 戻る」で作戦会議に戻る（phase 不変）。編成からも開ける。JS エラーなし。`run-all.sh` 全通過。

## 5. 落とし穴

- **`UI.set()` の scene 推定**：第2引数で `"records"` を明示。
- **`recordDeparture` の cause 名と kind 名を揃える**（`fallen/fired/deserted/retired`）。
- **決着の二経路**（`settleContinue` / `settleRetreat`）の両方に積む。片方だけだと撤退の戦いが日誌に残らない。
- **名簿が動く前に積む**：戦死者は `processCasualties` のあとでは uid が引けない。
- 器の `validate` は `data` を浅いオブジェクトに限る。配列は文字列にして入れる（`carried: "ガロ、ボグマ"`）。
- ブラウザテストの自動送り（`helpers.js`）は号令の既定「任せる」を押すので、日誌に `ordered` は入らない。それでよい（node テストで見る）。

## 6. 未決（答えが無ければ既定で）

- U1 日誌の件数上限（表示）。既定 40 行。
- U2 蔵の「渡す／戻す」を記録画面でも出すか。既定：出さない（読むだけ）。
- U3 魔界史（ランの終わり）に日誌の抜粋を残すか。既定：残さない（今回は読めるだけ）。

## 7. 完了の報告に含めること
kind ごとに積んだ場所の一覧、テストの通過数、日誌の言い回しの本数、未決で既定にしたもの。
