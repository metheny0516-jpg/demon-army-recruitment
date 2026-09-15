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
    intro: "アレンの幼なじみ。威勢だけで村を守ろうとする。", lines: { enter: [], beaten: [], spared: [] }
  },
  // ── 魔界の糸（部族の首領。territories.js の chief.id と一致） ──
  zagan: {
    name: "自称将軍ザガン", short: "ザガン", thread: "tribe", role: "commander", icon: "🎖️",
    hp: 60, atk: 12, def: 6, spd: 6, traits: ["pack"], offer: "hire", joinsHero: false, tribe: "t01",
    hire: { race: "goblin", loyalty: 30, trait: "show_off", job: "将軍候補" },   // 雇えば忠誠30の将軍候補。段階Bの run.js が名簿へ足す
    intro: "前魔王の元部下。「本当の魔王軍」を名乗り、解雇された者を拾って大きくなる。", lines: { enter: [], beaten: [], hired: [] }
  },
  gravekeeper: {
    name: "墓守", short: "墓守", thread: "tribe", role: "priest", icon: "🕯️",
    hp: 45, atk: 9, def: 5, spd: 4, traits: ["gravekeeper"], offer: "hire", joinsHero: false, tribe: "t03",
    hire: { race: "skeleton", loyalty: 40, trait: "gravekeeper", job: "墓守" },
    intro: "骨の谷で死者を数える。誰の味方でもない。", lines: { enter: [], beaten: [], hired: [] }
  },
  blood_chief: {
    name: "血の族長", short: "族長", thread: "tribe", role: "brute", icon: "🩸",
    hp: 70, atk: 14, def: 5, spd: 5, traits: ["brute"], offer: "hire", joinsHero: false, tribe: "t05",
    hire: { race: "orc", loyalty: 35, trait: "brute", job: "突撃隊長" },
    intro: "オークの荒野の長。強い者にしか従わない。", lines: { enter: [], beaten: [], hired: [] }
  },
  elder: {
    name: "森の長老", short: "長老", thread: "tribe", role: "priest", icon: "🌳",
    hp: 40, atk: 7, def: 6, spd: 3, traits: ["regen"], offer: "hire", joinsHero: false, tribe: "t07",
    hire: { race: "mandragora", loyalty: 50, trait: "regen", job: "薬師" },
    intro: "森の奥で眠っている。起こすと怒る。", lines: { enter: [], beaten: [], hired: [] }
  },
  tower_lord: {
    name: "塔の主", short: "塔の主", thread: "tribe", role: "caster", icon: "🗼",
    hp: 45, atk: 15, def: 4, spd: 7, traits: ["necromancy"], offer: "hire", joinsHero: false, tribe: "t08",
    hire: { race: "necromancer", loyalty: 25, trait: "necromancy", job: "研究員" },
    intro: "廃墟の塔で何かを研究している。給料次第で誰にでも仕える。", lines: { enter: [], beaten: [], hired: [] }
  },
  labyrinth_lord: {
    name: "迷宮の主", short: "迷宮の主", thread: "tribe", role: "brute", icon: "🐂",
    hp: 140, atk: 24, def: 12, spd: 6, traits: ["rampage"], offer: "hire", joinsHero: false, tribe: "t09",
    hire: { race: "minotaur", loyalty: 30, trait: "rampage", job: "門番" },
    intro: "第二幕。迷宮の奥で待つ。", lines: { enter: [], beaten: [], hired: [] }
  },
  // ── 王国の糸 ──
  gareth: {
    name: "王国軍将軍ガレス", short: "ガレス", thread: "kingdom", role: "shield", icon: "🛡️",
    hp: 110, atk: 16, def: 12, spd: 5, traits: ["guardian_prayer"], offer: "spare", joinsHero: true, gate: "h11",
    intro: "アレンの師匠。「一人も死なせない」が口癖。", lines: { enter: [], beaten: [], spared: [] }
  },
  bold: {
    name: "傭兵隊長ボルド", short: "ボルド", thread: "kingdom", role: "fighter", icon: "⚔️",
    hp: 50, atk: 13, def: 6, spd: 6, traits: ["first_strike"], offer: "spare", joinsHero: true,
    intro: "国境の傭兵団を率いる。金で動くが、約束は守る。", lines: { enter: [], beaten: [], spared: [] }
  },
  serena: {
    name: "神殿の聖女セレナ", short: "セレナ", thread: "kingdom", role: "priest", icon: "✨",
    hp: 55, atk: 10, def: 7, spd: 6, traits: ["guardian_prayer"], offer: "spare", joinsHero: true,
    intro: "大神殿の祈り手。戦場で倒れた者を起こす。", lines: { enter: [], beaten: [], spared: [] }
  },
  dolph: {
    name: "王国軍の砲手ドルフ", short: "ドルフ", thread: "kingdom", role: "archer", icon: "🏹",
    hp: 45, atk: 15, def: 4, spd: 8, traits: ["first_strike"], offer: "spare", joinsHero: true,
    intro: "後列を狙う。いまの勇者一行の「戦士ドルフ」はこの人物。", lines: { enter: [], beaten: [], spared: [] }
  },
  zack: {
    name: "野盗の頭ザック", short: "ザック", thread: "kingdom", role: "rogue", icon: "🗡️",
    hp: 40, atk: 12, def: 3, spd: 10, traits: ["pickpocket"], offer: "hire", joinsHero: true,
    hire: { race: "人間", loyalty: 20, trait: "pickpocket", job: "斥候" },
    intro: "王国にも魔王にも雇われる。どちらが高く買うかだけ。", lines: { enter: [], beaten: [], hired: [] }
  },
  inquisitor: {
    name: "審問官ヴァル", short: "ヴァル", thread: "kingdom", role: "caster", icon: "📜",
    hp: 50, atk: 16, def: 5, spd: 7, traits: ["fireball"], offer: null, joinsHero: true,
    intro: "聖教会の審問官。魔物と話す気はない（提案は出ない）。", lines: { enter: [], beaten: [] }
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
