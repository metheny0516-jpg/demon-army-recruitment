# 技と敵の役割 ― 実装チケット（2026-09-12）

仕様は `docs/SPEC_SKILLS_2026-09-12.md`。エンジン（`src/core/battle.js`）と技データ（`src/data/skills.js`）と
node テスト（`tools/test-skills-command.js`）は Claude が実装済み。**以下は貼り付けて渡す指示文。**

共通ルール：作業ブランチ `claude/hero-arrival-tavern-prototype-uy2toh` から切って、同じブランチへ push。
1タスク＝1コミット＝push。push 前に `node --check` を触ったファイル全部に、`for t in tools/test-*.js; do node $t >/dev/null || echo FAIL $t; done`。
sim・run-all・ブラウザテストは直列（並列にしない）。軽いサブエージェントは並列でも可。
`src/core/run.js` と `src/core/battle.js` を同じコミットに入れない。触るファイルは各チケットに書いたもの**だけ**。

---

## チケット A（CodeX）：敵の役割と、種族の技への移行（データ）

触るファイル：`src/data/enemies.js`、`src/data/monsters.js`、`src/data/skills.js`（`lines` だけ）、`src/data/mormo_lines.js`（任意）。
読むだけ：`docs/SPEC_SKILLS_2026-09-12.md` 1・2・5節、`src/core/battle.js` の `planEnemy`／`runEnemyPlan`／`pickTarget`。

1. **敵に `role` を付ける**（`src/data/enemies.js`、`ENEMY_STAGES` と `ENEMY_STAGES_ACT2` の全ユニット、variants も）。
   役は `fighter`（既定・省略可）／`brute`／`shield`／`priest`／`caster`／`archer`／`rogue`／`commander`。
   - 段階1：fighter だけ。段階2から shield か archer を1体。段階4から priest。段階5から caster。段階6から rogue。段階7から commander。
   - 第二幕（9〜14）は毎段階3役以上。勇者一行：戦士ドルフ＝brute、勇者アレン＝commander、従軍僧（priest）と術士（caster）を1体ずつ足す（合計5体以内）。
   - 名前に役が分かる語を入れる（盾持ち・弓手・従軍僧・術士・斥候・隊長・大男）。既存の名前は残してよい（例：「弓手ミナ」→ archer）。
   - 数字（hp/atk/def/spd）は今は動かさない。役だけ。
2. **技へ移した特性を `fixedTraits` から外し、`skills` を置く**（`src/data/monsters.js`）。
   対象：`brute`, `pickpocket`, `fireball`, `guardian_prayer`, `mischief`, `allure`, `charge`, `regen`, `slime_body`, `bone`, `necromancy`。
   各テンプレートに `skills: ["<種族の技 id>"]` を足す（id は `src/data/skills.js` の `SPECIES_SKILL`）。
   ハーピー・ミミック・トロルも同じ（`harpy_dive`, `mimic_box`, `troll_rest`）。`traitPool` から上の id は外す。
   **注意**：`TRAITS` 側は消さない（旧セーブ・敵・遺物が参照する）。外すのはテンプレートからだけ。
3. **技の台詞**（`src/data/skills.js` の各技 `lines.use` / `lines.miss`）を種族の口調で2〜3本ずつに増やす。数字（power/hit/cost 等）は触らない。
4. 面接の札に「3戦で技【○○】」と出せるように、と Opus に渡す（あなたは触らない）。
5. 検証：`node --check src/data/*.js`、node テスト全通過、`node tools/sim.js 30` がエラーなく終わる。
   `role` を付けた敵が増えるので sim の勝率は下がってよい（煙探知だけ：0% の戦略が出ないこと）。
6. コミットは2つに分ける：(a) enemies.js の role、(b) monsters.js＋skills.js の lines。

---

## チケット B（Opus）：技の開放（run.js）と指示窓の技枠（UI）

触るファイル：`src/core/run.js`、`src/ui/battle_scene.js`、`src/ui/ui.js`（面接の札の一行だけ）、`src/styles.css`、
`tools/browser-tests/order.js`、`tools/browser-tests/skills-window.js`（新）、`tools/test-skill-unlock.js`（新）、`tools/browser-tests/run-all.sh`（登録）。
読むだけ：`docs/SPEC_SKILLS_2026-09-12.md` 3・4・6節、`src/core/battle.js` の prompt の形（`allies[].skills`、`fallen`、`enemies[].intent/role`）、`result.spiritGained`。

### B-1 run.js（コミット1）
1. `SKILL_RULES.speciesUnlockBattles`（3）で種族技を覚える：`record.battles >= 3` かつ `monster.skills` に `SPECIES_SKILL[tplId]` が無ければ push。
   モルモの一言「○○が技【△△】を覚えた。次から指示で出せる」。既存の `checkSkillUnlock`（上位技）の隣に `checkSpeciesSkill(monster, notes)`。
   呼び場所は `checkSkillUnlock` と同じ（戦闘の決着後）。
2. **上位技を8戦に**：`SKILL_RULES.unlockBattles` を 8 に（`src/data/skills.js` の値を変えてよい。これだけは例外）。
   `nextSkillFor` の `replaces` が指す特性がテンプレートから消えているので、**`replaces` を持っていなくても**種族（`skill.species === tplId`）が合えば覚えるように直す。
   面接の札の「6戦で【…】」は `skillRules().unlockBattles` を読んでいるか確認（「8戦で」になること）。
3. **遅咲き**：`LATE_BLOOMER_JOBS = ["会計","倉庫","広報","伝令","受付","経理","備品","配達"]` を job に含む者は 3→6、8→12。
   代わりに内政のどれか（調達・施工・応募の値、テンプレートの該当 field）+1（採用時に決めて monster に保存）。
   履歴書（`UI.memberDetail` と面接の札）に「？？？（この者は何かを隠している）」を一行。モルモが一度だけ（`st.flags.lateBloomerHint`）
   「あの者、戦場に出すと化けるかもしれませんヨ」。
4. **移行**（`migrateState`）：`traits` に技へ移した特性（A-2 の一覧）があれば消す。`record.battles >= 3` なら `skills` に種族技。
   `skills` が無い旧セーブは `[]`。
5. **気合の増減**：`finishManualBattle`／`settleBattle` で `result.spiritGained[uid]` を名簿に足す（上限は `spiritRules().max`）。既存の `spiritSpent` の隣。
6. **略奪**：`resource_gain`（`label` が技名）は既存の略奪予約と同じ道で勝利時に足される。動くことを確認するだけ（直さない）。
7. node テスト `tools/test-skill-unlock.js`：3戦で覚える／8戦で上位／遅咲きは6・12／移行で癖が消えて技が入る／spiritGained の反映。

### B-2 指示窓（コミット2）
1. 技ボタンを `allies[].skills` の数だけ（最大2）。一行：`技「振り下ろす」　×2.0　最後に動く・命中70%　気合1`。選べないときは薄くして `why` を添える。
2. 押したときの命令は `{ cmd: "skill", skill: id, target }`。
   - `target: "enemy"` → 今の狙い選び（敵の札）。
   - `target: "ally"` → 味方の札が光る（`#band-player .bu`）。`fallen` → 倒れた味方の札（`.bu.dead`）が光る。
   - `self`／`none`／`all_*` → 即決定。
3. 敵の `intent` ごとの印と予告：`big` ⚠「大技を放つ」／`heal` ✚「仲間を癒やそうとしている」／`aoe` 🔥「全体への術を練っている」／`guard` 🛡「守りに入っている」。
   敵の `role` は札の名前の前に小さく（💪🛡✚🔥🏹🗡🎖）。
4. 字幕：`note` に `skillMiss`（外れた）、`spiritGain`（気合が高まる。札の気合表示を一瞬光らせる）、`stunned`、`guarding`。
   `order_exec` に `species: true` が付く（種族技）。表示は既存の号令と同じでよい。
5. `heal` イベントに `sourceId`／`label` が付くことがある（技・敵の癒やし）。既存の描画が壊れないこと。
6. ブラウザテスト `tools/browser-tests/skills-window.js`：技2枠が並ぶ／味方狙いで味方の札が光る／外れの字幕／intent の印。`run-all.sh` に登録。
   `order.js` は `skills` を使う形に直す（`brute` は技に移るので、テストの roster は `skills: ['ogre_smash']` と `traits: ['ogre_charge']` にする）。
7. 390px で窓が指示中の札を隠さないこと（スクリーンショットを `.screenshots/` に）。

---

## チケット C（Opus、B のあと）：戦闘回数を増やす ― 前哨戦と本戦

別紙 `docs/SPEC_TWO_STAGE_BATTLES_2026-09-12.md` を Claude が書いてから渡す。B が終わるまで着手しない。
