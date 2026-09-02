// ブラウザ回帰テストの共通ヘルパー。
//
// モルモの全画面報告は**自動で閉じない**（読み終える前に消えないための実装意図）。
// つまり報告が出ている間、下の画面のボタンは覆われていてクリックできない。
// 実プレイでは人が送るので問題にならないが、テストは明示的に送ってやる必要がある。
// 報告そのものの挙動は `mormo.js` が見る。他のテストはここを通して先へ進む。

// 出ている報告を1つ閉じる（1回目の入力＝全文表示、2回目＝閉じる、を人の代わりに行う）
async function dismissMormo(page) {
  if (!await page.locator('#mormo-scene').count()) return false;
  await page.evaluate(() => {
    if (typeof MormoScene === 'undefined' || !MormoScene.active) return;
    if (MormoScene.typing) MormoScene.completeTyping();
    MormoScene.advance();
  });
  await page.waitForTimeout(30);
  return true;
}

// 以後に出るすべての報告を即座に閉じる。報告の中身を見ないテスト用。
// goto の前に呼ぶこと（addInitScript はページ読み込みのたびに走るので、
// resume.js のようなリロードを挟むテストでも効き続ける）。
async function autoDismissMormo(page) {
  await page.addInitScript(() => {
    const patch = () => {
      if (typeof MormoScene === "undefined" || !MormoScene.show || MormoScene.__autoDismiss) {
        return setTimeout(patch, 5);
      }
      MormoScene.__autoDismiss = true;
      const show = MormoScene.show.bind(MormoScene);
      MormoScene.show = function (options) { show(options); this.close(); };
    };
    patch();
  });
}

// 「この時点から先の報告は全部即送り」。報告が出ること自体を先に確かめたいテスト用。
async function silenceMormoFromNow(page) {
  await page.evaluate(() => {
    if (typeof MormoScene === "undefined" || MormoScene.__autoDismiss) return;
    MormoScene.__autoDismiss = true;
    const show = MormoScene.show.bind(MormoScene);
    MormoScene.show = function (options) { show(options); this.close(); };
    MormoScene.close();
  });
  await page.waitForTimeout(30);
}

// 3日間の開幕プロトタイプを終わらせ、通常ループ（作戦会議）へ入る。
// 開幕の日次進行そのものは daily.js が見る。ここを通るのは「作戦会議から先」を
// 見たいテストで、開幕の3日を毎回遊ばせるとテストが何を見ているのか分からなくなるため。
async function enterMissionPhase(page) {
  await page.evaluate(() => {
    const st = Game.state;
    if (!st) return;
    if (st.openingPrototype) {
      st.openingPrototype = false;
      st.openingDefenseWon = true;
      st.expeditionUsedToday = false;
      st.applicants = [];
      st.hiresLeft = 0;
    }
    if (st.phase !== "mission") Game.prepareMissions(true);
    App.render();
  });
  await page.waitForTimeout(30);
}

module.exports = { dismissMormo, autoDismissMormo, silenceMormoFromNow, enterMissionPhase };
