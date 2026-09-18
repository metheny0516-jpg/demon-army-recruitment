# 仕様：将軍への転身 ― 階級を2段にし、将軍を「事件」にする（2026-09-13）

オーナー決定（2026-09-13 試遊後）：小隊長・魔将は分かりづらく、効果もぴんと来ない。**将軍以外の階級はなくす**。
将軍になったら魔王が魔力を授け、**大幅強化＋転身（強化変身）**にする。

## 0. 一文で

**戦功が溜まった者は、魔王の魔力を受けて「将軍」に転身する。名に二つ名が付き、体が大きく強くなり、将軍だけの技を得る。**
階級は「兵卒 → 将軍」の2段だけ。途中の階段はなし。

## 1. 今との差

| | 今 | これから |
|---|---|---|
| 階級 | 兵卒→小隊長(4)→魔将(10)→将軍(22) | 兵卒→**将軍(22)** |
| 昇進の中身 | HP・攻撃 +5%／+8%／+20%、忠誠・給与が少し | 将軍だけ：HP・攻撃 **+40%**、気合上限 **+1**、将軍技1本、二つ名、忠誠+15、給与+2 |
| 見た目 | 名簿にバッジ | 名簿・戦場の札に**紫の炎の縁**（共通差分）、名前が「二つ名＋名」に |
| 将軍の号令（与ダメ+15%） | あり | **そのまま** |

## 2. 規則

### 2.1 戦功と閾値
- 戦功の入り方は変えない（生存1、撃破ごと+1で最大+2、最多与ダメ+2、最多被ダメ+1）。
- `PROMOTION_RANKS` は `soldier`(0) と `general`(22) の2件にする。`squad_leader`／`demon_lord` は**削除**。
- 22 は活躍する者で 8〜12 戦目（上位技8戦の少し後）。sim で「将軍が1ランに平均 1〜2 体」なら据え置き。0.5 未満なら 18、3 以上なら 26。

### 2.2 転身（`promote` の中身）
- HP・攻撃を **×1.40**（現在値に直接かける。`base`／`grown` は触らない。今の方針どおり）。防御 +2。忠誠 +15、給与 +2。
- `m.spiritMaxBonus = 1`（気合の上限+1。エンジンは `unit.spiritMaxBonus` を `SPIRIT_MAX` に足す。**新しい欄**）。
- `m.skills` に将軍技の id を1本足す（3節）。種族技・上位技はそのまま残る。
- `m.epithet`（二つ名。種族ごとに1本、`src/data/epithets.js`（新））。表示名は「二つ名・名前」（例「鉄壁・ゴルド」）。`m.name` は変えない（セーブ・記録・殿堂の照合を壊さない）。表示側で `Game.displayName(m)` を通す。
- 気合は転身の瞬間に**満タン**にする（次の戦いで将軍技をすぐ見せられる）。
- 転身は決着画面の「魔王軍人事」で出す。既存の `promotion-panel` を使い、将軍だけ**カットイン一枚**（紫の炎が札を包み、二つ名が浮かぶ。2.5秒、タップで飛ばせる）。モルモ「魔王様の魔力デス……あの体で受け止めるとは」。
- 効果音：既存の `revive` 系か、無ければ勝利の歓声を短く。新しい音は作らない。

### 2.3 将軍技（`src/data/skills.js` に `GENERAL_SKILL` 1本。全種族共通）
- id `general_might`、名「魔王の力」、label「力を示せ」、kind `aoe`、気合 **2**、target enemy、fx `dark`。
- 効果：敵全体に攻撃の 0.9 倍。使用後、味方全員の気合 +1（将軍が「魔力を分ける」）。一文：「敵全体をなぎ払い、仲間に気合を分ける」。
- 息切れ・傭兵の規則は他の技と同じ。お披露目（cost 0）は**付けない**（転身時に気合を満タンにするので要らない）。
- 敵の役に「将軍」は足さない（敵側の強化は別件）。

### 2.4 やらないこと
- 転身の分岐（複数の姿）、降格、将軍の人数制限、種族ごとの技差、種族ごとの転身絵（まず共通の縁で。反応がよければ人気種族から CodeX に描かせる）。

### 2.5 旧セーブ（`migrateState`）
- `rankId` が `squad_leader`／`demon_lord` の者は `soldier` に戻す。戦功はそのまま（22 に届いていれば次の決着で将軍になる）。**能力の巻き戻しはしない**（既に掛かった +5%／+8% は据え置き。壊す方が危ない）。
- `rankId === "general"` の者で `epithet` が無ければ二つ名と将軍技と `spiritMaxBonus` を**付け直す**（HP・攻撃は再度掛けない）。
- 殿堂（`legacy`）の `formerRankId` は `soldier`／`general` 以外を `soldier` に丸める。

### 2.6 表示
- 名簿の一行：`戦功 12/22` はそのまま。中間の階段が消えるので、これが「将軍まであと○」の代わり。
- 名簿・詳細・戦場の札：将軍は `rank-general` に紫の炎の縁（CSS だけ。`box-shadow`＋ゆっくりした脈動、低モーションでは静止）。
- 二つ名は名簿・詳細・戦場・決着・記録で出す。面接カードには出ない（応募者は兵卒）。
- 記録の「輩出した将軍」「歴代将軍」は二つ名付きで。

## 3. 分担と触るファイル

| 誰 | 何 | 触るファイル |
|---|---|---|
| **Claude**（先） | エンジン：`unit.spiritMaxBonus`、`GENERAL_SKILL` の kind aoe＋「味方全員の気合+1」の後処理（`SKILL_EFFECTS` の hook で書く） | `src/core/battle.js`、`src/data/skills.js`、`src/core/skill_effects.js`、`tools/test-skills-command.js`（2件） |
| **Opus** | run.js：階級2段、`promote` の転身、`migrateState`、`displayName`、気合満タン。UI：名簿・札・決着カットイン・記録。CSS | `src/data/promotions.js`、`src/core/run.js`、`src/ui/ui.js`、`src/ui/battle_scene.js`（札の縁だけ）、`src/styles.css`、`src/data/mormo_lines.js`（1本）、`tools/test-promotion.js`（新）、`tools/browser-tests/general.js`（新）、既存テストの `demon_lord` 参照（`test-hall-of-fame.js`）の修正 |
| **CodeX** | 二つ名 17 種族分（新種族が入れば追加）＋将軍技の台詞3本。**データ1ファイルだけ** | `src/data/epithets.js`（新。`{ [race]: "二つ名" }` と `GENERAL_LINES`） |

順序：Claude → Opus。CodeX は並行可（epithets.js が無い間、Opus は「将軍」を仮の二つ名にしてよい）。

## 4. テスト
- `tools/test-promotion.js`：22 で将軍になる／中間階級が無い／転身で HP・攻撃 ×1.4・気合満タン・技が足される／旧セーブの `demon_lord` が `soldier` に戻り能力は据え置き／将軍の旧セーブに二つ名が付く。
- `tools/test-skills-command.js`：`spiritMaxBonus` で上限が 4 になる／「魔王の力」で敵全体に当たり味方の気合が +1。
- `tools/browser-tests/general.js`：将軍を1体持つセーブを流し、名簿に二つ名と縁、戦場の窓に「力を示せ」が出る。
- sim：`SIM` 20 ランで将軍の輩出数を列に足す（Opus。`tools/sim.js` の集計1列）。

## 5. 落とし穴
- `promote` は `while` で複数段を一気に登る（`applyMerit`）。2段になれば1回で済むが、ループはそのままでよい。
- `generalsMade` は uid で重複を防いでいる。転身の付け直し（旧セーブ）で二重登録しないこと。
- `m.name` を変えないこと。殿堂・遺物・記録・テストが名前で照合している。
- 将軍技の「味方全員の気合+1」は `gainSpirit` を通す（`result.spiritGained` に載せて run.js が反映する。直接 `unit.spirit` を触らない）。
- 「将軍の号令」シナジーは `rankId === "general"` を見ている。id は変えない。

## 6. 貼り付け用
Opus：
```
docs/SPEC_GENERAL_2026-09-13.md の Opus の欄を実装して。作業ブランチ claude/hero-arrival-tavern-prototype-uy2toh から切って同じブランチへ push。
Claude のエンジン側（unit.spiritMaxBonus と GENERAL_SKILL）が入ってから着手。battle.js は触らない。
コミットは (a) 階級2段と転身（run.js・promotions.js・テスト）、(b) 表示とカットイン、(c) ブラウザテストと sim の列、の3つ。
```
CodeX：
```
docs/SPEC_GENERAL_2026-09-13.md の3節を読んで、src/data/epithets.js を作って。17種族（src/data/monsters.js）ぶんの二つ名と、将軍技「魔王の力」の台詞3本。
ブランチ codex/epithets（claude/hero-arrival-tavern-prototype-uy2toh から切る）。このファイル1つだけ、1コミット。二つ名は中高生が読める4字以内、ダジャレは2割まで。
```
