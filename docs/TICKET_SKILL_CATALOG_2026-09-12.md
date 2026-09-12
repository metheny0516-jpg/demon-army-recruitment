# チケット D（CodeX・別ブランチ）：技と行動パターンのカタログ

目的：戦闘の多様性。**誰がいつ使うかは後で決める**ので、ここでは「技の効き（kind）」「敵の行動パターン（role）」
「痕跡からの派生行動」を**部品として**たくさん作る。ロマサガほどでなくとも、殴る以外の手が30〜40通りある状態にする。

ブランチ：`codex/skill-catalog`（作業ブランチ `claude/hero-arrival-tavern-prototype-uy2toh` から切る）。本線には Claude がマージする。
本線は並行して動くので、**下の「触るファイル」以外は絶対に触らない**（battle.js / run.js / ui / styles / index.html / 既存テスト）。

## 触るファイル（これだけ）
- `src/core/skill_effects.js`：`SKILL_EFFECTS[kind]` と `ENEMY_ROLES[role]` の登録（差し込み口。ファイル頭の説明を読む）
- `src/data/skills_catalog.js`：`SKILL_CATALOG[id]`（技のデータ。形は `src/data/skills.js` の `SKILLS` と同じ。`species` は空でよい）
- `tools/test-skill-catalog.js`（新）：kind ごとに1本以上、role ごとに1本以上
- `docs/SKILL_CATALOG_2026-09-12.md`（新）：一覧表（id／名前／kind／効き／制限／分類／向く種族の候補）

## 仕様の土台（読むだけ）
- `docs/SPEC_SKILLS_2026-09-12.md` 2節（データ項目・一技一制限）、3節（解決の規則）、5節（敵の役割）
- `src/core/battle.js` の `resolveSkill`／`applyImmediateSkill`／`planEnemy`／`runEnemyPlan`（既定の kind と role の実装。同じ道具で書く）
- `tools/test-skills-command.js` の 9 節（差し込み口の使い方の実例）

## 使える道具（ctx。`skill_effects.js` の頭に一覧）
`damage(target, mult, label)`／`heal(target, ratio, label)`／`applyDamage`／`act`／`summon(spec)`／`note`／`emit`／`emitCausal`／
`pickEnemy()`／`pickTarget`／`lowestAlly`／`moveBack(list, target)`／`gainBattleResource(unit, "gold", n, label)`／`gainSpirit(unit, n, reason)`。
乱数は **`ctx.rand()` / `ctx.chance(p)` / `ctx.pick(list)` だけ**（Math.random 直呼びは禁止：同じ種で展開が変わる）。

ユニットの状態フラグ（既定の kind が使うもの。組み合わせてよい）：
`flags.guarding`（被ダメ半減）／`flags.covering = targetId, coverRatio`（かばう）／`flags.stunned`（次の手番動けない）／
`flags.charmed`（次の手番に同僚を殴る）／`flags.buff = { mult, until, name }`（与ダメ倍率）／`flags.burn = { at, source }`（次R頭に最大HP8%）／
`flags.decoyUntil`（狙われやすい）／`flags.winded`（次の手番動けない＝息切れ）／`unit.atk` を直接下げる（弱体）。
新しい状態を足すなら `flags.<kindName>_*` の名前で、**解除もその kind の中で**行う（battle.js は知らない）。

## 作るもの

### D-1 技の効き（SKILL_EFFECTS、20種以上）
既定にある kind（strike/aoe/heal/rest/buff/debuff/cover/stun/charm/push/revive/random/steal/scatter）**以外**を作る。候補：

| 分類 | kind の案 | 効き | 制限の案 |
|---|---|---|---|
| 単体 | drain | 与ダメの3割を回復 | 命中80% |
| 単体 | pierce | 防御を無視 | 最後に動く |
| 単体 | double | 2回攻撃（各70%） | 気合2 |
| 単体 | execute | 相手HP30%以下なら必殺 | 外れると反撃 |
| 全体 | quake | 敵全体×0.5、速度の低い順に当たる | 味方の後列にも10% |
| 全体 | rain | 敵全体×0.4、2ラウンド続く（flags） | 気合2 |
| 回復 | mend_all | 味方全員15% | 自分は動かない |
| 回復 | sacrifice | 自分HP半分を味方1体へ | 気合1 |
| 防御 | wall_all | 味方全員このラウンド被ダメ-30% | 自分は動かない |
| 防御 | counter | このラウンド殴られたら反撃 | 攻撃はしない |
| バフ | haste | 味方1体の次の手番を最初に | 気合1 |
| バフ | frenzy | 自分×1.5、被ダメ+50%（2ラウンド） | 解除不可 |
| 弱体 | slow | 敵1体の速度半減（2ラウンド） | ― |
| 弱体 | blind | 敵1体の命中を60%に（2ラウンド） | ― |
| 弱体 | curse | 敵1体：受けるダメージ+30%（2ラウンド） | 気合2 |
| 妨害 | taunt | 敵全員の狙いを自分に（このラウンド） | 被ダメ+20% |
| 妨害 | swap | 敵の先頭と最後尾を入れ替える | ― |
| 妨害 | silence | 敵1体の役の行動（回復・全体・号令）を1ラウンド封じる | ― |
| 波乱 | gamble | 50%で×3、50%で自分に×1 | ― |
| 波乱 | rally_fallen | 倒れた味方の数×0.5 を上乗せ | 誰も倒れていなければ×0.5 |
| 召喚 | summon_minion | 自分の分身（HP30%・atk50%）を呼ぶ | 気合2・1戦闘1回 |
| 略奪 | ransack | 倒した敵1体につき+1G を予約（このラウンド） | ― |

### D-2 痕跡からの派生行動（5種以上）
`ctx.options.traces`（`{ seq, day, turn, kind, subject(uid), object, data }`。kind は fallen / downed / carried / retreated / revived / hired / promoted / fired / deserted / late / ate など）、
`ctx.options.departed`（去った者：`{ uid, name, race, cause, army? ... }`）、`ctx.options.relics`（遺物）を読む技。例：
- **弔い合戦**（mourning）：`departed` に同じ種族の戦死者がいれば×1.5、名前を字幕に（「○○の仇！」）
- **復讐**（vendetta）：`traces` の fallen の `data.army` が今の敵軍と同じなら全体×0.6
- **担がれの恩**（carried_debt）：自分が `carried` されたことがあれば、担いだ者をかばう（cover）
- **常連の勘**（veteran）：自分の `downed` 回数×10% の与ダメ（上限50%）
- **遺物の重み**（relic_weight）：遺物の数×5% を味方全員に（このラウンド）
派生は「読むだけ」。痕跡を書き足さない（`Traces.record` は run.js の仕事）。

### D-3 敵の行動パターン（ENEMY_ROLES、6種以上）
既定（fighter/brute/shield/priest/caster/archer/rogue/commander）以外。`plan(ctx, nextRound)` で予告（`intent` と `text`）を返し、`run(ctx, plan)` で実行。候補：
- **bomber**：3ラウンド目に全体×0.8、その前ラウンドに「導火線に火をつけた」
- **summoner**：HP半分以下で一度だけ手下を1体呼ぶ（`summon`）
- **assassin**：最もHP割合の低い味方を必ず狙い、×1.3
- **berserker**：HPが減るほど攻撃が上がる（`buff` を自分で更新）
- **healer_guard**：味方が倒れそうなら回復、いなければ守る（priest と shield の合わせ技）
- **coward**：HP30%以下で退く（戦場から消える。倒した扱いにしない：`flags.absent = true` と `alive` はそのまま。字幕「逃げ出した」）
- **duelist**：最初に殴られた相手だけを狙い続ける
- **trickster**：ラウンドごとに味方の狙いを散らす（scatter と同じ）

### D-4 一覧表（docs）
id／名前／kind／効き／制限／分類／向く種族の候補（3つまで）／敵の role なら段階の候補。**数字は仮**でよい（誰に付けるかを決めるときに調整する）。

## 規則
- **一技一制限**：制限は `hit`・`order`・`recoil`・`winded`・`selfHp`・`cost`（2以上）・専用の反動のうち1つか2つ。窓の一行（`note`、全角28字以内・数字はあってよい）に書けるものだけ。
- 字幕は `note`／`emit("note", { unitId, text, cls: "trait" })`。台詞は `lines.use`／`lines.miss` に2〜3本。
- 2ラウンド続く効果は **kind 自身が解除**する（`flags.<kind>Until = round + 1` を見て、次に呼ばれたときか `plan` で消す）。既定の battle.js は知らない。
- 検証は `node tools/test-skill-catalog.js` と既存の node テスト全件（壊さない）。`node tools/sim.js 30` は**回さない**（カタログは誰も使っていないので sim は変わらない）。
- コミットは D-1／D-2／D-3／D-4 で4つ。push は `codex/skill-catalog` へ。

## 貼り付け用（オーナー → CodeX）
```
docs/TICKET_SKILL_CATALOG_2026-09-12.md を読んで実装して。ブランチは codex/skill-catalog（claude/hero-arrival-tavern-prototype-uy2toh から切る）。
触るファイルはチケットの「触るファイル」の4つだけ。battle.js / run.js / UI / index.html / 既存テストは触らない。
乱数は ctx.rand / ctx.chance / ctx.pick だけ。コミットは D-1〜D-4 で4つ。push 前に node --check と node テスト全件。sim は回さない。
```
