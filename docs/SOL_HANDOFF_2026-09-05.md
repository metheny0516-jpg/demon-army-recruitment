# Solへの引き継ぎ：イベント用表情差分 J

## 最初に読む短い指示

このメモを読み、**残件J（味方11種×驚き・にやり・涙）を進める**。2026-09-06にゴブリン・スライム・キングスライム・コボルト・オークの各3差分を制作・接続した。次はスケルトンから再開する。

正のブランチは `claude/owner-playtest-tuning-3vr0tt`。メモ作成時の基準HEADは `316f372a921355230db01941412d27264120cd9e`。着手前に `git pull origin claude/owner-playtest-tuning-3vr0tt`、`git status` を確認する。

`GAME_DESIGN_PRINCIPLES.md` 全文 → `HANDOFF.md` 0節 → `docs/WORK_SPLIT_2026-09-05.md` を読む。画像作業前に `.codex/skills/demon-army-monster-art/SKILL.md` とシステムの imagegen スキルを読む。コアKPIは「もう1回遊びたいか」。表情は事件の感情を伝えるための追加。

## 最新状態：完了分をやり直さない

| 作業 | 現状と注意 |
|---|---|
| A・B・D・G・I | Claudeが実装済み。Gの立ち絵＋吹き出しの器を使う |
| C | 混成シナジー7件は本番へ統合済み。`grant: true` は魔王軍完成の発動数に数えない。古い下書きで上書きしない |
| F | 3→10件と最小限のbattle.js接続を取り込み済み。既存3件の判定は維持。追加確率0.3〜0.4%、1体1戦1回、将軍で抑制 |
| E | `316f372`で戦間イベント30件・ツケを実装済み。Gemini台本を再投入しない |
| H | 台詞の流し込み済み。ただし `hungry/feast/chain` と `MORMO_LINES` の呼び出しは旧HANDOFFで未接続と記載。Jとは別の残件として現在の参照を確認する。Iの戦闘野次は別の `MORMO_BATTLE_LINES` を使用 |
| J | **ゴブリン・スライム・キングスライム・コボルト・オークの各3差分は本番接続済み**。`assets/monsters/events/{id}/` と `EVENT_EXPRESSIONS` へ追加する契約。残り6種×3差分 |

同日中にClaudeの取り込みが進んだ。**stash内の旧READMEにある「C未採用・E未着手・すべて未push」は古い**。本メモと現在のコードを優先する。旧作業は `7d39498`（`origin/codex/f-wip`）へ保管され、その後正のブランチへ調整して取り込まれた。旧コミットを再cherry-pickしない。

## Jの保存場所と復元

プロジェクト: `C:/Users/sano/Documents/ChatGPT/demon-army-recruitment`

生成原画のローカル保存先:

`C:/Users/sano/.codex/generated_images/01a07033-f347-7ee0-9b82-3ea332701b8e/`

同じ10枚はローカルstashにもコピーしてある:

- stash名: `Codex CFJ checkpoint notes and generated originals 2026-09-05`
- 固定stashコミット: `be625ddf091eb32a966f439df73e170fa7d373f4`（作成時は `stash@{0}`）
- 画像: `docs/drafts/cfj-2026-09-05/images/`
- stashはローカル専用。別PC・クラウドには自動で移らない。
- **stash全体をpop/applyしない**。古いメモと重複計測を一緒に戻さない。
- 必要なら未追跡ファイル用の第3親から画像だけ復元する:

```powershell
git restore --source='be625ddf091eb32a966f439df73e170fa7d373f4^3' --worktree -- docs/drafts/cfj-2026-09-05/images
```

先に同パスのローカル変更がないことを確認する。原画の生成元フォルダから読み取ってもよい。stashは検証・統合が終わるまで残す。

### 原画の対応表

全てPNG・1254×1254。2026-09-05にPillowでmodeとalpha極値を確認。alphaありは**採用確定ではない**。顔の読みやすさ・輪郭・元絵との一致は縮小して再確認する。

| 種族・表情 | ファイル名 | 状態 |
|---|---|---|
| goblin 驚き | exec-996a2f87-dfc2-4928-864a-191546a5c3f7.png | RGBA、alpha 0〜255 |
| goblin にやり | exec-3e1e157d-90a0-4c42-bd4c-93f9216ed219.png | RGBA、alpha 0〜255 |
| goblin 涙 | exec-9f1561a2-d15b-45dd-9ec1-4884be927bba.png | **RGB・チェック柄焼き込み。再生成** |
| slime 驚き | exec-2cfd2119-081d-434b-9bf9-3f030140026d.png | **RGB・チェック柄焼き込み。再生成** |
| slime にやり | exec-92951727-4f72-405e-8a17-a518b77af108.png | RGBA、alpha 0〜255。顔を足さず体のひだで表現 |
| slime 涙 | exec-439df4e7-8697-4c65-9ca6-046aad09dbde.png | RGBA、alpha 0〜255。涙が顔に見えないか要QA |
| king_slime 驚き | exec-f05c0cca-f694-4b50-93e0-da8342bf2063.png | RGBA、alpha 0〜255 |
| king_slime にやり | exec-5880c21c-38c9-45ba-8efb-f6aea1fcce0f.png | RGBA、alpha 0〜255 |
| king_slime 涙 | exec-73614f34-5727-4fe6-825d-697e07c2bbcf.png | RGBA、alpha 0〜255 |
| kobold 驚き | exec-812199d4-d4a3-46aa-99c4-b4b1bdea2249.png | RGBA、alpha 0〜255。記号追加と拡大率を要QA |

ゴブリン・スライム・キングスライム・コボルト・オークは2026-09-06に完了。残り6種18枚はすべて新規生成が必要。対象は `skeleton, zombie, imp, mage, necromancer, ogre`。

オークの原画は同じ生成フォルダの `exec-16868708-9e7f-450f-b00d-b11976af86ae.png`（驚き）、`exec-b7d090c1-fc7a-4fc4-8012-c70daa26a45b.png`（にやり）、`exec-fd49ba28-adf9-475f-8b06-8a107a5c936d.png`（涙）。

コボルトの新規原画は `exec-99a203ae-8cc3-434d-a998-5304b2197c3a.png`（にやり）と `exec-ebfec321-cc33-4e72-b571-f5201160707b.png`（涙）。どちらも `C:/Users/sano/.codex/generated_images/01a073f2-b8e7-7c41-b4a8-b30e4b550a10/` にある。

ゴブリンの涙は新しい生成元 `C:/Users/sano/.codex/generated_images/01a073f2-b8e7-7c41-b4a8-b30e4b550a10/exec-992937b9-fb0b-413c-bc54-d1cf19259d11.png` を採用。生成器がチェック柄をRGBへ焼き込んだため、`scripts/prepare_event_expressions.py` がキャンバス端につながる無彩色領域だけを透過化した。今後も真alphaならそのまま保持し、RGBチェック柄だけ同処理を使う。

スライムは保存済みの驚き・にやりを採用。保存済み涙は滴が目に見えるため不採用にし、顔を足さず体の下端から滴る新規原画 `C:/Users/sano/.codex/generated_images/01a073f2-b8e7-7c41-b4a8-b30e4b550a10/exec-7092357e-ed0a-498c-9ff6-07363d94d687.png` を採用した。

以前の大量生成セルはオーナーの停止指示で終了済み。新しく生成する前にフォルダを再確認し、完了して保存された追加ファイルがあれば重複生成を避ける。

## 画像制作と組み込みの手順

1. まず保存済み8枚のQAと1種の接続を行い、残りを量産する前にイベント画面で有効なサイズを決める。
2. 参照は `assets/battle/units/{id}/idle.webp` の既存全身立ち絵。`view_image` で見てから内蔵image_genへ渡す。履歴書の証明写真を置き換える依頼ではない。
3. 内蔵image_genで1差分ずつ編集。APIキーやCLIへの切り替えは不要。1種ずつ保存・QAを済ませると、中断や失敗時の無駄が少ない。サブエージェントは依頼されていない。
4. 別名でプロジェクト内へ保存し、元のidleや証明写真は保持。イベント差分用の保存パスと `src/data/portraits.js` の参照契約を先に決めて記録する。現状は通常portraitのID配列だけで、差分マップは未実装。
5. `UI.eventFaceHtml(who)` がGの差し替え口。ただし**表情をどの台詞で選ぶか・関数へどう渡すかは未実装**。単に3枚登録するだけでは自動表示されない。UI層はClaudeと同時に触らず、必要な接続を引き継ぐか、競合がないことを確認して小さく実装する。
6. 真のalphaを維持して圧縮し、イベントでの縮小表示・読み込み失敗時の通常絵/絵文字fallbackを確認。透過全身絵へ証明写真用スクリプトをそのまま使わない。同スクリプトは背景を塗りつぶし768×1024へ変形する。
7. 画像だけならファイル・alpha・寸法・容量・縮小QA。データ/UI接続後は関連テスト（`tools/browser-tests/eventcast.js` 等）を実行する。数値バランスを変えないJだけのためにsimを何度も回さない。
8. HANDOFFと分担表を更新。通常のプロジェクト運用は1タスク1コミット即push。契約追加はコミット文とHANDOFF第2節へ。元からある `.codex-remote-attachments/`、`img/`、ルートのxlsxはオーナーの未追跡ファイルなので触らない。

### 使用したプロンプトの再利用用要約

「既存全身RPG立ち絵の表情差分。驚き＝目を見開き口を開く、にやり＝得意げな笑い、涙＝読める涙と悲しい口。キャラ同一性・服・武器・配色・ポーズ・位置・全身の収まり・手描きの古いRPG図鑑の画風を維持し、表情だけ変更。正方形PNG、実alpha透過、チェック柄・背景・文字を描かない。」

- slimeは元から顔がない。目や口を追加せず、体の緊張・ひだ・たるみと既存のネクタイで表現。
- king_slimeは3体の合体と冠を維持。
- skeletonの元idleは右上に別コマの槍先が混入。本人の槍を保ち、その無関係な断片だけ除去する。

## 今回は行っていないこと

このメモ作成時はゲーム変更・画像生成・モデル切り替えなし。最新版の全テスト再実行もしていない。HANDOFF記載のClaude検証結果と、前の作業中のテスト結果を区別する。古いsimログは現行E（ツケ）導入前なので現在値として引用しない。
