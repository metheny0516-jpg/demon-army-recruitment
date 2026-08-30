# Project instructions

## 最上位の設計指針

**作業を始める前に `DESIGN_PRINCIPLES.md` を読むこと。**
これがこのプロジェクトの最上位の設計指針であり、個別の仕様・UI・数値・
このファイルの内容よりも優先される。最重要KPIは「もう1回遊びたいか」。

新機能を実装する前に、`DESIGN_PRINCIPLES.md` 第15節の8つの問いを必ず通すこと。
YESが少ないなら作らずに再検討する。

実装状況と引き継ぎ事項は `HANDOFF.md`、現在の仕様は `README.md` を参照。

## 画像まわり

For any request involving monster portraits, résumé images, battle icons, image compression, or files under `assets/monsters`, read and follow `.codex/skills/demon-army-monster-art/SKILL.md` before acting.

Keep image IDs synchronized with `src/data/monsters.js` and `src/data/portraits.js`. Preserve the emoji fallback for monsters without an accepted portrait.
