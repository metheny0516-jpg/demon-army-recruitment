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
    assert.equal(result.count, 126);
    assert.equal(result.unknown, null);
    assert.ok(result.mapped.every(u => u.id), JSON.stringify(result.mapped.filter(u => !u.id)));
    assert.deepEqual([...new Set(result.mapped.map(u => u.id))].sort(), ['swordsman','archer','shield','slinger','axeman','cavalry','commander','cleric','sage','hero'].sort());
    console.log(`✓ art coverage: ${enemies.length} enemy entries including variants, 10 roles, all 126 pose images loaded at 512px`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
