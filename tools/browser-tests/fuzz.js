// 通し試遊（ランダム指示）。run-all には入れない（長い）。手で回す：
//   CHROME=... GAME="$(pwd)" RUNS=2 STEPS=1500 node tools/browser-tests/fuzz.js
// 見るもの：errors 0・stalls 0。技・狙い・まもる・退く・慰留・採用をランダムに押し、JSエラーと停滞を探す。
// 通し試遊（ランダム指示）。技・狙い・まもる・退く・慰留・採用をランダムに押し、JSエラー／停滞／状態の矛盾を探す。
const { chromium } = require('playwright');
const { autoDismissMormo } = require('./helpers.js');
const RUNS = Number(process.env.RUNS || 3), STEPS = Number(process.env.STEPS || 160);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME });
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.evaluate(() => localStorage.clear()); await page.reload();
  const click = async sel => { const l = page.locator(sel).first(); if (await l.count()) { await l.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(30); return true; } return false; };
  const stats = { battles: 0, skills: 0, guards: 0, retreats: 0, retains: 0, stalls: 0, phases: {} };
  for (let run = 1; run <= RUNS; run++) {
    await click('.slot-card [data-action="new"]') || await click('[data-action="new"]'); await page.evaluate(() => { BattleScene.speed = 4; BattleScene.saveSpeed(); });
    let last = '', same = 0;
    for (let step = 0; step < STEPS; step++) {
      const sig = await page.evaluate(() => (Game.state && Game.state.phase) + ':' + document.body.innerText.length);
      if (sig === last) { same++; if (same > 30) { stats.stalls++; console.log('  stall at', sig, 'step', step); break; } } else same = 0;
      last = sig;
      const phase = await page.evaluate(() => Game.state && Game.state.phase);
      stats.phases[phase] = (stats.phases[phase] || 0) + 1;
      // 指示窓
      if (await page.evaluate(() => { const p = document.getElementById('command-panel'); return p && !p.hidden; })) {
        const r = Math.random();
        if (r < 0.08 && await click('[data-cmdall="retreat"]')) { stats.retreats++; continue; }
        if (r < 0.15 && await click('[data-cmdall="attack"]')) continue;
        const mode = await page.evaluate(() => document.getElementById('command-panel').dataset.mode);
        if (mode === 'target') {
          const picks = await page.evaluate(() => [...document.querySelectorAll('#scene .bu.cmd-pick')].map(e => e.id));
          if (picks.length && Math.random() < 0.7) { await page.evaluate(id => document.getElementById(id).click(), picks[Math.floor(Math.random() * picks.length)]); }
          else await click('[data-pick=""]');
          await page.waitForTimeout(30); continue;
        }
        const btns = await page.evaluate(() => [...document.querySelectorAll('#command-panel .cmd-btn[data-cmd]:not([disabled])')].map(e => e.dataset.cmd + '|' + (e.dataset.skill || '')));
        if (!btns.length) { stats.stalls++; console.log('  no buttons in panel'); break; }
        const pick = btns[Math.floor(Math.random() * btns.length)];
        const [cmd, skill] = pick.split('|');
        if (cmd === 'skill') stats.skills++; if (cmd === 'guard') stats.guards++;
        await page.evaluate(([cmd, skill]) => { const b = [...document.querySelectorAll('#command-panel .cmd-btn[data-cmd]')].find(e => e.dataset.cmd === cmd && (e.dataset.skill || '') === skill); if (b) b.click(); }, [cmd, skill]);
        await page.waitForTimeout(30); continue;
      }
      if (await page.evaluate(() => (Game.state.phase === 'battle') && !BattleScene.finished)) { await page.waitForTimeout(200); continue; }
      if (await page.evaluate(() => Game.state.phase === 'battle' && BattleScene.finished && document.querySelector('#next-btn') && getComputedStyle(document.querySelector('#next-btn')).display === 'none')) { await page.waitForTimeout(200); continue; }
      if (await click('[data-action="concede"]')) continue;
      if (await click('[data-action="eventpick"]')) continue;
      if (await click('[data-action="eventdone"]')) continue;
      if (await click('[data-action="afterresult"]')) continue;
      if (await click('[data-action="afterbattle"]')) { stats.battles++; continue; }
      if (await click('[data-action="choosefacility"]')) continue;
      if (await page.locator('.banner').count() && !(await page.locator('[data-action="nextrecruit"], [data-action="afterresult"]').count())) break;
      // 慰留できるならたまに
      if (Math.random() < 0.3 && await page.locator('[data-action="retain"]:not([disabled])').count()) { await click('[data-action="retain"]'); stats.retains++; continue; }
      if (await page.locator('[data-action="skip"]').count() && await page.evaluate(() => Game.state.hiresLeft <= 0)) { await click('[data-action="skip"]'); continue; }
      if (await click('[data-action="hire"]:not([disabled])')) continue;
      if (await page.locator('[data-action="hire"][disabled]').count() && await click('[data-action="fire"]')) continue;
      if (await page.locator('[data-action="deploy"]:not([disabled])').count()) { await click('[data-action="deploy"]'); await page.waitForTimeout(200); continue; }
      if (await page.locator('[data-action="missionpick"]').count()) { const n = await page.locator('[data-action="missionpick"]').count(); await page.locator('[data-action="missionpick"]').nth(Math.floor(Math.random() * n)).click(); await page.waitForTimeout(40); continue; }
      if (await click('[data-action="skip"]')) continue;
      if (await click('[data-action="closemember"]')) continue;
      stats.stalls++; console.log('  nothing to click at phase', phase, (await page.evaluate(() => document.body.innerText.slice(0, 200))).replace(/\n/g, ' ')); break;
    }
    console.log(`run ${run}: turn ${await page.evaluate(() => Game.state && Game.state.turn)} conquest ${await page.evaluate(() => Game.state && Game.state.conquest)} roster ${await page.evaluate(() => Game.state && Game.state.roster.length)}`);
    await page.evaluate(() => { try { Game.endRun && null; } catch (e) {} });
    await page.goto('file://' + process.env.GAME + '/index.html'); await page.evaluate(() => localStorage.clear()); await page.reload();
  }
  console.log('stats', JSON.stringify(stats));
  console.log('errors', errs.length, errs.slice(0, 8));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
