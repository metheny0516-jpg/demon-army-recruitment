# 効果音のライセンス台帳

## 2026-09-11 勝利ファンファーレ（`recorded/fanfare-win.wav`）

- 原題: [Classic fanfare lick](https://opengameart.org/content/classic-fanfare-lick)／作者: fvcalderan／取得日: 2026-09-11／ライセンス: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)（同日に配布ページのCC0表記を確認）／変換: 前後無音を除去、ピーク0.85、端フェード、44.1kHz・16bit・stereo WAV。

2026-09-04 オーナー試聴後: 通常物理攻撃は `candidate-antum-thwack-08.wav` と
`candidate-antum-thwack-09.wav` を原音のまま交互使用。作者・CC0出典は下記 AntumDeluge の項。
`recorded/` の斬撃・打撃・刺突割当は旧候補。金属防御は引き続き使用。

## 2026-09-04 実録音の試遊接続（`recorded/`）

オーナーの最新依頼に従い、下記CC0素材をゲームの物理攻撃・防御へ仮接続。
`slash-*` / `guard-*` は StarNinjas、`blunt-*` / `pierce-*` は Jordan Irwin (AntumDeluge)。
出典とライセンスは下記。2026-09-04に元ページのCC0表記を再確認。
元音との対応は `recorded/sources.json`。`tools/prepare-recorded-sfx.js` で無音を詰め、
ピークを0.85へ揃え、端にフェードをかけた。音の合成・レイヤー追加はしていない。
刺突は専用の刺傷録音ではなく、短い打撃音を割り当てた試遊候補。最終選定はオーナー試聴後。
以下の「現行ゲーム音」「ゲーム本体では未使用」は2026-08-31時点の履歴である。

## 現行ゲーム音（`basun-*` / `gachan-*` / `zushi-*` / `zuba-*`）

`tools/generate-sfx.js` で本プロジェクト用に生成したオリジナルWAV。外部素材は含まない。

## 試聴候補（`candidates/`、ゲーム本体では未使用）

### `candidate-starninjas-sword-01.wav` 〜 `10.wav`
### `candidate-starninjas-clash-01.wav` 〜 `10.wav`

- 原題: [20 Sword Sound Effects (Attacks and Clashes)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes)
- 作者: StarNinjas
- 取得日: 2026-08-31
- ライセンス: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 原音: 実際のナイフ2本の風切り10種、衝突10種。`sword_-_starninjas.zip` / `sword_clash_-_starninjas.zip`
- 変換: 試聴を揃えるため、OGGステレオを 44.1kHz・16bit・mono WAV に変換しただけ。音の加工・編集・正規化は行っていない。

### `candidate-antum-thwack-01.wav` 〜 `10.wav`

- 原題: [Thwack Sounds](https://opengameart.org/content/thwack-sounds)
- 作者: Jordan Irwin (AntumDeluge)
- 取得日: 2026-08-31
- ライセンス: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 原音: 物を叩いて録音した10種。配布元のPCM WAVをそのまま収録（44.1kHz・16bit・mono）。

### `candidate-artisticdude-swish-01.wav` 〜 `13.wav`

- 原題: [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack)
- 作者: artisticdude
- 取得日: 2026-08-31
- ライセンス: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 原音: 衣類ハンガーや木材を振って作られた、軽い4種と重い9種の短いスイッシュ。
- 変換: 44.1kHz・24bit・stereo WAVを、試聴条件に合わせて44.1kHz・16bit・mono WAVへ機械的に変換しただけ。音の加工・編集・正規化は行っていない。

候補は比較試聴のためだけに分離してあり、採用するまで `src/ui/sound.js` から読み込まない。採用時は、元ページ・取得日・ライセンスをこの台帳に残したまま、ゲーム用に切り出し・レイヤーした成果物を別名で追加する。

## 2026-09-13 魔王軍の勝利歓声（`recorded/fanfare-win-roar.wav`）

- 採用（2026-09-13 オーナー試聴後）: `candidates/candidate-win-roar-quendel-crowd.wav`（大群衆寄り、下記 Gregor Quendel、**CC-BY 4.0**）。採用WAVはこの候補と同一。クレジットは `CREDITS.md` に記載。
- 初回案は `candidates/candidate-win-roar-craigsmith-cheer.wav`。男性集団の歓声を3半音下げたもの。以下の原題・変換の記述はこの初回案のもの。
- 原題: [S12-03 Small group men cheering; encouraging.wav](https://freesound.org/people/craigsmith/sounds/675103/)／作者: craigsmith／取得日: 2026-09-13（日本時間）／ライセンス: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)（同日に配布ページのCC0表記を確認）。
- 取得音源: 配布ページに掲載された[高品質MP3プレビュー](https://cdn.freesound.org/previews/675/675103_2524442-hq.mp3)。原配布WAVではなくMP3からの変換。
- 変換: 44.1kHzへリサンプル後、ピッチを3半音下げてテンポを補正。70Hzハイパス／5.5kHzローパス、前後無音を除去（ピーク比−45dB）、加工後の約0.15624秒から2.29秒を切り出し。端フェード（先頭25ms／末尾180ms）、ピーク0.85へ正規化、44.1kHz・16bit・stereo WAV（原音monoの左右複製）。
- 長さ: 2.29秒。既存の `CUE_LENGTH.win` と揃え、BGM復帰タイミングは変更しない。旧 `recorded/fanfare-win.wav` は保持。

### 比較候補 `candidate-win-roar-craigsmith-shout.wav`

- 原題: [R15-73-Small Group of Men Shouting.wav](https://freesound.org/people/craigsmith/sounds/480805/)
- 作者: craigsmith
- 取得日: 2026-09-13（日本時間）
- ライセンス: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)（同日に配布ページで確認）
- 取得音源: [高品質MP3プレビュー](https://cdn.freesound.org/previews/480/480805_2524442-hq.mp3)。原配布WAVではなくMP3からの変換。
- 変換: 採用候補と同じリサンプル・3半音低下・テンポ補正・フィルター・無音除去・端フェード・ピーク0.85・44.1kHz／16bit／stereo処理。加工後の約5.25229秒から2.29秒。原音monoの左右複製。
- 比較意図: 男性の掛け声寄り。配布説明が怒声寄りのため、勝利の歓声を明示する675103を採用した。

### 比較候補 `candidate-win-roar-quendel-crowd.wav`

- 原題: [Free Crowd Cheering Sounds](https://opengameart.org/content/free-crowd-cheering-sounds) 内 `04 - Strong cheering - II - Short`
- 作者: Gregor Quendel
- 取得日: 2026-09-13（日本時間）
- ライセンス: [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)（同日に配布ページで確認）
- 取得音源: 配布ZIP `gregor_quendel_-_free_crowd_cheering_sounds_-_mp3.zip` 内の `Gregor Quendel - Crowd Cheering Sounds - 04 - Strong cheering - II - Short.mp3`。
- 変換: 採用候補と同じリサンプル・3半音低下・テンポ補正・フィルター・無音除去・端フェード・ピーク0.85・44.1kHz／16bit／stereo処理。加工後の約5.74063秒から2.29秒。
- 比較意図: 大群衆寄り。今回は男性集団の短い歓声を優先。
- クレジット: “Free Crowd Cheering Sounds” by Gregor Quendel, licensed under CC BY 4.0. Source and license linked above. Modified: excerpt, pitch/tempo, filtering, trimming, fades, normalization and WAV conversion.
