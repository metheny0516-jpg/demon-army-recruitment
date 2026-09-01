# Project instructions

## Highest-priority product vision

Before planning, implementing, reviewing, or refactoring anything in this project, read
`GAME_DESIGN_PRINCIPLES.md` in full. Treat it as the highest-level design authority for
the game. It takes precedence over individual feature specifications, UI details,
balance values, content volume, implementation convenience, and this README when they
conflict.

Use its eight questions in section 15 as a gate for proposed features. Optimize for the
core KPI, 「もう1回遊びたいか」: prefer simple rules, surprising interactions,
player-discovered combinations, emergent stories, and replayability over feature count.
Do not silently dilute or contradict the product vision. If a request appears to conflict
with it, call out the tension before implementation so the product owner can decide.

実装状況と引き継ぎ事項は `HANDOFF.md`、現在の仕様は `README.md` を参照。

## 画像まわり

For any request involving monster portraits, résumé images, battle icons, image compression, or files under `assets/monsters`, read and follow `.codex/skills/demon-army-monster-art/SKILL.md` before acting.

Keep image IDs synchronized with `src/data/monsters.js` and `src/data/portraits.js`. Preserve the emoji fallback for monsters without an accepted portrait.

---

## Claude と CodeX の分担ルール

この2つのAIは**お互いのセッションが見えない**。人間（オーナー）が唯一の調整役である。
そのため、以下を守らないと静かに壊れる。

### 層で分ける（機能では分けない）

| 層 | 主担当 | 理由 |
|---|---|---|
| `assets/` `src/data/` | **CodeX** | 絵の生成パイプラインを持つ。データは末尾追記なので衝突しにくい |
| `src/core/` `tools/` | **Claude** | 変更のたびに `tools/sim.js` で測って検証する必要がある |
| `src/ui/` | どちらでも | ただし同時着手は避ける |

役割の言い換え:
**CodeX＝増やす**（絵・モンスター・台詞・イベント・敵データ）/
**Claude＝繋ぐ・測る・直す**（エンジン、相互作用、バランス検証、テスト）。

これは `GAME_DESIGN_PRINCIPLES.md` 第19節「大量生成 → 選別 → 調整」の分業に対応する。

### 専有ではなく優先権

どちらかが利用上限に達しても開発が止まらないよう、担当外の層も触ってよい。
ただし以下は必ず守ること。

1. **着手前に必ず `git pull`**（怠るとpushが弾かれる）
2. **1タスク＝1コミット＝即push**。作りかけを手元に置かない
3. **`src/core/run.js` と `src/core/battle.js` は同時に触らない**。最も衝突しやすい
4. **数値バランスを変えたら通常は `node tools/sim.js 50` の結果をコミットメッセージに書く**。
   戦闘式・経済式の大変更だけ100〜200へ増やす。
   相手がそれを見て判断できるようにする
5. **契約（`HANDOFF.md` 第2節）を変えたらコミットメッセージで宣言し、HANDOFFも更新する**

### 本当の危険はマージ衝突ではない

gitは大抵きれいにマージする。危険なのは**意味の衝突**である。

- 片方がバランスを測っている最中に、もう片方が数値を変える → 測定結果が嘘になる
- 片方が `contribution` などの構造を変える → その上に作られたUIが静かに壊れる

テキストとしては綺麗にマージされるのに、ゲームが壊れる。だから 4. と 5. が重要。

### 引き継ぎの作法

作業を終えたら `HANDOFF.md` の「次にやること」と「バックログ」を更新する。
相手が**文脈ゼロで拾える**状態にしておくこと。
設計アイデアを出してもらった場合も、採用したものはバックログに落とす。
