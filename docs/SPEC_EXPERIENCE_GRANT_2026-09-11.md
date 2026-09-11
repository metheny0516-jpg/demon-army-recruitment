# 小票：共通特性の「付与」と、事件文の種族決め打ちさらい（2026-09-11）

実装担当：Opus。2つの独立した小票。別コミットで。

## A. 共通特性の付与（`run.js`）

`SPEC_EXPERIENCE_TRAITS`（2026-09-10）で定義だけ入っている4つ（`hardy` 頑丈／`die_hard` しぶとい／`carried_before` 担がれ慣れ／`castle_keeper` 城の主）を、実際に付ける。

- 各特性の `earned: { counter, at, unless }` を読む。`counter` は `m.record` のキー。**`homeStays` はまだ無い**：`processDepartments` で留守番（`departmentRoster("home")`）の `record.homeStays` を +1（開幕の日割り `dailyDay` 指定時は足さない。気合の +2 と同じ場所）。
- 判定は決着ごと、`trainSurvivors` の直後に**名簿全員**へ（留守番も対象。城の主は留守番でしか育たない）。条件：`record[counter] >= at` かつ（`unless` があれば `record[unless] === 0`）かつ まだ持っていない。1決着につき1人1つまで。
- 付いたら `m.traits.push(id)`、`notes.push(`${name}は【${name}】になった`)`、`lastBattle.earned = [{ uid, name, traitId, traitName, quote }]`（`lines.earned` から1本）。結果画面の「新しい技を覚えた」パネルと同じ形で「経験が身についた」を出す（`ui.js` の `skillUnlockPanel` を写す。数値は出さない）。
- **効果の接続**：`carried_before.injuryFree` → `settleRetreat` で担がれても `injured` を付けない（名前は「担いで戻った」に残す）。`castle_keeper.homeFood` → `Aptitude`（`src/data/departments.js`）が留守番の食料調達に +1。`hardy` / `die_hard` は battle.js のフックで既に効く（触らない）。
- `traitPool` には入れない（応募者には付かない）。
- テスト：`tools/test-experience-grant.js`（新規）。8戦倒れず→頑丈／2回倒れて→しぶとい／担がれて→担がれ慣れ→次の撤退で負傷しない／留守番5決着→城の主→食料+1。既存全通過。sim は煙感知器として1回（0%の戦略なし・戦闘数の急減なし）。

触るファイル：`src/core/run.js`、`src/data/departments.js`（Aptitude）、`src/ui/ui.js`（パネル）、`tools/test-experience-grant.js`、HANDOFF §0 に3行。`battle.js` は触らない。

## B. 事件文の種族決め打ちさらい（`src/data/events.js`）

「配置換え希望」で本人がゴブリンなのに「インプは笑顔で戻っていった」と出た（直し済み `6170e9d`）。同じ穴を全部さらう。

- `events.js` の全事件について、`apply()` が返す文と `text` の中で**種族名を直接書いている箇所**（オーク・オーガ・ゴブリン・インプ・スライム・骸骨・ゾンビ・コボルド・魔法使い・死霊術師）を列挙し、cast の `race` / `tplId` で絞っていない事件では `${c.actor.name}` か `${c.actor.race}` に置き換える。
- 絞っている事件（例：`check` で `race === "オーク" || "オーガ"`）は、文がその両方に合っているか確認（「オークは何も言わずに去った」はオーガでも起きる → `${c.actor.name}`）。
- 変更した箇所を一覧にして報告。テスト：`tools/browser-tests/eventui.js` / `eventcast.js` 通過。node 全通過。

触るファイル：`src/data/events.js` だけ（＋HANDOFF 1行）。
