// 魔界史がV1/V2の最大CHAINを混在比較せず、旧記録をV1として扱うことを固定する。
const fs = require('fs'), vm = require('vm');
const ctx = {
  console, document: {}, Game: { state: null },
  MONSTER_TEMPLATES: [], SYNERGIES: [], ACHIEVEMENTS: []
};
vm.createContext(ctx);
for (const file of ['src/data/departments.js', 'src/core/util.js', 'src/core/chain.js', 'src/ui/ui.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}
const UI = vm.runInContext('UI', ctx);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log(`✓ ${msg}`); };
const record = (gen, version) => ({
  gen, chainDefVersion: version, maxChain: version === 2 ? 4 : 6, maxOverkill: 120,
  reignYears: 3, maxPower: 10, finalRoster: [], mainRace: '混成', region: '辺境', cause: '敗北'
});

const old = record(1, undefined), v1 = record(2, 1), v2 = record(3, 2);
assert(UI.chainRecordVersion(old) === 1, '定義バージョン欠落の旧魔界史はV1として扱う');
assert(!UI.hasMixedChainVersions([old, v1]), '旧記録と明示V1だけなら混在扱いしない');
assert(UI.hasMixedChainVersions([old, v2]), 'V1とV2が同じ魔界史にあれば混在を検出する');

const single = UI.recordHighlights(v1, false);
assert(single.includes('<span>最大CHAIN</span>') && !single.includes('旧定義'),
  '単一定義の履歴は従来の主要記録表示を維持する');
const oldLabel = UI.recordHighlights(old, true);
const newLabel = UI.recordHighlights(v2, true);
assert(oldLabel.includes('最大CHAIN（旧定義 V1）'), '混在時は旧記録のCHAINへ旧定義V1を付ける');
assert(newLabel.includes('最大CHAIN（新定義 V2）'), '混在時は新記録のCHAINへ新定義V2を付ける');
assert((oldLabel.match(/record-highlights/g) || []).length === 1
  && (oldLabel.match(/<div><b>/g) || []).length === 2,
  '版表示を足しても主要記録は最大CHAINと最大OVERKILLの2つだけ');

let rendered = '';
UI.set = html => { rendered = html; };
UI.history([old, v2]);
assert(rendered.includes('世代間で直接比較しません'), '混在する魔界史に比較禁止の説明を一度表示する');
assert((rendered.match(/旧定義 V1/g) || []).length === 1
  && (rendered.match(/新定義 V2/g) || []).length === 1,
  '各世代のCHAIN値に対応する定義版を表示する');

rendered = '';
UI.history([old, v1]);
assert(!rendered.includes('世代間で直接比較しません') && !rendered.includes('旧定義 V1'),
  'V1だけの魔界史には不要な注意や版ラベルを増やさない');

console.log('\nOK: 魔界史のCHAIN定義版を分離し、V1/V2を直接比較しない。');
