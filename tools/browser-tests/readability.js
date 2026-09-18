// 戦闘中の読みやすさ（2026-09-18 オーナー試遊の指摘4件）。
//  1. 技の台詞は本人の吹き出しで大きく出す
//  2. 上の字幕は状況の説明だけ。台詞は混ぜない。敵の台詞も吹き出し
//  3. 全体技は一撃で全員に当たる（死亡が挟まっても別の一撃に割れない）
//  4. 技は正式名で覚えられる／ダメージの数字が画面からはみ出さない
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await autoDismissMormo(page);
    await page.goto('file://' + process.env.GAME + '/index.html?nostory=1');
    await page.click('[data-action="new"]');
    await page.locator('[data-action="hire"]:not([disabled])').first().click();
    await enterMissionPhase(page);
    await page.evaluate(() => {
      const mk = (uid, tplId, race, skills, rankId) => ({ uid, tplId, name: race, race, job: '', hp: 900, atk: 26, def: 22,
        spd: 9, salary: 2, loyalty: 70, traits: [], skills, tags: [], quote: 'やるぞ', unpaid: false, injured: 0, spirit: 3, rankId });
      Game.state.roster = [mk(941, 'orc', 'オーク将軍', ['general_might'], 'general'),
                           mk(942, 'succubus', 'サキュバス', ['succubus_charm'], null)];
      Game.state.activeUids = [941, 942];
      Game.state.stage = 8; Game.state.gold = 80; Game.state.food = 40; Game.state.phase = 'formation';
      App.render(); BattleScene.speed = 1;
    });
    await page.click('[data-action="deploy"]');
    await page.waitForSelector('#command-panel:not([hidden])', { timeout: 20000 });

    // (4a) 技は正式名で出す。命令形（label）だけでは何の技か覚えられない。
    const button = await page.evaluate(() => (document.querySelector('.cmd-btn[data-cmd="skill"]') || {}).innerText || '');
    assert.ok(/技「魔王の力」/.test(button), `指示ボタンは技の正式名（${button.split('\n')[0]}）`);

    // (2b) 敵の台詞も吹き出しで出す。上の字幕には流さない。
    //      台詞のデータ経路（introQuote → dialogue）は tools/test-enemy-dialogue.js が見ている。
    //      ここで見たいのは「dialogue を受けた描画がどこへ出すか」。
    const enemySpeech = await page.evaluate(() => {
      const enemyId = Object.keys(BattleScene.units).find(id => BattleScene.units[id].side === 'enemy');
      const enemy = BattleScene.units[enemyId];
      const caps = [];
      const rawA = BattleScene.showAction.bind(BattleScene);
      BattleScene.showAction = (t, d) => { caps.push(String(t)); return rawA(t, d); };
      BattleScene.render({ type: 'dialogue', unitId: enemyId, name: enemy.name, side: 'enemy',
        quote: 'ここが最後の一線だ', emphasis: 2 });
      const box = enemy.el.querySelector('.bu-bubble');
      const rect = box ? box.getBoundingClientRect() : null;
      const out = { name: enemy.name, has: !!box, enemyStyle: box ? box.classList.contains('enemy') : false,
        text: box ? box.textContent.trim() : '', caps,
        left: rect ? rect.left : 0, right: rect ? rect.right : 0,
        font: box ? parseFloat(getComputedStyle(box.querySelector('.bu-quote')).fontSize) : 0 };
      BattleScene.showAction = rawA;
      if (box) box.remove();
      return out;
    });
    assert.ok(enemySpeech.has, '敵の台詞も本人の吹き出しに出る：' + JSON.stringify(enemySpeech));
    assert.ok(enemySpeech.name, '話し手の札がある');
    assert.ok(enemySpeech.enemyStyle, '敵の吹き出しは敵側の見た目');
    assert.ok(/ここが最後の一線だ/.test(enemySpeech.text), `台詞が入る（${enemySpeech.text}）`);
    assert.ok(enemySpeech.font >= 14, `敵の台詞も読める大きさ（${enemySpeech.font}px）`);
    assert.deepEqual(enemySpeech.caps, [], '敵の台詞を上の字幕へ流さない');
    assert.ok(enemySpeech.left >= -1 && enemySpeech.right <= 391,
      `敵の吹き出しも画面の中（${Math.round(enemySpeech.left)}..${Math.round(enemySpeech.right)}）`);

    // 出たものを全部記録する（吹き出し・数字・字幕）
    await page.evaluate(() => {
      window.__seen = { bubbles: [], nums: [], caps: [] };
      const rawF = BattleScene.float.bind(BattleScene);
      const rawB = BattleScene.bubble.bind(BattleScene);
      const rawA = BattleScene.showAction.bind(BattleScene);
      BattleScene.float = (u, t, c) => {
        rawF(u, t, c); const n = u.pop.lastChild;
        requestAnimationFrame(() => { const b = n.getBoundingClientRect();
          window.__seen.nums.push({ text: t, left: b.left, right: b.right, at: performance.now() }); });
      };
      BattleScene.bubble = (u, q, s, o) => {
        const box = rawB(u, q, s, o);
        if (box) requestAnimationFrame(() => { const b = box.getBoundingClientRect();
          window.__seen.bubbles.push({ quote: q || '', skill: s || '', side: u.side,
            left: b.left, right: b.right, font: parseFloat(getComputedStyle(box.querySelector('.bu-quote') || box).fontSize) }); });
        return box;
      };
      BattleScene.showAction = (t, d) => { window.__seen.caps.push(String(t)); return rawA(t, d); };
    });

    for (let i = 0; i < 8; i++) {
      if (await page.evaluate(() => document.getElementById('command-panel').hidden)) break;
      await page.evaluate(() => { const p = document.querySelector('[data-pick=""]'); if (p) return p.click();
        const b = document.querySelector('.cmd-btn[data-cmd="skill"]'); if (b && !b.disabled) return b.click();
        document.querySelector('.cmd-btn[data-cmd="attack"]').click(); });
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(9000);
    const seen = await page.evaluate(() => window.__seen);

    // (1) 技の台詞は吹き出しで、読める大きさで出る
    const spoken = seen.bubbles.filter(b => b.quote);
    assert.ok(spoken.length, '技の台詞が吹き出しで出る');
    for (const b of spoken) assert.ok(b.font >= 14,
      `台詞は読める大きさ（${b.font}px：「${b.quote}」）`);

    // (2) 字幕に台詞を混ぜない。混ぜると台詞も説明も小さくなって両方読めない。
    for (const cap of seen.caps) assert.ok(!/[^魔王]「.+」/.test(cap.replace(/^魔王「[^」]*」/, '')),
      `字幕は状況の説明だけ（${cap}）`);

    // (4b) 数字は画面の中に収まる。札は5体並ぶと 70px 台なので、はみ出しやすい。
    for (const n of seen.nums) assert.ok(n.left >= -1 && n.right <= 391,
      `数字が画面の外に出ない（"${n.text}" ${Math.round(n.left)}..${Math.round(n.right)}）`);
    for (const b of seen.bubbles) assert.ok(b.left >= -1 && b.right <= 391,
      `吹き出しが画面の外に出ない（"${b.quote}" ${Math.round(b.left)}..${Math.round(b.right)}）`);

    // (3) 全体技は一撃で全員へ。死亡イベントが挟まっても別の一撃に割れない。
    const aoe = await page.evaluate(() => {
      const tl = BattleScene.timeline || [];
      const heads = [];
      for (const [head, group] of (BattleScene.aoeGroups || new Map()))
        if (group) heads.push({ skill: head.skillId, size: group.length });
      const hits = tl.filter(e => e.aoe && e.skillId === 'general_might').length;
      return { heads, hits };
    });
    if (aoe.hits > 1) {
      assert.ok(aoe.heads.some(h => h.skill === 'general_might' && h.size === aoe.hits),
        `全体技の着弾 ${aoe.hits} 件は1拍にまとまる（まとまり: ${JSON.stringify(aoe.heads)}）`);
    }

    assert.deepEqual(errors, []);
    console.log(`✓ readability: 台詞は吹き出し（味方${spoken.length}件＋敵）・字幕は説明だけ・`
      + `数字と吹き出しは画面内・技は正式名・全体技は一撃（着弾${aoe.hits}件）`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
