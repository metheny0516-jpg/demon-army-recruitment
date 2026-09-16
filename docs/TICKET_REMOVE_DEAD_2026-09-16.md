# チケット：死んでいる要素を消す（2026-09-16・オーナー承認「そのまま進めて」）

根拠と実測は `docs/AUDIT_DEAD_ELEMENTS_2026-09-15.md`。**1要素＝1コミット**。run.js と battle.js は同じコミットに入れない。
消した要素の**言葉**（台詞・名前・説明）は `docs/GRAVEYARD.md` に残す（CodeX）。数値バランスは変えない。

## 0. 進み具合

| 要素 | 担当 | 状態 |
|---|---|---|
| 戦意（momentum） | Claude | **済** 85b6da1（run.js の `momentumPeak` 2か所は Opus の 1 で落とす） |
| OVERKILL 2段（OVERKILL／殲滅＝大技の直撃） | Claude | **済** b2fa740 |
| ~~《魔王軍完成》＋シナジー5本~~ | Claude | **取りやめ（09-16）**。監査の数え方の誤り。sim 20 で 魔王軍完成 158〜393回、魔法結社 345回。試しに消したら魔法職寄せが 85%→15% に落ちたので戻した |
| 宴 | Opus（run.js・ui）→ Claude（battle.js の `feastUid`／暴食の宴） | **Opus 済** 900903c（`feastUid` は null 固定で残してある。飢餓と腐敗の検証は browser-tests/food.js へ退避） |
| 指名求人 | Opus | **済** c31f0ae（`RECRUIT_BRIEFS` のデータは残置） |
| 傭兵市場 | Opus（run.js・ui・main）→ Claude（battle.js の `flags.mercenary`） | **Opus 済** a9eb333（run.js の `row.mercenary` を見る枝は battle.js を落とすまで残置） |
| 拠点接収 | Opus（段階A が入ったので落とせる） | **済** 0d46095 |
| 号令エンジン＋自動撤退提案 | Opus（run.js 12か所・UI・テスト5本）→ Claude（battle.js の `offerOrder` / `retreatOffer`） | **Opus 済** 2156e33（`browser-tests/order.js` は残置＝前半はコマンドバトルの指示窓の検証。`test-order-run.js` / `test-order-battle.js` は削除） |
| 墓場文書 `docs/GRAVEYARD.md` | CodeX | **済** 5c9e82e（宴45本・求人6要項・傭兵・旧OVERKILL段・戦意の文を保全。取り込み済み） |

## 1. Opus 用（段階B/D のあと。順番どおり、1つずつコミット）

> **2026-09-16：§1 は 5 件とも完了**（900903c / c31f0ae / a9eb333 / 0d46095 / 2156e33）。
> 各コミットで node 全件と該当ブラウザテスト、最後に sim 20（0% の戦略なし・戦闘数の急減なし）と
> ブラウザ直列の全通過を確認済み。残るのは §2（Claude・battle.js 側）だけ。

> **統括レビュー追記（2026-09-16）**：上の検証はOpus報告。§1の実装は本線にあるが、§4の修正漏れがあり完了承認は保留。スライム②より先に§4をOpus一人へ渡す。§2のエンジン削除はその確認後。

1. **宴**：`Game.feastQuote / holdFeast`、`st.feastPending`、ui.js の宴ボタンと表示、styles.css、`browser-tests/feast.js`（run-all から外す）、`main.js` の action。
   `rationContext.feastUid` は **null 固定で残す**（battle.js は Claude が後で落とす。同じコミットに入れない）。旧セーブ：`migrateState` で `feastPending` を捨てる。
   ついでに `lastBattle.momentumPeak`（run.js 2か所）を落とす。
2. **指名求人**：`briefUnlocked / activeBrief / briefCost / canPostBrief / postBrief`、`st.briefId / briefsThisPhase`、`RECRUIT_BRIEFS` を読む `genApplicants` の分岐、ui.js の求人票、`browser-tests/brief.js`（run-all から外す）、`counterattack.js` / `mission.js` の brief 前提を外す。`RECRUIT_BRIEFS`（monsters.js）は CodeX が墓場へ移すので**データは残す**。
3. **傭兵市場**：`mercenaryOffers / canHireMercenary / hireMercenary / mercenaryCost / mercenaryKinCount / preparedMercenaries`、`st.mercenaryOffers / mercenaries`、`MERCENARY_COSTS / MERCENARY_OFFERS`、ui.js・main.js、`test-mercenary.js`、`browser-tests/mercenary.js`（run-all から外す）。他のテストの `mercenaries: []` は消してよい。`kpi.js` の傭兵列と `kpi-report.js` も。battle.js の `flags.mercenary` は Claude。
4. **拠点接収**：`seizeQuote / canSeizeStronghold / seizeStronghold`、main.js の action、`tools/sim.js` の1行、`test-town.js` の1件。領土の「砦」が同じ役なので代替は不要。
5. **号令エンジン（UI 側）**：`offerOrder`、`Game.nextOrderOffer / answerOrder`、battle_scene.js の号令の窓、`test-order-run.js` / `test-order-battle.js` / `test-spirit-run.js` の号令部分、`browser-tests/order.js` は「決めポーズ」の検証だけ残す。`ordered` 痕跡の種類は残す（痕跡技が読む）。
   Claude が続けて battle.js の `orderOffers / retreatOffer` を落とす。

各コミット：`for f in tools/test-*.js; do node $f; done` と該当ブラウザテスト。最後に `node tools/sim.js 20` を1回（0% の戦略なし・戦闘数の急減なし だけ見る）。

### 貼り付け用（Opus 用。段階B/D の後）
```
Opus へ。まず git pull。docs/TICKET_REMOVE_DEAD_2026-09-16.md の §1 を上から順に。1要素=1コミット、run.js と battle.js は同じコミットに入れない（battle.js 側は Claude が後で落とす）。消した要素の台詞や名前のデータ（RECRUIT_BRIEFS など）は消さず残す（CodeX が墓場へ移す）。旧セーブは migrateState で該当フィールドを捨てる。各コミットで node 全件と該当ブラウザテスト、最後に sim 20 を1回。数値は変えない。
```

## 2. Claude 用（battle.js・engine 側）

- **済（Claude、2026-09-16 夕）**：battle.js の 暴食の宴（`feastUid` は旧セーブ互換の欄として残るが読まない）、`flags.mercenary` の分岐と snapshot、号令エンジン（`orderRoster / offerOrder / orderOffers / options.orders`、round 冒頭の実行）。
  `battle_happenings.js` の宴依存2件（feast_belt / feast_receipt）も落とした（文は GRAVEYARD にある）。
  **自動の撤退提案（`retreat_offer`、自動戦闘だけ）は残した**：UI からは呼ばれないが、run.js のテスト4本（inheritance / experience-grant / counterattack / retreat-run）が
  `deploy({ offerRetreat: true })` → `settleBattle("retreat")` の入口として使っている。消すならそれらを手動戦闘の `retreat: true` へ書き換えてから（Opus、急がない）。
- 統括レビュー §4 との対応：4-1 の 1（測定器の削除済み API）は Claude が直した。4-1 の 3（test-order-battle の復元）は号令エンジンを消したので不要。**Opus に残るのは 4-1 の 2（`spoilFood()` の宴への誘導文）だけ。**

## 3. CodeX 用

`docs/GRAVEYARD.md` を新設し、消した要素の**言葉**を移す：宴の台詞（`events.js` / `monsters.js` / ui の文）、指名求人の6要項（`RECRUIT_BRIEFS`）、傭兵の口上、OVERKILL の旧4段の名（蹂躙・粉砕・消滅・魔王級殲滅）、戦意の文。（シナジーは消さないことになった）
それぞれ「いつ・なぜ消えたか」を1行（`AUDIT_DEAD_ELEMENTS` から写す）。**src/ は触らない**（データの削除は Opus / Claude が担当）。

### 貼り付け用（CodeX 用）
```
Astra へ。docs/TICKET_REMOVE_DEAD_2026-09-16.md の §3 をお願いします。docs/GRAVEYARD.md を新設し、消す要素の言葉（宴の台詞、指名求人の6要項 RECRUIT_BRIEFS、傭兵の口上、OVERKILL の旧4段の名、戦意の文）を移して、それぞれ「いつ・なぜ消えたか」を1行（docs/AUDIT_DEAD_ELEMENTS_2026-09-15.md から）。src/ は触らない。ブランチ codex/graveyard、本線 claude/hero-arrival-tavern-prototype-uy2toh から切って push。
```

## 4. 統括レビューの修正（Opus用・スライム②より先）

対象：`900903c`〜`e529f36`、進捗追記 `7f679bd`。土台は統括引き継ぎ `cf45476` の子孫で、battle.jsとsrc/dataの変更はない。すでに本線へ直接pushされているため再マージは不要だが、以後は本線から作業枝を切り、統括の検証後に取り込む。

### 4-1. 修正すること

1. **削除した関数への呼び出しが測定器に残る。** `tools/audit-elements.js` の `canHireMercenary` / `hireMercenary` と `canSeizeStronghold` / `seizeStronghold`、`tools/econ-trace.js` の接収呼び出し。現行Gameには無く、測定が例外終了する。呼び出しと廃止機能の戦略・集計列を整理する。単に存在チェックで隠し、「傭兵を使う」等の列へ偽の0を出さない。現在のシナジー集計の母集団は軍団全体のまま守る。
2. **腐敗ログが実行不能な宴を勧める。** `src/core/run.js` の `spoilFood()` は「腐らせる前に宴を開くべきだった」をまだ表示する。上限・傷んだ量の事実だけを残す。`tools/browser-tests/food.js` は「何か1行ある」だけでなく、廃止した宴への誘導がないことも確認する。食料上限・腐敗量・飢餓適応・給与などの数値は変えない。
3. **残っている戦闘エンジンのテストを先に消さない。** `tools/test-order-battle.js` を削除前の `cf45476` から復元する。`Battle` の号令処理は§2でまだ削除していない。エンジン削除時に、号令専用の検証を整理し、お披露目・自動発動回数など残存機能の検証は適切なテストへ移す。削除済みのrun側APIを検証する `test-order-run.js` の復元は要求しない。「フレークだった」は削除の根拠にしない。

> **2026-09-16：§4-1 の3件とも修正済み**（枝 `claude/remove-dead-followup-s4`、取り込み待ち）。
> 測定器の呼び出しは列ごと畳み、腐敗ログの宴への誘導を外し、`test-order-battle.js` を復元した。

### 4-2. 採用した判断・範囲

- 飢餓表示を `hungerPanel()` に残し、腐敗・飢餓のブラウザ検証を `food.js` に残した判断は妥当。
- `browser-tests/order.js` は現行コマンド窓を検証するので維持。`order_exec` は現行の技も使うため、旧号令と名前だけで一括削除しない。
- skill-fxの燃焼印を待つ変更は検証条件を消していない。後続の「火球は燃焼印を残さない」はまだ固定2000ms待ちであり、今回の「すべて状態待ちに変更」とは扱わない。
- 触るファイル：`src/core/run.js`（腐敗の表示文と説明のみ）、`tools/audit-elements.js`、`tools/econ-trace.js`、`tools/test-order-battle.js`、`tools/browser-tests/food.js`、`HANDOFF.md`、本チケット。battle.js・文章データ・ゲーム数値は範囲外。
- 検証：Node全件 → browser run-all → sim 20を各直列。加えて `node tools/audit-elements.js 1` と `node tools/econ-trace.js 1 careful` が例外なしで終了すること（1ランは道具の動作確認で、バランスの判断には使わない）。HANDOFF先頭へ結果・残る§2・次のスライム②を記録する。

> **Claude 追記（同日夕）**：4-1 の 1 と 3 は Claude 側で片付いた（上の §2）。Opus は **4-1 の 2 だけ**（run.js の `spoilFood()` の文と `food.js` の確認）。下の貼り付け文はその前提で読み替える。

### 貼り付け用（Opus用）
```
Opusへ。削除報告を確認しました。飢餓表示・food.js・order.jsを残した判断は採用です。スライム②より先に docs/TICKET_REMOVE_DEAD_2026-09-16.md §4 を修正してください。監査・経済測定に残った削除済みAPI呼び出し、腐敗ログの宴への誘導を直し、battle.jsが残っている間はtest-order-battle.jsをcf45476から復元してください。触るファイルと検証は§4-2のとおり。battle.jsと数値は変えません。最新の本線 claude/hero-arrival-tavern-prototype-uy2toh から別枝を切り、HANDOFFを更新して作業枝へpushし、枝名・コミット・結果を報告してください。本線への直接pushはせず、統括の確認を待ってください。
```
