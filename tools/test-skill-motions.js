const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let reduced = false, now = 0, sequence = 0;
const timers = new Map();
const ctx = vm.createContext({
  matchMedia: () => ({matches: reduced}),
  setTimeout(fn, delay) { const id = ++sequence; timers.set(id, {fn, at: now + delay}); return id; },
  clearTimeout(id) { timers.delete(id); }
});
vm.runInContext(fs.readFileSync('src/ui/battle_scene.js', 'utf8') + '\nglobalThis.scene = BattleScene;', ctx);
const b = ctx.scene;
const flush = () => { while (timers.size) { const [id, t] = [...timers].sort((a,c) => a[1].at-c[1].at)[0]; timers.delete(id); now=t.at; t.fn(); } };
const records = [];
const unit = (side, x) => ({side, tplId:'ogre', actor:{getBoundingClientRect:()=>({x,y:100,width:50,height:70})}, el:{classList:{contains:()=>false,remove(){}}}});
const from = unit('player', 20), to = unit('enemy', 220);
Object.assign(b, {speed:1,eventScale:1, attackKind:()=> 'melee', setPose(){},
  animateActor(u, frames, duration){records.push({kind:'move',u,frames,duration});},
  motionFx(kind){records.push({kind});}, unitVfx(){}, hit(){records.push({kind:'hit'});}, shake(){},
  setHp(u,hp){u.hp=hp;records.push({kind:'hp',hp});},
  projectileMotion(){records.push({kind:'projectile'});return ()=>{};}
});
const event = skillId => ({type:'attack',fromId:'p0',toId:'e0',skillId,dmg:20,hp:80,maxHp:100,emphasis:1});
b.attackMotion(from,to,event());
assert.equal(to.hp,undefined,'接触前にHPを減らさない');
const normal=records.find(r=>r.kind==='move' && r.u===from);
assert.equal(normal.duration,660);
assert.ok(normal.frames.some(f=>f.transform==='translate(24px,0px)'));
assert.ok(!normal.frames.some(f=>f.transform.includes('162.5')),'通常攻撃は敵まで走らない');
flush(); assert.equal(to.hp,80); assert.equal(b.pendingHits.size,0);
for (const [id, spec] of Object.entries(b.SKILL_MOTIONS)) {
  records.length=0;
  b.attackMotion(from,to,event(id));
  const move=records.find(r=>r.kind==='move' && r.u===from);
  assert.equal(move.duration,spec.ms,id);
  assert.equal(move.frames.at(-1).transform,'translate(0px,0px)',id+': 必ず原点へ');
  flush();
  assert.equal(records.filter(r=>r.kind==='hit').length,1,id+': ダメージ表示は一度');
  assert.ok(records.some(r=>r.kind===spec.effect),id+': 専用着弾');
}
records.length=0;
b.attackMotion(from,to,event('mage_fireball'));
b.attackMotion(from,unit('enemy',280),event('mage_fireball'),true);
flush();
assert.equal(records.filter(r=>r.kind==='move' && r.u===from).length,1,'全体火球の詠唱は一度');
assert.equal(records.filter(r=>r.kind==='projectile').length,1,'全体火球の弾は一つ');
assert.equal(records.filter(r=>r.kind==='hit').length,2,'各対象へ着弾');
records.length=0;
b.performSkillMotion(from,null,{skillId:'ogre_smash',skillMiss:true},1070);flush();
assert.equal(records.filter(r=>['hit','hp','vertical'].includes(r.kind)).length,0,'空振りはHP・命中演出なし');
for (const speed of [2,4]) {
  records.length=0;b.speed=speed;b.attackMotion(from,to,event('mino_rush'));
  assert.equal(records.find(r=>r.kind==='move'&&r.u===from).duration,880/speed);flush();
}
reduced=true; records.length=0;
b.attackMotion(from,to,event('knight_ittou'));
assert.equal(to.hp,80);assert.ok(!records.some(r=>r.kind==='darkness'),'低モーションは暗転なし');flush();
console.log('skill motions: normal / five skills / contact / AoE / miss / speed / reduced passed');
