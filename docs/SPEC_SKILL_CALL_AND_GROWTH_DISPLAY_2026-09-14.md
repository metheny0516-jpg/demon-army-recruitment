# 仕様：技の台詞は繰り出す瞬間に吹き出しで／成長は一つずつ読み上げ（2026-09-14）

オーナー：「技は出すときにセリフがほしい。ターン最初にセリフだけ出て繰り出す前に戦死することがある。技名は本人の口への吹き出しで、ロマサガ風に」「ステータスが上がったら『○○の○○が1上がった！』と戦闘後に一つ一つ表示してほしい」。

## 1. 技の台詞（エンジン済み・Claude 2026-09-14）
- 新イベント **`skill_call`**：本人の手番が回ってきて**実際に繰り出す直前**に出る。`{ unitId, name, skillId, skillName, label, quote, fx, target, debut, cost, text }`。
  - 指示の直後に効く技（かばう・鬨の声・かく乱）は指示の時点で出る（効きがその瞬間だから）。
  - 繰り出す前に倒れた・動けない場合は出ない（`unit.alive` を見る。動けない＝stunned は手番が来るので出る。出したあと「動けない」）。
- 既存の **`order_exec`** は指示の記録として残るが `quiet: true`。**描画側はもう字幕・カットインを出さない**（データは残す：お披露目の判定や sim の集計に使っている）。
- **Opus（`src/ui/battle_scene.js`・`src/styles.css`）**：
  - `skill_call` で本人の札の口元に**吹き出し**（`.bu-bubble`）：1行目に台詞「……」、2行目に技名を太字。ロマサガ風＝札の上に浮き、1.4秒残す（既存の HOLD の1段短い長さ）。敵側の役の行動（`intent`）は変えない。
  - お披露目（`debut`）はカットインを `skill_call` の時点に移す。
  - `order_exec` の `case` は `quiet` なら `acting` の付与と `clearFocus` だけにする。字幕・フラッシュ・pulse は出さない。
  - 吹き出しは1体1つ。次の吹き出しが来たら前のを消す。低モーションでは静止で同じ長さ。
  - `tools/browser-tests/skill-fx.js` か `skills-window.js` に2件：吹き出しが技を出す直前に出る／先攻の敵に倒された者は吹き出しを出さない。

## 2. 成長の読み上げ（`docs/SPEC_GROWTH_BY_ACTION` の続き・Opus）
- 決着画面の「一回り大きくなった」の札を、**一行ずつ順に出す**：「ゴルドの攻撃が 1 上がった！」「ゴルドの速さが 1 上がった！」「プルの HP が 2 上がった！」。
- 出し方：0.5 秒ごとに1行（タップで全部出す）。行数が 8 を超えるときは「ほか ○ 件」で畳む（中高生が読める量）。
- 上がった量は `applyGrowth` の差分（`delta`）そのもの。0 は出さない。伸びた数値の印（⚔🛡❤💨）は行の頭に。
- run.js：`applyGrowth` が `{ uid, key, delta }` の配列を返し、`st.lastGrowth` に控える。UI はそれを読む。
- `tools/browser-tests/report.js` に1件（行が順に出る・タップで全部）。

## 3. 触るファイル
- Claude：`src/core/battle.js`、`tools/test-skills-command.js`（済み）。
- Opus：`src/ui/battle_scene.js`、`src/styles.css`、`src/core/run.js`（`applyGrowth` の戻り値と `st.lastGrowth`）、`src/ui/ui.js`（読み上げ）、ブラウザテスト2件＋1件。

## 4. 貼り付け用（Opus）
```
docs/SPEC_SKILL_CALL_AND_GROWTH_DISPLAY_2026-09-14.md の Opus の欄を実装して。作業ブランチから切って同じブランチへ push。まず git pull。battle.js は触らない（skill_call は入っている）。
docs/SPEC_GROWTH_BY_ACTION_2026-09-14.md の (a)(b) と一緒に、コミットは (a) run.js の成長（record.grow・数値ごとの steps・spd・applyGrowth の戻り値・migrateState）、(b) 決着の読み上げ、(c) skill_call の吹き出しと order_exec の quiet 化、(d) テスト、の4つ。終わったらコミットIDを報告して。
```
