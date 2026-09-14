# 仕様：戦闘の深み A・C・D（2026-09-14、オーナー決定「ACD いく」）

たたき台：`docs/DESIGN_BATTLE_DEPTH_2026-09-14.md`。B（休む）と E・F は今回やらない。

## A. 食べる（エンジン済み・Claude 2026-09-14）
- 指示窓の各味方に `eat: { ready, left, heal }` が付く。`cmd: "eat"` で、その手番に携行食を1つ食べて HP を戻す（30%。巨大厨房 Lv3 で 40%）。攻撃はしない。
- 隊で1戦に **2回**まで（巨大厨房 Lv2 で 3回）。`options.rations.spare`（備蓄の残り）が無ければ `ready:false`。傭兵・召喚は食べられない。
- 結果 `result.rationsEaten`（食べた数）。
- **Opus**：
  - run.js：`rationContext` に `spare: st.food`（前払い後の備蓄）と `kitchenLv: Town.lv(st,"grand_kitchen")` を入れる。決着で `st.food -= result.rationsEaten`（0 未満にしない）。日誌に「戦闘中に携行食を○つ食べた」。
  - battle_scene.js：窓の「まもる」の**2段目**に「食べる（あと○回）」。`eat.ready` でなければ薄く。押したら `cmd:"eat"`。字幕は既存の heal と `note.eat` で足りる。
  - テスト：`tools/test-skills-command.js` は済み。`tools/browser-tests/skills-window.js` に1件（食べるが出て、押すと HP が戻り、食料が減る）。sim は触らない（自動戦闘は食べない）。

## C. 回復の技3本（データ済み・Claude 2026-09-14）
| 誰 | 技 | 中身 |
|---|---|---|
| トロル | 種族技「休む」→**「壁になる」** | 味方1体をかばう（80%で受ける）。気合1。3戦目から。オーナー決定「トロルはタンク役」：HP 38→48・防御 5→7・攻撃 10→9。回復役はマンドラゴラ（D） |
| サキュバス | 上位技「魅了」→**「気付け」** | 味方1体の足止め・魅了・燃焼を解く。気合2。癖「魅了」は残る（受動の魅了はそのまま） |
| キングスライム | 上位技**「包む」** | 味方1体を 20% 回復。気合1。癖「大波」に紐づく |
- 仕組み：上位技は癖（tier2 の trait）に紐づく。kind が `trait` なら号令、それ以外は通常の技として解決する（battle.js `unitSkillIds`）。
- **Opus**：`src/data/traits.js` の enthrall の desc に「上位技は気付け」の一言、`ui.js` の技一覧で「手当て」「気付け」「包む」の表示を確認（表示は SKILLS を読むので変更なしのはず）。旧セーブは traits がそのままなので移行不要。

## D. 回復役の新種族「マンドラゴラ」（`IDEA_BANK` S07）
- 姿：土から抜かれた根の魔物。声は大きいが言葉遣いは丁寧。**中盤（征服度3以上）から応募**、tier 2、給与 4G、HP 低め・攻撃低め・速さ普通。職業は料理人（酒場の職業一致）。
- 種族技（3戦）：**「配り薬」**（カタログ `mend_all`：味方全員 15% 回復、気合2）。
- 上位技（8戦・癖 `wake_call` tier2）：**「目覚めの声」**（`cleanse` の全体版：全員の足止め・魅了・燃焼を払い、次の自分の手番は休む）。
- 履歴書の噂・面接の一言：「食材とは別の棚に、名札を付けていただければ」。
- **CodeX（絵）**：`assets/monsters/mandragora.png`（768×1024、80KB以下）、`assets/battle/units/mandragora/` 6ポーズ＋review。画風は既存。
- **Opus（データ）**：`monsters.js` に template（id `mandragora`、race「マンドラゴラ」、tier 2、応募は征服度3以上の条件を既存の tier の仕組みで）、`traits.js` に tier1 癖 `root_voice`（受動：留守番のとき食料 +1／決着）と tier2 `wake_call`（replaces root_voice）、`skills.js` に `mandragora_mend`（kind `mend_all`、species mandragora）と UPPER `mandragora_wake`（kind `cleanse_all`＝カタログに無ければ `cleanse` を全員に回す hook を Claude が足す）、`portraits.js` に追加、`epithets.js` に二つ名1本、`tools/test-skill-unlock.js` に1件。
- 順序：Claude（`cleanse_all` の hook、本日）→ Opus（データ）→ CodeX（絵、並行可。絵が無い間は絵文字🌱）。

## 触るファイル
- Claude：`src/core/battle.js`、`src/data/skills.js`、`src/core/skill_effects.js`（`cleanse_all`）、`tools/test-skills-command.js`。
- Opus：`src/core/run.js`（rations の2欄と食料の減算）、`src/ui/battle_scene.js`（食べるの2段目）、`src/data/monsters.js`・`traits.js`・`skills.js`（マンドラゴラのデータ）、`src/data/portraits.js`、`src/data/epithets.js`、`tools/browser-tests/skills-window.js`、`tools/test-skill-unlock.js`。
- CodeX：`assets/monsters/mandragora.png`、`assets/battle/units/mandragora/`。
