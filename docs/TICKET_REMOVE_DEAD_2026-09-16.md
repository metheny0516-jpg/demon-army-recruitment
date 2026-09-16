# チケット：死んでいる要素を消す（2026-09-16・オーナー承認「そのまま進めて」）

根拠と実測は `docs/AUDIT_DEAD_ELEMENTS_2026-09-15.md`。**1要素＝1コミット**。run.js と battle.js は同じコミットに入れない。
消した要素の**言葉**（台詞・名前・説明）は `docs/GRAVEYARD.md` に残す（CodeX）。数値バランスは変えない。

## 0. 進み具合

| 要素 | 担当 | 状態 |
|---|---|---|
| 戦意（momentum） | Claude | **済** 85b6da1（run.js の `momentumPeak` 2か所は Opus の 1 で落とす） |
| OVERKILL 2段（OVERKILL／殲滅＝大技の直撃） | Claude | **済** b2fa740 |
| ~~《魔王軍完成》＋シナジー5本~~ | Claude | **取りやめ（09-16）**。監査の数え方の誤り。sim 20 で 魔王軍完成 158〜393回、魔法結社 345回。試しに消したら魔法職寄せが 85%→15% に落ちたので戻した |
| 宴 | Opus（run.js・ui）→ Claude（battle.js の `feastUid`／暴食の宴） | 未 |
| 指名求人 | Opus | 未 |
| 傭兵市場 | Opus（run.js・ui・main）→ Claude（battle.js の `flags.mercenary`） | 未 |
| 拠点接収 | Opus（段階A が入ったので落とせる） | 未 |
| 号令エンジン＋自動撤退提案 | Opus（run.js 12か所・UI・テスト5本）→ Claude（battle.js の `offerOrder` / `retreatOffer`） | 未（段階B/D の後） |
| 墓場文書 `docs/GRAVEYARD.md` | CodeX | **済** 5c9e82e（宴45本・求人6要項・傭兵・旧OVERKILL段・戦意の文を保全。取り込み済み） |

## 1. Opus 用（段階B/D のあと。順番どおり、1つずつコミット）

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

- Opus の 1・3・5 の後：battle.js の `feastUid`（暴食の宴）、`flags.mercenary`、`offerOrder / orderOffers / retreatOffer`。

## 3. CodeX 用

`docs/GRAVEYARD.md` を新設し、消した要素の**言葉**を移す：宴の台詞（`events.js` / `monsters.js` / ui の文）、指名求人の6要項（`RECRUIT_BRIEFS`）、傭兵の口上、OVERKILL の旧4段の名（蹂躙・粉砕・消滅・魔王級殲滅）、戦意の文。（シナジーは消さないことになった）
それぞれ「いつ・なぜ消えたか」を1行（`AUDIT_DEAD_ELEMENTS` から写す）。**src/ は触らない**（データの削除は Opus / Claude が担当）。

### 貼り付け用（CodeX 用）
```
Astra へ。docs/TICKET_REMOVE_DEAD_2026-09-16.md の §3 をお願いします。docs/GRAVEYARD.md を新設し、消す要素の言葉（宴の台詞、指名求人の6要項 RECRUIT_BRIEFS、傭兵の口上、OVERKILL の旧4段の名、戦意の文）を移して、それぞれ「いつ・なぜ消えたか」を1行（docs/AUDIT_DEAD_ELEMENTS_2026-09-15.md から）。src/ は触らない。ブランチ codex/graveyard、本線 claude/hero-arrival-tavern-prototype-uy2toh から切って push。
```
