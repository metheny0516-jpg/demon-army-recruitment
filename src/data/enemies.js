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

// 敵の成長（2026-09-10）。通常作戦の敵の段階は征服度だけで決まり、時間では上がらない。
// 同じ段階で戦うたびに「慣れ」で能力が familiarityPerFight ずつ上がる（familiarityCap 回まで）。
// 時間の圧力は警戒度＝王国の反撃で払う。仕様: docs/SPEC_SPIRIT_AND_ENEMY_GROWTH_2026-09-10.md
const ENEMY_GROWTH = { familiarityPerFight: 0.04, familiarityCap: 5 };

// 第二幕（段階9〜14）。docs/SPEC_ACT2_CONTENT_2026-09-11.md 3節。
// ENEMY_STAGES に追記しないのは、run.js の MAX_CONQUEST と campaignLevel() の上限が
// ENEMY_STAGES.length に縛られているため。配列を伸ばすと第一幕が段階9へ進めてしまい、
// 勇者戦（段階8）での着地が壊れる。run.js 側で幕の進行を実装するとき、征服度の上限を
// ACT_STAGE_CAP[現在の幕] に切り替え、この配列を第一幕クリア後の段階として合流させる。
const ENEMY_STAGES_ACT2 = [
  {
    stage: 9, army: "国境警備隊", region: "隣国国境", reward: 58,
    units: [
      { name: "国境兵レオ", icon: "⚔️", hp: 96, atk: 19, def: 11, spd: 7 },
      { name: "国境兵マルコ", icon: "⚔️", hp: 96, atk: 19, def: 11, spd: 7 },
      { name: "国境弓兵イラ", icon: "🏹", hp: 68, atk: 20, def: 6, spd: 9 }
    ], variants: [
      { id: "shield_and_crossbow", name: "大盾弩隊", hint: "大盾二人が前に出て、後ろの弩が的を絞って撃つ。", units: [
        { name: "大盾兵レオ", icon: "🛡️", hp: 118, atk: 15, def: 15, spd: 5 },
        { name: "大盾兵マルコ", icon: "🛡️", hp: 118, atk: 15, def: 15, spd: 5 },
        { name: "弩兵イラ", icon: "🏹", hp: 60, atk: 24, def: 4, spd: 9 }
      ] }
    ]
  },
  {
    stage: 10, army: "隣国重装歩兵", region: "街道の砦", reward: 66,
    units: [
      { name: "重装歩兵ガル", icon: "🛡️", hp: 110, atk: 20, def: 14, spd: 6 },
      { name: "重装歩兵ヴォス", icon: "🛡️", hp: 110, atk: 20, def: 14, spd: 6 },
      { name: "砦長ベルナ", icon: "🎖️", hp: 130, atk: 23, def: 15, spd: 6 }
    ], variants: [
      { id: "iron_wall_three", name: "鉄壁三列", hint: "硬い前衛が三人並び、まず削り切るしかない編成。", units: [
        { name: "重装歩兵ガル", icon: "🛡️", hp: 124, atk: 18, def: 17, spd: 5 },
        { name: "重装歩兵ヴォス", icon: "🛡️", hp: 124, atk: 18, def: 17, spd: 5 },
        { name: "重装歩兵デュク", icon: "🛡️", hp: 124, atk: 18, def: 17, spd: 5 }
      ] }
    ]
  },
  {
    stage: 11, army: "聖教会審問団", region: "大聖堂", reward: 74,
    units: [
      { name: "審問官セイラ", icon: "🔥", hp: 78, atk: 27, def: 7, spd: 8 },
      { name: "審問官トマス", icon: "🔥", hp: 78, atk: 27, def: 7, spd: 8 },
      { name: "聖歌隊ノーラ", icon: "🎵", hp: 140, atk: 14, def: 10, spd: 5 }
    ], variants: [
      { id: "inquisition_choir", name: "断罪と詠唱", hint: "攻高で脆い審問官の後ろに、やたら硬い聖歌隊が控える。", units: [
        { name: "審問官セイラ", icon: "🔥", hp: 66, atk: 30, def: 5, spd: 9 },
        { name: "聖歌隊ノーラ", icon: "🎵", hp: 160, atk: 12, def: 11, spd: 4 },
        { name: "聖歌隊メイ", icon: "🎵", hp: 160, atk: 12, def: 11, spd: 4 }
      ] }
    ]
  },
  {
    stage: 12, army: "竜騎兵団", region: "高地", reward: 84,
    units: [
      { name: "竜騎兵ロナ", icon: "🐉", hp: 100, atk: 26, def: 10, spd: 11 },
      { name: "竜騎兵ファウ", icon: "🐉", hp: 100, atk: 26, def: 10, spd: 11 },
      { name: "重竜騎士ゴーグ", icon: "🐲", hp: 150, atk: 24, def: 16, spd: 6 }
    ], variants: [
      { id: "fast_and_heavy", name: "速攻二騎と重騎一", hint: "速い二騎が先に叩き、重い一騎が最後まで残る。", units: [
        { name: "竜騎兵ロナ", icon: "🐉", hp: 92, atk: 28, def: 9, spd: 12 },
        { name: "竜騎兵ファウ", icon: "🐉", hp: 92, atk: 28, def: 9, spd: 12 },
        { name: "重竜騎士ゴーグ", icon: "🐲", hp: 168, atk: 22, def: 18, spd: 5 }
      ] }
    ]
  },
  {
    stage: 13, army: "連合軍砲兵陣地", region: "連合本陣前", reward: 95,
    units: [
      { name: "護衛兵カド", icon: "🛡️", hp: 120, atk: 20, def: 14, spd: 6 },
      { name: "護衛兵ジエン", icon: "🛡️", hp: 120, atk: 20, def: 14, spd: 6 },
      { name: "砲兵オルト", icon: "💥", hp: 60, atk: 38, def: 0, spd: 5 },
      { name: "砲兵ネイ", icon: "💥", hp: 60, atk: 38, def: 0, spd: 5 }
    ], variants: [
      { id: "cannon_row", name: "砲列と壁", hint: "防御0の砲兵が二門、硬い護衛の後ろから撃ちまくる。", units: [
        { name: "護衛兵カド", icon: "🛡️", hp: 140, atk: 17, def: 17, spd: 5 },
        { name: "護衛兵ジエン", icon: "🛡️", hp: 140, atk: 17, def: 17, spd: 5 },
        { name: "砲兵オルト", icon: "💥", hp: 52, atk: 42, def: 0, spd: 5 },
        { name: "砲兵ネイ", icon: "💥", hp: 52, atk: 42, def: 0, spd: 5 }
      ] }
    ]
  },
  {
    stage: 14, army: "勇者アレン一行（再）", region: "連合本陣", reward: 110,
    units: [
      { name: "戦士ドルフ", icon: "🪓", hp: 117, atk: 23, def: 13, spd: 8 },
      { name: "勇者アレン", icon: "👑", hp: 156, atk: 31, def: 16, spd: 12, traits: ["hero_awaken"],
        introQuote: "隣国の力を借りてでも、僕は帰ってきた。今度こそ決着をつけよう！" },
      { name: "聖女エル", icon: "✨", hp: 91, atk: 16, def: 10, spd: 7 },
      { name: "賢者ミラ", icon: "📖", hp: 78, atk: 26, def: 8, spd: 10 },
      { name: "竜騎士カイ", icon: "🐉", hp: 100, atk: 27, def: 12, spd: 13,
        introQuote: "アレンの誘いで馳せ参じた、竜騎士カイだ。空から決めさせてもらう。" }
    ], variants: [
      { id: "reinforced_party", name: "増援込みの一行", hint: "前衛が二人に増え、竜騎士が空から加勢する布陣。", units: [
        { name: "戦士ドルフ", icon: "🪓", hp: 126, atk: 21, def: 15, spd: 7 },
        { name: "聖騎士予備ジン", icon: "🛡️", hp: 108, atk: 18, def: 16, spd: 6 },
        { name: "勇者アレン", icon: "👑", hp: 156, atk: 31, def: 16, spd: 12, traits: ["hero_awaken"],
          introQuote: "隣国の力を借りてでも、僕は帰ってきた。今度こそ決着をつけよう！" },
        { name: "賢者ミラ", icon: "📖", hp: 78, atk: 26, def: 8, spd: 10 },
        { name: "竜騎士カイ", icon: "🐉", hp: 100, atk: 27, def: 12, spd: 13,
          introQuote: "アレンの誘いで馳せ参じた、竜騎士カイだ。空から決めさせてもらう。" }
      ] }
    ]
  }
];

// 幕ごとの段階上限。run.js が MAX_CONQUEST / campaignLevel() をここへ切り替える想定
// （現状は ENEMY_STAGES.length を直接見ているため未接続）。第一幕は8で据え置き、
// 第二幕を実装するときに ACT_STAGE_CAP[2] と ENEMY_STAGES_ACT2 をつなぐ。
const ACT_STAGE_CAP = { 1: 8, 2: 14 };
