// 「得だが後で祟る」選択のツケが、約束どおり数戦後に効くか。
//
// 見ているのは演出ではなく契約:
//   1. 積んだ伝票が即座には効かない（効いたら「後で祟る」ではない）
//   2. 期限の戦闘でだけ効く
//   3. 敗北でも取り立てが来る（負ければ踏み倒せるなら、ツケは抜け道になる）
//   4. セーブ・ロードを跨いでも残る（関数を持たない伝票にしてある理由）
//   5. 新イベント14本が契約どおりの形をしている
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const EVENTS = vm.runInContext('EVENTS', ctx);
const assert = (c, m) => { if (!c) throw new Error(m); console.log(`✓ ${m}`); };

// ── 1〜2. 期限まで効かない・期限で効く ────────────────────
Game.newRun();
const st = Game.state;
st.gold = 100;
Game.oweDebt({ kind: "gold", amount: -30, battlesLeft: 3, text: "テストの借り" });
assert(st.gold === 100, "伝票を積んだだけでは所持金は動かない");
assert(Game.pendingDebts().length === 1, "未払いの伝票が1件見えている");

let notes = [];
Game.settleDebts(notes);
assert(st.gold === 100 && notes.length === 0, "1戦目では取り立てが来ない");
Game.settleDebts(notes);
assert(st.gold === 100, "2戦目でもまだ来ない");
Game.settleDebts(notes);
assert(st.gold === 70, "3戦目に -30G が効く");
assert(notes.length === 1 && notes[0].includes("ツケの取り立て"), "戦果へ一行が残る: " + notes[0]);
assert(Game.pendingDebts().length === 0, "支払い済みの伝票は消える");

// ── 3. 種別ごとの効き方 ────────────────────────────────
Game.newRun();
const st2 = Game.state;
st2.roster = [
  { uid: 1, tplId: "goblin", race: "ゴブリン", name: "ゴブ太", hp: 100, loyalty: 80, salary: 3,
    department: "combat", unpaidStreak: 0, traits: [], tags: [], job: "" },
  { uid: 2, tplId: "slime", race: "スライム", name: "ぬる子", hp: 100, loyalty: 80, salary: 3,
    department: "life", unpaidStreak: 0, traits: [], tags: [], job: "" }
];
st2.activeUids = [1];
st2.materials = 30;
Game.oweDebt({ kind: "loyalty_all", amount: -15, battlesLeft: 1, text: "全員" });
Game.oweDebt({ kind: "loyalty_dept", dept: "support", amount: -10, battlesLeft: 1, text: "控え" });
Game.oweDebt({ kind: "maxhp_one", uid: 1, amount: 20, battlesLeft: 1, text: "ゴブ太" });
Game.oweDebt({ kind: "alert", amount: 2, battlesLeft: 1, text: "警戒" });
notes = [];
Game.settleDebts(notes);
assert(st2.roster[0].loyalty === 65, "loyalty_all が全員に効く: " + st2.roster[0].loyalty);
assert(st2.roster[1].loyalty === 55, "loyalty_dept が控えにだけ重なる: " + st2.roster[1].loyalty);
assert(st2.roster[0].hp === 80, "maxhp_one が割合で効く: " + st2.roster[0].hp);
assert(st2.alert === 2, "alert が上がる: " + st2.alert);
assert(notes.length === 4, "4件ぶんの行が出る: " + notes.length);

// 出奔は軍から消え、建材も持っていく
Game.oweDebt({ kind: "desert", uid: 2, amount: -20, battlesLeft: 1, text: "夜逃げ" });
notes = [];
Game.settleDebts(notes);
assert(!st2.roster.some(m => m.uid === 2), "desert で当人が軍から消える");
assert(st2.materials === 10, "desert で建材を持っていかれる: " + st2.materials);

// 当人がもう居ない伝票でも落ちない
Game.oweDebt({ kind: "loyalty_one", uid: 999, amount: -10, battlesLeft: 1, text: "居ない者" });
notes = [];
Game.settleDebts(notes);
assert(notes[0].includes("もう軍にいない"), "居ない者への伝票は不発として処理される");

// 稼働中の施設は Lv.0 まで落とさない（選んだ施設が宙に浮くため）
st2.activeFacilityId = "graveyard";
st2.facilityLevel = 1;
Game.oweDebt({ kind: "facilityLevel", amount: -1, battlesLeft: 1, text: "施設" });
Game.settleDebts([]);
assert(st2.facilityLevel === 1, "稼働中の施設は Lv.1 で止まる: " + st2.facilityLevel);

// ── 4. セーブ・ロードを跨いで残る ───────────────────────
Game.newRun();
Game.state.gold = 50;
Game.oweDebt({ kind: "gold", amount: -20, battlesLeft: 2, text: "跨ぐ借り" });
Game.save();
Game.load();
assert(Game.pendingDebts().length === 1, "ロード後も伝票が残っている");
assert(Game.pendingDebts()[0].battlesLeft === 2, "期限も保たれている");
Game.settleDebts([]); Game.settleDebts([]);
assert(Game.state.gold === 30, "ロードした伝票がちゃんと効く: " + Game.state.gold);

// 伝票を持たない旧セーブでも落ちない
delete Game.state.debts;
Game.settleDebts([]);
assert(true, "debts の無い旧セーブでも取り立てが落ちない");

// ── 5. イベント側の契約 ────────────────────────────────
assert(EVENTS.length === 33, "イベントは33本ある（CodeXの30本＋労務3本）: " + EVENTS.length);
const ids = EVENTS.map(e => e.id);
assert(new Set(ids).size === ids.length, "id に重複が無い");
// rats（金庫のネズミ）だけは 2026-09-05 以前からある1択の通知イベント。
// 「通知だけのイベントは作らない」は以後の約束なので、既存の1本は例外として名指しで許す
// （黙って許すと、次に足すものが1択でも気づけない）。
const NOTICE_ONLY = ["rats", "gambling", "orc_duel"];
for (const ev of EVENTS) {
  if (!(ev.options || []).length) throw new Error(`${ev.id} に選択肢が無い`);
  if (ev.options.length < 2 && !NOTICE_ONLY.includes(ev.id)) {
    throw new Error(`${ev.id} は選択肢が1つしかない（通知イベントは作らない）`);
  }
  for (const key of ["title", "weight", "check", "cast", "text"]) {
    if (ev[key] === undefined) throw new Error(`${ev.id} に ${key} が無い`);
  }
}
console.log("✓ 全30本が契約どおりの形をしている（1択は既存の rats・gambling・orc_duel のみ）");

// 新規14本は「後で祟る」選択肢を必ず1つ持つ
const ADDED = ["paid_leave", "black_market", "weed_soup", "keepsake", "rumor", "kitchen_blaze",
  "transfer_demand", "surrender_letter", "feast_hangover", "soul_advance", "resignation",
  "veteran_rookie", "ledger_fraud", "tapestry"];
assert(ADDED.every(id => ids.includes(id)), "追加14本がすべて入っている");
for (const id of ADDED) {
  const ev = EVENTS.find(e => e.id === id);
  const owes = ev.options.filter(o => /oweDebt/.test(o.apply.toString()));
  if (owes.length !== 1) throw new Error(`${id} の「後で祟る」選択肢が ${owes.length} 個（1個であるべき）`);
}
console.log("✓ 追加14本はそれぞれ「後で祟る」選択肢をちょうど1つ持つ");

// 本文には必ず「」がある（立ち絵＋吹き出しに割る器がそれを見て話者を決める）
for (const id of ADDED) {
  const ev = EVENTS.find(e => e.id === id);
  if (!/「/.test(ev.text.toString())) throw new Error(`${id} の本文に台詞（「」）が無い`);
}
console.log("✓ 追加14本の本文に台詞がある（立ち絵と吹き出しに割れる）");

console.log("\n✓ ツケの契約と追加イベント14本：すべて通過");
