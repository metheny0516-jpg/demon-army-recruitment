# 効果音のライセンス台帳

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
