# 仕様：お披露目 ― 上位技の自動発動をやめ、窓で光らせる（2026-09-12）

背景：上位技（8戦目）を覚えた直後の戦いでは、技が **勝手に1回出る**（`debutSkill`／`autoLimit`、2026-09-11 オーナー決定「初回は自動でよい」）。
これは自動戦闘の頃の設計。コマンドバトルでは「勝手に出る」より、**指示窓でその技が光り、初回は気合なしで撃てる**方が
「覚えた」を自分の手で確かめられる。担当：エンジン＝Claude、run.js と UI＝Opus。

## 0. 一文で

**覚えた直後の戦いでは、上位技のボタンが光り、一度だけ気合なしで使える。勝手には出ない。**

## 1. 規則

- `monster.debutSkill`（覚えた直後の戦いでだけ入っている id。今までどおり run.js が立て、戦闘の決着で消す）を、エンジンは
  **手動戦闘では自動発動に使わない**。`prompt.allies[].skills[i].debut = true` を付けるだけ。
- お披露目の技は **その戦いで最初の1回だけ `cost: 0`**（`ready` は気合を見ない。息切れ・傭兵は今までどおり）。
  2回目以降は通常の気合。`skills[i].debut` は使ったら false。
- 自動戦闘（sim・おまかせ・「最後まで飛ばす」）では今までどおり **勝手に1回出る**（`autoLimit`）。sim の種族技の測定を変えない。
  「おまかせ」で流した戦いでもお披露目が無駄にならない。
- 種族技（3戦目）にはお披露目は無い（気合1で軽く、覚えた次の戦いから普通に選べる）。
- 遅咲きの上位技（12戦）も同じ扱い。

## 2. エンジン（`src/core/battle.js`、Claude）

- `makeUnit`：`debut` は今までどおり写す。
- `autoExhausted(unit, traitId)`：`options.manual` のとき、`unit.debut === traitId` でも自動発動を **許さない**（allowed = 0）。
  `unit.debut === "any"`（テストの直作り・sim の敵）は今までどおり。
- 技の一覧（`unitSkillIds` → skills）：`sk.kind === "trait" && unit.debut === sk.trait && !unit.flags.debutUsed` なら
  `{ ..., debut: true, cost: 0, ready: (息切れ・傭兵でなければ true) }`。
- 指示の処理：`kind "trait"` で `debut` 中なら気合を払わず、`unit.flags.debutUsed = true`。`order_exec` に `debut: true`。
  字幕「魔王『○○、△△！』 ○○『……体が、覚えている』」（`lines.unlock` から引く。無ければ `lines.order`）。
- `result.debutShown = [uid...]`（お披露目を実際に使った者。run.js は今までどおり `debutSkill` を消すだけなので、読まなくてよい）。

## 3. run.js（Opus）
- 変更なし（`debutSkill` の立て方・消し方は今のまま）。確認だけ：覚えた直後の戦いを「おまかせ」で流しても、決着で `debutSkill` が消えること。
- モルモの一言（覚えた通知）を「次の戦いで一度だけ勝手に出る。以後は号令で」から **「次の戦いでは気合なしで一度撃てる。窓で光る」** へ。

## 4. UI（`src/ui/battle_scene.js`・`src/styles.css`、Opus）
- `skills[i].debut` のボタンに `cmd-debut` を付け、金色の縁が脈打つ。小さく「お披露目・気合なし」。
- 押したあとの字幕は既存の `order_exec` と同じ。`debut: true` なら演出を一段強く（既存の号令のカットインを流用してよい）。
- ブラウザテスト `skills-window.js` に1件：`debutSkill` を立てた者の窓で技が光り、cost 0 で押せ、押したあと通常の気合表示に戻る。

## 5. 触るファイル
- Claude：`src/core/battle.js`、`tools/test-skills-command.js`（3件追加）。
- Opus：`src/ui/battle_scene.js`、`src/styles.css`、`src/core/run.js`（モルモの文言1か所）、`tools/browser-tests/skills-window.js`。

## 6. 落とし穴
- `debut === "any"` は「制限なし」の意味でテストと sim が依存している。手動でも `"any"` は自動発動を許したままにする（直作りのユニットで既存テストが落ちる）。
- お披露目で cost 0 にしても `spiritSpent` に 0 を積まない（run.js の反映が空振りするだけだが、記録が汚れる）。
- 「以後もおまかせ」の設定が ON の人はお披露目を見ない。自動側で勝手に出るので損はしない。
