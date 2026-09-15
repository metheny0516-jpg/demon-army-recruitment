// 敵将の名簿（docs/DESIGN_CAMPAIGN_ROUTE_2026-09-15.md 三本の糸、docs/SPEC_CAPTAINS_BD_2026-09-15.md）。
//
// 「魔王が人材を集めるあいだ、勇者アレンも仲間を集めている」。ここに載る者は全員、最後に勇者の隣に立つかもしれない人物。
// - thread：糸。village（村・ポルカ）／tribe（魔界・首領たち）／kingdom（王国・ガレスと隊長たち）／hall（先代の英雄：過去ランの殿堂入り。データはここに無く、run.js が殿堂から写す）
// - offer：HP 30% 以下で出る提案の種類。"spare"（見逃す）／"hire"（雇う）／null（提案なし＝討つしかない）
// - joinsHero：討たれず雇われもしなければ、最終戦で勇者一行の枠に入る候補か
// - stats は段階表の同じ役より一回り上（「⚠ ○○がいる」の重み）。段階に合わせた倍率は run.js の scale がそのまま掛かる
// - trait は既存の TRAITS から1つだけ。新しい戦闘の仕組みは作らない
// - lines（登場・決着・雇用の台詞）は CodeX が埋める。空なら描画側は出さない
// - 部族の首領は territories.js の chief.id と同じ id。ここに戦闘の値を持つ
const ENEMY_CAPTAINS = {
  // ── 村の糸 ──
  polka: {
    name: "村おこし勇者団の団長ポルカ", short: "ポルカ", thread: "village", role: "fighter", icon: "🎺",
    hp: 30, atk: 8, def: 3, spd: 7, traits: ["show_off"], offer: "spare", joinsHero: true,
    grows: 3,   // 負けても逃げて、次は少し強い装備で来る（3回まで。run.js が st.captains[id].seen で回数を持ち、stats に +15%/回）
    intro: "アレンの幼なじみ。威勢だけで村を守ろうとする。", lines: {
      enter: ["村おこし勇者団、参上！　魔王なんか怖くないぞ！", "見ろ、この新しい鎧！　前と同じだと思うなよ！", "今日は見栄じゃない。俺が村を守るんだ。"],
      beaten: ["くっ……声の大きさじゃ勝てないのかよ。", "鎧は強くなったのに、俺はまだ足りないのか。", "立て、俺……村を任されたんだろ。"],
      spared: ["見逃すのか？　礼は言う。でも村は渡さないぞ。", "帰ったら稽古だ。装備に頼ってばかりじゃ駄目だ。", "アレンに顔向けできる自分になって帰る。"],
    }
  },
  // ── 魔界の糸（部族の首領。territories.js の chief.id と一致） ──
  zagan: {
    name: "自称将軍ザガン", short: "ザガン", thread: "tribe", role: "commander", icon: "🎖️",
    hp: 60, atk: 12, def: 6, spd: 6, traits: ["pack"], offer: "hire", joinsHero: false, tribe: "t01",
    hire: { race: "goblin", loyalty: 30, trait: "show_off", job: "将軍候補" },   // 雇えば忠誠30の将軍候補。段階Bの run.js が名簿へ足す
    intro: "前魔王の元部下。「本当の魔王軍」を名乗り、解雇された者を拾って大きくなる。", lines: {
      enter: ["我らこそ本当の魔王軍だ！　玉座だけで王を名乗るな！", "お前が捨てた部下にも、居場所は必要なのだ！", "前魔王の旗を預かるザガンだ。膝をつくのはお前だ！"],
      beaten: ["本当の魔王軍が……看板だけになってたまるか。", "部下を置いて逃げる将軍にだけは、ならんぞ。", "古い旗では、今のお前を止められんのか。"],
      hired: ["雇うなら将軍候補だ。そこは譲らん！", "本当の魔王軍かどうか、この目で確かめてやる。", "拾った部下を、また捨てるな。それが条件だ。"],
    }
  },
  gravekeeper: {
    name: "墓守", short: "墓守", thread: "tribe", role: "priest", icon: "🕯️",
    hp: 45, atk: 9, def: 5, spd: 4, traits: ["gravekeeper"], offer: "hire", joinsHero: false, tribe: "t03",
    hire: { race: "skeleton", loyalty: 40, trait: "gravekeeper", job: "墓守" },
    intro: "骨の谷で死者を数える。誰の味方でもない。", lines: {
      enter: ["谷に眠る者を踏むな。道なら、ここにある。", "旗の色はどうでもよい。墓を荒らすなら止める。", "名を言え。数だけでは、死者は覚えられぬ。"],
      beaten: ["骨が折れたか。数え直す手間が増えたな。", "倒れた者の名は……誰か、覚えておけ。", "わしを倒しても、死者の仕事は終わらぬ。"],
      hired: ["敵味方を分けずに弔う。それでよければ働こう。", "墓守だ。勝ち戦の片づけも、忘れぬようにな。", "死者の名簿をくれ。一人ずつ確かめる。"],
    }
  },
  blood_chief: {
    name: "血の族長", short: "族長", thread: "tribe", role: "brute", icon: "🩸",
    hp: 70, atk: 14, def: 5, spd: 5, traits: ["brute"], offer: "hire", joinsHero: false, tribe: "t05",
    hire: { race: "orc", loyalty: 35, trait: "brute", job: "突撃隊長" },
    intro: "オークの荒野の長。強い者にしか従わない。", lines: {
      enter: ["王だと？　その腕で名乗ってみろ！", "荒野に命令したければ、まず俺を倒せ！", "旗より拳だ。強いほうが先頭に立つ！"],
      beaten: ["効いたぞ……口だけの王ではなかったな。", "まだ膝はつかん。俺の腕は、まだ動く。", "くそっ。力比べで、言い訳はできんな。"],
      hired: ["強さは認めた。次はお前の先頭で戦う。", "俺は突撃隊長だ。後ろで待つ仕事はよせ。", "従おう。だが、弱い命令なら聞き返すぞ。"],
    }
  },
  elder: {
    name: "森の長老", short: "長老", thread: "tribe", role: "priest", icon: "🌳",
    hp: 40, atk: 7, def: 6, spd: 3, traits: ["regen"], offer: "hire", joinsHero: false, tribe: "t07",
    hire: { race: "mandragora", loyalty: 50, trait: "regen", job: "薬師" },
    intro: "森の奥で眠っている。起こすと怒る。", lines: {
      enter: ["何百年も寝たわけではない。今、眠ったところじゃ！", "森の根を踏むな。わしの足でもあるんじゃぞ。", "昼寝を邪魔して、ただで帰れると思うなよ。"],
      beaten: ["年寄りをここまで働かせるとは……。", "葉が散ったわい。片づけてから帰れ。", "根比べは負けじゃ。少し休ませい。"],
      hired: ["薬は作ろう。昼寝の時間は契約に書け。", "水と日陰を用意せい。椅子はいらん。", "若い連中の傷を見るか。騒ぐのは外で頼むぞ。"],
    }
  },
  tower_lord: {
    name: "塔の主", short: "塔の主", thread: "tribe", role: "caster", icon: "🗼",
    hp: 45, atk: 15, def: 4, spd: 7, traits: ["necromancy"], offer: "hire", joinsHero: false, tribe: "t08",
    hire: { race: "necromancer", loyalty: 25, trait: "necromancy", job: "研究員" },
    intro: "廃墟の塔で何かを研究している。給料次第で誰にでも仕える。", lines: {
      enter: ["用件は短く。研究の途中なのでね。", "その装備、実験に使えそうだ。持ち主ごと来たか。", "塔への無断立ち入りだ。修理代は払ってもらう。"],
      beaten: ["なるほど……この結果は記録しておこう。", "待て、瓶を踏むな！　私より高いんだ！", "計算と違うな。君の値段を見直そう。"],
      hired: ["給料と研究費は別だ。そこを間違えないでくれ。", "契約成立だ。忠誠まで込みとは書いていないがね。", "塔から荷物を運ぼう。割れ物ばかりだ、慎重にな。"],
    }
  },
  labyrinth_lord: {
    name: "迷宮の主", short: "迷宮の主", thread: "tribe", role: "brute", icon: "🐂",
    hp: 140, atk: 24, def: 12, spd: 6, traits: ["rampage"], offer: "hire", joinsHero: false, tribe: "t09",
    hire: { race: "minotaur", loyalty: 30, trait: "rampage", job: "門番" },
    intro: "第二幕。迷宮の奥で待つ。", lines: {
      enter: ["ここまで来たか。帰り道は覚えているな？", "迷宮の主だ。この先は、俺を越えて行け。", "待つのは慣れている。逃げるなら今のうちだ。"],
      beaten: ["壁より固いと思っていたが……俺の負けか。", "膝をついたのは、何年ぶりだろうな。", "道をふさぐ側にも、退く時が来るのか。"],
      hired: ["門番か。通してよい者の名を教えろ。", "お前の城門で待とう。侵入者には慣れている。", "出口の多い城だな。まず道を覚えさせろ。"],
    }
  },
  // ── 王国の糸 ──
  gareth: {
    name: "王国軍将軍ガレス", short: "ガレス", thread: "kingdom", role: "shield", icon: "🛡️",
    hp: 110, atk: 16, def: 12, spd: 5, traits: ["guardian_prayer"], offer: "spare", joinsHero: true, gate: "h11",
    intro: "アレンの師匠。「一人も死なせない」が口癖。", lines: {
      enter: ["一人も死なせない。全員、私の盾の後ろへ！", "アレンにも教えた。守る者が先に立つのだ。", "通したければ私を倒せ。部下には手を出すな。"],
      beaten: ["一人も死なせない……まだ、盾は離さん。", "私を見るな。動ける者から後ろへ下がれ！", "アレンに教えたことを、ここで曲げるわけにはいかん。"],
      spared: ["恩は忘れぬ。だが、守る相手は変わらん。", "退こう。負傷した部下を運ぶ時間をくれ。", "一人も死なせない。そのためなら、この屈辱も受ける。"],
    }
  },
  bold: {
    name: "傭兵隊長ボルド", short: "ボルド", thread: "kingdom", role: "fighter", icon: "⚔️",
    hp: 50, atk: 13, def: 6, spd: 6, traits: ["first_strike"], offer: "spare", joinsHero: true,
    intro: "国境の傭兵団を率いる。金で動くが、約束は守る。", lines: {
      enter: ["代金は受け取った。ここから先は通せん。", "傭兵隊長ボルドだ。雇い主との約束を果たす。", "命を安売りするなよ。俺も、そのつもりはない。"],
      beaten: ["割に合わん相手だ……だが、仕事は仕事だ。", "契約書に、勝てるとは書いていなかったな。", "腕は認める。こっちの読みが甘かった。"],
      spared: ["借りは覚えておく。約束までは売れんがな。", "今日は退く。兵を連れ帰るのも隊長の仕事だ。", "礼は言う。次の仕事で会わないことを願おう。"],
    }
  },
  serena: {
    name: "神殿の聖女セレナ", short: "セレナ", thread: "kingdom", role: "priest", icon: "✨",
    hp: 55, atk: 10, def: 7, spd: 6, traits: ["guardian_prayer"], offer: "spare", joinsHero: true,
    intro: "大神殿の祈り手。戦場で倒れた者を起こす。", lines: {
      enter: ["倒れた方は私が支えます。どうか、一歩ずつ。", "祈るだけでは届きません。私もここに立ちます。", "剣を収めてくださるなら、今からでも手当てを。"],
      beaten: ["まだ声がします……手を伸ばさなくては。", "私のことは後で。先に、あちらの傷を。", "祈りが途切れても、見捨てたりはしません。"],
      spared: ["ありがとうございます。けが人のそばへ戻ります。", "敵の情けにも、救われる命があるのですね。", "この手を離してくださったこと、忘れません。"],
    }
  },
  dolph: {
    name: "王国軍の砲手ドルフ", short: "ドルフ", thread: "kingdom", role: "archer", icon: "🏹",
    hp: 45, atk: 15, def: 4, spd: 8, traits: ["first_strike"], offer: "spare", joinsHero: true,
    intro: "後列を狙う。いまの勇者一行の「戦士ドルフ」はこの人物。", lines: {
      enter: ["前の鎧は狙わん。後ろの隙を見ている。", "ドルフ、射線についた。そこを動くな。", "守りの厚さより、守りの切れ目だ。"],
      beaten: ["くっ……狙う側のつもりだったんだがな。", "次の一発までが、長すぎたか。", "手が震える。狙い直すには、間が要るな。"],
      spared: ["借りができたな。狙いと同じで、忘れはしない。", "武器を下ろす。今日はこれ以上、撃たん。", "命拾いだ。仲間には、ありのままを伝える。"],
    }
  },
  zack: {
    name: "野盗の頭ザック", short: "ザック", thread: "kingdom", role: "rogue", icon: "🗡️",
    hp: 40, atk: 12, def: 3, spd: 10, traits: ["pickpocket"], offer: "hire", joinsHero: true,
    hire: { race: "人間", loyalty: 20, trait: "pickpocket", job: "斥候" },
    intro: "王国にも魔王にも雇われる。どちらが高く買うかだけ。", lines: {
      enter: ["王国の金払いも悪くない。今日は敵同士ってわけだ。", "財布を守ってる間に、足元がお留守だぜ。", "魔王さん、俺に値をつけるなら戦う前がお得だ。"],
      beaten: ["待った、ここからは値段の話にしようぜ。", "こいつは赤字だ。命まで払う気はないぞ。", "参った。逃げ道まで見てやがったか。"],
      hired: ["毎度あり。高く買ったぶんは働くぜ。", "斥候ザックだ。前金は、どこでもらえる？", "王国よりいい話だ。そういう間は味方さ。"],
    }
  },
  inquisitor: {
    name: "審問官ヴァル", short: "ヴァル", thread: "kingdom", role: "caster", icon: "📜",
    hp: 50, atk: 16, def: 5, spd: 7, traits: ["fireball"], offer: null, joinsHero: true,
    intro: "聖教会の審問官。魔物と話す気はない（提案は出ない）。", lines: {
      enter: ["魔物の言い分を聞くために来たのではない。", "審問官ヴァルだ。弁明は認めぬ。", "情けを口にしても、その罪は消えぬ。"],
      beaten: ["私が倒れても、裁きまで終わったと思うな。", "魔物に屈する言葉など、持ち合わせていない。", "この手が止まっても、教えは曲げぬ。"],
      spared: ["情けで私の考えを変えられると思うな。", "見逃したことを悔やんでも、知らぬぞ。", "命を残されても、お前を認めはしない。"],
    }
  }
};

// 数値はここだけ。
const CAPTAIN_RULES = {
  // 「⚠ ○○がいる」札：2〜3決着に1回（run.js が決着数の剰余で決める）
  everyNSettles: 3,
  // 不意打ち（札に書かれていない敵将）：警戒度 0〜10 で 0〜15%。前哨戦を踏んだ作戦・訓練・防衛戦では起きない
  ambushMax: 0.15,
  // 不意打ちのうち、先代の英雄（過去ランの殿堂入り）が立つ割合
  hallShare: 0.4,
  // 首級（討った）の報酬倍率と名声
  bountyMult: 1.5, fame: 1,
  // 最終戦：勇者アレン＋3枠。討たれず雇われもしなかった joinsHero の者から埋め、足りなければ既定の3人
  heroSlots: 3,
  // 見逃した敵将が「逃げた」あと、同じランで再登場するか（オーナー判断で「二度出ない」。因縁は後で）
  reappear: false
};
