# 仕様：大技は大きく・揺れて・ドカーン（2026-09-15）

オーナー：「打撃に比べて魔法攻撃が玉小さく出る。普通の攻撃ならいいが、大火球だと迫力がほしい。当たった時の衝撃もインパクトあるように。効果音もドカーンみたいなのに」→「全部一般化で進めて」。

## 0. 一文で

**上位技（`upper: true` の技＝大技）の一撃と余波には、エンジンが `big: true` と技の `fx` を乗せる。描画と音は `ev.big` を見て、fx の種類によらず一律に「大きい弾・長い溜め・着弾の止めと揺れ・爆発音」を出す。**
普通の火球（`mage_fireball`）や通常攻撃は今のまま。

## 1. エンジン（Claude・済み 2026-09-15）

- `battle.js`：`UPPER_BY_TRAIT`（癖 id → 大技）を持ち、
  - `trait_trigger`（大技の発火印）に `big: true, fx, skillId`、強調度 3。
  - 号令・指示で大技を放つ本人の `attack` に `big: true` と技の `fx`（`skillId` も）。
  - 発火印を親にする `splash`（大火球の余波・ぶちかましの巻き込み等）は親から `big` と `fx` を継承。
  - 燃焼（次ラウンド頭の削り）は `big: false` を明示して継承しない。
  - `big` の一撃は強調度が最低 2（`hit-big`・大きい数字は今の仕組みでそのまま出る）。
- テスト：`tools/test-skills-command.js` に5件（発火印・本人の一撃・余波2発・燃焼は継承しない・普通の攻撃は big=false）。
- データは触っていない。大技の一覧（`skills.js` の `upper: true`、12本）：
  大火球 fire／死の波動 dark／疾風 wind／暴走 heavy／ぶちかまし heavy／一刀 slash／血の雄叫び slash_multi／集団戦法 slash_multi／黒の癒し dark（回復）／包む nature（回復）／目覚めの声 holy（回復・全体）。
  回復系の大技は `attack`/`splash` を出さないので、描画は発火印（`trait_trigger` の big）だけで「大きく」する。

## 2. 描画と音（Opus）

触るファイル：`src/ui/battle_scene.js`、`src/ui/sound.js`、`src/styles.css`、ブラウザテスト（`skill-fx.js` に追記）。**run.js・battle.js は触らない。**

| 場面 | 見せ方 |
|---|---|
| 発火印（`trait_trigger` で `ev.big`） | 溜めを長く（`windup` 1.6 相当）、本人の札を一回り拡大＋光る。技名の吹き出し（skill_call）は今のまま |
| 弾（`fx` に `projectile` がある：fire / wind）で `ev.big` | 弾の要素に `.big` を付け、3倍の大きさ＋尾を長く。飛ぶ時間は 1.3 倍（速いほど迫力が落ちる） |
| 着弾（`attack` / `splash` で `ev.big`） | **止め（ヒットストップ）80ms** → 白フラッシュ（scene の opacity 0.15s） → `shake()` を強い版（振幅 2 倍、`shake-big` クラス） → 相手が後ろへ 12px 弾かれて戻る（transform） → 着弾の絵 `fx-big-<fx>`（無ければ既存 `impact` を 2 倍） |
| 全体攻撃の余波（`splash` が連続） | 1 発ごとに止めと揺れを入れると重い。**最初の 1 発だけ**止め＋フラッシュ、以降は揺れだけ |
| 音 | `sound.js` に **爆発系（`dokan`）** を追加。`ev.big` の着弾で `dokan`、種類 fire/dark/heavy は `dokan`、slash/slash_multi/wind は既存 `zuba` を強調度 3 で。回復系の big は既存のまま |
| 低モーション | 止め・揺れ・弾き飛ばしは出さない。大きい弾と音は出す |

- `FX` プリセットに `big` を足す方式は取らない（fx の種類ごとに増えて散らかる）。**`ev.big` を見る分岐を `damage` と `trait_trigger` の描画に 1 箇所ずつ**。
- テスト（`skill-fx.js`）2件：大火球を指示すると弾に `.big` が付き着弾で `shake-big` が出る／普通の火球には付かない。

## 3. 絵と音（CodeX）

触るファイル：`assets/battle/effects/`、`assets/sfx/recorded/`、それぞれの `LICENSES.md`。**src/ は触らない。**

| 種類 | ファイル | 内容 |
|---|---|---|
| 弾（大） | `projectile-fire-big.webp` | 大火球。既存 `projectile-fire.webp` の 3 倍相当の火の玉と長い尾。512×512 透過 |
| 弾（大） | `projectile-wind-big.webp` | 疾風。渦を巻く大きな風の刃 |
| 着弾（大） | `big-fire.webp` `big-dark.webp` `big-heavy.webp` `big-slash.webp` `big-slash_multi.webp` `big-wind.webp` | 6 枚。爆発・闇の噴出・地割れ・大きな斬撃・連撃・突風。512×512 透過、既存 `impact.webp` と同じ座標系（中心が相手の胸） |
| 音 | `dokan-a.wav` `dokan-b.wav` `dokan-c.wav` | 爆発・ドカーン系 3 種。既存の zuba / basun と同じ長さ・音量感（0.4〜0.7 秒、CC0） |

- 絵の指針は `assets/battle/README.md` のまま（荒い線・抑えた影・光沢なし）。**大きいが、綺麗すぎない**。
- ブランチ `codex/big-skill-fx`。上がったら Claude が取り込み、`LICENSES.md` を確認して Opus のチケットを出す。

## 4. 順番

1. Claude エンジン（済み）→ push。
2. CodeX の絵と音（§3）。
3. 絵が本線に入ってから Opus の配線（§2）。絵が無い間も `ev.big` の止め・揺れ・大きい CSS 弾は動くので、Opus を先に貼ってもよい（その場合は絵の差し替えだけ後で）。**オーナー判断：Opus を先に貼るか、絵を待つか。** 推奨は Opus 先（迫力の大半は動きと音で決まる。音は候補フォルダの thwack を仮に使う）。

## 5. 貼り付け用（CodeX 用）
```
Astra へ。docs/SPEC_BIG_SKILL_FX_2026-09-15.md の §3 をお願いします。大技用の絵 8 枚（弾2＝projectile-fire-big / projectile-wind-big、着弾6＝big-fire / big-dark / big-heavy / big-slash / big-slash_multi / big-wind）を assets/battle/effects/ に、爆発音 dokan-a/b/c.wav を assets/sfx/recorded/ に。512×512 透過 webp、既存 impact.webp と同じ座標系。大きいが綺麗すぎない（README の指針）。LICENSES.md に出典を足す。ブランチ codex/big-skill-fx、作業ブランチ claude/hero-arrival-tavern-prototype-uy2toh から切って push。src/ は触らない。
```

## 6. 貼り付け用（Opus 用）
```
Opus へ。まず git pull（作業ブランチ claude/hero-arrival-tavern-prototype-uy2toh）。docs/SPEC_BIG_SKILL_FX_2026-09-15.md の §2 を実装して。エンジン側は済み（attack / splash / trait_trigger に ev.big と fx が乗っている。tools/test-skills-command.js の末尾に例）。触るのは battle_scene.js・sound.js・styles.css・skill-fx.js だけ。run.js と battle.js は触らない。着弾は「止め80ms→白フラッシュ→強い揺れ→相手を12px弾く」の順、全体攻撃は最初の1発だけ止め。絵が無い種類は既存 impact を2倍、音は dokan が無ければ candidates の thwack を仮に。node 全件とブラウザテストを直列で回して緑を確認してから push。
```
