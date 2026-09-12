# 技と敵の役割 ― コマンドバトルに深みを（2026-09-12）

オーナー決定（2026-09-12 朝）：
- 殴り続けるだけの戦闘をやめる。回復・全体・防御・バフ・弱体・波乱を、**最初の数戦のあと 2択3択**で選べるようにする。
- 追い剥ぎのような「行動」は通常攻撃ではなく **気合を払う技** にし、毎回はできないようにする。
- 大ダメージ技にはリスク（最後に動く、命中70%、反動）。
- 技に移した特性は、癖としては**消す**（二重にしない）。
- **種族技は3戦目で開く。上位技は8戦目。** ランの戦闘回数はそれに合わせて増やす（別紙、7節）。
- 戦闘中に気合が動く（まもるで大技を受け切る／味方が倒れる）。
- 敵にも役割とバリエーション。
- 実装分担：エンジンと契約＝Claude、敵データ＝CodeX、UI の技枠と run.js の開放＝Opus（8節）。

前提：`docs/SPEC_COMMAND_BATTLE_2026-09-11.md`（指示窓・気合・大技の構え）。

---

## 0. 一文で

**特性を「癖（勝手に効く）」と「技（気合を払って自分で選ぶ）」に分け、種族ごとの技を3戦目から使えるようにし、敵にも役割を与える。**

## 1. 癖と技

| | 癖 | 技 |
|---|---|---|
| 発動 | 勝手に（今までどおり） | 指示窓で選ぶ。気合を払う |
| 例 | 硬皮・群れの本能・先制・忠犬・しぶとい・飢餓適応・血の気 | 振り下ろす・追い剥ぎ・火球・骨の壁・鬨の声 |
| データ | `TRAITS`（既存） | `SKILLS`（新設、`src/data/skills.js`） |
| 覚える | 採用時に持っている | 種族技＝3戦目、上位技＝8戦目 |

**技に移す特性（癖からは消す）**：怪力(brute)、追い剥ぎ(pickpocket)、火球(fireball)、回復の祈り(guardian_prayer)、悪戯(mischief)、誘惑(allure)、突進(charge)、再生(regen)、粘体(slime_body)、白骨(bone)、死霊術(necromancy)。
テンプレートの `fixedTraits` から外し、`skills`（3戦目に覚える技の id）へ置く。既存セーブは移行で同じ扱い（4節）。

上位技（既存の tier 2、`TRAITS[x].skill`＋`order`）は**そのまま技として指示窓に並ぶ**。1段目の置き換え（`replaces`）は「種族技を置き換える」のではなく、**種族技に加えて**覚える（枠が2つになる）。

## 2. 技のデータ（`SKILLS`）

```js
const SKILLS = {
  ogre_smash: {
    name: "振り下ろす", species: "ogre", cost: 1,
    kind: "strike", target: "enemy", power: 2.0,
    hit: 0.7, order: "last",
    note: "×2.0　最後に動く・命中70%",       // 窓の一行。数字はここから組み立ててもよい
    lines: { use: ["……潰す", "どっせい！"], miss: ["空を切った"] }
  },
  ...
};
```

| 項目 | 意味 |
|---|---|
| `kind` | `strike`（単体）、`aoe`（敵全体）、`heal`（味方回復）、`buff`（味方全員このラウンド）、`debuff`（敵の攻撃力を下げる）、`cover`（味方をかばう）、`stun`（敵1体を行動不能）、`push`（敵の先頭を押し下げ）、`revive`（倒れた味方を起こす）、`rest`（自分回復）、`random`（表から一つ）、`steal`（攻撃＋金貨） |
| `target` | `enemy`（敵1体をタップ）、`ally`（味方1体をタップ。倒れた者も可＝revive）、`self`、`all_enemies`、`all_allies`、`none` |
| `power` | 通常攻撃に対する倍率（strike/aoe/steal）、回復は最大HP比（heal/rest）、buff は倍率、debuff は攻撃力の減少値 |
| `hit` | 命中率（省略＝100%） |
| `order` | `last`（ラウンドの最後に動く）／`first`（最初に動く）／省略＝速度順 |
| `recoil` | 与えた合計の何割を自分が受けるか |
| `winded` | true なら次のラウンドは動けない（息切れ） |
| `selfHp` | 自分の最大HPの何割を払うか（死霊術師の死者の手） |
| `chance` | stun 等の成功率 |
| `table` | random の表 `[ {kind, ...}, ... ]` |
| `cost` | 気合。1〜3 |
| `lines.use / miss` | 使用時・失敗時の一言 |

**一技一制限**：制限は `hit`・`order`・`recoil`・`winded`・`selfHp`・`cost`（2以上）のうち1つか2つ。窓の一行（`note`）に書けないものは作らない。

### 2.1 種族技（3戦目で開く。全て気合1、例外は記す）

| 種族 | id | 技 | kind | 効果 | 制限 |
|---|---|---|---|---|---|
| オーガ | ogre_smash | 振り下ろす | strike | ×2.0 | 最後に動く・命中70% |
| オーク | orc_cleave | 薙ぎ払い | strike | ×1.4、隣の敵にも50% | 最後に動く |
| インプ | imp_rob | 追い剥ぎ | steal | ×0.7、勝利時+2G | 命中80% |
| 魔法使い | mage_fireball | 火球 | aoe | 敵全体 ×0.6 | 息切れ |
| ゴブリン | goblin_warcry | 鬨の声 | buff | 味方全員このラウンド攻撃+30% | 自分は攻撃しない |
| スライム | slime_cling | 粘りつく | stun | 敵1体をこのラウンド行動不能（55%） | 失敗するとその敵に殴られる |
| 骸骨兵 | skeleton_wall | 骨の壁 | cover | 味方1体をかばう（自分が60%で受ける） | まもると同時に不可 |
| ゾンビ | zombie_bite | 腐敗の一噛み | debuff | 敵の攻撃力-3（永続）＋×0.5 | ― |
| コボルト | kobold_feint | かく乱 | debuff+self | 敵全員の狙いを散らす（先頭60%→均等）、自分が狙われやすく | 気合1 |
| 死霊術師 | necro_hand | 死者の手 | revive | 倒れた味方1体をHP30%で起こす | 気合2・自分HP-20% |
| サキュバス | succubus_charm | 魅惑 | stun(変種) | 敵1体の次の攻撃を同僚へ向ける（70%） | 気合2 |
| トロル | troll_rest | 休む | rest | 自分HP30%回復 | このラウンド行動なし |
| ミノタウロス | mino_rush | 突進 | strike+push | ×1.5、敵の先頭を押し下げ | 与えた10%を反動 |
| リッチ | lich_pulse | 死の脈動 | aoe | 敵全体 ×0.4＋燃焼（次R開始時 最大HP8%） | 気合3 |
| ミミック | mimic_box | 宝箱の中身 | random | 回復（味方全員15%）／全体×0.5／金貨+3 のどれか | 何が出るか分からない |
| ハーピー | harpy_dive | 急降下 | strike | ×1.3 | 最初に動く・命中85% |
| キングスライム | king_wave | 大波 | aoe | 敵全体 ×0.5 | HP50%以上のときだけ |

数字は初期値。sim は煙探知だけ（0%戦略と戦闘数の崩れ）。手触りはオーナー試遊で。

### 2.2 上位技（8戦目。既存 tier 2 をそのまま）

ぶちかまし・大火球・血の雄叫び・集団戦法・疾風・分裂・骨の壁（上位版）・腐敗・火遊び・大召集・大波・魅了・暴走・死の波動。
既存の `TRAITS[x].order`（label/cost/note）で窓に並ぶ。**種族技と上位技の2枠**になる。

## 3. エンジン契約（`src/core/battle.js`）

### 3.1 ユニット
- `makeUnit` が `skills: m.skills ? m.skills.slice() : []` を写す（技の id 列）。
- 敵は `role`（5節）を写す。

### 3.2 prompt.allies[]
```
skills: [ { id, name, note, cost, ready, why }, ... ]   // 種族技（SKILLS）→ 上位技（TRAITS.order）の順
skill:  skills[0] || null                                 // 互換（既存テスト・旧 UI）
```
`ready` が false のとき `why` に理由（`気合不足`／`息切れ`／`条件外`／`傭兵`）。

### 3.3 commands
```
{ [unitId]: { cmd: "attack"|"guard"|"skill"|"auto", skill?: id, target?: enemyId|allyId } }
```
`cmd: "skill"` で `skill` 省略なら `skills[0]`。`target` は `SKILLS[id].target` が `enemy`/`ally` のとき必須（無ければ既定：敵は先頭60%、味方は最もHP割合の低い者）。

### 3.4 解決
- 気合はラウンドの頭で払う（今までどおり）。`result.spiritSpent[uid]`。
- **気合の増加**（新）：`result.spiritGained[uid]`。
  - まもる中に**大技**（`bigMove`）を受けた：+1。
  - 味方（召喚以外）が倒れた：立っている味方全員 +1。
  - 上限は `MONSTER_RULES.spirit.max`（3）。イベント `spirit_gain { unitId, amount, reason, text }`。
- 行動順：`order: "last"` の技を選んだ者は速度順の列の**最後**へ、`first` は最初へ（疾風より後、号令より前）。
- `hit` 判定に失敗：`skill_miss` イベント（`lines.miss`）。気合は戻らない。
- `kind` ごとの解決は `resolveSkill(unit, skill, ctx)` に集約。既存の `applyDamage` を使い、連鎖・反応（`postAttack` 等）は strike/aoe/steal のときだけ今までどおり回す。
- `cover`：かばう側に `flags.covering = targetId`。`applyDamage` で対象が殴られる前に振り替え（骨の壁 tier2 の仕組みを流用）。
- `stun`：対象に `flags.stunned = true`。手番で解除して「動けない」note。
- `buff`：味方全員に `flags.buffMult = 1.3`（このラウンドの act で乗算、ラウンド末に消す）。
- `debuff`：`target.atk = max(1, atk - n)`。
- `push`：`enemyUnits` の配列順を入れ替える（火遊びと同じ）。
- `revive`：`alive=true, hp=maxHp*0.3`、`revive` イベント（既存の死霊術と同じ描画）。
- `steal`：`result.loot += n`（勝利時のみ加算。負け・撤退では消える）。
- `random`：`U.pick(table)` を選んで解決。何が出たかを `skill_roll` イベントで。

### 3.5 敵の役割（5節）の解決
ラウンドの頭、味方の指示のあとに `enemyPlan(enemy, round)` で敵ごとに行動を決める（乱数はここで消費してよい：指示のあとなので分岐しない）。

## 4. 覚える時期と移行（`src/core/run.js`、Opus）

- `SKILL_RULES = { speciesUnlockBattles: 3, unlockBattles: 8, growthPerBattle, growthCapBattles }`。
- 3戦目：`monster.skills.push(SPECIES_SKILL[tplId])`。モルモ「○○が技【…】を覚えた。次から指示で出せる」。
- 8戦目：既存 `checkSkillUnlock`（上位技）。`replaces` は種族技を消さない（`fixedTraits` から技に移った特性はもう無いので、`replaces` が指す id が無くても覚える）。
- **遅咲き（裏方）**：職業が `LATE_BLOOMER_JOBS`（会計・倉庫番・広報・伝令・受付・経理・備品・配達 を含む）の者は 3→6、8→12。代わりに内政（調達・施工・応募のいずれか）+1。履歴書に「？？？（この者は何かを隠している）」を一行。モルモが一度だけ「あの者、戦場に出すと化けるかもしれませんヨ」。
- 種族の伝承（`skillLore`）は上位技だけ（今までどおり）。種族技は誰でも3戦で覚えるので伝承は要らない。
- **移行**：旧セーブの `traits` に技へ移した特性（1節）があれば消し、`record.battles >= 3` なら `skills` に種族技を入れる。テンプレートの `fixedTraits` から該当 id を外す（CodeX の敵データと同じコミットにしない）。

## 5. 敵の役割（`src/data/enemies.js`、CodeX）

各敵ユニットに `role` を1つ。無ければ `fighter`。

| role | 行動 | 見せ方（窓・札） |
|---|---|---|
| fighter | たたかう。2R以降15%で大技の構え（今までどおり） | ― |
| brute | 大技の構えが30%。大技×2.0 | 札に「💪」 |
| shield | 味方（敵側）のHPが半分以下の者がいればその者をかばう（cover）。いなければまもる（被ダメ半減）40% | 「🛡」。まもる中は名前が青 |
| priest | 敵側に HP60% 未満の者がいれば最も低い者を25%回復。いなければ攻撃 | 「✚」。回復の前ラウンドに `intent:"heal"` |
| caster | 偶数ラウンドに全体×0.6（`intent:"aoe"` を前ラウンドに出す）。奇数は単体 | 「🔥」 |
| archer | 先頭を狙わず、HP割合が最も低い味方を狙う（60%） | 「🏹」 |
| rogue | 攻撃時30%で気合を1奪う（対象の spirit-1） | 「🗡」。奪われたら note |
| commander | 1R目に味方全員バフ（+20%、2ラウンド）。以後 fighter | 「🎖」 |

- `intent` は `attack`／`big`／`heal`／`aoe`／`guard`。窓の予告文と敵の札の印は intent ごと（Opus）。
- 段階1〜8（第一幕）は **段階2から shield か archer を1体**、段階4から priest、段階5から caster、段階6から rogue、段階7から commander。第二幕は3役以上を混ぜる。
- variants も同じ規則。名前に役が分かる語（盾持ち・弓手・従軍僧・術士・斥候・隊長）を入れる。
- 勇者一行：戦士ドルフ＝brute、勇者アレン＝commander（覚醒は今までどおり）、他に priest と caster を1体ずつ入れる。

## 6. UI（`src/ui/battle_scene.js`、Opus）

- 窓の技ボタンを `skills` の数だけ並べる（最大2）。`技「振り下ろす」　×2.0　最後に動く・命中70%　気合1` を一行。
- `target: "ally"` の技は狙い選びで**味方の札**が光る（倒れた者も含む＝revive）。`self`/`none`/`all_*` は即決定。
- 敵の `intent` ごとの印（⚠ 大技／✚ 回復／🔥 全体／🛡 守り）と窓の予告文。
- `skill_miss`／`spirit_gain`／`skill_roll` の字幕。気合が増えたら札の気合表示を光らせる。
- 既存テスト `order.js` は `skill:` 互換で通る。新テスト：技2枠、味方狙い、命中失敗、気合増加。

## 7. 戦闘回数を増やす（別紙にする。Opus、技の後）

上位技を8戦にする以上、ランの戦闘数（今 7〜13）を **14〜20** にする。案：
- **各段階を「前哨戦→本戦」の2戦**にする。前哨戦は敵の一部（役1〜2体）で報酬半分、勝てば本戦へ。本戦で負けても前哨からやり直し（征服度は前哨の分だけ進む＝0.5刻み）。
- 討伐・鎮圧（`raid`/`suppress`）は今までどおり任意。
- 第二幕（段階9〜14）も同じ。勇者戦（8）は前哨なし（一発勝負の重み）。
- 一日の戦闘は1回のまま。日数・給料・食料の圧が2倍近くなるので、`reward` と調達を合わせて見直す（sim で破産率だけ見る）。

## 8. 分担と順序

1. **Claude**（先）：`SKILLS` の骨組みと2.1の17技のデータ、エンジン3節、敵役割の解決5節、node テスト。**触るファイル**：`src/core/battle.js`、`src/data/skills.js`、`tools/test-skills-command.js`（新）、`tools/test-enemy-roles.js`（新）。
2. **CodeX**（Claude の後、並行可）：`src/data/enemies.js` に `role` と役の分かる名前、段階ごとの構成（5節）。`src/data/monsters.js` の `fixedTraits` から技へ移した特性を外し `skills` を置く。各技の `lines.use/miss`（`src/data/skills.js` の該当技だけ）。**触るファイル**：`src/data/enemies.js`、`src/data/monsters.js`、`src/data/skills.js`（lines のみ）、`src/data/mormo_lines.js`。
3. **Opus**：4節（run.js の開放・遅咲き・移行）、6節（窓の技2枠・味方狙い・intent の印）。**触るファイル**：`src/core/run.js`、`src/ui/battle_scene.js`、`src/styles.css`、`tools/browser-tests/order.js`、新テスト。
4. 7節は別紙 `SPEC_TWO_STAGE_BATTLES` にして Opus。

各担当：軽いサブエージェントは並列でも可、sim・run-all・ブラウザテストは直列。1タスク＝1コミット＝push。`run.js` と `battle.js` を同じコミットにしない。push 前に `node --check` と node テスト。

## 9. 落とし穴

- 乱数の消費順：指示の**前**に乱数を使うと、同じ種で計算し直したとき展開が変わる。敵の行動決定は指示のあと。
- `cover` と `guard` の同時：かばう側が「まもる」中なら cover は無効（一つの手番で一つ）。
- `revive` の対象は `onField` ではない（倒れている）。狙い選びの候補は別に組む。
- `steal` の金貨は `result.loot` に足すだけ。撤退・敗北では加算しない（run.js は勝利の `reward` と一緒に足す）。
- 気合の増加は上限3。上限で増えなかったときはイベントを出さない（うるさい）。
- 敵の `role` が無い旧データは `fighter`。テストの直作りの敵も同じ。
- `order: "last"` の者が複数なら速度順。号令ユニット（`orderedUnit`）の先頭固定は今までどおり最優先。
