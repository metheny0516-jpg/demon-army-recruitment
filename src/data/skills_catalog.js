// 技のカタログ（まだ誰にも割り当てていない技・行動パターン）。形は src/data/skills.js の SKILLS と同じ。
// 誰がいつ使うかは後で決める（species は空のままでよい）。battle.js は SKILLS と SKILL_CATALOG の両方から id を引く。
const SKILL_CATALOG = {};

if (typeof module !== "undefined") module.exports = { SKILL_CATALOG };

Object.assign(SKILL_CATALOG, {
  catalog_drain: {
    name: "吸い上げ", species: "", cost: 1, kind: "drain", target: "enemy", hit: 0.8,
    note: "×1・与ダメの30%回復　命中80%",
    lines: { use: ["ひと口、返してもらう", "まだ倒れるわけには"], miss: ["吸い損ねた", "口が届かない"] }
  },
  catalog_pierce: {
    name: "継ぎ目突き", species: "", cost: 1, kind: "pierce", target: "enemy", order: "last",
    note: "防御無視の一撃　最後に動く",
    lines: { use: ["継ぎ目が見えた", "鎧の隙間を借りる"], miss: ["隙間が閉じた", "先が折れたか"] }
  },
  catalog_double: {
    name: "二連打", species: "", cost: 2, kind: "double", target: "enemy",
    note: "同じ敵に70%で2回　気合2",
    lines: { use: ["もう一発ある", "左右、続けて！"], miss: ["腕が絡まった", "二発とも空か"] }
  },
  catalog_execute: {
    name: "とどめの見切り", species: "", cost: 1, kind: "execute", target: "enemy",
    note: "敵HP30%以下で×3　それ以外は反撃",
    lines: { use: ["ここで仕留める", "終わらせよう"], miss: ["まだ早かった", "見切りを誤った"] }
  },
  catalog_quake: {
    name: "地響き", species: "", cost: 1, kind: "quake", target: "all_enemies",
    note: "遅い敵から全体50%　味方最後尾HP10%傷",
    lines: { use: ["足元に注意だ", "床ごと揺らす！"], miss: ["地面が硬い", "腰に来た……"] }
  },
  catalog_mend_all: {
    name: "配り薬", species: "", cost: 2, kind: "mend_all", target: "all_allies",
    note: "味方全員HP15%回復　気合2",
    lines: { use: ["一人一包ずつ", "薬代は後で精算だ"], miss: ["袋が空だった", "瓶を割った！"] }
  },
  catalog_sacrifice: {
    name: "血肉分け", species: "", cost: 1, kind: "sacrifice", target: "ally",
    note: "仲間を回復　自分の残HPを半分まで渡す",
    lines: { use: ["少し持っていけ", "立てる分だけ残す"], miss: ["分ける余裕がない", "手が届かない"] }
  },
  catalog_wall_all: {
    name: "総員防壁", species: "", cost: 2, kind: "wall_all", target: "all_allies",
    note: "味方全員今Rまもる　気合2",
    lines: { use: ["隙間を埋めろ", "皆で受け止める"], miss: ["壁が間に合わない", "並びが崩れた"] }
  },
  catalog_gamble: {
    name: "裏表の一撃", species: "", cost: 1, kind: "gamble", target: "enemy",
    note: "半々で×3か自分に攻撃力分の傷",
    lines: { use: ["表なら勝ちだ", "運も勤務のうち"], miss: ["裏目か！", "賭けは苦手だった"] }
  },
  catalog_rally_fallen: {
    name: "穴を埋める", species: "", cost: 1, kind: "rally_fallen", target: "enemy",
    note: "戦闘不能1人毎に×0.5加算　無人なら×0.5",
    lines: { use: ["休んだ分も働く", "あいつの持ち場は任せろ"], miss: ["無理が過ぎた", "一人では届かない"] }
  },
  catalog_summon_minion: {
    name: "臨時分身", species: "", cost: 2, kind: "summon_minion", target: "none",
    note: "HP30%攻撃半分の分身　気合2・一戦一回",
    lines: { use: ["臨時雇いを呼ぶ", "もう一人の私、出勤！"], miss: ["人手が尽きた", "二重出勤は無理だ"] }
  },
  catalog_disarm: {
    name: "武器はじき", species: "", cost: 1, kind: "disarm", target: "enemy", hit: 0.8,
    note: "敵の攻撃力を3下げる　命中80%",
    lines: { use: ["その武器を離せ", "柄を狙う"], miss: ["握りが固い", "武器を取り損ねた"] }
  },
  catalog_cleanse: {
    name: "気付け", species: "", cost: 2, kind: "cleanse", target: "ally",
    note: "足止め・魅了・燃焼を即解除　気合2",
    lines: { use: ["正気に戻れ", "まだ勤務中だぞ"], miss: ["気付け薬がない", "声が届かない"] }
  },
  catalog_rescue: {
    name: "引き寄せ救助", species: "", cost: 2, kind: "rescue", target: "ally",
    note: "仲間を最後尾へ、60%でかばう　気合2",
    lines: { use: ["後ろに下がれ", "ここは引き受けた"], miss: ["手をつかめない", "縄が短かった"] }
  },
  catalog_burn_touch: {
    name: "置き火", species: "", cost: 2, kind: "burn_touch", target: "enemy",
    note: "×0.5・次Rに最大HP8%燃焼　気合2",
    lines: { use: ["忘れ物だ、火種", "後から熱くなるぞ"], miss: ["湿っていたか", "火が消えた"] }
  },
  catalog_shatter_guard: {
    name: "盾崩し", species: "", cost: 1, kind: "shatter_guard", target: "enemy", order: "last",
    note: "まもるを解除して×0.8　最後に動く",
    lines: { use: ["盾をどけてもらう", "構えが重すぎるぞ"], miss: ["盾が動かない", "腕がしびれた"] }
  },
  catalog_spirit_gift: {
    name: "気合の差し入れ", species: "", cost: 2, kind: "spirit_gift", target: "ally",
    note: "自分以外の味方に気合1　気合2",
    lines: { use: ["これであと一仕事", "頼む、続けてくれ"], miss: ["気合が空回りだ", "差し入れを落とした"] }
  },
  catalog_finishing_loot: {
    name: "戦利品回収", species: "", cost: 1, kind: "finishing_loot", target: "enemy", order: "last",
    note: "×0.8・倒せば勝利時1G　最後に動く",
    lines: { use: ["備品を回収する", "落とし物は軍の物"], miss: ["空振り、収穫なし", "拾う隙がない"] }
  },
  catalog_flank: {
    name: "回り込み", species: "", cost: 1, kind: "flank", target: "none", hit: 0.8,
    note: "敵最後尾に×1.2、自分も後ろへ　命中80%",
    lines: { use: ["裏へ回る", "後ろが空いてるぞ"], miss: ["道を間違えた", "見つかったか"] }
  },
  catalog_siphon_guard: {
    name: "気勢くじき", species: "", cost: 2, kind: "siphon_guard", target: "enemy",
    note: "敵の鼓舞を消して自分はまもる　気合2",
    lines: { use: ["勢いはそこまで", "少し静かにしてくれ"], miss: ["声に負けた", "勢いが止まらない"] }
  }
});

Object.assign(SKILL_CATALOG, {
  catalog_mourning: {
    name: "弔い合戦", species: "", cost: 1, kind: "mourning", target: "enemy", order: "last",
    note: "同族の戦死者がいれば×1.5　最後に動く",
    lines: { use: ["あいつの名前を覚えている", "空いた席の分まで"], miss: ["力みすぎたか", "仇は逃がさない……次こそ"] }
  },
  catalog_carried_debt: {
    name: "担がれの恩", species: "", cost: 2, kind: "carried_debt", target: "none",
    note: "記録された担ぎ手を60%でかばう　気合2",
    lines: { use: ["あの時の借りを返す", "今度は私が背中を守る"], miss: ["恩人が見当たらない", "誰に担がれたのだったか"] }
  },
  catalog_veteran: {
    name: "常連の勘", species: "", cost: 1, kind: "veteran", target: "enemy", hit: 0.85,
    note: "被撃倒毎に攻撃10%増、最大50%　命中85%",
    lines: { use: ["この痛みは知っている", "前はここで倒れたんだ"], miss: ["覚え違いだったか", "同じところをやられた"] }
  },
  catalog_relic_weight: {
    name: "遺物の重み", species: "", cost: 2, kind: "relic_weight", target: "all_allies",
    note: "遺物1個毎に味方今R攻撃5%増　気合2",
    lines: { use: ["これは置いていけない", "預かった物の分も進む"], miss: ["荷が重すぎる", "まだ預かる物がない"] }
  },
  catalog_carried_resolve: {
    name: "担がれた者の盾", species: "", cost: 2, kind: "carried_resolve", target: "ally",
    note: "担がれ歴があれば仲間を40%でかばう　気合2",
    lines: { use: ["もう誰も置いていかない", "担がれる痛みは知っている"], miss: ["守る相手がいない", "まだ背中を預けられないか"] }
  }
});
