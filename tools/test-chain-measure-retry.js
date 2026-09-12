// 測定器が「再起で破棄された戦闘」を数えていないことの回帰テスト。
//
// 背景（この不備で測定結果が1度無効になった）:
//   本体は Game.retry() で state ごとチェックポイントへ巻き戻す。record.maxChain も
//   そこで巻き戻り、やり直した戦闘の連鎖は歴史から消える。ところが
//   tools/chain-v2-measure.js は戦闘ごとの最大値を単調加算していたため、
//   測定器だけが破棄された歴史を残していた。
//     再現: CHAIN_SEED_BASE=1000 / ゴブリン統一 11ラン目
//           record.maxChain = 3 に対し 測定器 v1Max = 4
//
// このテストは修正前のコードで**実際に落ちる**。落ちなくなったら、
// 測定器の巻き戻し（saveCheckpoint / retry のフック）が外れたと思ってよい。
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const N = 11;                                   // 再現ケース（11ラン目）を含む最小本数
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chain-measure-')), 'm.json');

execFileSync(process.execPath, [path.join(__dirname, 'chain-v2-measure.js'), String(N), '--json', out],
  { env: { ...process.env, CHAIN_SEED_BASE: '1000', SIM_NO_TOWN: '1' }, stdio: 'pipe' });   // 城下町の税を切る（全滅→再起が起きる前提の測定）

const data = JSON.parse(fs.readFileSync(out, 'utf8'));
const runs = data.runs || [];
const fail = msg => { console.error('✗ ' + msg); process.exitCode = 1; };

if (!runs.length) fail('測定結果が空');

// 1) 全ランで 測定V1最大 === record.maxChain
const mismatched = runs.filter(r => r.v1Max !== r.recordMaxChain);
if (mismatched.length) {
  fail(`測定V1最大 と record.maxChain が食い違うランが ${mismatched.length} 件ある`);
  for (const r of mismatched.slice(0, 5)) {
    console.error(`    ${r.strategy} / seed ${r.seed}: v1Max=${r.v1Max} record.maxChain=${r.recordMaxChain}`
      + ` 再起${r.retriesUsed}回`);
  }
}

// 2) 再起が実際に起きていること。起きていなければ 1) は何も検査していない
const retried = runs.filter(r => (r.retriesUsed || 0) > 0);
if (!retried.length) fail('再起が1件も起きていない。このテストは何も検証できていない');

// 3) 報告された再現ケースそのもの
const goblin = runs.filter(r => r.strategy === 'ゴブリン統一');
const target = goblin[10];
if (!target) fail('ゴブリン統一の11ラン目が無い（戦略名か seed の割り当てが変わった）');
else if (target.v1Max !== target.recordMaxChain) {
  fail(`再現ケース（ゴブリン統一11ラン目 / seed ${target.seed}）が直っていない:`
    + ` v1Max=${target.v1Max} record.maxChain=${target.recordMaxChain}`);
}

if (!process.exitCode) {
  console.log(`✓ chain-v2-measure: 再起で破棄された戦闘を数えていない`
    + `（${runs.length}ラン中 ${retried.length}ランが再起あり／不一致0件）`);
}
