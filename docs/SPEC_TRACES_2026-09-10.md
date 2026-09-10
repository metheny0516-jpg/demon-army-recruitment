# 仕様：痕跡の記録（器だけ）（2026-09-10）

実装担当者向け。撤退の実装（別セッション）と**同時並行**で進めるため、触るファイルを厳密に限る。
この文書と `HANDOFF.md` §0・§2 だけで始められるように書いてある。迷ったら末尾「未決」を見て、無ければ**いちばん小さい選択**をしてコミットメッセージに書く。

## 0. 一文で

**「誰が・何を・いつ」の小さな事実を積む器（`src/core/traces.js`）とテストを作る。ゲーム本体への接続はしない。**

## 1. 触ってよいファイル（これ以外は触らない）

- `src/core/traces.js` — 新規。グローバル `const Traces = {...}` と `const TRACE_KINDS = {...}`（他の `src/core/*.js` と同じく、モジュールではなく `<script>` で読むグローバル）
- `tools/test-traces.js` — 新規
- `HANDOFF.md` — §0 に3〜5行、§2 に「痕跡」の契約を1節

触らない：`src/core/run.js`、`src/core/battle.js`、`src/ui/*`、`index.html`（読み込みタグは接続時に足す。今は足さない）、`src/data/*`、`tools/sim.js`、browser-tests。

作業ブランチ：今の作業ブランチ（HANDOFF §0 の先頭）から `codex/traces` を切る。1タスク＝1コミット＝即push。sim・browser-tests は不要（本体に繋がっていないので挙動は変わらない）。node テストは全部通す：`for f in tools/test-*.js; do node $f >/dev/null 2>&1 || echo FAIL $f; done`。重い処理を並列に走らせない（別セッションが browser-tests を回している）。

## 2. 背景（何のための器か）

設計会話（2026-09-10）の §9「小さな伏線を無数に張る」と §10「小ネタ／痕跡／展開」。
日々の出来事の一部が世界に残り、後で条件が揃ったときに別の出来事へつながる。**全部は回収しない**。プレイヤーにはどれが小ネタでどれが伏線か分からない。

そのために、まず「事実を覚える器」が要る。例：
- ガロが3回遅刻した（酒好き）
- ボグマが敵の弁当を5回食べた（大食漢）
- グドの樽でクンが2回酔った（改造癖）
- 撤退で担がれて帰った者、担いだ戦い
- 戦死者、その戦いで生き残った者

これらは既に戦果（`contribution.late / lateCause / survived`、まもなく `injured`）やタイムラインに**一時的には**あるが、戦闘が終わると消える。器はそれを**ランの間ずっと**持つ。

危険は二つ。①因果の種類が15を超えると設計が破綻する（前の試作の教訓）。②人物ごとの脚本を書きたくなる。だから器は**種類を登録制**にし、**文章を持たない**（文章は後で日誌側が作る）。

## 3. 設計

### 3.1 痕跡（trace）の形

プレーンな JSON（`Storage.saveRun` は `JSON.stringify` するので、関数・クラスは持てない）。

```js
{
  seq: 12,            // 記録順の連番（器が振る）
  day: 4,             // st.day（接続時に渡す。器は知らない）
  turn: 3,            // st.turn（同上）
  kind: "late",       // TRACE_KINDS のキー。未登録の kind は record() が拒否する
  subject: 17,        // 主体の uid（軍団員）。人物でない出来事は null
  object: 23,         // 相手の uid、または文字列（"orc_bento" 等）、または null
  data: { rounds: 2 } // kind ごとの小さな付帯情報。深いネストは不可（1段のみ）
}
```

### 3.2 種類の登録（`TRACE_KINDS`）

**最初は10種まで**。増やすときは設計担当に戻す（コード上も `Traces.MAX_KINDS = 15` で数を検査する）。

| kind | subject | object | data | 意味 |
|---|---|---|---|---|
| `late` | 遅れた者 | null | `{ rounds, cause }` cause は `"drunkard"` か `"fermented_rations"` | 遅刻して到着した |
| `ate` | 食べた者 | 倒した敵の名（文字列） | `{}` | 倒した相手の携行食を食べた |
| `fermented` | 酔った者 | 樽を仕込んだ者の uid | `{}` | 発酵糧食で酔った |
| `downed` | 倒れた者 | null | `{ round }` | 戦闘中に倒れた（戦死とは別） |
| `fallen` | 戦死者 | null | `{ army }` | 戦死して軍から去った |
| `revived` | 戻った者 | 蘇生させた者の uid か null | `{ trait }` | 倒れて戻った |
| `retreated` | null | null | `{ carried: [uid...], army }` | 撤退した（担がれた者を並べる） |
| `carried` | 担がれた者 | null | `{ army }` | 撤退で担がれて帰った |
| `hired` | 採用された者 | null | `{ day }` | 採用 |
| `promoted` | 昇進した者 | null | `{ rank }` | 昇進 |

各 kind に `label`（日本語の短い名。「遅刻」「食事」…）と `template`（一行の言い方。`{subject}` `{object}` `{data.x}` を差し込む）を持たせる。template は**日誌の一行**用の最小限で、脚本ではない。例：`late: "{subject}が遅れて着いた（{data.rounds}ラウンド）"`。

### 3.3 API（すべて純関数。`list` は `st.traces` になる予定の配列）

```js
Traces.record(list, trace)          // 検証して push。seq を振る。上限を超えたら古い順に落とす（3.4）。戻り値は追加した trace（拒否なら null）
Traces.query(list, filter)          // filter: { kind, subject, object, since(seq), kinds:[...] } の AND。新しい順の配列
Traces.count(list, filter)          // query の件数
Traces.last(list, filter)           // 最新1件か null
Traces.forUnit(list, uid)           // subject か object が uid のもの（新しい順）
Traces.summary(list, uid)           // { late: 3, ate: 5, ... } kind ごとの件数（subject が uid）
Traces.describe(trace, nameOf)      // template を埋めた一行。nameOf(uid) → 名前。名前が引けなければ「誰か」
Traces.prune(list, cap)             // cap 件に切る（古い順に落とす）。record() が内部で呼ぶ
Traces.validate(trace)              // { ok, reason }。record() が使う
Traces.MAX = 400                    // 既定の上限件数（3.4）
Traces.MAX_KINDS = 15
```

- `list` を**破壊的に**変更するのは `record` と `prune` だけ。他は新しい配列を返す。
- `record` は `list` が配列でなければ何もせず `null`（旧セーブに `st.traces` が無い場合に落ちない）。
- 未登録の `kind`、`data` に関数や2段以上のオブジェクトがある、`subject` が数値でも null でもない → 拒否（`null` を返す）。例外は投げない（ゲームを止めない）。

### 3.4 上限

ランは長くて数十戦。1戦で数件。400件で十分。超えたら古いものから落とす。ただし `fallen` と `retreated` は**落とさない**（歴史に残るべき出来事）。それらだけで400を超えることは無い。

### 3.5 接続（**この仕様ではやらない**。後で設計担当が仕様にする）

参考として、どこから記録する予定かだけ書いておく。実装しない。
- `run.js deploy()` の決着処理：`contribution` から `late / fermented / downed / fallen / revived / carried / retreated`
- `run.js hire()`：`hired`。`awardMerit`：`promoted`
- `battle.js`：触らない。戦闘中の事実は `contribution` と `timeline` に既にある
- 日誌（朝の一行）と、条件が揃ったときの展開イベントが読み手

## 4. テスト：`tools/test-traces.js`（新規）

vm ハーネスは `tools/test-glutton.js` の先頭を写す。読み込むのは `src/core/util.js` と `src/core/traces.js` だけ。

- `record` が seq を 1 から振る。戻り値が trace。
- 未登録 kind／関数入り data／2段ネスト／subject が文字列 → `null` で、list は増えない、例外は出ない。
- `list` が `undefined` → `null`、例外なし。
- `query` の AND（kind+subject）、`kinds` 配列、`since`。新しい順。
- `count` / `last` / `forUnit`（object 側でも拾う）/ `summary`。
- `describe`：template の `{subject}` `{object}` `{data.rounds}` が埋まる。nameOf が undefined を返したら「誰か」。
- `prune`：420件入れて 400 に切れる。`fallen` は残る（`fallen` を 5 件混ぜて、落ちた 20 件に含まれない）。
- `TRACE_KINDS` の数が `MAX_KINDS` 以下。全 kind に `label` と `template`。
- JSON 往復：`JSON.parse(JSON.stringify(list))` が元と `deepEqual`。

## 5. 完了の報告に含めること

- API 一覧（変えた・足した・落としたもの）。
- kind の一覧（10種のまま か、変えたなら理由）。
- テストの通過数。

## 6. 未決（実装前にオーナー・設計担当へ。答えが無ければ既定で）

- **U1** `object` に文字列を許すか（倒した敵の名など、uid の無い相手）。既定：許す。
- **U2** 上限 400 と「落とさない kind」。既定：上記。
- **U3** `describe` を器に持たせるか、日誌側に置くか。既定：器に持たせる（template が kind の一部なので）。
