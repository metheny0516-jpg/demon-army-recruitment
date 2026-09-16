# 仕様：スライムの大筋 ②「増殖の元」（2026-09-16・Claude。設計は `DESIGN_ARC_SLIME_2026-09-15.md`）

## 0. 一文で

**池の噂を開いた周回で、火球の火の粉を浴びたスライムは戦闘中に分裂し、1体だけ名簿に残る。撃った魔法使いは「もう火球は撃たん」と言う。**

設計との違い：札（door C）は作らない。条件は痕跡から run.js が判定し、**戦闘の中で勝手に起きる事故**として出す（`DESIGN_INCIDENTS` 2節の入口 C）。
結果画面の「なぜ」欄で痕跡を名指しする。新しい画面・資源は無い。

## 1. エンジン側（Claude・済み b2fa740 の次のコミット）

- `options.slimeSplit = { enabled: true, cap?: 3 }` を渡すと、**火の火の粉**（`fx === "fire"`）を浴びて生き残ったスライム（`race === "スライム"`、召喚ではない）が
  次のラウンドから**ラウンドの頭に分身を1体**出す（1戦に cap＝3 まで）。分身は攻撃 1・HP 30%・`flags.summoned`（戦闘専用）。
- 浴びた直後に字幕「体が、火を浴びてぶるぶると震えている……」（`note` で `split: true`）。分身の `summon` は火の粉の一撃を親に持つ（因果が残る）。
- `result.slimeSplit = [{ uid, byUid, skillId, count }]`。options が無ければ何も起きない。`tools/test-slime-split.js` 10件。

## 2. run.js 側（Opus。段階B/D と削除チケットの後）

### 2-1 条件（痕跡2＋状態1。`docs/DESIGN_INCIDENTS` 7-1）
出撃のたびに判定して `simOptions.slimeSplit` を作る：
- 痕跡 `incident` に `data.id === "slime_pond"`（池の噂を**開いた**周回。無視した周回では起きない）
- 痕跡 `sparked` の subject がスライム（過去に一度は火の粉を浴びている）
- 状態：出撃隊にスライムが1体以上、**かつ** `st.slimeCulled` が立っていない（③で「間引く」を選んだら以後は起きない。今は常に undefined）
→ `{ enabled: true }`。満たさなければ渡さない。

### 2-2 決着（`settleBattle` の `sparked` を痕跡にしている所の隣）
`result.slimeSplit` の各行について：
- **1体だけ名簿へ**：`rollApplicant("slime")` で作り、名前は「○○の分身」、給与 1・忠誠 50、`m.origin = "split"`。名簿に空きが無ければ `incidentApplicant("slime", "○○の分身")` で次の面接へ。
- 痕跡 `incident`（`data.id = "slime_spawn"`, `data.text = "○○が火を浴びて分裂した（△体）"`, subject = スライムの uid, object = 魔法使いの uid）。
- 魔法使いの一言：`m.faceLine = "もう火球は撃たん"`（面接カード・人物詳細で `quote` の代わりに出す。既にあれば上書きしない）。
- 結果画面の「なぜ」欄（噂の札と同じ場所）に1行：「池の噂 ＋ 火の粉を浴びた○○ → 分裂して△体、1体が残った」。
- `st.slimeSpawnCount += 1`（③の条件に使う。表示はしない）。

### 2-3 触るファイル
`run.js`（条件・決着・痕跡）、`ui.js`（なぜ欄の1行、faceLine の表示）、`tools/sim.js`（戦略「スライム統一＋魔法職1」を1本足し、列に「分裂」を出す）、`tools/test-slime-run.js`（新規：条件が揃うと options が渡る／揃わないと渡らない／分身が1体だけ名簿に残る／痕跡と一言が残る／空きが無ければ面接へ）。
**battle.js は触らない。**

### 2-4 数の目安
sim で「スライム統一＋魔法職1」：分裂が 1周回に 1〜3 回、名簿のスライムが 2〜4 体増える程度。クリア率は見ない。

## 3. 貼り付け用（Opus 用。段階B/D と TICKET_REMOVE_DEAD §1 の後）
```
Opus へ。まず git pull。docs/SPEC_SLIME_ARC_2_2026-09-16.md の §2 を実装して。エンジン側は済み（battle.js の options.slimeSplit と result.slimeSplit、tools/test-slime-split.js に使い方）。触るのは run.js・ui.js・sim.js・新規テストだけ。battle.js は触らない。コミットは (a) 条件と決着 (b) 表示と sim とテスト の2つ。node 全件・sim 20・ブラウザテスト（incidents / report）を回して緑を確認してから push。
```

## 4. 次（③「沼が動く」）は ② の試遊のあとに仕様を書く。
