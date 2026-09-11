// 勝利ファンファーレが録音素材として再生され、終了後にBGMが戻ることを見る。
//
// 落とし穴（引き継ぎメモ 3-7）: Sound.cue を差し替えて「呼ばれた」だけを見るテストは、
// 実機の無音を見逃す。実際に一度これで見逃した。ここでは AnalyserNode を
// Sound.master と destination の間へ挟み、鳴っている波形そのものを測る。
//
// 見る性質は3つ:
//   1. 決着のあとに録音WAVが実際に再生され、共通音量へ追従すること
//   2. 「▶▶ 最後まで飛ばす」でも鳴り切るまでBGMを戻さないこと
//   3. WAVの読み込み失敗時だけ従来の合成音へ戻ること
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');

const FALLBACK_FLOOR = 0.2;

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
  // コマンドバトルは指示待ちで止まるので、この検査は「以後もおまかせ」で自動に回す
  await page.evaluate(() => { BattleScene.saveAutoBattle(true); });
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
    console.log('▼ 決着のあと、録音された勝利音が共通音量で鳴る');
    let page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    await toBattle(page);
    await page.waitForFunction(() => [...Sound.media].some(a => a.src.endsWith('/assets/sfx/recorded/fanfare-win.wav')),
      null, { timeout: 5000 });
    await page.waitForTimeout(150);
    const sample = await page.evaluate(() => {
      const audio = [...Sound.media].find(a => a.src.endsWith('/assets/sfx/recorded/fanfare-win.wav'));
      return audio ? { src: audio.src, paused: audio.paused, currentTime: audio.currentTime,
        volumeRatio: audio.volume / Sound.volume, duration: audio.duration,
        cueLength: Sound.cueLength('win') } : null;
    });
    ok(!!sample && sample.src.endsWith('/assets/sfx/recorded/fanfare-win.wav'), '勝利時に fanfare-win.wav を選ぶ');
    ok(!!sample && !sample.paused && sample.currentTime > 0, '録音WAVの再生位置が実際に進む');
    ok(!!sample && sample.volumeRatio >= .8 && sample.volumeRatio <= .84,
      `共通音量に追従する（比率 ${sample ? sample.volumeRatio.toFixed(2) : 'なし'}）`);
    ok(!!sample && Math.abs(sample.duration - sample.cueLength) <= .02,
      `WAV ${sample ? sample.duration.toFixed(3) : 'なし'}秒と待機 ${sample ? sample.cueLength.toFixed(2) : 'なし'}秒が一致`);
    await page.close();

    // ── 2. 決着表示のあとに「最後まで飛ばす」を押したとき ──────
    console.log('▼ 決着表示のあとに飛ばしても勝利音を自分で切らない');
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    await toBattle(page);
    await page.click('[data-action="skiplog"]');
    // BGMもファンファーレも実素材。重ねず、ファンファーレへ決着の場を渡す。
    // 決着後の「飛ばす」は finish() を即座に走らせるので、ここが待てているかを**押した直後に**見る。
    const during = await page.evaluate(() => ({
      paused: Music.track ? Music.track.paused : true, march: !!Music.timer,
      left: Math.max(0, BattleScene.settleCueUntil - Date.now())
    }));
    ok(during.left > 0, `勝利音はまだ ${during.left}ms 残っている（この間の話をしている）`);
    ok(during.paused && !during.march, '鳴っている最中にBGMを重ねない（曲もマーチも止めたまま）');
    await page.waitForTimeout(during.left + 300);
    const after = await page.evaluate(() => ({
      paused: Music.track ? Music.track.paused : true, scene: Music.desc && Music.desc.scene
    }));
    ok(!after.paused && after.scene === 'victory', '鳴り終わったら勝利BGMへ切り替わる（無音のまま残らない）');
    await page.close();

    // ── 3. ファイルを読めないときだけ従来音へ戻る ────────────
    console.log('▼ 録音WAVの読み込み失敗時は合成音へ戻る');
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/assets/sfx/recorded/fanfare-win.wav', route => route.abort());
    await autoDismissMormo(page);
    await page.goto('file://' + process.env.GAME + '/index.html');
    await page.click('[data-action="new"]');
    await tapMaster(page);
    const t0 = await page.evaluate(() => { const at = Sound.ctx.currentTime; Sound.cue('win'); return at; });
    await page.waitForTimeout(700);
    const fallbackPeak = await peakSince(page, t0, .7);
    ok(fallbackPeak >= FALLBACK_FLOOR,
      `読み込み失敗時の合成音ピーク ${fallbackPeak.toFixed(3)} が ${FALLBACK_FLOOR.toFixed(3)} 以上`);
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(errs.length ? '✗ ' + errs.join('\n✗ ') : '✓ 勝利ファンファーレが鳴る（録音・飛ばす・失敗時フォールバック）');
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
