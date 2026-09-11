// セーブスロット3つと書き出し／読み込み。
//   node tools/test-save-slots.js
// 「リロードで消える」の答えは storage.js 冒頭の切り分けメモを見ること。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
// テストの localStorage は自前の辞書。鍵が増えても getItem/setItem/removeItem だけで動くこと。
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const Storage = vm.runInContext('Storage', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);
const wipeStore = () => { for (const k of Object.keys(store)) delete store[k]; };

// ── 1. 鍵の形とスロットの選択 ──────────────────────
{
  wipeStore();
  assert(Storage.SLOTS === 3, `スロットは3つ（${Storage.SLOTS}）`);
  assert(Storage.activeSlot() === 1, '既定は1');
  assert(Storage.slotKey(2) === 'maou_save_2', `鍵の形（${Storage.slotKey(2)}）`);
  Storage.selectSlot(3);
  assert(Storage.activeSlot() === 3, 'selectSlot で切り替わる');
  Storage.selectSlot(0); assert(Storage.activeSlot() === 3, '0 は無視');
  Storage.selectSlot(4); assert(Storage.activeSlot() === 3, '4 は無視');
  Storage.selectSlot('abc'); assert(Storage.activeSlot() === 3, '文字列は無視');
  Storage.selectSlot('2'); assert(Storage.activeSlot() === 2, '"2" のような文字列は受ける（dataset は文字列）');
}

// ── 2. 3スロットに別々のランを保存して、それぞれ読める ──────
{
  wipeStore();
  const names = {};
  for (const slot of [1, 2, 3]) {
    Game.newRun('standard', slot);
    Game.state.turn = slot * 10;
    Game.save();
    names[slot] = Game.state.turn;
  }
  assert(Object.keys(store).filter(k => /^maou_save_\d$/.test(k)).length === 3,
    `鍵が3つ（${Object.keys(store).filter(k => /^maou_save_/.test(k)).join(",")}）`);
  for (const slot of [1, 2, 3]) {
    assert(Game.load(slot) && Game.state.turn === names[slot],
      `スロット${slot}を読める（turn=${Game.state.turn}）`);
  }
  assert(Storage.activeSlot() === 3, '最後に読んだスロットが選ばれたまま');
}

// ── 3. 札の中身（slotMeta）は保存本体から導く ────────────
{
  wipeStore();
  const metas0 = Storage.slotMetas();
  assert(metas0.length === 3 && metas0.every(m => m.empty), '何も無ければ3枚とも空き');
  assert(Storage.hasAnySave() === false, '保存が無ければ hasAnySave は false');
  Game.newRun('standard', 2);
  Game.state.turn = 7; Game.state.conquest = 3; Game.state.act = 2;
  Game.save();
  const m = Storage.slotMeta(2);
  assert(!m.empty && m.turn === 7 && m.conquest === 3 && m.act === 2 && m.generation === 1,
    `札に進み具合が出る（第${m.act}幕 作戦${m.turn} 攻略${m.conquest}）`);
  assert(m.rosterCount === Game.state.roster.length, `軍団の人数（${m.rosterCount}）`);
  assert(typeof m.savedAt === 'number' && m.savedAt > 0, `最終保存の時刻が入る（${m.savedAt}）`);
  assert(!!m.kingName, `魔王名が引ける（${m.kingName}）`);
  assert(Storage.slotMeta(1).empty && Storage.slotMeta(3).empty, '他の札は空きのまま');
  assert(Storage.hasAnySave() === true, '1つでもあれば hasAnySave は true');
}

// ── 4. 旧セーブ（maou_save）はスロット1へ移る ──────────
{
  wipeStore();
  Game.newRun('standard');
  Game.state.turn = 42;
  const legacy = JSON.stringify(Game.state);
  wipeStore();
  store['maou_save'] = legacy;
  const loaded = Storage.loadRun(1);
  assert(loaded && loaded.turn === 42, `旧セーブが1で読める（turn=${loaded && loaded.turn}）`);
  assert(store['maou_save_1'] === legacy, '中身がそのまま1へ移っている');
  assert(!('maou_save' in store), '旧い鍵は消える');
}
{
  // 1に既に中身があれば旧セーブで上書きしない（消すだけ）
  wipeStore();
  store['maou_save_1'] = '{"phase":"recruit","turn":1}';
  store['maou_save'] = '{"phase":"recruit","turn":99}';
  const loaded = Storage.loadRun(1);
  assert(loaded.turn === 1, `1の中身は守られる（turn=${loaded.turn}）`);
  assert(!('maou_save' in store), '旧い鍵は消える');
}

// ── 5. 書き出し → 別スロットへ読み込むと同じ状態 ────────
{
  wipeStore();
  Game.newRun('standard', 1);
  Game.state.turn = 12; Game.state.gold = 345;
  Game.save();
  const text = Storage.exportRun(1);
  assert(typeof text === 'string' && text.length > 100, `書き出せる（${text.length}文字）`);
  assert(Game.importRun(3, text) === true, 'スロット3へ読み込める');
  // 読み込みは migrateState を通すので、比べるときは元の側も同じように通す
  // （newRun の初期値と migrateState の既定値は別物なのが元からの仕様）。
  Game.load(1); const a = JSON.parse(JSON.stringify(Game.state));
  Game.load(3); const b = JSON.parse(JSON.stringify(Game.state));
  delete a.savedAt; delete b.savedAt;
  assert(JSON.stringify(a) === JSON.stringify(b), 'savedAt を除けば同じ状態');
  assert(Game.load(3) && Game.state.gold === 345, `読み込んだスロットで続けられる（${Game.state.gold}G）`);
}

// ── 6. 壊れた文字列は拒否する ────────────────────
{
  wipeStore();
  store['maou_save_2'] = '{"phase":"recruit","turn":5}';
  for (const bad of ['', 'こわれてる', '{', '[1,2,3]', 'null', '123', '{"turn":3}']) {
    assert(Game.importRun(2, bad) === false, `拒否：${JSON.stringify(bad).slice(0, 20)}`);
  }
  assert(JSON.parse(store['maou_save_2']).turn === 5, '拒否したときは元の保存を壊さない');
}

// ── 7. endRun は選んでいるスロットだけ消す ───────────
{
  wipeStore();
  Game.newRun('standard', 1); Game.state.turn = 5; Game.save();
  Game.newRun('standard', 2); Game.state.turn = 6; Game.save();
  Game.state.phase = 'clear';
  Game.endRun(true);
  assert(Storage.slotMeta(2).empty, '終わったスロットは空く');
  assert(!Storage.slotMeta(1).empty && Storage.slotMeta(1).turn === 5, 'もう一方は残る');
  assert(Storage.loadHistory().length === 1, '魔界史はスロットの外に1件');
}

// ── 8. 保存は選んでいるスロットへ入り続ける ────────────
{
  wipeStore();
  Game.newRun('standard', 3);
  for (let i = 0; i < 3; i++) { Game.state.turn = i; Game.save(); }
  assert(Storage.slotMeta(3).turn === 2, `選んでいるスロットが更新される（${Storage.slotMeta(3).turn}）`);
  assert(Storage.slotMeta(1).empty && Storage.slotMeta(2).empty, '他のスロットは触られない');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
