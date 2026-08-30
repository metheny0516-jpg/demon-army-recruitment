// MODE=none        画像なし（既定）: 全員が絵文字、404が飛ばないこと
// MODE=present     一覧登録＋ファイルあり: 立ち絵が出ること
// MODE=broken      一覧に載っているのにファイルが無い: 絵文字へ安全に落ちること
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const MODE = process.env.MODE || 'none';
const ok=(c,m)=>{ if(!c) process.exitCode = 1; console.log((c?'  ✓ ':'  ✗ ')+m); };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs=[], notFound=[];
  page.on('pageerror',e=>errs.push(e.message));
  page.on('requestfailed', r => { if (/assets\/monsters/.test(r.url())) notFound.push(r.url().split('/').pop()); });
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.evaluate(() => {
    const mk=(tplId,race)=>({uid:Math.random(),tplId,name:race,race,job:'試験',hp:20,atk:5,def:2,spd:5,
      salary:2,loyalty:50,traits:[],tags:[],quote:'',prevJob:'前職',motive:'志望',flaw:'短所',unpaid:false});
    Game.state.applicants=[mk('goblin','ゴブリン'),mk('ogre','オーガ'),mk('slime','スライム')];
    Game.state.phase='recruit'; App.render();
  });
  await page.waitForTimeout(600);
  const a = await page.evaluate(() => Array.from(document.querySelectorAll('.avatar')).map(el=>({
    img: !!el.querySelector('img'), noimg: el.classList.contains('noimg'), fb: el.dataset.fallback,
    w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height)
  })));
  console.log(`▼ MODE=${MODE}`);
  ok(a.every(x=>x.w===54&&x.h===72), '採用画面は3:4の証明写真の形 (54x72)');
  ok(a[1].noimg && !a[1].img, 'オーガ（一覧に無い）は常に絵文字 ('+a[1].fb+')');

  if (MODE === 'present') {
    ok(a[0].img && a[2].img, 'ゴブリン・スライムは立ち絵が表示される');
    ok(notFound.length===0, '404は発生しない');
  } else if (MODE === 'broken') {
    ok(!a[2].img && a[2].noimg, 'ファイルが無いスライムは絵文字へ安全に落ちる ('+a[2].fb+')');
    const miss = await page.evaluate(()=>Array.from(UI.missingPortraits));
    ok(miss.includes('slime'), '失敗を記憶して以後요求しない: '+JSON.stringify(miss));
  } else {
    ok(!a[0].img && !a[2].img, '一覧が空なので全員が絵文字');
    ok(notFound.length===0, '未登録の種族に対して404を飛ばさない');
  }
  ok(errs.length===0, 'JSエラーなし' + (errs.length?': '+errs.join(', '):''));
  await b.close();
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
