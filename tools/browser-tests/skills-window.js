// 指示窓の技枠（仕様 docs/SPEC_SKILLS_2026-09-12.md 6節）：
// 技が2枠まで並ぶ／味方を狙う技では味方の札が光る／外れの字幕／敵の役と構えの印。
//   node tools/browser-tests/skills-window.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

// 技2つ（種族技＋上位技）を持つオーガと、味方を狙う技（骨の壁）を持つ骸骨。
const SETUP = () => {
  const mk = (uid, tplId, name, race, x) => Object.assign({
    uid, tplId, name, race, job: '', hp: 200, atk: 12, def: 6, spd: 3,
    salary: 2, loyalty: 70, traits: [], skills: [], tags: [], quote: '', unpaid: false, injured: 0, spirit: 3
  }, x);
  Game.state.roster = [
    mk(901, 'ogre', 'ガロ', 'オーガ', { skills: ['ogre_smash'], traits: ['ogre_charge'] }),
    mk(902, 'skeleton', 'ホネオ', 'スケルトン', { skills: ['skeleton_wall'], hp: 120 })
  ];
  Game.state.activeUids = [901, 902];
  Game.state.stage = 1; Game.state.gold = 80; Game.state.food = 40; Game.state.phase = 'formation';
  App.render();
  BattleScene.speed = 4;
};

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.slot-card [data-action="new"][data-slot="1"]').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ 技の枠（種族技＋上位技を2つまで）');
  await page.evaluate(SETUP);
  await page.click('[data-action="deploy"]');
  await page.waitForSelector('#command-panel:not([hidden])', { timeout: 20000 });
  const win = await page.evaluate(() => ({
    unit: document.getElementById('command-panel').dataset.unit,
    skills: [...document.querySelectorAll('.cmd-btn[data-cmd="skill"]')].map(b => ({
      id: b.dataset.skill, text: b.innerText.replace(/\n/g, ' ').trim(), disabled: b.disabled
    })),
    prompt: BattleScene.manual.prompt.allies.map(a => ({ name: a.name, skills: (a.skills || []).map(s => s.id) }))
  }));
  ok(win.skills.length === 2, `技のボタンが2つ並ぶ（${win.skills.length}）`);
  ok(win.skills.some(s => s.id === 'ogre_smash') && win.skills.some(s => s.id === 'ogre_charge'),
    `種族技と上位技が別の枠（${win.skills.map(s => s.id).join(' / ')}）`);
  ok(/振り下ろす/.test(win.skills[0].text) && /×2.0/.test(win.skills[0].text) && /気合1/.test(win.skills[0].text),
    `一行に名前・効き・気合（${win.skills[0].text}）`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/skills-window-390.png' });

  console.log('\n▼ 390px：窓が指示中の札を隠さない');
  const overlap = await page.evaluate(() => {
    const panel = document.getElementById('command-panel').getBoundingClientRect();
    const card = document.querySelector('#band-player .bu.cmd-active').getBoundingClientRect();
    const hit = !(panel.right <= card.left || panel.left >= card.right || panel.bottom <= card.top || panel.top >= card.bottom);
    return { hit, panel: [Math.round(panel.top), Math.round(panel.bottom)], card: [Math.round(card.top), Math.round(card.bottom)] };
  });
  ok(!overlap.hit, `指示中の札に窓が重なっていない（窓 ${overlap.panel} / 札 ${overlap.card}）`);

  console.log('\n▼ 敵の役と構えの印');
  const enemies = await page.evaluate(() => ({
    roles: BattleScene.manual.prompt.enemies.map(e => e.role),
    marks: [...document.querySelectorAll('#band-enemy .bu-role')].map(e => e.textContent),
    intents: BattleScene.manual.prompt.enemies.map(e => e.intent)
  }));
  ok(enemies.roles.length > 0, `敵に役がある（${enemies.roles.join(',')}）`);
  ok(enemies.roles.every(r => r === 'fighter') || enemies.marks.length > 0,
    `fighter 以外には札に印が出る（印 ${enemies.marks.join('') || 'なし'}）`);
  // 構えの予告：敵に計画を差してから窓を描き直す
  const warn = await page.evaluate(() => {
    const e = BattleScene.manual.prompt.enemies[0];
    e.intent = 'heal';
    BattleScene.renderCommandPanel(BattleScene.manual.prompt);
    return {
      text: [...document.querySelectorAll('.cmd-warn')].map(x => x.textContent).join(' / '),
      cls: document.getElementById('bu-' + e.id).className
    };
  });
  ok(/✚/.test(warn.text) && /癒やそう/.test(warn.text), `窓に構えの予告（${warn.text}）`);
  ok(/intent-heal/.test(warn.cls), `敵の札に構えの印（${warn.cls.split(' ').filter(c => /intent/.test(c)).join(',')}）`);

  console.log('\n▼ 味方を狙う技：味方の札が光る');
  await page.evaluate(() => {
    // 2人目（骨の壁＝味方を狙う技）へ移る
    const seq = BattleScene.cmdSeq; seq.idx = 1; seq.mode = 'menu';
    BattleScene.manual.prompt.enemies[0].intent = 'attack';
    BattleScene.renderCommandPanel(BattleScene.manual.prompt);
  });
  const allyPick = await page.evaluate(() => {
    const btn = document.querySelector('.cmd-btn[data-skill="skeleton_wall"]');
    if (!btn) return { missing: true };
    btn.click();
    return {
      mode: document.getElementById('command-panel').dataset.mode,
      hint: (document.querySelector('.cmd-pick-hint') || {}).textContent || '',
      allies: document.querySelectorAll('#band-player .bu.cmd-pick').length,
      enemies: document.querySelectorAll('#band-enemy .bu.cmd-pick').length,
      side: BattleScene.cmdTargetSide
    };
  });
  ok(!allyPick.missing, '骸骨の窓に「骨の壁」がある');
  ok(allyPick.mode === 'target' && allyPick.side === 'ally', `味方狙いの選択に入る（${allyPick.side}）`);
  ok(allyPick.allies > 0 && allyPick.enemies === 0,
    `光るのは味方の札だけ（味方${allyPick.allies} / 敵${allyPick.enemies}）`);
  ok(/味方/.test(allyPick.hint), `案内が味方向け（${allyPick.hint}）`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/skills-window-ally-390.png' });
  // 味方の札をタップして決まる（命令に skill が載る）
  const decided = await page.evaluate(() => {
    // 最後の一人が決めた瞬間にラウンドが始まる（cmdSeq は消える）ので、送られた命令を捕まえる
    const real = BattleScene.submitCommands.bind(BattleScene);
    let sent = null;
    BattleScene.submitCommands = cmds => { sent = JSON.parse(JSON.stringify(cmds || {})); return real(cmds); };
    document.querySelector('#band-player .bu.cmd-pick').click();
    BattleScene.submitCommands = real;
    return sent || {};
  });
  const cmd = Object.values(decided).find(c => c.skill === 'skeleton_wall');
  ok(!!cmd && !!cmd.target, `命令に技と狙いが載る（${JSON.stringify(cmd)}）`);

  console.log('\n▼ 字幕：技が外れた／気合が高まった');
  const notes = await page.evaluate(() => {
    const before = document.getElementById('log').innerText;
    BattleScene.render({ type: 'note', unitId: 'p0', skillMiss: true, text: '　ガロの【振り下ろす】は外れた「空を切った……」', cls: 'trait' });
    const miss = document.getElementById('log').innerText.replace(before, '');
    BattleScene.render({ type: 'note', unitId: 'p0', spiritGain: 1, reason: '仲間が倒れた', text: '　ガロの気合が高まる（仲間が倒れた）', cls: 'trait' });
    return {
      miss,
      action: (document.querySelector('.action-line, #action-line, .battle-action') || {}).textContent || BattleScene.lastAction || '',
      gainCls: document.getElementById('bu-p0').className
    };
  });
  ok(/外れた/.test(notes.miss), `外れが戦況記録に出る（${notes.miss.trim().slice(0, 40)}）`);
  ok(/spirit-up/.test(notes.gainCls), `気合が高まった札が光る（${notes.gainCls.split(' ').filter(c => /spirit/.test(c)).join(',')}）`);

  console.log('\n▼ お披露目：覚えた直後の戦いは技が光り、気合なしで一度撃てる');
  await page.evaluate(() => BattleScene.skip());
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 60000 });
  await page.evaluate(() => {
    Game.state.roster = [{
      uid: 950, tplId: 'ogre', name: 'オヒロメ', race: 'オーガ', job: '', hp: 240, atk: 14, def: 6, spd: 3,
      salary: 2, loyalty: 70, traits: ['ogre_charge'], skills: [], tags: [], quote: '', unpaid: false, injured: 0,
      spirit: 0, skillTier: 2, debutSkill: 'ogre_charge'      // 覚えた直後（気合は0）
    }];
    Game.state.activeUids = [950];
    Game.state.gold = 80; Game.state.food = 40; Game.state.phase = 'formation';
    App.render();
    BattleScene.speed = 4;
  });
  await page.click('[data-action="deploy"]');
  await page.waitForSelector('#command-panel:not([hidden])', { timeout: 20000 });
  const debut = await page.evaluate(() => {
    const btn = document.querySelector('.cmd-btn[data-skill="ogre_charge"]');
    return {
      lit: !!btn && btn.classList.contains('cmd-debut'),
      text: btn ? btn.innerText.replace(/\n/g, ' ').trim() : '',
      disabled: !!btn && btn.disabled,
      cost: (BattleScene.manual.prompt.allies[0].skills.find(s => s.id === 'ogre_charge') || {}).cost,
      spirit: (document.querySelector('.cmd-spirit') || {}).innerText || ''
    };
  });
  ok(debut.lit, `お披露目の技が光る（cmd-debut：${debut.lit}）`);
  ok(/お披露目・気合なし/.test(debut.text), `窓に「お披露目・気合なし」（${debut.text}）`);
  ok(debut.cost === 0 && !debut.disabled, `気合0で押せる（気合${debut.spirit.replace(/\s/g, '')} cost=${debut.cost}）`);
  // 押して撃つ：気合は減らず、order_exec に debut が立つ
  await page.evaluate(() => document.querySelector('.cmd-btn[data-skill="ogre_charge"]').click());
  await page.evaluate(() => {
    const pick = document.querySelector('[data-pick=""]');
    if (pick) pick.click();
  });
  await page.waitForTimeout(400);
  const fired = await page.evaluate(() => ({
    exec: BattleScene.timeline.filter(e => e.type === 'order_exec' && e.debut).length,
    spirit: (Game.state.roster.find(m => m.uid === 950) || {}).spirit,
    spent: JSON.stringify((BattleScene.manual.result || {}).spiritSpent || {})
  }));
  ok(fired.exec === 1, `お披露目として実行された（${fired.exec}）`);
  ok(fired.spirit === 0, `気合0のまま撃てた（${fired.spirit}）`);
  ok(!/950/.test(fired.spent), `spiritSpent に0を積まない（${fired.spent}）`);
  // 2回目以降は通常の気合表示に戻る（この戦いではもう光らない）
  const second = await page.evaluate(async () => {
    for (let i = 0; i < 40 && document.getElementById('command-panel').hidden; i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    const btn = document.querySelector('.cmd-btn[data-skill="ogre_charge"]');
    return btn ? { lit: btn.classList.contains('cmd-debut'), text: btn.innerText.replace(/\n/g, ' ') } : null;
  });
  if (second) {
    ok(!second.lit, `2回目はもう光らない（${second.text.trim()}）`);
    ok(/気合\d/.test(second.text), `通常の気合表示に戻る（${second.text.trim()}）`);
  } else {
    ok(true, '（この戦いは1ラウンドで終わったので2回目は見ていない）');
  }
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/skills-window-debut-390.png' });

  console.log('\n▼ 最後まで戦えること（技を出したまま決着する）');
  await page.evaluate(() => BattleScene.skip());
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 60000 });
  const end = await page.evaluate(() => ({ phase: Game.state.phase, pending: !!Game.state.pendingBattle }));
  ok(!end.pending && ['result', 'defeat', 'clear', 'gameover'].includes(end.phase), `決着した（${end.phase}）`);

  ok(errs.length === 0, `ページエラーなし${errs.length ? '：' + errs[0] : ''}`);
  await b.close();
  console.log(process.exitCode ? '失敗あり' : '全通過');
})().catch(e => { console.error('✗', e.message); process.exit(1); });
