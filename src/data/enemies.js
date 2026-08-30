// 勇者軍の8ステージ。region は魔界史の「到達地域」に使う。
// units の並び順が配置（先頭が狙われやすい）。
const ENEMY_STAGES = [
  {
    stage: 1, army: "見習い冒険者たち", region: "村はずれ", reward: 6,
    units: [
      { name: "剣士見習いテト", icon: "🗡", hp: 14, atk: 5, def: 2, spd: 6 },
      { name: "剣士見習いポル", icon: "🗡", hp: 14, atk: 5, def: 2, spd: 5 }
    ]
  },
  {
    stage: 2, army: "駆け出し冒険者パーティ", region: "街道", reward: 8,
    units: [
      { name: "剣士ロイ", icon: "🗡", hp: 20, atk: 7, def: 3, spd: 6 },
      { name: "弓手ミナ", icon: "🏹", hp: 14, atk: 8, def: 1, spd: 8 }
    ]
  },
  {
    stage: 3, army: "国境の傭兵団", region: "関所", reward: 11,
    units: [
      { name: "傭兵ガレス", icon: "⚔️", hp: 26, atk: 9, def: 4, spd: 5 },
      { name: "傭兵ボルド", icon: "⚔️", hp: 26, atk: 9, def: 4, spd: 5 },
      { name: "傭兵隊長ハンス", icon: "🎖️", hp: 32, atk: 11, def: 5, spd: 6 }
    ]
  },
  {
    stage: 4, army: "神殿騎士団", region: "大神殿", reward: 14,
    units: [
      { name: "神殿騎士ユーグ", icon: "🛡️", hp: 38, atk: 12, def: 7, spd: 5 },
      { name: "神殿騎士セラ", icon: "🛡️", hp: 38, atk: 12, def: 7, spd: 5 },
      { name: "従軍僧リタ", icon: "✨", hp: 22, atk: 7, def: 3, spd: 6 }
    ]
  },
  {
    stage: 5, army: "王国軍先遣隊", region: "城塞都市", reward: 18,
    units: [
      { name: "王国兵アルド", icon: "⚔️", hp: 30, atk: 10, def: 5, spd: 6 },
      { name: "王国兵ベイン", icon: "⚔️", hp: 30, atk: 10, def: 5, spd: 6 },
      { name: "王国兵コッツ", icon: "⚔️", hp: 30, atk: 10, def: 5, spd: 5 },
      { name: "騎士ラインハルト", icon: "🛡️", hp: 50, atk: 15, def: 8, spd: 7 }
    ]
  },
  {
    stage: 6, army: "王国軍本隊", region: "大平原", reward: 23,
    units: [
      { name: "精鋭兵ダン", icon: "⚔️", hp: 38, atk: 13, def: 7, spd: 6 },
      { name: "精鋭兵エド", icon: "⚔️", hp: 38, atk: 13, def: 7, spd: 6 },
      { name: "精鋭兵フォス", icon: "⚔️", hp: 38, atk: 13, def: 7, spd: 6 },
      { name: "将軍グラハム", icon: "🎖️", hp: 60, atk: 16, def: 9, spd: 7 }
    ]
  },
  {
    stage: 7, army: "聖騎士団", region: "王都城門", reward: 30,
    units: [
      { name: "聖騎士オルガ", icon: "🛡️", hp: 48, atk: 16, def: 10, spd: 7 },
      { name: "聖騎士ジン", icon: "🛡️", hp: 48, atk: 16, def: 10, spd: 7 },
      { name: "聖騎士カレン", icon: "🛡️", hp: 48, atk: 16, def: 10, spd: 7 },
      { name: "団長ヴァレス", icon: "🎖️", hp: 70, atk: 19, def: 11, spd: 8 }
    ]
  },
  {
    stage: 8, army: "勇者アレン一行", region: "王都", reward: 50,
    units: [
      { name: "戦士ドルフ", icon: "🪓", hp: 90, atk: 18, def: 10, spd: 7 },
      { name: "勇者アレン", icon: "👑", hp: 120, atk: 24, def: 12, spd: 10 },
      { name: "聖女エル", icon: "✨", hp: 70, atk: 12, def: 8, spd: 6 },
      { name: "賢者ミラ", icon: "📖", hp: 60, atk: 20, def: 6, spd: 8 }
    ]
  }
];
