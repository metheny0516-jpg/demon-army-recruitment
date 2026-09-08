// 勝利ファンファーレが「実際に音として出ているか」を master 出力の実測で見る。
//
// 落とし穴（引き継ぎメモ 3-7）: Sound.cue を差し替えて「呼ばれた」だけを見るテストは、
// 実機の無音を見逃す。実際に一度これで見逃した。ここでは AnalyserNode を
// Sound.master と destination の間へ挟み、鳴っている波形そのものを測る。
//
// 見る性質は2つ:
//   1. 決着のあとに勝利音が鳴り、直前の打撃WAVに埋もれない大きさで鳴ること
//   2. 決着表示のあとに「▶▶ 最後まで飛ばす」を押しても勝利音が消えないこと
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');

// 実録の打撃WAVは Audio 要素で Sound.volume * 0.9 まで出る（master を通らない）。
// 合成の勝利音がこれと同じ土俵に無いと、勝ち確の連打の直後には聞こえない。
const SAMPLE_PEAK = 0.9;          // 打撃WAVの実効ピーク（Sound.volume比）
const FLOOR = SAMPLE_PEAK / 4;    // 打撃から12dB以内には居ること
const CEIL = 1.0;                 // 合算で歪ませないこと

const errs = [];
const ok = (c, m) => { if (!c) errs.push(m); console.log((c ? '  ✓ ' : '  ✗ ') + m); };

// Sound.master の直後で振幅を測り続ける
async function tapMaster(page) {
  await page.evaluate(() => {
    Sound.unlock();
    const ctx = Sound.ctx, an = ctx.createAnalyser();
    an.fftSize = 2048;
    Sound.master.disconnect();
    Sound.master.connect(an);
    an.connect(ctx.destination);
    window.__peaks = [];
    const buf = new Float32Array(an.fftSize);
    window.__tap = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      window.__peaks.push([ctx.currentTime, peak]);
    }, 25);
  });
}

// t0 以降 seconds 秒の実測ピーク（Sound.volume で割った「素の大きさ」で返す）
async function peakSince(page, t0, seconds) {
  return page.evaluate(([t0, seconds]) => {
    const inWindow = window.__peaks.filter(([t]) => t >= t0 && t <= t0 + seconds);
    return inWindow.reduce((m, [, p]) => Math.max(m, p), 0) / Math.max(0.01, Sound.volume);
  }, [t0, seconds]);
}

async function toBattle(page) {
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);
  await tapMaster(page);
  await page.evaluate(() => {
    // 必ず勝つ編成にする。見たいのは勝敗ではなく決着後の音
    Game.state.roster = [
      { uid: 901, tplId: 'goblin', name: 'ゴブ太', race: 'ゴブリン', job: '', hp: 200, atk: 40, def: 20, spd: 9,
        salary: 2, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false },
      { uid: 902, tplId: 'ogre', name: 'オグ', race: 'オーガ', job: '', hp: 200, atk: 40, def: 20, spd: 8,
        salary: 2, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false }
    ];
    Game.state.activeUids = Game.state.roster.map(m => m.uid);
    Game.state.stage = 1; Game.state.gold = 50; Game.state.phase = 'formation';
    App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.evaluate(() => { BattleScene.speed = 4; });
  await page.waitForFunction(() => !!document.querySelector('.scene-result.win'), null, { timeout: 180000 });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  try {
    // ── 1. 通常どおり見届けたとき ────────────────────────────
    console.log('▼ 決着のあと、勝利音が打撃に埋もれない大きさで鳴る');
    let page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    await toBattle(page);
    let t0 = await page.evaluate(() => Sound.ctx.currentTime);
    await page.waitForTimeout(3800);
    let peak = await peakSince(page, t0, 3.4);
    ok(peak >= FLOOR, `勝利音の実測ピーク ${peak.toFixed(3)} が打撃WAV基準 ${FLOOR.toFixed(3)} 以上`);
    ok(peak <= CEIL, `勝利音の実測ピーク ${peak.toFixed(3)} が ${CEIL} を超えず歪まない`);
    await page.close();

    // ── 2. 決着表示のあとに「最後まで飛ばす」を押したとき ──────
    console.log('▼ 決着表示のあとに飛ばしても勝利音を自分で切らない');
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    await toBattle(page);
    t0 = await page.evaluate(() => Sound.ctx.currentTime);
    await page.waitForTimeout(400);
    await page.click('[data-action="skiplog"]');
    await page.waitForTimeout(3400);
    peak = await peakSince(page, t0, 3.4);
    ok(peak >= FLOOR, `飛ばしたあとも勝利音の実測ピーク ${peak.toFixed(3)} が ${FLOOR.toFixed(3)} 以上`);
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(errs.length ? '✗ ' + errs.join('\n✗ ') : '✓ 勝利ファンファーレが実際に鳴る（通常・飛ばす）');
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
