# 戦闘効果音の研究メモ

## 結論

短い矩形波や白色ノイズを実行時に重ねるだけでは、「電子音」にはなっても
「ばすん・がちゃん・ずし・ずばっ」のような物体感のある衝撃音になりにくい。
今回から、決定的DSPで多層合成したWAVを事前生成し、ゲーム中はサンプル再生する。

これは既存ゲームの音声を抽出・模倣するものではない。目標とする手触りを分解し、
独自の波形をゼロから生成する。

## 以前の方式が弱く聞こえる理由

1. **単一の指数減衰** — 現実の衝撃は複数の振動モードが異なる速さで減衰する。
2. **残差が薄い** — 接触直後の短い広帯域ノイズが無いと、輪郭がぼやける。
3. **低域と中域の時間差が無い** — 重い音は鋭い接触の数ms後に胴鳴りが来る。
4. **倍音が整いすぎる** — 金属音は非整数比の共鳴が必要。単純和音では楽器になる。
5. **全音が同じ波形** — 同じ音の完全反復は耳につき、同時発音ではピークも重なる。
6. **仕上げ処理が無い** — 飽和、帯域整理、ピーク制御が無い層は一体化しない。

Microsoft Researchの衝撃音研究では、モーダル成分だけでなくノイズ残差を組み合わせること、
理想的な指数減衰ではなく任意の振幅包絡を使うことが品質向上に重要と報告されている。
また、複数衝撃では初期位相や開始時刻を少し変え、ピークの完全一致を避けている。

## 今回の4系統

| 系統 | 層構造 | 用途 |
|---|---|---|
| `basun` | 高域接触＋中低域ノイズ＋下降する胴鳴り | 通常より強い打撃 |
| `gachan` | 接触ノイズ＋非整数比の金属共鳴＋二次衝突 | 防御・金属衝突 |
| `zushi` | 短い接触＋6ms遅れの低域＋短い初期反射 | 決定打・重量攻撃 |
| `zuba` | 下降する帯域ノイズ＋高速ピッチ掃引＋短い着弾 | 通常の斬撃 |

各3変種、合計12ファイル。同一音の位相重なりと反復感を減らす。
生成物は44.1kHz・16bit・mono WAV。元コードは `tools/generate-sfx.js`。

## 実録フォーリー候補（2026-08-31）

オーナー試聴で「初期ファミコンのようでちゃっちい」と判断されたため、上記の純合成WAVをこれ以上磨く方針は取らない。現行12音は比較用・フォールバックとして残し、**実録を核にした新しい一音が決まるまでゲーム本体を差し替えない**。

試聴用の候補は `assets/sfx/candidates/` に隔離し、`tools/sfx-lab.html` で現行音と聞き比べる。すべてCC0で、公開リポジトリへ元音を置いてもライセンス上の制約がない。

| 役割 | 候補 | 実録内容 | 試聴ファイル |
|---|---|---|---|
| 斬撃の起点 | [20 Sword Sound Effects](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) / StarNinjas | ナイフ2本の風切り | `candidate-starninjas-sword-01`〜`10` |
| 防御・金属衝突 | 同上 / StarNinjas | ナイフ2本の衝突（盾受けにも使える） | `candidate-starninjas-clash-01`〜`10` |
| 肉・鈍器の命中 | [Thwack Sounds](https://opengameart.org/content/thwack-sounds) / AntumDeluge | 物を叩いた打撃 | `candidate-antum-thwack-01`〜`10` |
| 斬撃の抜け | [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack) / artisticdude | 衣類ハンガーや木材を振った、金属感の少ない短いスイッシュ13種 | `candidate-artisticdude-swish-01`〜`13` |

OGGで配布されていた剣系20音と、24bitステレオで配布されていたスイッシュ13音は、試聴条件を揃えるため44.1kHz・16bit・mono WAVへ機械的に変換した。切り出し、EQ、圧縮、音量の正規化はまだ行っていない。

### 採用候補から外した配布元

- **Sonniss #GameAudioGDC Bundle** はゲームへの同期利用・改変・商用利用を許可する一方、素材単体（改変後を含む）の再配布を禁止している。公開リポジトリの試聴候補として原音を置く用途とは相性が悪いため、今回の候補には含めない。完成ゲームだけで使う案は、取得日時点の利用規約と配布形態を確認して別途判断する。
- **Pixabay** も単体の配布を禁じている。完成音へ創作的に混合する場合は余地があるが、比較用の原音をリポジトリに入れる用途には使わない。

次の判断は試聴後に行う。各役割から3音ずつを選び、短い風切り→命中→低域の胴鳴りを約0〜60msに配置してから、現行4系統と同じ長さ・ラウドネスのゲーム用WAVへ書き出す。

## 参考

- [Sound Synthesis for Impact Sounds in Video Games (Microsoft Research / ACM I3D 2011)](https://www.microsoft.com/en-us/research/publication/sound-synthesis-impact-sounds-video-games/)
- [Web Audio API 1.1 specification](https://webaudio.github.io/web-audio-api/)
- [Procedural Audio in Computer Games Using Motion Controllers](https://doi.org/10.1155/2013/371374)
