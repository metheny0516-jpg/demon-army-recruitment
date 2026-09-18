# 仕様：敵将・中ボスに戦闘絵を当てる（2026-09-18、統括 Claude Fable）

オーナー指示（2026-09-18）：「迷宮の主など新しく作った中ボスが絵文字のままになっている。モンスター絵などを当てはめてちゃんと表示されるようにする」。

## 0. 一文で

**敵将（`src/data/enemy_captains.js` の13人）は `tplId` を持たないので、戦闘画面の `artId()` が絵文字→絵の対応表に無い icon をそのまま出している。各敵将に `look: { tplId, race }` を持たせ、`Captains.attach / heroParty` がそれを unit へ写すだけで、既存の戦闘絵が全員に付く。新しい絵は要らない。**

## 1. なぜ絵文字になるか（原因）

- `BattleScene.artId(u)` は `u.tplId || 絵文字対応表[u.icon]`。敵将は `Captains.attach()` が `{ name, role, icon, hp, ... }` だけで unit を作るので `tplId` が無い。
- 対応表にあるのは王国兵の icon（🗡 🏹 ✨ 🛡️ 🎖️ 👑 …）だけ。部族の首領の icon（🐂 🕯️ 🩸 🌳 🗼）とポルカ（🎺）、ヴァル（📜）は表に無い → 絵文字。
- ガレス（🛡️）・ボルド（⚔️）・セレナ（✨）・ドルフ（🏹）・ザック（🗡️）は偶然対応表に乗っているので絵が出ている。**これも `look` で明示する**（偶然に依存しない）。

## 2. 対応表（データ。`enemy_captains.js` の各 entry に `look` を足す）

`hire.race` がある首領はそれと同じ種族の絵。すべて **`assets/battle/units/<tplId>/` に既にある絵**（`BATTLE_SPRITES` に登録済み）。

| id | 名 | look.tplId | look.race | 根拠 |
|---|---|---|---|---|
| polka | 村おこし勇者団の団長ポルカ | `swordsman` | 人間 | 村の剣士。`hero`（アレン）とは分ける |
| zagan | 自称将軍ザガン | `goblin` | ゴブリン | hire.race |
| gravekeeper | 墓守 | `skeleton` | 骸骨 | hire.race |
| blood_chief | 血の族長 | `orc` | オーク | hire.race |
| elder | 森の長老 | `mandragora` | マンドラゴラ | hire.race |
| tower_lord | 塔の主 | `necromancer` | 死霊術師 | hire.race |
| labyrinth_lord | 迷宮の主 | `minotaur` | ミノタウロス | hire.race |
| gareth | 王国軍将軍ガレス | `shield` | 人間 | 今と同じ |
| bold | 傭兵隊長ボルド | `swordsman` | 人間 | 今と同じ |
| serena | 神殿の聖女セレナ | `cleric` | 人間 | 今と同じ |
| dolph | 王国軍の砲手ドルフ | `archer` | 人間 | 今と同じ |
| zack | 野盗の頭ザック | `swordsman` | 人間 | 今と同じ（rogue 専用絵は無い） |
| inquisitor | 審問官ヴァル | `inquisitor` | 人間 | **専用絵が既にある**のに絵文字だった |

`race` の文字列は、同 tplId の応募者（`monsters.js`）の `race` と同じ表記にする（履歴書・魔界史の表記が揃う）。人間は `"人間"`。

## 3. 触る所（Opus）

| ファイル | 変更 |
|---|---|
| `src/data/enemy_captains.js` | 13 entry に `look: { tplId, race }` を足す（上の表）。**icon・数値・台詞は変えない** |
| `src/core/captains.js` | `attach()` と `heroParty()` の unit に `tplId: c.look?.tplId \|\| null, race: c.look?.race \|\| null` を写す。それ以外は変えない |
| `tools/test-captains.js` | 「13人全員に look があり、`BATTLE_SPRITES` 相当の絵ディレクトリ（`assets/battle/units/<tplId>/idle.webp`）が実在する」を1件。attach 後の unit に tplId が乗ることを1件 |
| `tools/browser-tests/general.js` か `battlefield.js` | 迷宮の主（`labyrinth_lord`）を敵に立てた戦闘で `img.bu-sprite-img[data-tpl-id="minotaur"]` が出る（絵文字 🐂 が portrait に無い）を1件 |

**触らない**：`battle.js`（tplId は表示にしか使わない。`attackKind` の magic 判定に `necromancer` が含まれるが、塔の主は caster なので見た目どおり）、`run.js`、絵。

## 4. 確認

- 上の Node 2件・browser 1件。
- 390px 目視：迷宮の主（第二幕 t09）と塔の主（t08）の戦闘で、敵側の絵がミノタウロス／死霊術師になり、指示待ち・攻撃・被弾のポーズが出る。ヴァルが審問官の絵になる。
- `node tools/sim.js 5` が例外なく完走（数値は変えていないので結果は見ない）。

## 5. 範囲外

- 敵将専用の描き下ろし（今回は既存絵の流用。専用絵が欲しい者が出たら Terra へ別発注）。
- 作戦会議の札や地図の「⚠ ○○がいる」の icon（文字のままでよい。絵は戦闘だけ）。
