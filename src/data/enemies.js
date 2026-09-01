// 勇者軍の8ステージ。region は魔界史の「到達地域」に使う。
// units の並び順が配置（先頭が狙われやすい）。
const ENEMY_STAGES = [
  {
    stage: 1, army: "見習い冒険者たち", region: "村はずれ", reward: 6,
    units: [
      { name: "剣士見習いテト", icon: "🗡", hp: 14, atk: 5, def: 2, spd: 6 },
      { name: "剣士見習いポル", icon: "🗡", hp: 14, atk: 5, def: 2, spd: 5 }
    ], variants: [
      { id: "shield_and_sling", name: "盾役と投石係", hint: "硬い前衛の後ろに、素早い投石係が隠れている。", units: [
        { name: "盾持ち見習いテト", icon: "🛡️", hp: 18, atk: 4, def: 3, spd: 4 },
        { name: "投石見習いポル", icon: "🪨", hp: 10, atk: 6, def: 1, spd: 8 }
      ] }
    ]
  },
  {
    stage: 2, army: "駆け出し冒険者パーティ", region: "街道", reward: 8,
    units: [
      { name: "剣士ロイ", icon: "🗡", hp: 20, atk: 7, def: 3, spd: 6 },
      { name: "弓手ミナ", icon: "🏹", hp: 14, atk: 8, def: 1, spd: 8 }
    ], variants: [
      { id: "road_patrol", name: "街道三人組", hint: "一人ずつは弱いが、手数の多い三人編成。", units: [
        { name: "街道番ロイ", icon: "🗡", hp: 13, atk: 5, def: 2, spd: 6 },
        { name: "街道番ミナ", icon: "🏹", hp: 10, atk: 6, def: 1, spd: 8 },
        { name: "街道番ネス", icon: "🪓", hp: 12, atk: 5, def: 2, spd: 5 }
      ] }
    ]
  },
  {
    stage: 3, army: "国境の傭兵団", region: "関所", reward: 11,
    units: [
      { name: "傭兵ガレス", icon: "⚔️", hp: 26, atk: 9, def: 4, spd: 5 },
      { name: "傭兵ボルド", icon: "⚔️", hp: 26, atk: 9, def: 4, spd: 5 },
      { name: "傭兵隊長ハンス", icon: "🎖️", hp: 32, atk: 11, def: 5, spd: 6 }
    ], variants: [
      { id: "wall_and_bows", name: "大盾傭兵隊", hint: "大盾の後ろから二人の射手が先に動く。", units: [
        { name: "大盾傭兵ガレス", icon: "🛡️", hp: 42, atk: 7, def: 7, spd: 3 },
        { name: "傭兵弓手ボルド", icon: "🏹", hp: 20, atk: 10, def: 2, spd: 7 },
        { name: "傭兵弓手ハンス", icon: "🏹", hp: 21, atk: 11, def: 2, spd: 8 }
      ] }
    ]
  },
  {
    stage: 4, army: "神殿騎士団", region: "大神殿", reward: 14,
    units: [
      { name: "神殿騎士ユーグ", icon: "🛡️", hp: 38, atk: 12, def: 7, spd: 5 },
      { name: "神殿騎士セラ", icon: "🛡️", hp: 38, atk: 12, def: 7, spd: 5 },
      { name: "従軍僧リタ", icon: "✨", hp: 22, atk: 7, def: 3, spd: 6 }
    ], variants: [
      { id: "pilgrim_guard", name: "巡礼護衛隊", hint: "重騎士は一人だけ。代わりに軽装兵が多く、手数で押す。", units: [
        { name: "神殿騎士ユーグ", icon: "🛡️", hp: 44, atk: 12, def: 8, spd: 4 },
        { name: "巡礼剣士セラ", icon: "🗡", hp: 20, atk: 8, def: 3, spd: 7 },
        { name: "巡礼弓手ノア", icon: "🏹", hp: 17, atk: 9, def: 2, spd: 8 },
        { name: "従軍僧リタ", icon: "✨", hp: 19, atk: 6, def: 3, spd: 6 }
      ] }
    ]
  },
  {
    stage: 5, army: "王国軍先遣隊", region: "城塞都市", reward: 18,
    units: [
      { name: "王国兵アルド", icon: "⚔️", hp: 30, atk: 10, def: 5, spd: 6 },
      { name: "王国兵ベイン", icon: "⚔️", hp: 30, atk: 10, def: 5, spd: 6 },
      { name: "王国兵コッツ", icon: "⚔️", hp: 30, atk: 10, def: 5, spd: 5 },
      { name: "騎士ラインハルト", icon: "🛡️", hp: 50, atk: 15, def: 8, spd: 7 }
    ], variants: [
      { id: "knight_lance", name: "騎士突撃隊", hint: "三人だけの精鋭編成。頭数は少ないが一撃が重い。", units: [
        { name: "重装兵アルド", icon: "🛡️", hp: 48, atk: 11, def: 8, spd: 4 },
        { name: "騎兵ベイン", icon: "🐎", hp: 44, atk: 15, def: 6, spd: 8 },
        { name: "騎士ラインハルト", icon: "🛡️", hp: 56, atk: 17, def: 9, spd: 7 }
      ] }
    ]
  },
  {
    stage: 6, army: "王国軍本隊", region: "大平原", reward: 23,
    units: [
      { name: "精鋭兵ダン", icon: "⚔️", hp: 38, atk: 13, def: 7, spd: 6 },
      { name: "精鋭兵エド", icon: "⚔️", hp: 38, atk: 13, def: 7, spd: 6 },
      { name: "精鋭兵フォス", icon: "⚔️", hp: 38, atk: 13, def: 7, spd: 6 },
      { name: "将軍グラハム", icon: "🎖️", hp: 60, atk: 16, def: 9, spd: 7, traits: ["brute"] }
    ], variants: [
      { id: "five_rank", name: "王国軍横隊", hint: "将軍不在の五人横隊。個は軽いが攻撃回数が多い。", units: [
        { name: "盾兵ダン", icon: "🛡️", hp: 42, atk: 10, def: 8, spd: 4 },
        { name: "精鋭兵エド", icon: "⚔️", hp: 31, atk: 12, def: 6, spd: 6 },
        { name: "精鋭兵フォス", icon: "⚔️", hp: 31, atk: 12, def: 6, spd: 6 },
        { name: "王国弓兵レナ", icon: "🏹", hp: 24, atk: 13, def: 3, spd: 8 },
        { name: "王国弓兵シド", icon: "🏹", hp: 24, atk: 13, def: 3, spd: 8 }
      ] }
    ]
  },
  {
    stage: 7, army: "聖騎士団", region: "王都城門", reward: 30,
    units: [
      { name: "聖騎士オルガ", icon: "🛡️", hp: 48, atk: 16, def: 10, spd: 7 },
      { name: "聖騎士ジン", icon: "🛡️", hp: 48, atk: 16, def: 10, spd: 7 },
      { name: "聖騎士カレン", icon: "🛡️", hp: 48, atk: 16, def: 10, spd: 7 },
      { name: "団長ヴァレス", icon: "🎖️", hp: 70, atk: 19, def: 11, spd: 8, traits: ["brute"] }
    ], variants: [
      { id: "three_oaths", name: "三誓騎士", hint: "人数を絞った最高位の三騎。全員が硬く、倒す順番が重要。", units: [
        { name: "誓約騎士オルガ", icon: "🛡️", hp: 72, atk: 17, def: 13, spd: 6 },
        { name: "誓約騎士カレン", icon: "🛡️", hp: 68, atk: 18, def: 12, spd: 7 },
        { name: "団長ヴァレス", icon: "🎖️", hp: 82, atk: 21, def: 13, spd: 8, traits: ["brute"] }
      ] }
    ]
  },
  {
    stage: 8, army: "勇者アレン一行", region: "王都", reward: 50,
    units: [
      { name: "戦士ドルフ", icon: "🪓", hp: 90, atk: 18, def: 10, spd: 7 },
      { name: "勇者アレン", icon: "👑", hp: 120, atk: 24, def: 12, spd: 10, traits: ["hero_awaken"],
        introQuote: "ここが最後の一線だ。魔王よ、僕たちの世界は渡さない！" },
      { name: "聖女エル", icon: "✨", hp: 70, atk: 12, def: 8, spd: 6 },
      { name: "賢者ミラ", icon: "📖", hp: 60, atk: 20, def: 6, spd: 8 }
    ]
  }
];
