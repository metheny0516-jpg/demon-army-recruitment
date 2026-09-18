// 噂の札12枚。docs/SPEC_INCIDENTS_IMPL_2026-09-14.md §1 / INCIDENTS_BATCH2.md。
// 効果はGame.incidentEffectへ渡す。文章の例示名も原文のまま保持し、表示名への置換は器側で行う。
// c の受け渡し: subject=固定主役の人物、viewer=選んだ見学者、
// loser=提示時に決めた模擬戦の敗者。gainより前に器側で確定する。
// unitのrace/rankは選定条件、count:2は将軍二人を固定するための情報。
// 全軍の痕跡・同僚のfallenは単純なsubject一致では拾えない。
// 各traceScopeの原文に従う選別と施設data.facilityの記録は器側で接続する。
// tail.textは後始末の原文。afterのないtailは次の戦闘等の効果終了メモで、
// 決着数による続き札を予約しない。tail.idの解決も器側の担当。
// 訓練場は案山子隊が征服度0から利用可能（MISSION_TYPES.train）。
const INCIDENTS = [
  {
    id: "slime_pond",
    tier: "mid",
    door: "A",
    title: "池からの同居人",
    subject: {"kind": "race", "race": "スライム"},
    traces: ["sparked", "ate", "carried_materials"],
    traceScope: "関連痕跡 { sparked(スライム)／ate(スライム)／carried_materials(スライム) } の異なる2種＋宿舎Lv1以上。",
    state: st => Town.lv(st, "hostel") >= 1,
    rumor: "宿舎裏の池で、スライムの数だけ水面の顔が増えている。",
    mormoLine: "魔王様、宿舎裏の池でスライムの顔が増えているデス",
    choices: ["池を調べる", "やめる"],
    pick: "viewer",
    hidden: {
      label: "同種族が2体以上（名簿のスライム数）",
      value: (st, c) => (st.roster || []).filter(m => m.race === "スライム").length >= 2 ? "2体以上" : "1体"
    },
    // 見学者Vの次の1戦の気合上限+1。
    gain: (st, c) => {
      c.game.incidentEffect("slime_pond", "gain", c);
    },
    // スライム2体以上→分身を仲間と思って連れ帰り、宿舎の空き枠1つを占有。1体→自分の映り込みと思い、池に弁当を投げる。元の痕跡の持ち主が死亡しても種族の生存者が引き継げる。
    branches: {
      "2体以上": {
        apply: (st, c) => {
          c.game.incidentEffect("slime_pond", "2体以上", c);
        },
        text: "池の光を浴びて力が湧いた。帰りには、スライムたちが分身を連れ帰り、空き寝台を埋めていた。",
        mormo: "お名前より先に、寝床が決まりましたネ。"
      },
      "1体": {
        apply: (st, c) => {
          c.game.incidentEffect("slime_pond", "1体", c);
        },
        text: "池の光を浴びて力が湧いた。一体だけのスライムは水面の顔を自分だと思い、今日も弁当を二つ持って出かけた。",
        mormo: "鏡のぶんまで、お腹が空くんでしょうか。"
      },
    },
    tail: {
      after: 3,
      id: "slime_pond_tail",
      text: "3決着後、連れ帰った枝は正式採用／池へ返す。占有を解除し、採用なら通常の1体枠へ置換。空きがなければ既存員を追い出さず玄関に居座る絵と報告で示す。単独の枝は散歩が終わる。"
    }
  },
  {
    id: "mage_lab_light",
    tier: "small",
    door: "A",
    title: "授業をやめない研究所",
    subject: {"kind": "facility", "id": "lab"},
    traces: ["sparked", "trained", "carried_materials"],
    traceScope: "関連痕跡 { sparked(当時の研究担当者)／trained(研究所での稽古)／carried_materials(研究所への運搬) } の異なる2種＋研究所Lv1以上。",
    state: st => Town.lv(st, "lab") >= 1,
    rumor: "研究所は無人なのに、置き去りの斧だけが授業の鐘に合わせて光る。",
    mormoLine: "魔王様、無人の研究所で斧が鐘に合わせて光るデス",
    choices: ["光を調べる", "やめる"],
    pick: "viewer",
    hidden: {
      label: "見学者の種族（術師系／それ以外）",
      value: (st, c) => !(c.viewer.tags || []).includes("caster") ? "術師以外" : "術師系"
    },
    // 未開放の種族技を1戦早く開く。全て開放済みなら次の稽古1回を無償にする。
    gain: (st, c) => {
      c.game.incidentEffect("mage_lab_light", "gain", c);
    },
    // 術師以外→研究所の光が移り、既存の火球をその者だけの技として恒久習得。術師系→光を教材に写し、研究所が次の訓練で別の仲間にも授業を始める。
    branches: {
      "術師以外": {
        apply: (st, c) => {
          c.game.incidentEffect("mage_lab_light", "術師以外", c);
        },
        text: "光を調べて技のこつをつかんだ。研究所は先生の留守にも授業を続け、見学者の斧から火球を出した。",
        mormo: "出席を取っているのは、建物のほうでしょうか。"
      },
      "術師系": {
        apply: (st, c) => {
          c.game.incidentEffect("mage_lab_light", "術師系", c);
        },
        text: "光を調べて技のこつをつかんだ。研究所の光を写した教材が、今度は隣の机で授業を始めた。",
        mormo: "この教室、先生が増えやすいんですね。"
      },
    },
    tail: {
      text: "技を返却させない。火球を既に持つなら未習得の既存術を固定順で選び、候補なしなら教材の枝。恒久習得はレビューの明示指定による例外。追加出撃枠や将軍技は与えない。"
    }
  },
  {
    id: "kobold_dig",
    tier: "small",
    door: "A",
    title: "金庫の裏口",
    subject: {"kind": "unit", "race": "コボルト"},
    traces: ["carried_materials", "carried", "ransacked"],
    traceScope: "関連痕跡 { carried_materials(K)／carried(K)／ransacked(K在籍中) } の異なる2種＋建材1以上。",
    state: st => st.materials >= 1,
    rumor: "ポチが地下から戻るたびに、頭を下げる相手が一人ずつ増えている。",
    mormoLine: "魔王様、地下帰りのコボルトに知り合いが増えているデス",
    choices: ["地下の建材を運び出す", "やめる"],
    pick: null,
    hidden: {
      label: "借金あり／なし",
      value: (st, c) => (st.town?.debt || 0) > 0 ? "借金あり" : "借金なし"
    },
    // 建材+4。
    gain: (st, c) => {
      c.game.incidentEffect("kobold_dig", "gain", c);
    },
    // 借金あり→地下金庫へ抜け、銀行員が返済専用の窓口を作る。借金なし→銀行員が通路を配送口にし、次の決着に金庫の箱がK宛てに届く。
    branches: {
      "借金あり": {
        apply: (st, c) => {
          c.game.incidentEffect("kobold_dig", "借金あり", c);
        },
        text: "掘り出した建材を運んでいたら、銀行の金庫に出た。銀行員は穴に返済窓口の札を掛けた。",
        mormo: "裏口にも、ちゃんと営業時間があるんですね。"
      },
      "借金なし": {
        apply: (st, c) => {
          c.game.incidentEffect("kobold_dig", "借金なし", c);
        },
        text: "建材を掘り出した穴が、銀行の配送口になった。翌朝、ポチの部屋の前に金庫の箱が積まれていた。",
        mormo: "お届け先は合っていますが、置き場所がありませんネ。"
      },
    },
    tail: {
      after: 1,
      id: "kobold_dig_tail",
      text: "窓口は既存の返済へ誘導し借金は勝手に消さない。箱は銀行へ返す／運搬係を引き受ける。どちらも次の決着で穴を閉じ、新施設や継続収益は増やさない。"
    }
  },
  {
    id: "necro_visitor",
    tier: "mid",
    door: "A",
    title: "前の職場からお迎え",
    subject: {"kind": "unit", "race": "死霊術師"},
    traces: ["hired", "fallen", "carried"],
    traceScope: "関連痕跡 { hired(N)／fallen(N在籍中の同僚)／carried(N) } の異なる2種＋墓地Lv1以上。",
    state: st => Town.lv(st, "graveyard") >= 1,
    rumor: "墓地の見知らぬ骸骨が、面接の練習で何度も前の主の名前を言う。",
    mormoLine: "魔王様、墓地の骸骨が前の主の名で面接の練習中デス",
    choices: ["骸骨の身元を保証する", "やめる"],
    pick: null,
    hidden: {
      label: "遺物持ちか（軍団に遺物あり／なし）",
      value: (st, c) => (st.relics || []).length > 0 ? "遺物あり" : "なし"
    },
    // 既存の骸骨兵1体が応募する。通常の面接で採否を選べる。
    gain: (st, c) => {
      c.game.incidentEffect("necro_visitor", "gain", c);
    },
    // 遺物あり→Nが身元の印として貸した遺物を、元の主が追って来る。なし→骸骨が印の代わりに元の主の紹介状を持ち帰り、その主が採用条件を直談判しに来る。
    branches: {
      "遺物あり": {
        apply: (st, c) => {
          c.game.incidentEffect("necro_visitor", "遺物あり", c);
        },
        text: "骸骨の応募を受け付けた。貸した遺物を目印に、前の主が迎えの軍勢を連れて来た。",
        mormo: "退職届は、受け取ってもらえなかったようデス。"
      },
      "なし": {
        apply: (st, c) => {
          c.game.incidentEffect("necro_visitor", "なし", c);
        },
        text: "骸骨の応募を受け付けた。紹介状を書いた前の主まで、面接室の椅子を並べ始めた。",
        mormo: "採用する側の人数が、多すぎます。"
      },
    },
    tail: {
      after: 2,
      id: "necro_visitor_tail",
      text: "遺物の枝は2決着後に予告済みの防衛戦。迎撃／骸骨を本人の同意で送り届けて話を収める。遺物は返却し消去しない。紹介状の枝は保証を断る／通常条件で採用、強制採用なし。"
    }
  },
  {
    id: "harpy_letter",
    tier: "mid",
    door: "A",
    title: "封筒より先に本人",
    subject: {"kind": "unit", "race": "ハーピー"},
    traces: ["late", "defended", "carried"],
    traceScope: "関連痕跡 { late(H)／defended(H在籍中)／carried(H) } の異なる2種＋領地1以上。",
    state: st => st.conquest >= 1,
    rumor: "ピリカが拾った封筒を開けずに、宛名を何度も読み返している。",
    mormoLine: "魔王様、ハーピーが封筒の宛名を気にしているデス",
    choices: ["封筒を開く", "やめる"],
    pick: null,
    hidden: {
      label: "その決着に前哨を制しているか",
      value: (st, c) => !!(st.outpost?.cleared && st.outpost.stage === st.conquest && st.lastBattle?.missionKind === "invade" && st.lastBattle?.victory) ? "前哨済み" : "未制圧"
    },
    // 次の本戦の隊列を一度公開。
    gain: (st, c) => {
      c.game.incidentEffect("harpy_letter", "gain", c);
    },
    // 前哨済み→手紙を書いた連絡兵は退路を失い、Hについて面接へ来る。未制圧→まだ砦に勤めており、次の敵隊列で同じ名の連絡兵がHに手を振る。
    branches: {
      "前哨済み": {
        apply: (st, c) => {
          c.game.incidentEffect("harpy_letter", "前哨済み", c);
        },
        text: "手紙から敵の隊列が分かった。返事を出す前に、書いた本人が履歴書を持って現れた。",
        mormo: "返信用の切手だけ、余りました。"
      },
      "未制圧": {
        apply: (st, c) => {
          c.game.incidentEffect("harpy_letter", "未制圧", c);
        },
        text: "手紙から敵の隊列が分かった。次の砦では、手紙を書いた兵が敵の列からピリカに手を振っていた。",
        mormo: "文通相手が、あちら側にいましたネ。"
      },
    },
    tail: {
      after: 2,
      id: "harpy_letter_tail",
      text: "2決着以内の面接／本戦で回収。連絡兵は既存の人間型兵1体の名前と台詞の差分。新種族・追加の敵数は不要。採用を断っても罰なし。"
    }
  },
  {
    id: "general_duel",
    tier: "mid",
    door: "B",
    title: "借りた二つ名",
    subject: {"kind": "unit", "rank": "general", "count": 2},
    traces: ["promoted", "trained", "downed"],
    traceScope: "関連痕跡 { promoted(PまたはQ)／trained(PまたはQ)／downed(PまたはQ) } の異なる2種＋将軍が2人以上。",
    state: st => (st.roster || []).filter(m => m.rankId === "general").length >= 2,
    rumor: "二人の将軍が、相手の名札を自分の胸に当てて笑っている。",
    mormoLine: "魔王様、将軍同士で相手の名札を胸に当てているデス",
    choices: ["模擬戦を認める", "関わらない"],
    pick: null,
    hidden: {
      label: "敗者の忠誠60以上か",
      value: (st, c) => c.loser.loyalty >= 60 ? "60以上" : "60未満"
    },
    // 二人の次の1戦の気合上限+1。
    gain: (st, c) => {
      c.game.incidentEffect("general_duel", "gain", c);
    },
    // 敗者の忠誠60以上→勝者へ二つ名を貸し、次の戦いで勝者がその名を名乗る。60未満→二つ名を貸す代わりに再戦状を突きつけ、二人が訓練場で勝敗表を付け始める。
    branches: {
      "60以上": {
        apply: (st, c) => {
          c.game.incidentEffect("general_duel", "60以上", c);
        },
        text: "模擬戦で二人の息が合った。勝った将軍が相手の二つ名を借り、次の戦いにその名で出た。",
        mormo: "名簿は本名で引けますから、ご安心を。"
      },
      "60未満": {
        apply: (st, c) => {
          c.game.incidentEffect("general_duel", "60未満", c);
        },
        text: "模擬戦で二人の息が合った。敗者は名札を抱えて再戦を申し込み、訓練場の壁に勝敗表を貼った。",
        mormo: "その表、次の欄まで書いてありますネ。"
      },
    },
    tail: {
      after: 2,
      id: "general_duel_tail",
      text: "勝敗は現在の攻撃・防御による腕比べ、同点は挑戦側が譲る。敗者決定も提示時に固定。2決着後に名札返却／再戦打ち切りを報告。本名・UID・元の二つ名は保持し、貸した名は一時表示だけ。"
    }
  },
  {
    id: "mimic_appraisal",
    tier: "small",
    door: "A",
    title: "遺物の添い寝",
    subject: {"kind": "unit", "race": "ミミック"},
    traces: ["hired", "carried", "carried_materials"],
    traceScope: "関連痕跡 { hired(M)／carried(M)／carried_materials(M) } の異なる2種＋遺物あり。",
    state: st => (st.relics || []).length > 0,
    rumor: "箱丸が遺物を返そうとすると、留め金が口の端に引っかかって離れない。",
    mormoLine: "魔王様、ミミックの口から遺物が離れない様子デス",
    choices: ["遺物を鑑定する", "やめる"],
    pick: null,
    hidden: {
      label: "Mが負傷中か",
      value: (st, c) => c.subject.injured > 0 ? "負傷中" : "健康"
    },
    // 修理・手入れで次の1戦だけその遺物の既存効果を強化。効果別の強化量は採用時に決める。
    gain: (st, c) => {
      c.game.incidentEffect("mimic_appraisal", "gain", c);
    },
    // 負傷中→Mが遺物を寝台の見張りにする。健康→Mが遺物を看板にして宿舎で出張鑑定を始め、持ち主の列ができる。
    branches: {
      "負傷中": {
        apply: (st, c) => {
          c.game.incidentEffect("mimic_appraisal", "負傷中", c);
        },
        text: "傷んだ遺物を使えるようにした。負傷中の箱丸はそれを寝台に置き、見張り番にしてしまった。",
        mormo: "警備員より先に、枕が見つかったんですね。"
      },
      "健康": {
        apply: (st, c) => {
          c.game.incidentEffect("mimic_appraisal", "健康", c);
        },
        text: "遺物を手入れして使えるようにした。箱丸はそれを看板にして、宿舎の廊下で出張鑑定を始めた。",
        mormo: "列の最後尾は、どのお部屋でしょう。"
      },
    },
    tail: {
      text: "次の1戦で強化終了。遺物は貸し出し中も消失しない。修理で出た木枠をMが宿舎へ運べば、lockerの関連痕跡の1本になる。連鎖は最大2段。"
    }
  },
  {
    id: "mimic_hostel_locker",
    tier: "small",
    door: "A",
    title: "荷物の引っ越し",
    subject: {"kind": "facility", "id": "hostel"},
    traces: ["carried_materials", "cooked", "trained"],
    traceScope: "関連痕跡 { carried_materials(宿舎への運搬)／cooked(宿舎の炊事)／trained(宿舎の避難稽古) } の異なる2種＋宿舎Lv1以上。",
    state: st => Town.lv(st, "hostel") >= 1,
    rumor: "宿舎では、寝台の下へしまった荷物が毎朝きれいに廊下へ並んでいる。",
    mormoLine: "魔王様、しまった荷物が毎朝廊下に整列するデス",
    choices: ["荷物を預けて整理を頼む", "やめる"],
    pick: null,
    hidden: {
      label: "宿舎Lv2以上か",
      value: (st, c) => Town.lv(st, "hostel") >= 2 ? "Lv2以上" : "Lv1"
    },
    // 保管庫を整理し、なくした備品を取り戻す（建材+2は添え物）。
    gain: (st, c) => {
      c.game.incidentEffect("mimic_hostel_locker", "gain", c);
    },
    // Lv2以上→荷物が受付へ行列を作り、部屋番号順に受け渡される。Lv1→空き寝台へ籠城し、部屋札を掛けるとおとなしく収まる。
    branches: {
      "Lv2以上": {
        apply: (st, c) => {
          c.game.incidentEffect("mimic_hostel_locker", "Lv2以上", c);
        },
        text: "宿舎に預けた荷物から、なくした備品が戻ってきた。今度は荷物がひとりでに受付まで行列を作った。",
        mormo: "受付を作ったら、荷物まで順番を守るんですね。"
      },
      "Lv1": {
        apply: (st, c) => {
          c.game.incidentEffect("mimic_hostel_locker", "Lv1", c);
        },
        text: "なくした備品が戻ってきた。荷物は空き寝台を選んで籠城し、部屋番号を掛けてもらうまで動かなかった。",
        mormo: "荷物にも、住所が欲しかったんですね。"
      },
    },
    tail: {
      after: 1,
      id: "mimic_hostel_locker_tail",
      text: "次の決着に受付係を任せる／部屋札を掛け直す報告で収束。空き寝台がなければ廊下の棚を使い、既存員を追い出さない。専用保管画面なし。appraisalの木枠運搬が材料なら2段目、別の作業2種でも単独発生可。"
    }
  },
  {
    id: "goblin_market",
    tier: "mid",
    door: "A",
    title: "客の履歴書",
    subject: {"kind": "unit", "race": "ゴブリン"},
    traces: ["carried_materials", "ransacked", "hired"],
    traceScope: "関連痕跡 { carried_materials(G)／ransacked(G在籍中)／hired(G) } の異なる2種＋市場Lv1以上。",
    state: st => Town.lv(st, "market") >= 1,
    rumor: "ギギの露店では、品物を買わずに城の間取りだけ聞く客がいる。",
    mormoLine: "魔王様、露店に城の間取りばかり聞く客がいるデス",
    choices: ["露店を開く", "やめる"],
    pick: null,
    hidden: {
      label: "Gに未払いがあるか",
      value: (st, c) => c.subject.unpaidStreak > 0 ? "未払いあり" : "なし"
    },
    // 金+8の売上。
    gain: (st, c) => {
      c.game.incidentEffect("goblin_market", "gain", c);
    },
    // 未払いあり→Gの愚痴を聞いた客が王国の雇用契約を示す。なし→Gの待遇自慢を聞いた客が、自分も雇ってほしいと名乗る。客は最初から王国の間者で、正体を乱数で付けない。
    branches: {
      "未払いあり": {
        apply: (st, c) => {
          c.game.incidentEffect("goblin_market", "未払いあり", c);
        },
        text: "闇市で品物が売れた。ギギが客に職場の愚痴を話すと、王国の間者が雇用契約書を差し出した。",
        mormo: "向こうも、売り物を探していたようです。"
      },
      "なし": {
        apply: (st, c) => {
          c.game.incidentEffect("goblin_market", "なし", c);
        },
        text: "闇市で品物が売れた。ギギが職場を自慢すると、王国の間者が身分証を裏返し、面接の列に並んだ。",
        mormo: "買い物より、大きな用事ができたようです。"
      },
    },
    tail: {
      after: 2,
      id: "goblin_market_tail",
      text: "2決着後、引き抜きの枝はGと話す／契約を断って店を閉じる。勝手な永久離脱はなし。応募の枝は通常条件で採否を選ぶ。原案の大筋へ自動移行しない。"
    }
  },
  {
    id: "training_visitor",
    tier: "mid",
    door: "A",
    title: "師匠の追っかけ",
    subject: {"kind": "unit"},
    traces: ["trained", "promoted", "carried"],
    traceScope: "関連痕跡 { trained(P)／promoted(P)／carried(P) } の異なる2種＋訓練場利用可能。",
    state: st => !!st && (st.conquest || 0) >= 0,
    rumor: "稽古場の旅人が、先生の休憩の取り方まで帳面に写している。",
    mormoLine: "魔王様、旅人が先生の休み方まで書き写しているデス",
    choices: ["見学を許す", "やめる"],
    pick: null,
    hidden: {
      label: "Pが名簿で痕跡最多か（同数なら全員該当）",
      value: (st, c) => {
        const count = uid => (st.traces || []).filter(t => t.subject === uid || t.object === uid).length;
        return (st.roster || []).every(m => count(m.uid) <= count(c.subject.uid)) ? "最多" : "最多でない";
      }
    },
    // 既存種族の旅人が弟子として応募。種族は札ごとに固定、採否は任意。
    gain: (st, c) => {
      c.game.incidentEffect("training_visitor", "gain", c);
    },
    // 最多→旅人が武勇伝を集めて伝記作家を名乗り、次の日報の一面をPの話で埋める。最多でない→失敗の仕方までまねた弟子が稽古でわざと転び、Pが受け身の教室を始める。
    branches: {
      "最多": {
        apply: (st, c) => {
          c.game.incidentEffect("training_visitor", "最多", c);
        },
        text: "旅人が弟子入りを願い出た。噂の多い師匠を追ううちに、弟子より先に伝記作家を名乗り始めた。",
        mormo: "初版の表紙に、もうお名前が載っています。"
      },
      "最多でない": {
        apply: (st, c) => {
          c.game.incidentEffect("training_visitor", "最多でない", c);
        },
        text: "旅人が弟子入りを願い出た。転び方までまねるので、先生は予定を変えて受け身から教え直した。",
        mormo: "教えなかったところほど、よく見ていますネ。"
      },
    },
    tail: {
      after: 2,
      id: "training_visitor_tail",
      text: "2決着後に紙面／教室を一度回収。伝記は実在ログだけで書き、武功を捏造しない。教室は通常の稽古1回へ合流、常設施設を増やさない。"
    }
  },
  {
    id: "skeleton_choir",
    tier: "small",
    door: "B",
    title: "食堂で鳴る鎮魂歌",
    subject: {"kind": "race", "race": "骸骨兵"},
    traces: ["hired", "fallen", "cooked"],
    traceScope: "関連痕跡 { hired(骸骨兵)／fallen(骸骨兵が在籍した軍団の同僚)／cooked(骸骨兵) } の異なる2種＋骸骨兵が在籍。",
    state: st => (st.roster || []).some(m => m.race === "骸骨兵"),
    rumor: "骸骨たちの歌は、空の食器を叩くところだけ妙に元気だ。",
    mormoLine: "魔王様、骸骨の合唱は空の食器を叩く時だけ元気デス",
    choices: ["一曲頼む", "関わらない"],
    pick: null,
    hidden: {
      label: "食料3以下か",
      value: (st, c) => st.food <= 3 ? "食料3以下" : "余裕あり"
    },
    // 留守番全員の忠誠+3。
    gain: (st, c) => {
      c.game.incidentEffect("skeleton_choir", "gain", c);
    },
    // 食料3以下→町へ合唱を出前して食べ物をもらう。余裕あり→町人の送別会を葬儀と間違えて招待を受ける。最初の歌い手が死んでも、生存する骸骨たちが歌う。
    branches: {
      "食料3以下": {
        apply: (st, c) => {
          c.game.incidentEffect("skeleton_choir", "食料3以下", c);
        },
        text: "合唱で留守番の顔がほころんだ。骸骨たちは町へ歌いに出て、食べ物を抱えて戻った。",
        mormo: "骨にも、おひねりは必要なんですね。"
      },
      "余裕あり": {
        apply: (st, c) => {
          c.game.incidentEffect("skeleton_choir", "余裕あり", c);
        },
        text: "合唱で留守番の顔がほころんだ。骸骨たちは送別会へ招かれ、生きている主役に鎮魂歌を歌ってしまった。",
        mormo: "お別れは、隣町へ引っ越すだけだそうです。"
      },
    },
    tail: {
      after: 1,
      id: "skeleton_choir_tail",
      text: "次の決着までに帰る。食料+3は出前の添え物。送別会の主役を死亡扱いにせず誤解を解く。全ての骸骨が去れば未発生札は閉じる。"
    }
  },
  {
    id: "succubus_party",
    tier: "small",
    door: "B",
    title: "夜会の総点呼",
    subject: {"kind": "unit", "race": "サキュバス"},
    traces: ["cooked", "trained", "hired"],
    traceScope: "関連痕跡 { cooked(S)／trained(S)／hired(S) } の異なる2種＋酒場Lv1以上。",
    state: st => Town.lv(st, "tavern") >= 1,
    rumor: "リリィが夜会の席札を並べると、なぜか全員が姿勢を正す。",
    mormoLine: "魔王様、夜会の席札だけで皆が姿勢を正すデス",
    choices: ["夜会を開く", "関わらない"],
    pick: null,
    hidden: {
      label: "Sが将軍か",
      value: (st, c) => c.subject.rankId === "general" ? "将軍" : "兵卒"
    },
    // 参加者の忠誠+5。
    gain: (st, c) => {
      c.game.incidentEffect("succubus_party", "gain", c);
    },
    // 将軍→乾杯が号令として伝わり、客も並ぶ臨時の観兵式になる。兵卒→気楽な会にするつもりが客の愚痴を集める相談所になり、Sが司会席から動けなくなる。
    branches: {
      "将軍": {
        apply: (st, c) => {
          c.game.incidentEffect("succubus_party", "将軍", c);
        },
        text: "夜会でみんなの機嫌がよくなった。主催者が将軍なので、乾杯が号令になり、客まで隊列を組んだ。",
        mormo: "二列目のお客様、杯はそのままで結構デス。"
      },
      "兵卒": {
        apply: (st, c) => {
          c.game.incidentEffect("succubus_party", "兵卒", c);
        },
        text: "夜会でみんなの機嫌がよくなった。リリィの席には相談の列ができ、最後の客は酒場の店主だった。",
        mormo: "閉店の相談だけ、先に聞いてあげてください。"
      },
    },
    tail: {
      after: 1,
      id: "succubus_party_tail",
      text: "次の決着で閉会、臨時役を終了。客は隊員に数えず、出撃数・恒久職業は変えない。"
    }
  },
  // 堕騎士（docs/DESIGN_HUMAN_SWORDSMAN_2026-09-14.md 2節）。主と認めたあとに、王国が「戻れ」と言ってくる。
  // door B ＝ 使者はもう門の外にいる。「関わらない」でも来たこと自体は消えない。
  {
    id: "knight_envoy",
    tier: "mid",
    door: "B",
    title: "王国からの使者",
    subject: {"kind": "unit", "race": "堕騎士"},
    traces: ["hired", "promoted", "trained"],
    traceScope: "関連痕跡 { hired(堕騎士)／promoted(堕騎士)／trained(堕騎士) } の異なる2種＋忠誠80以上の堕騎士がいる。",
    state: st => (st.roster || []).some(m => m.race === "堕騎士" && (m.loyalty || 0) >= 80),
    rumor: "門の外に王国の使者が立っている。堕騎士は鞘の布を、黙って巻き直している。",
    choices: ["使者に会わせる", "関わらない"],
    pick: null,
    hidden: {
      label: "その者の忠誠90以上か",
      value: (st, c) => (c.subject?.loyalty || 0) >= 90 ? "90以上" : "90未満"
    },
    // 使者に会わせると、主を口に出して決める（忠誠+5）。
    gain: (st, c) => {
      c.game.incidentEffect("knight_envoy", "gain", c);
    },
    // 90以上→使者を斬る（王国警戒度+5・戦功+3）。90未満→断る（忠誠+10、後日 元同僚が討伐隊で来る）。
    branches: {
      "90以上": {
        apply: (st, c) => {
          c.game.incidentEffect("knight_envoy", "90以上", c);
        },
        text: "使者は書状を読み上げ、最後まで読み終えることはなかった。門の血は、本人が拭いた。",
        mormo: "返事は、要らなかったようですネ。"
      },
      "90未満": {
        apply: (st, c) => {
          c.game.incidentEffect("knight_envoy", "90未満", c);
        },
        text: "「戻る場所は、自分で切り取りました」。使者は書状を持ったまま帰り、名簿だけを写していった。",
        mormo: "あの写し、人事課に回りますネ。"
      },
    },
    tail: {
      after: 2,
      id: "knight_envoy_tail",
      text: "斬った枝は王国が黙って警戒を上げるだけ。断った枝は2決着後、写された名簿から元同僚が討伐隊に混ざる。"
    }
  },
];

if (typeof module !== "undefined") module.exports = { INCIDENTS };
