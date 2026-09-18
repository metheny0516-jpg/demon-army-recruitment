# チケット I（CodeX・素材のみ、夜間）：城下町と将軍の音、地図の小物、転身の炎

Opus が run.js を大きく書き換えている最中なので、**コードとテストには触らない**。素材だけ2本、別ブランチ。配線はあとで Claude/Opus がやる。
画風・音の決まりは今までどおり（絵：太いインク・くすんだマット・透過 WebP／音：CC0 か CC-BY、`assets/sfx/LICENSES.md` に出典を追記、CC-BY なら `CREDITS.md` にも）。

## I-1 音（ブランチ `codex/sfx-town-general`）
すべて 44.1kHz・16bit・stereo WAV、ピーク 0.85、前後無音除去、`assets/sfx/recorded/` に置く。**合成・重ね無し**、原音の加工（切り出し・ピッチ・フィルター）だけ。

| ファイル | 場面 | 長さ | 手触り |
|---|---|---|---|
| `town-build.wav` | 城下町で施設を建てた／増築した | 0.6〜1.0秒 | 木槌を2回、乾いた音。派手にしない |
| `town-coin.wav` | 両替・税収・借りる・返す | 0.3〜0.5秒 | 硬貨が2〜3枚落ちる |
| `town-bank.wav` | 差し押さえ（施設が Lv を落とす） | 0.8秒 | 錠前か鎖の重い音。くすっと寄りは要らない |
| `map-open.wav` | 地図を開いた | 0.5秒 | 紙を広げる |
| `general-rise.wav` | 将軍への転身のカットイン | 1.5〜2.0秒 | 低い唸りが立ち上がって一拍で止まる。既存 `fanfare-win-roar.wav` と重ならない音色 |

候補は各1本でよい（比較は要らない）。`docs/SFX_TOWN_NOTES.md` に5行で「何を切り出したか」を残す。

## I-2 絵（ブランチ `codex/map-props-general-fx`）
- 地図の小物 5枚（`assets/map/props/`、64×64 透過）：`flag.webp`（前哨済の旗）、`smoke.webp`（荒らされた煙、1枚絵）、`vault.webp`（魔界銀行の金庫。今は絵文字🏦）、`star.webp`（勇者の地点）、`fog.webp`（第二幕の霧の帯。390×220、半透明）。
  設計 `docs/WORLD_MAP_DESIGN_2026-09-13.md` 5節。
- 転身の炎 1枚（`assets/battle/effects/general-aura.webp`、512×512 透過）：札を包む紫の炎の輪。既存 `assets/battle/effects/` の画風（`docs/BATTLE_FX_PRESETS.md`）に合わせる。今は CSS の縁だけなので、これが入れば名簿と決着のカットインで差し替える。
- 合成の確認 `docs/map-props-preview.png` 1枚（地図の城下町付近に旗・煙・金庫を置いたもの）。

## 規則
- 2ブランチとも `claude/hero-arrival-tavern-prototype-uy2toh` から切る。`src/` と `tools/` は触らない。各1コミット。
- 終わったらブランチ名とコミットIDを報告。

## 貼り付け用
```
docs/TICKET_NIGHT_ASSETS_2026-09-13.md を読んで、I-1（音5本、ブランチ codex/sfx-town-general）と I-2（地図の小物5枚＋転身の炎1枚、ブランチ codex/map-props-general-fx）を作って。
どちらも claude/hero-arrival-tavern-prototype-uy2toh から切る。src/ と tools/ は触らない。素材と docs だけ、各1コミット。ライセンスは LICENSES.md（CC-BY なら CREDITS.md も）に追記。
```
