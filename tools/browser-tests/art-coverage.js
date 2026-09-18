const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
(async () => {
  const stages = vm.runInNewContext(fs.readFileSync(path.join(process.env.GAME, 'src/data/enemies.js'), 'utf8') + '\nENEMY_STAGES');
  const enemies = stages.flatMap(s => [...s.units, ...(s.variants || []).flatMap(v => v.units)]);
  const browser = await chromium.launch({executablePath: process.env.CHROME});
  try {
    const page = await browser.newPage();
    await page.goto('file://' + process.env.GAME + '/battle-preview.html');
    const result = await page.evaluate(async enemies => {
      const mapped = enemies.map(u => ({name:u.name, id:BattleScene.artId({...u, side:'enemy'})}));
      const assets = Object.entries(BattleScene.BATTLE_SPRITES).flatMap(([id, poses]) => [...poses].map(p => `${id}/${p}`));
      const failed = (await Promise.all(assets.map(asset => new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth === 512 && img.naturalHeight === 512 ? null : asset);
        img.onerror = () => resolve(asset);
        img.src = BattleScene.UNIT_DIR + asset + '.webp';
      })))).filter(Boolean);
      return {mapped, failed, count:assets.length, unknown:BattleScene.artId({side:'enemy',icon:'?'}) || null};
    }, enemies);
    assert.deepEqual(result.failed, []);
    assert.equal(result.count, 246);   // 35種×6ポーズ＋採用18種×2（ready/guard、2026-09-15）
    assert.equal(result.unknown, null);

    // 指示待ち／指示確定の10コマ（.codex/skills/battle-spin-9frame/SKILL.md）。
    // 0〜7＝1周ぶんの方向、8＝指示をくれの決めポーズ、9＝指示を受けた戦闘準備姿勢。
    const spin = await page.evaluate(async () => {
      const species = [...BattleScene.READY_SPIN_SPRITES];
      const frames = species.flatMap(id => Array.from({ length: 10 }, (_, f) => `${id}/ready-spin/${f}`));
      const bad = (await Promise.all(frames.map(path => new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth === 512 && img.naturalHeight === 512 ? null : `${path} (${img.naturalWidth}x${img.naturalHeight})`);
        img.onerror = () => resolve(path);
        img.src = BattleScene.UNIT_DIR + path + '.webp';
      })))).filter(Boolean);
      return { species, count: frames.length, bad,
        confirm: [...BattleScene.CONFIRM_SPIN_SPRITES] };
    });
    assert.deepEqual(spin.bad, [], '読めない回転コマ: ' + spin.bad.join('、'));
    assert.equal(spin.count, 110, '11種×10コマ');
    assert.deepEqual(spin.confirm.sort(), spin.species.sort(),
      '確定後回転は、指示待ち回転と同じ顔ぶれ（10コマ揃った種族）に限る');
    console.log(`✓ ready-spin: ${spin.species.length} species × 10 frames = ${spin.count} images at 512px`);
    assert.ok(result.mapped.every(u => u.id), JSON.stringify(result.mapped.filter(u => !u.id)));
    assert.deepEqual([...new Set(result.mapped.map(u => u.id))].sort(), ['swordsman','archer','shield','slinger','axeman','cavalry','commander','cleric','sage','hero'].sort());
    console.log(`✓ art coverage: ${enemies.length} enemy entries including variants, 10 roles, all 246 pose images loaded at 512px`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
