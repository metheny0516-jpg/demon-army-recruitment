# 効果音のライセンス台帳

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

候補は比較試聴のためだけに分離してあり、採用するまで `src/ui/sound.js` から読み込まない。採用時は、元ページ・取得日・ライセンスをこの台帳に残したまま、ゲーム用に切り出し・レイヤーした成果物を別名で追加する。
